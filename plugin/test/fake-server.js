/**
 * A stand-in for the kRPC server the mod runs, with a small simulated vehicle.
 *
 * It speaks the same protocol as the mod (handshake, reflection, batched calls) and
 * publishes a subset of the KSA services, so the plugin can be run and tested without
 * launching Kitten Space Agency. The simulation is deliberately simple: the numbers
 * move so readouts look alive, but nothing here is a physics model.
 */
"use strict";

const net = require("net");
const { EventEmitter } = require("events");

const schema = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/protobuf");
const values = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/krpc-values");

const T = schema.TYPE_CODES;

const DOUBLE = { code: T.DOUBLE };
const FLOAT = { code: T.FLOAT };
const SINT32 = { code: T.SINT32 };
const UINT64 = { code: T.UINT64 };
const BOOL = { code: T.BOOL };
const STRING = { code: T.STRING };

function klass(service, name) {
	return { code: T.CLASS, service: service, name: name };
}

function enumeration(service, name) {
	return { code: T.ENUMERATION, service: service, name: name };
}

const VEHICLE = klass("Vehicle", "Vehicle");
const FLIGHT = klass("Flight", "Flight");
const CONTROL = klass("Control", "Control");
const AUTOPILOT = klass("AutoPilot", "AutoPilot");
const ORBIT = klass("Orbit", "Orbit");
const SEQUENCE = klass("Sequence", "Sequence");

const AUTOPILOT_MODES = [
	"AUTO_PILOT_MODE_HOLD",
	"AUTO_PILOT_MODE_ATTITUDE",
	"AUTO_PILOT_MODE_PROGRADE",
	"AUTO_PILOT_MODE_RETROGRADE",
	"AUTO_PILOT_MODE_NORMAL",
	"AUTO_PILOT_MODE_ANTI_NORMAL",
	"AUTO_PILOT_MODE_RADIAL_IN",
	"AUTO_PILOT_MODE_RADIAL_OUT",
	"AUTO_PILOT_MODE_SURFACE_PROGRADE",
	"AUTO_PILOT_MODE_SURFACE_RETROGRADE"
];

const SITUATIONS = [
	"SITUATION_MANEUVERING",
	"SITUATION_LANDED",
	"SITUATION_SAILING",
	"SITUATION_ROLLING",
	"SITUATION_FLOATING",
	"SITUATION_BOTTOMED",
	"SITUATION_DRAGGING",
	"SITUATION_FREEFALL"
];

function enumValues(names) {
	return names.map(function (name, index) {
		return { name: name, value: index };
	});
}

function param(name, type) {
	return { name: name, type: type };
}

const THIS_VEHICLE = { name: "this", type: VEHICLE };
const THIS_FLIGHT = { name: "this", type: FLIGHT };
const THIS_CONTROL = { name: "this", type: CONTROL };
const THIS_AUTOPILOT = { name: "this", type: AUTOPILOT };
const THIS_ORBIT = { name: "this", type: ORBIT };
const THIS_SEQUENCE = { name: "this", type: SEQUENCE };

/**
 * The services the fake server publishes. `impl` receives the simulation state (or the
 * vehicle, when the procedure is a member of one) and the decoded arguments.
 */
