/**
 * KSA Flight Deck: the Stream Deck side of the plugin.
 *
 * Stream Deck starts this file with Node, passing the port of the socket it listens
 * on. The connection to the game lives here too, because that socket outlives every
 * property inspector. Keys never talk to kRPC themselves: one poll fills in every
 * visible readout and the keys are drawn from that snapshot.
 */
"use strict";

const ksa = require("../lib/ksa");
const render = require("../lib/render");
const format = require("../lib/format");
const sd = require("../lib/sd");
const { createClient } = require("../lib/krpc-client");

const PLUGIN_UUID = "com.novistrum.ksaflightdeck";
const ACTION = {
	status: PLUGIN_UUID + ".status",
	readout: PLUGIN_UUID + ".readout",
	sequence: PLUGIN_UUID + ".sequence",
	engine: PLUGIN_UUID + ".engine",
	autopilot: PLUGIN_UUID + ".autopilot",
	toggle: PLUGIN_UUID + ".toggle",
	throttle: PLUGIN_UUID + ".throttle",
	warp: PLUGIN_UUID + ".warp"
};

const FAST_POLL_MS = 250;
const SLOW_POLL_MS = 1500;
const THROTTLE_STEP = 0.01;
const THROTTLE_STEP_FAST = 0.05;

console.log("KSA Flight Deck: plugin loaded");

const deck = sd.createConnection();
const client = createClient();
const session = ksa.createSession(client);

let renderer = null;
let settings = { host: "127.0.0.1", port: 50000, pollMs: FAST_POLL_MS };
let contexts = new Map();
let snapshot = session.snapshot();
let timer = null;
let polling = false;
let refreshRequested = false;
let throttleOverride = null;

function connectToStreamDeck(inPort, inUUID, inRegisterEvent) {
	renderer = render.createRenderer();

	deck.on("willAppear", function (message) {
		const payload = message.payload || {};
		const entry = {
			context: message.context,
			action: payload.action,
			settings: payload.settings || {}
		};
		contexts.set(message.context, entry);
		if (renderer) {
			renderer.forget(message.context);
		}
		deck.getSettings(message.context);
		startPolling();
		renderEntry(entry);
		refreshSoon(0);
	});

	deck.on("willDisappear", function (message) {
		contexts.delete(message.context);
		if (renderer) {
			renderer.forget(message.context);
		}
		if (contexts.size === 0) {
			stopPolling();
		}
	});

	deck.on("didReceiveSettings", function (message) {
		const entry = contexts.get(message.context);
		if (!entry) {
			return;
		}
		entry.settings = (message.payload && message.payload.settings) || {};
		if (renderer) {
			renderer.forget(message.context);
		}
		renderEntry(entry);
		refreshSoon(0);
	});

	deck.on("didReceiveGlobalSettings", function (message) {
		const received = (message.payload && message.payload.settings) || {};
		const next = {
			host: typeof received.host === "string" && received.host.length > 0 ? received.host : settings.host,
			port: Number(received.port) > 0 ? Math.floor(Number(received.port)) : settings.port,
			pollMs: Number(received.pollMs) > 0 ? Math.floor(Number(received.pollMs)) : FAST_POLL_MS
		};
		const endpointChanged = next.host !== settings.host || next.port !== settings.port;
		settings = next;
		client.configure({ host: settings.host, port: settings.port });
		if (endpointChanged) {
			client.close();
			session.reset();
			snapshot = session.snapshot();
			renderAll();
		}
		refreshSoon(0);
	});

	deck.on("keyDown", function (message) {
		handleKeyDown(message).catch(function (cause) {
			console.error("KSA Flight Deck: key failed", cause);
		});
	});

	deck.on("dialRotate", function (message) {
		handleDialRotate(message).catch(function (cause) {
			console.error("KSA Flight Deck: dial failed", cause);
		});
	});

	deck.on("dialPress", function (message) {
		const payload = message.payload || {};
		if (!payload.pressed) {
			return;
		}
		handleDialPress(message).catch(function (cause) {
			console.error("KSA Flight Deck: dial press failed", cause);
		});
	});

	deck.on("touchTap", function (message) {
		handleTouchTap(message).catch(function (cause) {
			console.error("KSA Flight Deck: touch failed", cause);
		});
	});

	deck.on("sendToPlugin", function (message) {
		const payload = message.payload || {};
		if (payload.command === "test") {
			testConnection(message.context).catch(function (cause) {
				console.error("KSA Flight Deck: connection test failed", cause);
			});
		}
	});

	deck.on("systemDidWakeUp", function () {
		refreshSoon(0);
	});

	deck.connect(inPort, inRegisterEvent, inUUID)
		.then(function () {
			deck.getGlobalSettings();
		})
		.catch(function (cause) {
			console.error("KSA Flight Deck: could not reach Stream Deck", cause);
		});
}

