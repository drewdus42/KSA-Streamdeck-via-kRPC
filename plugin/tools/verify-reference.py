"""Interoperability check: the reference kRPC Python client against the fake server.

    tools/.venv-ref/Scripts/python.exe tools/verify-reference.py

Starts the JavaScript fake server, then talks to it with the kRPC 0.7.0 client that
the mod's documentation tells players to use, using the same member syntax as the
kRPC documentation (`ksa.ut`, `vehicle.name`). Python builds the KSA services from
the server's reflection alone, so class members only appear if the procedure names
follow the protocol's conventions. If this passes, the fake server speaks the real
protocol and any remaining bug is in the plugin, not the stand-in.
"""

import os
import subprocess
import sys
import time

import krpc

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 50555


def start_server():
    process = subprocess.Popen(
        ["node", os.path.join(HERE, "..", "test", "fake-server.js"), str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    deadline = time.time() + 15
    while time.time() < deadline:
        line = process.stdout.readline()
        if "listening" in line:
            return process
        if process.poll() is not None:
            print("server exited early:", line)
            sys.exit(1)
    print("server did not start")
    process.kill()
    sys.exit(1)


def main():
    server = start_server()
    failures = []

    def check(name, condition, detail=""):
        if condition:
            print("  ok   " + name)
        else:
            print("  FAIL " + name + ("  " + detail if detail else ""))
            failures.append(name)

    try:
        conn = krpc.connect(
            name="interop", address="127.0.0.1", rpc_port=PORT, stream_port=None
        )
        service_names = sorted(service.name for service in conn.krpc.get_services().services)
        print("connected, services: " + ", ".join(service_names))
        for expected in ("KSA", "Vehicle", "Flight", "Orbit", "Control", "AutoPilot", "Sequence"):
            check("service " + expected, expected in service_names)

        status = conn.krpc.get_status()
        check("status version", "kRPC" in status.version, status.version)
        check("protocol version", status.protocol_version == 1, str(status.protocol_version))

        check(
            "service property ksa.ut",
            isinstance(conn.ksa.ut, float) and conn.ksa.ut > 0,
            repr(conn.ksa.ut),
        )

        speed = conn.ksa.simulation_speed
        check("service property simulation_speed", abs(speed - 1.0) < 1e-6, repr(speed))
        conn.ksa.simulation_speed = 5.0
        check("service property setter", abs(conn.ksa.simulation_speed - 5.0) < 1e-6)
        conn.ksa.simulation_speed = 1.0

        vehicle = conn.ksa.active_vehicle
        check("service property active_vehicle", vehicle is not None, repr(vehicle))
        check("class property name", vehicle.name == "Kerbal Express", repr(vehicle.name))

        altitude = vehicle.flight.mean_altitude
        check("nested class property", isinstance(altitude, float), repr(altitude))

        situation = vehicle.situation
        check(
            "class enumeration property",
            isinstance(situation.name, str) and "situation" in situation.name.lower(),
            repr(situation),
        )

        control = vehicle.control
        control.throttle = 0.5
        check("class property setter", abs(control.throttle - 0.5) < 1e-6, repr(control.throttle))

        control.engine_on = True
        check("bool property", control.engine_on is True)
        check("thrust follows throttle", vehicle.thrust > 0, repr(vehicle.thrust))

        before = control.active_sequence.number
        control.activate_next_sequence()
        after = control.active_sequence.number
        check("class method", after == before + 1, str(before) + " -> " + str(after))

        # Python snake_cases the value names it builds from reflection, so match on the
        # number the server uses rather than the declaration name.
        modes = list(conn.auto_pilot.AutoPilotMode)
        check("enumeration type", len(modes) == 10, str([mode.name for mode in modes]))
        prograde = modes[2]
        check("enumeration order", prograde.value == 2, repr(prograde))

        autopilot = vehicle.auto_pilot
        autopilot.mode = prograde
        check(
            "enumeration property round trip",
            autopilot.mode == prograde,
            repr(autopilot.mode),
        )
        autopilot.engage()
        check("autopilot engaged", autopilot.engaged is True)
        autopilot.disengage()
        check("autopilot disengaged", autopilot.engaged is False)

        orbit = vehicle.orbit
        check("orbit property", orbit.apoapsis_altitude > 0, repr(orbit.apoapsis_altitude))

        conn.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    if failures:
        print("\n" + str(len(failures)) + " check(s) failed")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