function buildApi() {
	return [
		{
			name: "KRPC",
			procedures: [
				{ name: "GetStatus", parameters: [], return_type: { code: T.STATUS }, impl: implGetStatus },
				{ name: "GetClientName", parameters: [], return_type: STRING, impl: function (state) { return state.clientName; } }
			]
		},
		{
			name: "KSA",
			procedures: [
				{ name: "GetActiveVehicle", parameters: [], return_type: VEHICLE, impl: implActiveVehicle },
				{ name: "GetUT", parameters: [], return_type: DOUBLE, impl: function (state) { return state.ut; } },
				{
					name: "GetSimulationSpeed",
					parameters: [],
					return_type: FLOAT,
					impl: function (state) { return state.simSpeed; }
				},
				{
					name: "SetSimulationSpeed",
					parameters: [param("value", FLOAT)],
					return_type: null,
					impl: function (state, args) { state.simSpeed = args[0]; }
				}
			]
		},
		{
			name: "Vehicle",
			classes: [{ name: "Vehicle" }],
			enumerations: [{ name: "Situation", values: enumValues(SITUATIONS) }],
			procedures: [
				{ name: "GetName", parameters: [THIS_VEHICLE], return_type: STRING, impl: function (vehicle) { return vehicle.name; } },
				{
					name: "GetSituation",
					parameters: [THIS_VEHICLE],
					return_type: enumeration("Vehicle", "Situation"),
					impl: function (vehicle) { return vehicle.situation; }
				},
				{ name: "GetMass", parameters: [THIS_VEHICLE], return_type: FLOAT, impl: function (vehicle) { return vehicle.mass; } },
				{
					name: "GetPropellantMass",
					parameters: [THIS_VEHICLE],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.propellant; }
				},
				{ name: "GetThrust", parameters: [THIS_VEHICLE], return_type: FLOAT, impl: implThrust },
				{
					name: "GetAvailableThrust",
					parameters: [THIS_VEHICLE],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.engines * 215000; }
				},
				{
					name: "GetStoredEnergy",
					parameters: [THIS_VEHICLE],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.energy; }
				},
				{
					name: "GetNetPower",
					parameters: [THIS_VEHICLE],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.netPower; }
				},
				{ name: "GetFlight", parameters: [THIS_VEHICLE], return_type: FLIGHT, impl: function () { return {}; } },
				{ name: "GetControl", parameters: [THIS_VEHICLE], return_type: CONTROL, impl: function () { return {}; } },
				{ name: "GetAutoPilot", parameters: [THIS_VEHICLE], return_type: AUTOPILOT, impl: function () { return {}; } },
				{ name: "GetOrbit", parameters: [THIS_VEHICLE], return_type: ORBIT, impl: function () { return {}; } }
			]
		},
		{
			name: "Flight",
			classes: [{ name: "Flight" }],
			procedures: [
				{ name: "GetMeanAltitude", parameters: [THIS_FLIGHT], return_type: DOUBLE, impl: function (vehicle) { return vehicle.altitude; } },
				{
					name: "GetSurfaceAltitude",
					parameters: [THIS_FLIGHT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.altitude - 120; }
				},
				{ name: "GetSpeed", parameters: [THIS_FLIGHT], return_type: FLOAT, impl: function (vehicle) { return vehicle.speed; } },
				{
					name: "GetVerticalSpeed",
					parameters: [THIS_FLIGHT],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.verticalSpeed; }
				},
				{
					name: "GetHorizontalSpeed",
					parameters: [THIS_FLIGHT],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.speed * 0.82; }
				},
				{ name: "GetPitch", parameters: [THIS_FLIGHT], return_type: DOUBLE, impl: function (vehicle) { return vehicle.pitch; } },
				{ name: "GetHeading", parameters: [THIS_FLIGHT], return_type: DOUBLE, impl: function (vehicle) { return vehicle.heading; } },
				{ name: "GetRoll", parameters: [THIS_FLIGHT], return_type: DOUBLE, impl: function (vehicle) { return vehicle.roll; } },
				{
					name: "GetGForce",
					parameters: [THIS_FLIGHT],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.gForce; }
				},
				{
					name: "GetDynamicPressure",
					parameters: [THIS_FLIGHT],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.dynamicPressure; }
				},
				{ name: "GetBiome", parameters: [THIS_FLIGHT], return_type: STRING, impl: function () { return "Grasslands"; } }
			]
		},
		{
			name: "Orbit",
			classes: [{ name: "Orbit" }],
			procedures: [
				{
					name: "GetApoapsisAltitude",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.apoapsis; }
				},
				{
					name: "GetPeriapsisAltitude",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.periapsis; }
				},
				{
					name: "GetInclination",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.inclination; }
				},
				{
					name: "GetTimeToApoapsis",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.timeToApoapsis; }
				},
				{
					name: "GetTimeToPeriapsis",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.timeToPeriapsis; }
				},
				{
					name: "GetEccentricity",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.eccentricity; }
				},
				{
					name: "GetPeriod",
					parameters: [THIS_ORBIT],
					return_type: DOUBLE,
					impl: function (vehicle) { return vehicle.period; }
				}
			]
		},
		{
			name: "Control",
			classes: [{ name: "Control" }],
			procedures: [
				{
					name: "GetThrottle",
					parameters: [THIS_CONTROL],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.throttle; }
				},
				{
					name: "SetThrottle",
					parameters: [THIS_CONTROL, param("value", FLOAT)],
					return_type: null,
					impl: function (vehicle, args) { vehicle.throttle = clamp(args[0], 0, 1); }
				},
				{
					name: "GetEngineOn",
					parameters: [THIS_CONTROL],
					return_type: BOOL,
					impl: function (vehicle) { return vehicle.engineOn; }
				},
				{
					name: "SetEngineOn",
					parameters: [THIS_CONTROL, param("value", BOOL)],
					return_type: null,
					impl: function (vehicle, args) { vehicle.engineOn = Boolean(args[0]); }
				},
				{ name: "GetRCS", parameters: [THIS_CONTROL], return_type: BOOL, impl: function (vehicle) { return vehicle.rcs; } },
				{
					name: "SetRCS",
					parameters: [THIS_CONTROL, param("value", BOOL)],
					return_type: null,
					impl: function (vehicle, args) { vehicle.rcs = Boolean(args[0]); }
				},
				{
					name: "GetLights",
					parameters: [THIS_CONTROL],
					return_type: BOOL,
					impl: function (vehicle) { return vehicle.lights; }
				},
				{
					name: "SetLights",
					parameters: [THIS_CONTROL, param("value", BOOL)],
					return_type: null,
					impl: function (vehicle, args) { vehicle.lights = Boolean(args[0]); }
				},
				{
					name: "GetStabilization",
					parameters: [THIS_CONTROL],
					return_type: BOOL,
					impl: function (vehicle) { return vehicle.stabilization; }
				},
				{
					name: "SetStabilization",
					parameters: [THIS_CONTROL, param("value", BOOL)],
					return_type: null,
					impl: function (vehicle, args) { vehicle.stabilization = Boolean(args[0]); }
				},
				{
					name: "GetPulse",
					parameters: [THIS_CONTROL],
					return_type: BOOL,
					impl: function (vehicle) { return vehicle.pulse; }
				},
				{
					name: "SetPulse",
					parameters: [THIS_CONTROL, param("value", BOOL)],
					return_type: null,
					impl: function (vehicle, args) { vehicle.pulse = Boolean(args[0]); }
				},
				{
					name: "GetActiveSequence",
					parameters: [THIS_CONTROL],
					return_type: SEQUENCE,
					impl: function (vehicle) { return vehicle.sequence; }
				},
				{
					name: "ActivateNextSequence",
					parameters: [THIS_CONTROL],
					return_type: null,
					impl: function (vehicle) {
						vehicle.sequence.number = Math.min(vehicle.sequence.number + 1, vehicle.sequence.count);
					}
				}
			]
		},
		{
			name: "Sequence",
			classes: [{ name: "Sequence" }],
			procedures: [
				{
					name: "GetNumber",
					parameters: [THIS_SEQUENCE],
					return_type: SINT32,
					impl: function (vehicle) { return vehicle.sequence.number; }
				},
				{
					name: "GetDeltaV",
					parameters: [THIS_SEQUENCE],
					return_type: FLOAT,
					impl: function (vehicle) { return vehicle.sequence.deltaV; }
				}
			]
		},
		{
			name: "AutoPilot",
			classes: [{ name: "AutoPilot" }],
			enumerations: [{ name: "AutoPilotMode", values: enumValues(AUTOPILOT_MODES) }],
			procedures: [
				{
					name: "GetEngaged",
					parameters: [THIS_AUTOPILOT],
					return_type: BOOL,
					impl: function (vehicle) { return vehicle.autopilot.engaged; }
				},
				{
					name: "Engage",
					parameters: [THIS_AUTOPILOT],
					return_type: null,
					impl: function (vehicle) { vehicle.autopilot.engaged = true; vehicle.stabilization = true; }
				},
				{
					name: "Disengage",
					parameters: [THIS_AUTOPILOT],
					return_type: null,
					impl: function (vehicle) { vehicle.autopilot.engaged = false; }
				},
				{
					name: "GetMode",
					parameters: [THIS_AUTOPILOT],
					return_type: enumeration("AutoPilot", "AutoPilotMode"),
					impl: function (vehicle) { return vehicle.autopilot.mode; }
				},
				{
					name: "SetMode",
					parameters: [THIS_AUTOPILOT, param("value", enumeration("AutoPilot", "AutoPilotMode"))],
					return_type: null,
					impl: function (vehicle, args) { vehicle.autopilot.mode = args[0]; }
				},
				{
					name: "TargetPitchAndHeading",
					parameters: [THIS_AUTOPILOT, param("pitch", FLOAT), param("heading", FLOAT)],
					return_type: null,
					impl: function (vehicle, args) {
						vehicle.autopilot.mode = 1;
						vehicle.pitch = args[0];
						vehicle.heading = args[1];
					}
				}
			]
		}
	];
}

