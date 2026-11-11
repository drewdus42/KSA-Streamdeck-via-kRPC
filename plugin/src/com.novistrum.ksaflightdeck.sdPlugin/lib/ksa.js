/**
 * The Kitten Space Agency side of the plugin: which kRPC procedures back each
 * readout, one batched poll that fills them all in, and the commands the keys send.
 *
 * Everything is addressed through the server's reflection, so a readout is a
 * description (service, member, which object it belongs to) rather than a hard coded
 * stub. A procedure the current KSA build no longer has simply reports itself as
 * unavailable instead of breaking the rest of the snapshot.
 */
"use strict";

const format = require("./format");

/** The object a member hangs off. */
const TARGETS = ["vehicle", "flight", "control", "autopilot", "orbit", "sequence"];

function metric(id, group, label, options) {
	return Object.assign(
		{
			id: id,
			group: group,
			label: label,
			service: options.service || group,
			kind: options.kind || "get",
			member: options.member,
			target: options.target === undefined ? null : options.target,
			format: options.format || "decimal"
		},
		options.extra || {}
	);
}

const METRICS = [
	// Flight
	metric("altitude", "Flight", "Altitude", { member: "MeanAltitude", target: "flight", format: "distance" }),
	metric("surfaceAltitude", "Flight", "Above ground", { member: "SurfaceAltitude", target: "flight", format: "distance" }),
	metric("speed", "Flight", "Speed", { member: "Speed", target: "flight", format: "speed" }),
	metric("verticalSpeed", "Flight", "Vert. speed", { member: "VerticalSpeed", target: "flight", format: "speed" }),
	metric("horizontalSpeed", "Flight", "Horiz. speed", { member: "HorizontalSpeed", target: "flight", format: "speed" }),
	metric("pitch", "Flight", "Pitch", { member: "Pitch", target: "flight", format: "angle" }),
	metric("heading", "Flight", "Heading", { member: "Heading", target: "flight", format: "angle" }),
	metric("roll", "Flight", "Roll", { member: "Roll", target: "flight", format: "angle" }),
	metric("gForce", "Flight", "G-force", { member: "GForce", target: "flight", format: "gforce" }),
	metric("angleOfAttack", "Flight", "AoA", { member: "AngleOfAttack", target: "flight", format: "angle" }),
	metric("dynamicPressure", "Flight", "Dyn pressure", { member: "DynamicPressure", target: "flight", format: "pressure" }),
	metric("biome", "Flight", "Biome", { member: "Biome", target: "flight", format: "text" }),

	// Orbit
	metric("apoapsis", "Orbit", "Apoapsis altitude", { member: "ApoapsisAltitude", target: "orbit", format: "distance" }),
	metric("periapsis", "Orbit", "Periapsis altitude", { member: "PeriapsisAltitude", target: "orbit", format: "distance" }),
	metric("inclination", "Orbit", "Inclination", { member: "Inclination", target: "orbit", format: "angle" }),
	metric("timeToApoapsis", "Orbit", "Time to Ap", { member: "TimeToApoapsis", target: "orbit", format: "duration" }),
	metric("timeToPeriapsis", "Orbit", "Time to Pe", { member: "TimeToPeriapsis", target: "orbit", format: "duration" }),
	metric("period", "Orbit", "Period", { member: "Period", target: "orbit", format: "duration" }),
	metric("eccentricity", "Orbit", "Eccentricity", { member: "Eccentricity", target: "orbit", format: "decimal" }),

	// Vehicle
	metric("mass", "Vehicle", "Mass", { member: "Mass", target: "vehicle", format: "mass" }),
	metric("propellant", "Vehicle", "Propellant mass", { member: "PropellantMass", target: "vehicle", format: "mass" }),
	metric("thrust", "Vehicle", "Thrust", { member: "Thrust", target: "vehicle", format: "force" }),
	metric("availableThrust", "Vehicle", "Max thrust", { member: "AvailableThrust", target: "vehicle", format: "force" }),
	metric("storedEnergy", "Vehicle", "Stored energy", { member: "StoredEnergy", target: "vehicle", format: "energy" }),
	metric("netPower", "Vehicle", "Net power", { member: "NetPower", target: "vehicle", format: "power" }),
	metric("situation", "Vehicle", "Situation", { member: "Situation", target: "vehicle", format: "enum" }),

	// Control
	metric("throttle", "Control", "Throttle", { member: "Throttle", target: "control", format: "percent" }),
	metric("engineOn", "Control", "Engine", { member: "EngineOn", target: "control", format: "boolean" }),
	metric("rcs", "Control", "RCS", { member: "RCS", target: "control", format: "boolean" }),
	metric("lights", "Control", "Lights", { member: "Lights", target: "control", format: "boolean" }),
	metric("stabilization", "Control", "Stabilization", { member: "Stabilization", target: "control", format: "boolean" }),
	metric("pulse", "Control", "Pulse", { member: "Pulse", target: "control", format: "boolean" }),
	metric("sequenceNumber", "Sequence", "Sequence", { service: "Control", member: "ActiveSequence", target: "control", format: "plain" }),
	metric("sequenceDeltaV", "Sequence", "Stage delta-v", { service: "Sequence", member: "DeltaV", target: "sequence", format: "speed" }),

	// Auto-pilot
	metric("autoPilotEngaged", "AutoPilot", "Auto-pilot", { member: "Engaged", target: "autopilot", format: "boolean" }),
	metric("autoPilotMode", "AutoPilot", "Auto-pilot mode", { member: "Mode", target: "autopilot", format: "enum" }),

	// Game
	metric("ut", "KSA", "Universal time", { kind: "get", member: "UT", target: null, format: "clock" }),
	metric("simSpeed", "KSA", "Simulation speed", { kind: "get", member: "SimulationSpeed", target: null, format: "factor" })
];

