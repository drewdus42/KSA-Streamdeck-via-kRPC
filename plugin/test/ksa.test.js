"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { createClient } = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/krpc-client");
const ksa = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/ksa");
const { createFakeServer } = require("./fake-server");

async function withSession(run, options) {
	const server = createFakeServer(options);
	const port = await server.listen(0);
	const client = createClient({ port: port, requestTimeoutMs: 2000 });
	const session = ksa.createSession(client);
	try {
		await run({ server: server, client: client, session: session });
	} finally {
		client.close();
		await server.close();
	}
}

test("every readout has a unique id, a label and a formatter", function () {
	const seen = new Set();
	ksa.METRICS.forEach(function (metric) {
		assert.ok(!seen.has(metric.id), "duplicate id " + metric.id);
		seen.add(metric.id);
		assert.ok(metric.label.length > 0, metric.id + " needs a label");
		assert.ok(
			Object.prototype.hasOwnProperty.call(require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/format").FORMATTERS, metric.format) ||
				metric.format === "enum" ||
				metric.format === "plain",
			metric.id + " has an unknown formatter " + metric.format
		);
		assert.ok(
			metric.target === null || ksa.TARGETS.indexOf(metric.target) >= 0,
			metric.id + " has an unknown target " + metric.target
		);
	});
	assert.ok(seen.has("altitude"));
	assert.ok(seen.has("apoapsis"));
	assert.ok(seen.has("speed"));
});

test("a poll fills in the readouts that the keys asked for", async function () {
	await withSession(async function ({ session }) {
		const snapshot = await session.poll(["altitude", "speed", "throttle", "situation", "ut"]);
		assert.strictEqual(snapshot.ok, true);
		assert.strictEqual(snapshot.vehicle.name, "Kerbal Express");
		assert.strictEqual(snapshot.values.altitude.ok, true);
		assert.ok(snapshot.values.altitude.formatted.text.length > 0);
		assert.strictEqual(snapshot.values.throttle.ok, true);
		assert.strictEqual(snapshot.values.ut.ok, true);
		assert.strictEqual(snapshot.values.situation.formatted.value, "MANEUVERING");
		assert.strictEqual(snapshot.values.pitch, undefined, "unrequested readouts are not polled");
	});
});

test("a readout the game version broke reports itself and the others still work", async function () {
	await withSession(async function ({ session, server }) {
		server.markBroken("Flight.GetDynamicPressure");
		const snapshot = await session.poll(["altitude", "dynamicPressure"]);
		assert.strictEqual(snapshot.values.altitude.ok, true);
		assert.strictEqual(snapshot.values.dynamicPressure.ok, false);
		assert.strictEqual(snapshot.values.dynamicPressure.error, "MissingGameCode");
		assert.strictEqual(snapshot.values.dynamicPressure.formatted.text, "—");
	});
});

test("no active vehicle is reported rather than treated as a failure", async function () {
	await withSession(
		async function ({ session }) {
			const snapshot = await session.poll(["altitude"]);
			assert.strictEqual(snapshot.ok, true);
			assert.strictEqual(snapshot.vehicle, null);
			assert.deepStrictEqual(snapshot.values, {});
		},
		{ launched: false }
	);
});

test("the snapshot is kept between polls so keys can redraw from it", async function () {
	await withSession(async function ({ session }) {
		assert.strictEqual(session.snapshot().ok, false);
		await session.poll(["ut"]);
		assert.strictEqual(session.snapshot().ok, true);
		const before = session.snapshot();
		await session.poll(["ut"]);
		assert.notStrictEqual(session.snapshot(), before, "each poll publishes a new snapshot");
	});
});

test("throttle commands reach the game and read back", async function () {
	await withSession(async function ({ session, server }) {
		await session.setThrottle(0.65);
		assert.ok(Math.abs(server.state.vehicle.throttle - 0.65) < 1e-6);
		assert.ok(Math.abs((await session.getThrottle()) - 0.65) < 1e-6);
		await session.setThrottle(4);
		assert.strictEqual(server.state.vehicle.throttle, 1, "throttle is clamped");
	});
});

test("the engine key toggles and reports the new state", async function () {
	await withSession(async function ({ session, server }) {
		assert.strictEqual(server.state.vehicle.engineOn, false);
		assert.strictEqual(await session.toggleEngine(), true);
		assert.strictEqual(server.state.vehicle.engineOn, true);
		assert.strictEqual(await session.toggleEngine(), false);
		assert.strictEqual(server.state.vehicle.engineOn, false);
	});
});

test("staging advances the sequence and the readout follows", async function () {
	await withSession(async function ({ session, server }) {
		const before = await session.poll(["sequenceNumber"]);
		assert.strictEqual(before.values.sequenceNumber.value, 1);
		await session.nextSequence();
		const after = await session.poll(["sequenceNumber"]);
		assert.strictEqual(after.values.sequenceNumber.value, 2);
		assert.strictEqual(server.state.vehicle.sequence.number, 2);
	});
});

test("toggles read and write the control flags", async function () {
	await withSession(async function ({ session, server }) {
		await session.setToggle("rcs", true);
		assert.strictEqual(server.state.vehicle.rcs, true);
		assert.strictEqual(await session.getToggle("rcs"), true);
		await session.setToggle("rcs", false);
		assert.strictEqual(await session.getToggle("rcs"), false);
		await assert.rejects(function () {
			return session.setToggle("warp", true);
		}, /Unknown toggle/);
	});
});

test("the autopilot engages a mode and lets go on a second press", async function () {
	await withSession(async function ({ session, server }) {
		const engaged = await session.toggleAutoPilot("AUTO_PILOT_MODE_PROGRADE");
		assert.strictEqual(engaged.engaged, true);
		assert.strictEqual(server.state.vehicle.autopilot.engaged, true);
		assert.strictEqual(server.state.vehicle.autopilot.mode, 2);

		const state = await session.autoPilotState();
		assert.strictEqual(state.engaged, true);
		assert.strictEqual(state.mode, 2);

		const released = await session.toggleAutoPilot("AUTO_PILOT_MODE_PROGRADE");
		assert.strictEqual(released.engaged, false);
		assert.strictEqual(server.state.vehicle.autopilot.engaged, false);
	});
});

test("the time warp dial steps through the warp factors and can pause", async function () {
	await withSession(async function ({ session, server }) {
		await session.setSimulationSpeed(1);
		assert.strictEqual(await session.stepSimSpeed(1, 1), 2);
		assert.strictEqual(await session.stepSimSpeed(2, 1), 5);
		assert.strictEqual(await session.stepSimSpeed(1, -1), 0);
		await session.setSimulationSpeed(0);
		assert.strictEqual(server.state.vehicle.throttle, 0, "pausing leaves control alone");
		assert.strictEqual(await session.getSimulationSpeed(), 0);
	});
});