function clamp(value, low, high) {
	return Math.min(high, Math.max(low, value));
}

// A service whose procedures are all members of the class it defines, such as the
// Vehicle service's Vehicle_get_Name. The protocol qualifies those with the class
// name; the other services name their own procedures directly (KSA.get_UT).
const CLASS_SERVICES = new Set([
	"Vehicle",
	"Flight",
	"Orbit",
	"Control",
	"Sequence",
	"AutoPilot"
]);

/** The name the protocol gives a procedure, from the readable name used above. */
function protocolName(serviceName, procedureName) {
	if (serviceName === "KRPC") {
		return procedureName;
	}
	if (!CLASS_SERVICES.has(serviceName)) {
		if (procedureName.startsWith("Get")) {
			return "get_" + procedureName.slice(3);
		}
		if (procedureName.startsWith("Set")) {
			return "set_" + procedureName.slice(3);
		}
		return procedureName;
	}
	if (procedureName.startsWith("Get")) {
		return serviceName + "_get_" + procedureName.slice(3);
	}
	if (procedureName.startsWith("Set")) {
		return serviceName + "_set_" + procedureName.slice(3);
	}
	return serviceName + "_" + procedureName;
}

function normalizeApi(rawServices) {
	return rawServices.map(function (service) {
		return Object.assign({}, service, {
			procedures: (service.procedures || []).map(function (procedure) {
				return Object.assign({}, procedure, {
					name: protocolName(service.name, procedure.name),
					shortName: procedure.name
				});
			})
		});
	});
}