const METRICS_BY_ID = new Map(
	METRICS.map(function (entry) {
		return [entry.id, entry];
	})
);

const TOGGLES = {
	rcs: { label: "RCS", member: "RCS" },
	lights: { label: "Lights", member: "Lights" },
	stabilization: { label: "Stabilization", member: "Stabilization" },
	pulse: { label: "Pulse", member: "Pulse" }
};

const AUTO_PILOT_MODES = [
	{ name: "AUTO_PILOT_MODE_HOLD", rpcName: "Hold", label: "HOLD" },
	{ name: "AUTO_PILOT_MODE_ATTITUDE", rpcName: "Attitude", label: "ATTITUDE" },
	{ name: "AUTO_PILOT_MODE_PROGRADE", rpcName: "Prograde", label: "PROGRADE" },
	{ name: "AUTO_PILOT_MODE_RETROGRADE", rpcName: "Retrograde", label: "RETROGRADE" },
	{ name: "AUTO_PILOT_MODE_NORMAL", rpcName: "Normal", label: "NORMAL" },
	{ name: "AUTO_PILOT_MODE_ANTI_NORMAL", rpcName: "AntiNormal", label: "ANTI-NORMAL" },
	{ name: "AUTO_PILOT_MODE_RADIAL_IN", rpcName: "RadialIn", label: "RADIAL IN" },
	{ name: "AUTO_PILOT_MODE_RADIAL_OUT", rpcName: "RadialOut", label: "RADIAL OUT" },
	{ name: "AUTO_PILOT_MODE_SURFACE_PROGRADE", rpcName: "SurfacePrograde", label: "SURFACE PROGRADE" },
	{ name: "AUTO_PILOT_MODE_SURFACE_RETROGRADE", rpcName: "SurfaceRetrograde", label: "SURFACE RETROGRADE" }
];

/** The warp factors the time warp dial steps through. */
const SIM_SPEEDS = [0, 1, 2, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000];

