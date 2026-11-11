"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
	createClient,
	RpcError
} = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/krpc-client");
const { createFakeServer } = require("./fake-server");

async function withServer(run, options) {
	const server = createFakeServer(options);
	const port = await server.listen(0);
	const client = createClient({ port: port, requestTimeoutMs: 2000 });
	try {
		await run({ server: server, client: client, port: port });
	} finally {
		client.close();
		await server.close();
	}
}

test("connecting publishes the server's services", async function () {
	await withServer(async function ({ client }) {
		const registry = await client.connect();
		assert.ok(registry.services.has("KSA"), "KSA service should be reflected");
		assert.ok(registry.services.get("Vehicle").procedures.has("Vehicle_get_Name"));
		assert.ok(client.hasProcedure("Control", "Control_set_Throttle"));
		assert.strictEqual(client.hasProcedure("Control", "Control_NoSuchThing"), false);
		assert.ok(
			registry.enumerations.has("AutoPilot.AutoPilotMode"),
			"autopilot modes should be reflected"
		);
	});
});

test("KSA class calls use their actual owning service", async function () {
	await withServer(async function ({ client, server }) {
		await client.connect();
		assert.strictEqual(client.serviceFor("Vehicle").name, "KSA");
		assert.strictEqual(client.memberProcedure("Vehicle", "get", "Name"), "Vehicle_get_Name");
		assert.strictEqual(await client.call("Vehicle", "Vehicle_get_Name", [1]), server.state.vehicle.name);
		assert.strictEqual(client.registry().enumerations.has("KSA.AutoPilotMode"), true);
	}, { ksaService: true });
});

test("service discovery reports the server's actual error and closes the connection", async function () {
	const servicesError = {
		service: "KRPC",
		name: "UnsupportedSceneException",
		description: "Procedure not available in game scene 'None'"
	};
	await withServer(async function ({ client }) {
		await assert.rejects(client.connect(), function (error) {
			assert.ok(error instanceof RpcError);
			assert.strictEqual(error.rpc, "UnsupportedSceneException");
			assert.strictEqual(error.message, servicesError.description);
			return true;
		});
		assert.strictEqual(client.isConnected(), false);
	}, { servicesError: servicesError });
});

test("member names are resolved with the protocol's naming convention", async function () {
	await withServer(async function ({ client }) {
		await client.connect();
		assert.strictEqual(client.memberProcedure("Vehicle", "get", "Name"), "Vehicle_get_Name");
		assert.strictEqual(client.memberProcedure("Vehicle", "set", "Name"), "Vehicle_set_Name");
		assert.strictEqual(
			client.memberProcedure("Control", "call", "ActivateNextSequence"),
			"Control_ActivateNextSequence"
		);
		assert.strictEqual(client.memberProcedure("KSA", "get", "UT"), "get_UT");
	});
});

test("a call decodes its result using the reflected return type", async function () {
	await withServer(async function ({ client, server }) {
		await client.connect();
		const ut = await client.call("KSA", "get_UT", []);
		assert.strictEqual(typeof ut, "number");
		assert.ok(ut > 0);

		const name = await client.call("Vehicle", "Vehicle_get_Name", [1]);
		assert.strictEqual(name, server.state.vehicle.name);
	});
});

test("a batch keeps results in order and reports per call errors", async function () {
	await withServer(async function ({ client, server }) {
		await client.connect();
		server.markBroken("Flight.GetDynamicPressure");

		const results = await client.callBatch([
			{ service: "KSA", procedure: "get_UT" },
			{ service: "Vehicle", procedure: "Vehicle_get_Name", args: [1] },
			{ service: "Flight", procedure: "Flight_get_DynamicPressure", args: [1] },
			{ service: "Vehicle", procedure: "Vehicle_get_Mass", args: [1] }
		]);

		assert.strictEqual(results.length, 4);
		assert.strictEqual(results[0].ok, true);
		assert.strictEqual(typeof results[0].value, "number");
		assert.strictEqual(results[1].value, server.state.vehicle.name);
		assert.strictEqual(results[2].ok, false);
		assert.strictEqual(results[2].error.rpc, "MissingGameCode");
		assert.strictEqual(results[3].ok, true);
		assert.strictEqual(typeof results[3].value, "number");
	});
});

