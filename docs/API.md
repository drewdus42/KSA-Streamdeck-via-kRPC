# kRPC mapping

Every action is a small set of kRPC procedures. The names below are the protocol names
the server publishes; the class members follow kRPC's convention, where `Vehicle.Name`
is sent as procedure `Vehicle_get_Name` in service `Vehicle` and a service property such
as `KSA.UT` is `get_UT` in service `KSA`.

## Actions

| Action | Procedure | Arguments | Returns |
| --- | --- | --- | --- |
| kRPC Status | `KSA.get_ActiveVehicle` | – | `Vehicle` |
| | `Vehicle_get_Name` | `this` | string |
| Telemetry Readout | one of the [readouts](#readouts) | – | – |
| Next Sequence | `Control_ActivateNextSequence` | `this` | – |
| | `Sequence_get_Number` | `this` | sint32 |
| Engine | `Control_get_EngineOn` / `Control_set_EngineOn` | `this` (+ bool) | bool |
| Auto-Pilot Mode | `AutoPilot_set_Mode` | `this`, `AutoPilotMode` | – |
| | `AutoPilot_Engage` / `AutoPilot_Disengage` | `this` | – |
| | `AutoPilot_get_Engaged` / `AutoPilot_get_Mode` | `this` | bool / enum |
| Control Toggle | `Control_get_RCS` / `Control_set_RCS` | `this` (+ bool) | bool |
| | `Control_get_Lights` / `Control_set_Lights` | `this` (+ bool) | bool |
| | `Control_get_Stabilization` / `Control_set_Stabilization` | `this` (+ bool) | bool |
| | `Control_get_Pulse` / `Control_set_Pulse` | `this` (+ bool) | bool |
| Throttle | `Control_get_Throttle` / `Control_set_Throttle` | `this` (+ float 0–1) | float |
| Time Warp | `KSA.get_SimulationSpeed` / `KSA.set_SimulationSpeed` | (+ float) | float |
| Connection test | `KRPC.GetStatus` | – | `Status` |

`this` is the remote object the member belongs to. The plugin resolves
`Vehicle_get_Flight`, `Vehicle_get_Control`, `Vehicle_get_AutoPilot` and
`Vehicle_get_Orbit` once per active vehicle and `Control_get_ActiveSequence` when a
sequence readout is on screen.

## Readouts

Formatting is SI throughout, because that is what the KSA service returns.

| id | Procedure | Unit | Formatter |
| --- | --- | --- | --- |
| `altitude` | `Flight_get_MeanAltitude` | m | distance |
| `surfaceAltitude` | `Flight_get_SurfaceAltitude` | m | distance |
| `speed` | `Flight_get_Speed` | m/s | speed |
| `verticalSpeed` | `Flight_get_VerticalSpeed` | m/s | speed |
| `horizontalSpeed` | `Flight_get_HorizontalSpeed` | m/s | speed |
| `pitch` | `Flight_get_Pitch` | ° | angle |
| `heading` | `Flight_get_Heading` | ° | angle |
| `roll` | `Flight_get_Roll` | ° | angle |
| `gForce` | `Flight_get_GForce` | g | gforce |
| `angleOfAttack` | `Flight_get_AngleOfAttack` | ° | angle |
| `dynamicPressure` | `Flight_get_DynamicPressure` | Pa | pressure |
| `biome` | `Flight_get_Biome` | – | text |
| `apoapsis` | `Orbit_get_ApoapsisAltitude` | m | distance |
| `periapsis` | `Orbit_get_PeriapsisAltitude` | m | distance |
| `inclination` | `Orbit_get_Inclination` | ° | angle |
| `timeToApoapsis` | `Orbit_get_TimeToApoapsis` | s | duration |
| `timeToPeriapsis` | `Orbit_get_TimeToPeriapsis` | s | duration |
| `period` | `Orbit_get_Period` | s | duration |
| `eccentricity` | `Orbit_get_Eccentricity` | – | decimal |
| `mass` | `Vehicle_get_Mass` | kg | mass |
| `propellant` | `Vehicle_get_PropellantMass` | kg | mass |
| `thrust` | `Vehicle_get_Thrust` | N | force |
| `availableThrust` | `Vehicle_get_AvailableThrust` | N | force |
| `storedEnergy` | `Vehicle_get_StoredEnergy` | J | energy |
| `netPower` | `Vehicle_get_NetPower` | W | power |
| `situation` | `Vehicle_get_Situation` | – | enum |
| `throttle` | `Control_get_Throttle` | 0–1 | percent |
| `engineOn` | `Control_get_EngineOn` | – | boolean |
| `rcs` | `Control_get_RCS` | – | boolean |
| `lights` | `Control_get_Lights` | – | boolean |
| `stabilization` | `Control_get_Stabilization` | – | boolean |
| `pulse` | `Control_get_Pulse` | – | boolean |
| `sequenceNumber` | `Sequence_get_Number` | – | plain |
| `sequenceDeltaV` | `Sequence_get_DeltaV` | m/s | speed |
| `autoPilotEngaged` | `AutoPilot_get_Engaged` | – | boolean |
| `autoPilotMode` | `AutoPilot_get_Mode` | – | enum |
| `ut` | `KSA.get_UT` | s | clock |
| `simSpeed` | `KSA.get_SimulationSpeed` | x | factor |

## Protocol

The KSA mod is built against the **KRPC.Core 0.7.0** release, so its protocol is the
0.7.0 one, not the newer `Message` envelope in `main`'s `krpc.proto`:

- a message is a varint length followed by the encoded protobuf message
- the handshake is a `ConnectionRequest` with `type = RPC (0)` and
  `protocol_version = 1`; the server answers with a `ConnectionResponse` whose
  `client_identifier` is only needed by the stream server
- calls travel as `Request { repeated ProcedureCall calls }` and are answered by
  `Response { repeated ProcedureResult results }` in the same order
- one request is in flight per connection, so the client queues calls
- `Argument.value` and `ProcedureResult.value` hold *bare* values: a double is eight
  little endian bytes, an object is the varint id of the remote object, an enumeration is
  a zigzag varint, and a collection is a serialized `Tuple`/`List`/`Set`/`Dictionary`
  whose items are themselves bare values
- a value of zero is the protobuf default, so an enumeration value of 0 and an argument
  at position 0 arrive as absent fields and read back as their default

Streams (`50001`) are not used: the plugin polls, because a Stream Deck only needs a
handful of values a few times a second, and one batched request covers all of them.

## Reflection

The client asks for `KRPC.GetServices` once per connection. It uses that reflection for:

- the parameter and return types of every call, so no stub can drift from the server
- enumeration names, so the property inspector can send `AUTO_PILOT_MODE_PROGRADE`
  instead of a number, and keys can show `PROGRADE` instead of `2`
- `Procedure` lookup, so a readout the current game build does not have is reported as
  unavailable instead of breaking the rest of the snapshot