function implGetStatus(state) {
	return {
		version: "kRPC 0.2.0 (fake)",
		bytes_read: state.bytesRead,
		bytes_written: state.bytesWritten,
		rpcs_executed: state.rpcsExecuted,
		one_rpc_per_update: false,
		max_time_per_update: 5000,
		adaptive_rate_control: true,
		blocking_recv: true,
		recv_timeout: 1000,
		protocol_version: schema.PROTOCOL_VERSION
	};
}

function implActiveVehicle(state) {
	return state.launched ? {} : null;
}

function implThrust(vehicle) {
	if (!vehicle.engineOn) {
		return 0;
	}
	return vehicle.engines * 215000 * vehicle.throttle;
}

function createState(options) {
	const settings = options || {};
	return {
		launched: settings.launched !== false,
		clientName: "unknown",
		ut: 1234.5,
		simSpeed: 1,
		bytesRead: 0,
		bytesWritten: 0,
		rpcsExecuted: 0,
		broken: new Set(settings.broken || []),
		vehicle: {
			name: "Kerbal Express",
			situation: 0,
			altitude: 1200,
			speed: 145.5,
			verticalSpeed: 88.2,
			pitch: 84,
			heading: 45,
			roll: 0,
			gForce: 1.4,
			dynamicPressure: 812.5,
			mass: 48.2,
			propellant: 31.4,
			thrust: 0,
			engines: 2,
			energy: 3600,
			netPower: 12.5,
			apoapsis: 84000,
			periapsis: -120,
			inclination: 28.6,
			timeToApoapsis: 214,
			timeToPeriapsis: 1840,
			eccentricity: 0.62,
			period: 2410,
			throttle: 0,
			engineOn: false,
			rcs: false,
			lights: false,
			stabilization: false,
			pulse: false,
			sequence: { number: 1, count: 3, deltaV: 2840 },
			autopilot: { engaged: false, mode: 0 }
		}
	};
}