test("a null object result decodes to null", async function () {
	await withServer(
		async function ({ client }) {
			await client.connect();
			const vehicle = await client.call("KSA", "get_ActiveVehicle", []);
			assert.strictEqual(vehicle, null);
			const name = await client.call("Vehicle", "Vehicle_get_Name", [1]);
			assert.ok(name, "vehicle methods still work");
		},
		{ launched: false }
	);
});

test("a procedure the server does not have rejects with an RPC error", async function () {
	await withServer(async function ({ client }) {
		await client.connect();
		await assert.rejects(
			function () {
				return client.call("Vehicle", "Vehicle_get_SomethingMadeUp", [1]);
			},
			function (error) {
				assert.ok(error instanceof RpcError);
				assert.strictEqual(error.rpc, "NoSuchProcedure");
				return true;
			}
		);
	});
});

test("calls are serialised when they are issued together", async function () {
	await withServer(async function ({ client }) {
		await client.connect();
		const answers = await Promise.all([
			client.call("KSA", "get_UT", []),
			client.call("KSA", "get_SimulationSpeed", []),
			client.call("Vehicle", "Vehicle_get_Name", [1]),
			client.call("Flight", "Flight_get_Speed", [1])
		]);
		assert.strictEqual(typeof answers[0], "number");
		assert.strictEqual(typeof answers[1], "number");
		assert.strictEqual(typeof answers[2], "string");
		assert.strictEqual(typeof answers[3], "number");
	});
});

test("setting a value is visible to the next read", async function () {
	await withServer(async function ({ client, server }) {
		await client.connect();
		await client.call("Control", "Control_set_Throttle", [1, 0.42]);
		assert.ok(Math.abs(server.state.vehicle.throttle - 0.42) < 1e-6);
		const throttle = await client.call("Control", "Control_get_Throttle", [1]);
		assert.ok(Math.abs(throttle - 0.42) < 1e-6);

		await client.call("Control", "Control_set_EngineOn", [1, true]);
		assert.strictEqual(await client.call("Control", "Control_get_EngineOn", [1]), true);
	});
});

test("an enumeration argument can be sent as a number and read back", async function () {
	await withServer(async function ({ client }) {
		await client.connect();
		const registry = client.registry();
		const modeType = registry.enumerations.get("AutoPilot.AutoPilotMode");
		const prograde = modeType.values.find(function (entry) {
			return entry.name === "Prograde";
		});
		await client.call("AutoPilot", "AutoPilot_set_Mode", [1, prograde.value]);
		assert.strictEqual(await client.call("AutoPilot", "AutoPilot_get_Mode", [1]), prograde.value);
	});
});

test("a refused connection surfaces as an offline error", async function () {
	const client = createClient({ port: 1, connectTimeoutMs: 500 });
	await assert.rejects(
		function () {
			return client.connect();
		},
		function (error) {
			assert.strictEqual(error.code, "offline");
			return true;
		}
	);
	client.close();
});

test("a dropped connection is reported and can be reopened", async function () {
	const server = createFakeServer();
	const port = await server.listen(0);
	const client = createClient({ port: port, requestTimeoutMs: 1000 });
	let closes = 0;
	client.onClose(function () {
		closes++;
	});
	await client.connect();
	assert.strictEqual(client.isConnected(), true);
	await server.close();
	await new Promise(function (resolve) {
		setTimeout(resolve, 150);
	});
	assert.strictEqual(client.isConnected(), false);
	assert.ok(closes > 0, "the close handler should run");

	const second = createFakeServer();
	const secondPort = await second.listen(0);
	try {
		client.configure({ port: secondPort });
		await client.connect();
		assert.strictEqual(client.isConnected(), true);
		assert.ok(await client.call("KSA", "get_UT", []));
	} finally {
		client.close();
		await second.close();
	}
});

test("a call that arrives after the server goes away rejects", async function () {
	const server = createFakeServer();
	const port = await server.listen(0);
	const client = createClient({ port: port, requestTimeoutMs: 1000 });
	await client.connect();
	await server.close();
	await new Promise(function (resolve) {
		setTimeout(resolve, 150);
	});
	await assert.rejects(function () {
		return client.call("KSA", "get_UT", []);
	});
	client.close();
});