function createSession(client, options) {
	const settings = options || {};
	let characters = null;
	let objects = null;
	let vehicleId = null;
	let serverVersion = null;
	let snapshot = emptySnapshot();
	const labelCache = new Map();

	function emptySnapshot() {
		return {
			connected: false,
			ok: false,
			vehicle: null,
			error: null,
			values: {},
			serverVersion: serverVersion,
			at: 0
		};
	}

	/** Remember the labels of an enumeration the first time it is read. */
	function enumLabels(service, procedure) {
		const key = service + "." + procedure;
		if (labelCache.has(key)) {
			return labelCache.get(key);
		}
		const registry = client.registry();
		let labels = null;
		if (registry) {
			const owner = client.serviceFor(service);
			const definition = owner && owner.procedures.get(procedure);
			const type = definition && definition.returnType;
			if (type && registry.enumerations.has(type.service + "." + type.name)) {
				const enumeration = registry.enumerations.get(type.service + "." + type.name);
				labels = new Map();
				(enumeration.values || []).forEach(function (entry) {
					// A value of zero is the protobuf default, so it arrives as no field.
					labels.set(entry.value === undefined ? 0 : entry.value, entry.name);
				});
			}
		}
		labelCache.set(key, labels);
		return labels;
	}

	/** Fetch the objects a member hangs off: they only change with the vehicle. */
	async function ensureObjects(id) {
		if (objects && objects.vehicle === id) {
			return objects;
		}
		const batch = await client.callBatch([
			{ service: "Vehicle", procedure: client.memberProcedure("Vehicle", "get", "Flight"), args: [id] },
			{ service: "Vehicle", procedure: client.memberProcedure("Vehicle", "get", "Control"), args: [id] },
			{ service: "Vehicle", procedure: client.memberProcedure("Vehicle", "get", "AutoPilot"), args: [id] },
			{ service: "Vehicle", procedure: client.memberProcedure("Vehicle", "get", "Orbit"), args: [id] }
		]);
		const valueOf = function (index) {
			return batch[index].ok ? batch[index].value : null;
		};
		objects = {
			vehicle: id,
			flight: valueOf(0),
			control: valueOf(1),
			autopilot: valueOf(2),
			orbit: valueOf(3),
			sequence: null
		};
		return objects;
	}

	async function ensureSequence() {
		if (objects.sequence) {
			return objects.sequence;
		}
		const active = await client.call(
			"Control",
			client.memberProcedure("Control", "get", "ActiveSequence"),
			[objects.control]
		);
		const sequences = await client.call(
			"Vehicle",
			client.memberProcedure("Vehicle", "get", "Sequences"),
			[objects.vehicle]
		);
		const numbers = await client.callBatch(sequences.map(function (sequence) {
			return {
				service: "Sequence",
				procedure: client.memberProcedure("Sequence", "get", "Number"),
				args: [sequence]
			};
		}));
		const index = numbers.findIndex(function (result) {
			return result.ok && result.value === active;
		});
		objects.sequence = index < 0 ? null : sequences[index];
		return objects.sequence;
	}

	async function ensureConnected() {
		if (client.isConnected()) {
			return;
		}
		await client.connect();
		serverVersion = null;
		try {
			const status = await client.getStatus();
			serverVersion = status && status.version ? status.version : null;
		} catch (cause) {
			serverVersion = null;
		}
	}

	async function ensureVehicle() {
		await ensureConnected();
		if (vehicleId === null) {
			vehicleId = await client.call("KSA", client.memberProcedure("KSA", "get", "ActiveVehicle"), []);
		}
		if (vehicleId === null) {
			const error = new Error("No vehicle is under control");
			error.code = "no-vehicle";
			throw error;
		}
		return ensureObjects(vehicleId);
	}

	function targetId(target) {
		if (!target) {
			return null;
		}
		if (!objects || objects[target] === null || objects[target] === undefined) {
			return null;
		}
		return objects[target];
	}

	/**
	 * One tick: find the active vehicle, make sure its sub-objects are known, and run
	 * the readouts the visible keys asked for in a single batched request.
	 */
	async function poll(metricIds) {
		const wanted = Array.from(new Set(metricIds || []));
		try {
			await ensureConnected();
			const id = await client.call("KSA", client.memberProcedure("KSA", "get", "ActiveVehicle"), []);
			vehicleId = id;
			if (id === null) {
				objects = null;
				snapshot = {
					connected: true,
					ok: true,
					vehicle: null,
					error: null,
					values: {},
					serverVersion: serverVersion,
					at: Date.now()
				};
				return snapshot;
			}
			await ensureObjects(id);

			const specs = wanted
				.map(function (metricId) {
					return METRICS_BY_ID.get(metricId);
				})
				.filter(Boolean);

			const needsSequence = specs.some(function (spec) {
				return spec.target === "sequence";
			});
			if (needsSequence) {
				objects.sequence = null;
				try {
					await ensureSequence();
				} catch (cause) {
					objects.sequence = null;
				}
			}

			const calls = [];
			const callable = [];
			specs.forEach(function (spec) {
				if (!client.registry()) {
					return;
				}
				const argument = targetId(spec.target);
				if (spec.target && argument === null) {
					return;
				}
				const procedure = client.memberProcedure(spec.service, spec.kind, spec.member);
				if (!procedure) {
					return;
				}
				calls.push({
					service: spec.service,
					procedure: procedure,
					args: spec.target ? [argument] : []
				});
				callable.push(spec);
			});

			const values = {};
			if (calls.length > 0) {
				const results = await client.callBatch(calls);
				results.forEach(function (result, index) {
					const spec = callable[index];
					values[spec.id] = describe(spec, result);
				});
			}

			const nameProcedure = client.memberProcedure("Vehicle", "get", "Name");
			let name = snapshot.vehicle && snapshot.vehicle.id === id ? snapshot.vehicle.name : null;
			if (name === null) {
				try {
					name = await client.call("Vehicle", nameProcedure, [id]);
				} catch (cause) {
					name = null;
				}
			}

			snapshot = {
				connected: true,
				ok: true,
				vehicle: { id: id, name: name },
				error: null,
				values: values,
				serverVersion: serverVersion,
				at: Date.now()
			};
			return snapshot;
		} catch (cause) {
			objects = null;
			vehicleId = null;
			snapshot = {
				connected: client.isConnected(),
				ok: false,
				vehicle: null,
				error: cause && cause.code ? cause.code : "error",
				message: cause && cause.message ? cause.message : String(cause),
				values: {},
				serverVersion: serverVersion,
				at: Date.now()
			};
			throw cause;
		}
	}

	function describe(spec, result) {
		if (!result.ok) {
			return {
				ok: false,
				error: result.error && result.error.rpc ? result.error.rpc : "error",
				message: result.error && result.error.message,
				formatted: format.EMPTY
			};
		}
		const value = result.value;
		let formatted;
		let enumName = null;
		if (spec.format === "enum") {
			const labels = enumLabels(spec.service, client.memberProcedure(spec.service, spec.kind, spec.member));
			const label = labels && labels.has(value) ? labels.get(value) : null;
			enumName = label;
			formatted = label
				? { value: format.enumLabel(label), unit: "", text: format.enumLabel(label) }
				: format.decimal(value);
		} else {
			formatted = format.format(spec.format, value);
		}
		return { ok: true, value: value, formatted: formatted, enumName: enumName };
	}

	// ---------------------------------------------------------------- commands

	async function setThrottle(value) {
		const target = await ensureVehicle();
		await client.call("Control", client.memberProcedure("Control", "set", "Throttle"), [
			target.control,
			Math.min(1, Math.max(0, value))
		]);
		return Math.min(1, Math.max(0, value));
	}

	async function getThrottle() {
		const target = await ensureVehicle();
		return client.call("Control", client.memberProcedure("Control", "get", "Throttle"), [target.control]);
	}

	async function setEngineOn(value) {
		const target = await ensureVehicle();
		await client.call("Control", client.memberProcedure("Control", "set", "EngineOn"), [
			target.control,
			Boolean(value)
		]);
		return Boolean(value);
	}

	async function toggleEngine() {
		const target = await ensureVehicle();
		const current = await client.call(
			"Control",
			client.memberProcedure("Control", "get", "EngineOn"),
			[target.control]
		);
		await setEngineOn(!current);
		return !current;
	}

	async function nextSequence() {
		const target = await ensureVehicle();
		await client.call("Control", client.memberProcedure("Control", "call", "ActivateNextSequence"), [
			target.control
		]);
		objects.sequence = null;
	}

	async function setSimulationSpeed(value) {
		await ensureConnected();
		const speed = Math.max(0, Number(value));
		await client.call("KSA", client.memberProcedure("KSA", "set", "SimulationSpeed"), [speed]);
		return speed;
	}

	async function getSimulationSpeed() {
		await ensureConnected();
		return client.call("KSA", client.memberProcedure("KSA", "get", "SimulationSpeed"), []);
	}

	async function setToggle(kind, value) {
		const toggle = TOGGLES[kind];
		if (!toggle) {
			throw new Error("Unknown toggle " + kind);
		}
		const target = await ensureVehicle();
		await client.call("Control", client.memberProcedure("Control", "set", toggle.member), [
			target.control,
			Boolean(value)
		]);
		return Boolean(value);
	}

	async function getToggle(kind) {
		const toggle = TOGGLES[kind];
		if (!toggle) {
			throw new Error("Unknown toggle " + kind);
		}
		const target = await ensureVehicle();
		return client.call("Control", client.memberProcedure("Control", "get", toggle.member), [
			target.control
		]);
	}

	async function autoPilotState() {
		const target = await ensureVehicle();
		const results = await client.callBatch([
			{
				service: "AutoPilot",
				procedure: client.memberProcedure("AutoPilot", "get", "Engaged"),
				args: [target.autopilot]
			},
			{
				service: "AutoPilot",
				procedure: client.memberProcedure("AutoPilot", "get", "Mode"),
				args: [target.autopilot]
			}
		]);
		return {
			engaged: results[0].ok ? results[0].value === true : false,
			mode: results[1].ok ? results[1].value : null
		};
	}

	async function engageAutoPilot(mode) {
		const target = await ensureVehicle();
		if (mode !== null && mode !== undefined) {
			const modeNumber = typeof mode === "string" ? await modeValue(mode) : mode;
			if (modeNumber === null) {
				throw new Error("Auto-pilot mode is not available: " + mode);
			}
			await client.call("AutoPilot", client.memberProcedure("AutoPilot", "set", "Mode"), [
				target.autopilot,
				modeNumber
			]);
		}
		await client.call("AutoPilot", client.memberProcedure("AutoPilot", "call", "Engage"), [
			target.autopilot
		]);
	}

	async function disengageAutoPilot() {
		const target = await ensureVehicle();
		await client.call("AutoPilot", client.memberProcedure("AutoPilot", "call", "Disengage"), [
			target.autopilot
		]);
	}

	/**
	 * Pressing an autopilot key engages that mode, or lets go when it is already
	 * holding it. Returns the state the key should show afterwards.
	 */
	async function toggleAutoPilot(mode) {
		const target = await ensureVehicle();
		const state = await autoPilotState();
		const modeNumber = await modeValue(mode);
		if (modeNumber === null) {
			throw new Error("Auto-pilot mode is not available: " + mode);
		}
		if (state.engaged && state.mode === modeNumber) {
			await disengageAutoPilot();
			return { engaged: false, mode: state.mode };
		}
		await engageAutoPilot(modeNumber);
		return { engaged: true, mode: modeNumber };
	}

	async function modeValue(mode) {
		const procedure = client.memberProcedure("AutoPilot", "get", "Mode");
		const labels = enumLabels("AutoPilot", procedure);
		if (!labels) {
			return null;
		}
		const selected = AUTO_PILOT_MODES.find(function (entry) {
			return entry.name === mode;
		});
		for (const entry of labels.entries()) {
			if (entry[1] === mode || (selected && entry[1] === selected.rpcName)) {
				return entry[0];
			}
		}
		return null;
	}

	function stepSimSpeed(current, direction) {
		const speeds = SIM_SPEEDS;
		let index = 0;
		let best = Infinity;
		speeds.forEach(function (speed, position) {
			const distance = Math.abs(speed - current);
			if (distance < best) {
				best = distance;
				index = position;
			}
		});
		const next = Math.min(speeds.length - 1, Math.max(0, index + (direction > 0 ? 1 : -1)));
		return speeds[next];
	}

	return {
		client: client,
		poll: poll,
		snapshot: function () {
			return snapshot;
		},
		reset: function () {
			objects = null;
			vehicleId = null;
			snapshot = emptySnapshot();
			labelCache.clear();
		},
		setThrottle: setThrottle,
		getThrottle: getThrottle,
		setEngineOn: setEngineOn,
		toggleEngine: toggleEngine,
		nextSequence: nextSequence,
		setSimulationSpeed: setSimulationSpeed,
		getSimulationSpeed: getSimulationSpeed,
		setToggle: setToggle,
		getToggle: getToggle,
		autoPilotState: autoPilotState,
		engageAutoPilot: engageAutoPilot,
		disengageAutoPilot: disengageAutoPilot,
		toggleAutoPilot: toggleAutoPilot,
		stepSimSpeed: stepSimSpeed
	};
}

module.exports = {
	METRICS: METRICS,
	METRICS_BY_ID: METRICS_BY_ID,
	TOGGLES: TOGGLES,
	AUTO_PILOT_MODES: AUTO_PILOT_MODES,
	SIM_SPEEDS: SIM_SPEEDS,
	TARGETS: TARGETS,
	createSession: createSession
};