/** Advance the simple simulation. */
function tick(state, elapsedSeconds) {
	state.ut += elapsedSeconds * state.simSpeed;
	const vehicle = state.vehicle;
	const thrust = implThrust(vehicle);
	vehicle.thrust = thrust;
	const accel = thrust / (vehicle.mass * 1000);
	vehicle.verticalSpeed = clamp(vehicle.verticalSpeed + accel * 6 - 9.81 * 0.6, -400, 1500);
	vehicle.altitude = Math.max(-10, vehicle.altitude + vehicle.verticalSpeed * elapsedSeconds * state.simSpeed);
	vehicle.speed = Math.max(0, vehicle.speed + accel * 2 - 0.4);
	vehicle.propellant = Math.max(0, vehicle.propellant - (thrust / 215000) * 0.35 * elapsedSeconds * state.simSpeed);
	vehicle.mass = 17 + vehicle.propellant;
	vehicle.gForce = 1 + accel / 9.81;
	vehicle.pitch = clamp(vehicle.pitch - 0.4 * elapsedSeconds * state.simSpeed, 0, 90);
	vehicle.apoapsis = vehicle.altitude + 60000 + vehicle.verticalSpeed * 20;
	if (vehicle.altitude > 60000) {
		vehicle.situation = 7;
	}
}