function startPolling() {
	if (timer || contexts.size === 0) {
		return;
	}
	schedule(0);
}

function stopPolling() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
}

function schedule(delay) {
	stopPolling();
	timer = setTimeout(tick, delay);
}

/** Ask for a poll almost immediately, e.g. right after a command. */
function refreshSoon(delay) {
	if (polling) {
		refreshRequested = true;
		return;
	}
	schedule(delay === undefined ? 40 : delay);
}

async function tick() {
	timer = null;
	if (contexts.size === 0) {
		return;
	}
	if (polling) {
		refreshRequested = true;
		return;
	}
	polling = true;
	let nextDelay = settings.pollMs;
	try {
		snapshot = await session.poll(neededMetrics());
		nextDelay = settings.pollMs;
		throttleOverride = null;
	} catch (cause) {
		snapshot = session.snapshot();
		nextDelay = SLOW_POLL_MS;
	}
	polling = false;
	try {
		renderAll();
	} catch (cause) {
		console.error("KSA Flight Deck: rendering failed", cause);
	}
	if (refreshRequested) {
		refreshRequested = false;
		schedule(40);
		return;
	}
	schedule(nextDelay);
}

function neededMetrics() {
	const ids = new Set();
	contexts.forEach(function (entry) {
		const selected = entry.settings || {};
		switch (entry.action) {
			case ACTION.readout:
				if (selected.metric) {
					ids.add(selected.metric);
				}
				break;
			case ACTION.engine:
				ids.add("engineOn");
				break;
			case ACTION.toggle:
				if (selected.toggle) {
					ids.add(selected.toggle);
				}
				break;
			case ACTION.autopilot:
				ids.add("autoPilotEngaged");
				ids.add("autoPilotMode");
				break;
			case ACTION.sequence:
				ids.add("sequenceNumber");
				break;
			case ACTION.throttle:
				ids.add("throttle");
				break;
			case ACTION.warp:
				ids.add("simSpeed");
				break;
			default:
				break;
		}
	});
	return Array.from(ids);
}

function renderAll() {
	contexts.forEach(renderEntry);
}

function valueFor(entry, metricId) {
	if (!snapshot.values) {
		return null;
	}
	return snapshot.values[metricId] || null;
}

function offlineTone() {
	if (!snapshot.connected) {
		return "error";
	}
	return snapshot.vehicle ? "live" : "warn";
}

function offlineLabel() {
	if (!snapshot.at) {
		// The first poll has not finished, so nothing is known yet.
		return { value: "…", unit: "", tone: "idle" };
	}
	if (!snapshot.connected) {
		return { value: "OFFLINE", unit: "", tone: "error" };
	}
	if (!snapshot.vehicle) {
		return { value: "NO SHIP", unit: "", tone: "warn" };
	}
	return null;
}

function renderEntry(entry) {
	if (!renderer) {
		return;
	}
	const description = render.spec(describeEntry(entry));
	deck.setImage(entry.context, renderer.image(entry.context, description));
	if (entry.action === ACTION.throttle || entry.action === ACTION.warp) {
		const text = description.unit ? description.value + description.unit : description.value;
		const feedback = description.label.toUpperCase() + "|" + text;
		if (entry.feedback !== feedback) {
			entry.feedback = feedback;
			deck.setFeedback(entry.context, { title: description.label.toUpperCase(), value: text });
		}
	}
}

function describeEntry(entry) {
	const selected = entry.settings || {};
	const missing = offlineLabel();

	switch (entry.action) {
		case ACTION.status:
			return describeStatus();

		case ACTION.readout: {
			const metric = ksa.METRICS_BY_ID.get(selected.metric);
			const label = metric ? metric.label : "Readout";
			if (missing) {
				return { label: label, value: missing.value, tone: missing.tone };
			}
			const reading = valueFor(entry, selected.metric);
			if (!reading) {
				return { label: label, value: "—", tone: "idle" };
			}
			if (!reading.ok) {
				return { label: label, value: "—", badge: "?", tone: "warn" };
			}
			return {
				label: label,
				value: reading.formatted.value,
				unit: reading.formatted.unit,
				tone: "live"
			};
		}

		case ACTION.sequence: {
			if (missing) {
				return { label: "STAGE", value: missing.value, tone: missing.tone };
			}
			const reading = valueFor(entry, "sequenceNumber");
			const delta = valueFor(entry, "sequenceDeltaV");
			return {
				label: "Next stage",
				value: reading && reading.ok ? reading.formatted.value : "—",
				footer: delta && delta.ok ? delta.formatted.text : "",
				tone: "live"
			};
		}

		case ACTION.engine: {
			if (missing) {
				return { label: "ENGINE", value: missing.value, tone: missing.tone };
			}
			const reading = valueFor(entry, "engineOn");
			const on = Boolean(reading && reading.ok && reading.value);
			return { label: "Engine", value: on ? "ON" : "OFF", tone: on ? "on" : "off" };
		}

		case ACTION.toggle: {
			const toggle = ksa.TOGGLES[selected.toggle] || ksa.TOGGLES.rcs;
			if (missing) {
				return { label: toggle.label, value: missing.value, tone: missing.tone };
			}
			const reading = valueFor(entry, selected.toggle);
			const on = Boolean(reading && reading.ok && reading.value);
			return { label: toggle.label, value: on ? "ON" : "OFF", tone: on ? "on" : "off" };
		}

		case ACTION.autopilot: {
			const mode = selected.mode || "AUTO_PILOT_MODE_PROGRADE";
			const known = ksa.AUTO_PILOT_MODES.find(function (entryMode) {
				return entryMode.name === mode;
			});
			const modeLabel = known ? known.label : format.enumLabel(mode);
			if (missing) {
				return { label: modeLabel, value: missing.value, tone: missing.tone };
			}
			const engaged = valueFor(entry, "autoPilotEngaged");
			const current = valueFor(entry, "autoPilotMode");
			const on = Boolean(engaged && engaged.ok && engaged.value);
			const holds = on && current && current.ok && current.formatted.value === modeLabel;
			return {
				label: modeLabel,
				value: on ? (holds ? "HOLD" : "OTHER") : "OFF",
				tone: holds ? "on" : on ? "warn" : "off"
			};
		}

		case ACTION.throttle: {
			if (missing) {
				return { label: "THROTTLE", value: missing.value, tone: missing.tone };
			}
			let formatted = { value: "—", unit: "" };
			if (throttleOverride !== null) {
				formatted = format.percent(throttleOverride);
			} else {
				const reading = valueFor(entry, "throttle");
				if (reading && reading.ok) {
					formatted = reading.formatted;
				}
			}
			return { label: "Throttle", value: formatted.value, unit: formatted.unit, tone: "live" };
		}

		case ACTION.warp: {
			if (missing) {
				return { label: "WARP", value: missing.value, tone: missing.tone };
			}
			const reading = valueFor(entry, "simSpeed");
			const formatted = reading && reading.ok ? reading.formatted : { value: "—", unit: "" };
			return {
				label: "Time warp",
				value: formatted.value,
				unit: formatted.unit,
				tone: formatted.value === "PAUSE" ? "warn" : "live"
			};
		}

		default:
			return { label: "", value: "?", tone: "idle" };
	}
}

function describeStatus() {
	const footer = settings.host + ":" + settings.port;
	if (!snapshot.at) {
		return { label: "kRPC", value: "…", tone: "idle" };
	}
	if (!snapshot.connected) {
		return {
			label: "kRPC",
			value: "OFFLINE",
			footer: footer,
			tone: "error"
		};
	}
	if (!snapshot.vehicle) {
		return { label: "kRPC", value: "NO SHIP", footer: "connected", tone: "warn" };
	}
	return {
		label: "kRPC",
		value: "ONLINE",
		footer: snapshot.vehicle.name || "vehicle ready",
		tone: "live"
	};
}

/** The inspector's "Test connection" button. */
async function testConnection(context) {
	try {
		client.close();
		session.reset();
		await client.connect();
		const registry = client.registry();
		let detail = "protocol " + (registry ? "ok" : "unknown");
		try {
			const status = await client.getStatus();
			if (status && status.version) {
				detail = status.version + ", protocol " + status.protocol_version;
			}
		} catch (cause) {
			detail = "connected";
		}
		const count = registry ? registry.services.size : 0;
		deck.sendToPropertyInspector(context, {
			command: "test",
			ok: true,
			message: "Connected to " + client.endpoint() + "\n" + detail + ", " + count + " services"
		});
	} catch (cause) {
		deck.sendToPropertyInspector(context, {
			command: "test",
			ok: false,
			message: (cause && cause.message) || "Could not connect"
		});
	}
	refreshSoon(0);
}