function createFakeServer(options) {
	const settings = options || {};
	const state = createState(settings);
	const api = normalizeApi(buildApi());
	const apiByName = new Map();
	const proceduresByService = new Map();

	api.forEach(function (service) {
		proceduresByService.set(service.name, service);
		(service.procedures || []).forEach(function (procedure) {
			apiByName.set(service.name + "." + procedure.name, procedure);
		});
	});

	const codec = values.createCodec({});
	const server = new net.Server();
	const events = new EventEmitter();
	const sockets = new Set();
	let ticker = null;
	let connections = 0;
	let boundPort = null;

	function servicesMessage() {
		return {
			services: api.map(function (service) {
				return {
					name: service.name,
					documentation: "",
					procedures: (service.procedures || []).map(function (procedure) {
						return {
							name: procedure.name,
							parameters: procedure.parameters.map(function (entry) {
								return { name: entry.name, type: entry.type };
							}),
							return_type: procedure.return_type || { code: T.NONE }
						};
					}),
					classes: service.classes || [],
					enumerations: service.enumerations || [],
					structs: service.structs || [],
					exceptions: []
				};
			})
		};
	}

	function execute(serviceName, procedureName, rawArguments) {
		const procedure = apiByName.get(serviceName + "." + procedureName);
		if (!procedure) {
			return {
				error: {
					service: serviceName,
					name: "NoSuchProcedure",
					description: "The fake server has no procedure " + serviceName + "." + procedureName
				}
			};
		}
		if (state.broken.has(serviceName + "." + procedureName)) {
			return {
				error: {
					service: serviceName,
					name: "MissingGameCode",
					description: "This RPC uses game code that is missing from this KSA version"
				}
			};
		}
		const args = [];
		for (let position = 0; position < procedure.parameters.length; position++) {
			const argument = (rawArguments || []).find(function (entry) {
				return (entry.position || 0) === position;
			});
			if (!argument) {
				args.push(undefined);
				continue;
			}
			if (argument.is_null) {
				args.push(null);
				continue;
			}
			args.push(codec.decode(procedure.parameters[position].type, argument.value || Buffer.alloc(0)));
		}
		const hasThis = Boolean(
			procedure.parameters[0] && procedure.parameters[0].name === "this"
		);
		const implArgs = hasThis ? args.slice(1) : args;
		const result = hasThis
			? procedure.impl(state.vehicle, implArgs, state)
			: procedure.impl(state, implArgs);
		if (!procedure.return_type) {
			return { is_null: true };
		}
		if (result === null || result === undefined) {
			return { is_null: true };
		}
		if (procedure.return_type.code === T.CLASS) {
			return { value: codec.encode({ code: T.UINT64 }, 1) };
		}
		return { value: codec.encode(procedure.return_type, result) };
	}

	function handleConnection(socket) {
		connections++;
		sockets.add(socket);
		events.emit("connection", connections);
		const frames = new schema.FrameReader();
		let identified = false;

		socket.setNoDelay(true);
		socket.on("data", function (chunk) {
			state.bytesRead += chunk.length;
			frames.push(chunk);
			for (;;) {
				const body = frames.next();
				if (!body) {
					return;
				}
				if (!identified) {
					const request = schema.decodeMessage("ConnectionRequest", body);
					identified = true;
					if (request.type === 1) {
						send(
							socket,
							schema.frame("ConnectionResponse", {
								status: 0,
								protocol_version: schema.PROTOCOL_VERSION
							})
						);
						continue;
					}
					if (request.protocol_version !== schema.PROTOCOL_VERSION) {
						send(
							socket,
							schema.frame("ConnectionResponse", {
								status: 4,
								message: "wrong protocol version",
								protocol_version: schema.PROTOCOL_VERSION
							})
						);
						continue;
					}
					state.clientName = request.client_name || "anonymous";
					send(
						socket,
						schema.frame("ConnectionResponse", {
							status: 0,
							client_identifier: Buffer.alloc(16, 7),
							protocol_version: schema.PROTOCOL_VERSION
						})
					);
					continue;
				}

				const request = schema.decodeMessage("Request", body);
				const calls = request.calls || [];
				let results;
				try {
					results = calls.map(function (call) {
						state.rpcsExecuted++;
						if (call.service === "KRPC" && call.procedure === "GetServices") {
							return { value: codec.encode({ code: T.SERVICES }, servicesMessage()) };
						}
						return execute(call.service, call.procedure, call.arguments);
					});
				} catch (cause) {
					send(
						socket,
						schema.frame("Response", {
							error: {
								service: "",
								name: "FakeServerError",
								description: cause.message
							}
						})
					);
					continue;
				}
				send(socket, schema.frame("Response", { results: results }));
			}
		});
		socket.on("error", function () {
			connections--;
		});
		socket.on("close", function () {
			connections--;
			sockets.delete(socket);
		});
	}

	function send(socket, buffer) {
		state.bytesWritten += buffer.length;
		socket.write(buffer);
	}

	server.on("connection", handleConnection);

	function listen(port) {
		return new Promise(function (resolve, reject) {
			server.once("error", reject);
			server.listen(port === undefined ? 0 : port, "127.0.0.1", function () {
				server.removeListener("error", reject);
				boundPort = server.address().port;
				ticker = setInterval(function () {
					tick(state, 0.25);
				}, 250);
				if (ticker.unref) {
					ticker.unref();
				}
				resolve(boundPort);
			});
		});
	}

	function close() {
		if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
		sockets.forEach(function (socket) {
			socket.destroy();
		});
		sockets.clear();
		return new Promise(function (resolve) {
			server.close(function () {
				resolve();
			});
		});
	}

	return {
		state: state,
		events: events,
		port: function () {
			return boundPort;
		},
		listen: listen,
		close: close,
		/** Break an RPC on purpose, to exercise error handling. */
		markBroken: function (name) {
			const parts = name.split(".");
			state.broken.add(parts[0] + "." + protocolName(parts[0], parts[1]));
		},
		servicesMessage: servicesMessage
	};
}

module.exports = {
	createFakeServer: createFakeServer,
	createState: createState,
	tick: tick
};

if (require.main === module) {
	const port = Number(process.argv[2] || 50000);
	const server = createFakeServer();
	server.listen(port).then(function (actual) {
		console.log("Fake kRPC server listening on 127.0.0.1:" + actual);
		console.log("Active vehicle: " + server.state.vehicle.name);
		process.on("SIGINT", function () {
			server.close().then(function () {
				process.exit(0);
			});
		});
	});
}