// ---------------------------------------------------------------- commands

function entryFor(message) {
	return contexts.get(message.context) || null;
}

async function handleKeyDown(message) {
	const entry = entryFor(message);
	if (!entry) {
		return;
	}
	const selected = entry.settings || {};
	try {
		switch (entry.action) {
			case ACTION.status:
				await session.poll(neededMetrics());
				break;
			case ACTION.readout:
				break;
			case ACTION.sequence:
				await session.nextSequence();
				break;
			case ACTION.engine:
				await session.toggleEngine();
				break;
			case ACTION.toggle: {
				const reading = valueFor(entry, selected.toggle);
				const on = Boolean(reading && reading.ok && reading.value);
				await session.setToggle(selected.toggle, !on);
				break;
			}
			case ACTION.autopilot:
				await session.toggleAutoPilot(selected.mode || "AUTO_PILOT_MODE_PROGRADE");
				break;
			default:
				break;
		}
		refreshSoon(0);
	} catch (cause) {
		deck.showAlert(entry.context);
		console.error("KSA Flight Deck: command failed", cause);
	}
}

async function handleDialRotate(message) {
	const entry = entryFor(message);
	if (!entry) {
		return;
	}
	const payload = message.payload || {};
	const ticks = Number(payload.ticks) || 0;
	const pressed = Boolean(payload.pressed);
	if (entry.action === ACTION.throttle) {
		const current = await currentThrottle(entry);
		const step = pressed ? THROTTLE_STEP_FAST : THROTTLE_STEP;
		const next = Math.min(1, Math.max(0, current + ticks * step));
		throttleOverride = next;
		renderEntry(entry);
		await session.setThrottle(next);
		refreshSoon(0);
		return;
	}
	if (entry.action === ACTION.warp) {
		const current = await currentSimSpeed(entry);
		const next = session.stepSimSpeed(current, ticks > 0 ? 1 : -1);
		await session.setSimulationSpeed(next);
		refreshSoon(0);
	}
}

async function handleDialPress(message) {
	const entry = entryFor(message);
	if (!entry) {
		return;
	}
	if (entry.action === ACTION.throttle) {
		throttleOverride = 0;
		renderEntry(entry);
		await session.setThrottle(0);
		refreshSoon(0);
		return;
	}
	if (entry.action === ACTION.warp) {
		const current = await currentSimSpeed(entry);
		await session.setSimulationSpeed(current === 0 ? 1 : 0);
		refreshSoon(0);
	}
}

async function handleTouchTap(message) {
	const entry = entryFor(message);
	if (!entry) {
		return;
	}
	if (entry.action === ACTION.throttle) {
		throttleOverride = 1;
		renderEntry(entry);
		await session.setThrottle(1);
		refreshSoon(0);
		return;
	}
	if (entry.action === ACTION.warp) {
		await session.setSimulationSpeed(1);
		refreshSoon(0);
	}
}

async function currentThrottle(entry) {
	if (throttleOverride !== null) {
		return throttleOverride;
	}
	const reading = valueFor(entry, "throttle");
	if (reading && reading.ok && typeof reading.value === "number") {
		return reading.value;
	}
	try {
		const value = await session.getThrottle();
		return typeof value === "number" ? value : 0;
	} catch (cause) {
		return 0;
	}
}

async function currentSimSpeed(entry) {
	const reading = valueFor(entry, "simSpeed");
	if (reading && reading.ok && typeof reading.value === "number") {
		return reading.value;
	}
	try {
		const value = await session.getSimulationSpeed();
		return typeof value === "number" ? value : 1;
	} catch (cause) {
		return 1;
	}
}

if (typeof module === "object" && module.exports) {
	module.exports = {
		ACTION: ACTION,
		start: start
	};
}

/**
 * Entry point. Stream Deck passes the socket details on the command line, e.g.
 * `plugin.js -port 28196 -pluginUUID com.novistrum.ksaflightdeck -registerEvent registerPlugin`.
 */
function start(argv) {
	const args = sd.parseArguments(argv || []);
	if (!args.port) {
		console.error("KSA Flight Deck: no -port argument, this plugin is started by Stream Deck");
		return;
	}
	connectToStreamDeck(args.port, args.pluginUUID, args.registerEvent);
}

if (require.main === module) {
	start(process.argv.slice(2));
}
