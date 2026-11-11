"use strict";

/**
 * End to end: the real plugin process, driven by a stand-in Stream Deck, talking to a
 * stand-in kRPC server. Nothing here is mocked inside the plugin, so this covers the
 * manifest's entry point, the socket protocol, the poll loop, the kRPC client and the
 * drawing of a key.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { createFakeStreamDeck } = require("./fake-streamdeck");
const { createFakeServer } = require("./fake-server");

const SDP = path.join(__dirname, "..", "src", "com.novistrum.ksaflightdeck.sdPlugin");
const ENTRY = path.join(SDP, "bin", "plugin.js");
const UUID = "com.novistrum.ksaflightdeck";
const ACTION = {
	status: UUID + ".status",
	readout: UUID + ".readout",
	sequence: UUID + ".sequence",
	engine: UUID + ".engine",
	autopilot: UUID + ".autopilot",
	toggle: UUID + ".toggle"
};

async function startSession() {
	const krpc = createFakeServer();
	const krpcPort = await krpc.listen(0);
	const deck = createFakeStreamDeck();
	const port = await deck.listen();

	const child = spawn(process.execPath, [
		ENTRY,
		"-port", String(port),
		"-pluginUUID", UUID,
		"-registerEvent", "registerPlugin",
		"-info", "{}"
	], { cwd: SDP, stdio: ["ignore", "pipe", "pipe"] });

	const output = [];
	child.stdout.on("data", function (chunk) {
		output.push(chunk.toString());
	});
	child.stderr.on("data", function (chunk) {
		output.push(chunk.toString());
	});

	await deck.waitFor(function (message) {
		return message.event === "registerPlugin" && message.uuid === UUID;
	}, 5000);

	deck.send("didReceiveGlobalSettings", {
		settings: { host: "127.0.0.1", port: krpcPort, pollMs: 100 }
	});

	return {
		deck: deck,
		krpc: krpc,
		output: output,
		stop: async function () {
			child.kill();
			await deck.close();
			await krpc.close();
			await new Promise(function (resolve) {
				setTimeout(resolve, 50);
			});
		}
	};
}

function imagesFor(deck, context) {
	return deck.received.filter(function (message) {
		return message.event === "setImage" && message.context === context;
	});
}

function lastImage(deck, context) {
	const images = imagesFor(deck, context);
	return images.length > 0 ? images[images.length - 1].payload.image : null;
}

function decoded(image) {
	return decodeURIComponent(image.slice(image.indexOf(",") + 1));
}

test("the plugin registers, draws a status key and follows the vehicle", async function () {
	const session = await startSession();
	try {
		session.deck.send("willAppear", { action: ACTION.status, settings: {} }, "ctx-status");
		session.deck.send("didReceiveSettings", { settings: {} }, "ctx-status");

		const image = await session.deck.waitFor(function (message) {
			return message.event === "setImage" && message.context === "ctx-status";
		}, 6000);
		assert.ok(image.payload.image.indexOf("data:image/svg+xml") === 0);

		const later = await session.deck.waitFor(function (message) {
			return (
				message.event === "setImage" &&
				message.context === "ctx-status" &&
				decodeURIComponent(message.payload.image).indexOf("ONLINE") >= 0
			);
		}, 6000);
		assert.ok(later, "the status key reports the link once the poll succeeds");
	} finally {
		await session.stop();
	}
});

test("a readout key shows the value the game reports", async function () {
	const session = await startSession();
	try {
		session.deck.send("willAppear", { action: ACTION.readout, settings: { metric: "altitude" } }, "ctx-alt");
		session.deck.send("didReceiveSettings", { settings: { metric: "altitude" } }, "ctx-alt");

		const image = await session.deck.waitFor(function (message) {
			if (message.event !== "setImage" || message.context !== "ctx-alt") {
				return false;
			}
			const markup = decoded(message.payload.image);
			return markup.indexOf(">Altitude<") >= 0 && /(km| m)<\/text>/.test(markup);
		}, 6000);
		const markup = decoded(image.payload.image);
		assert.ok(markup.indexOf(">Altitude<") >= 0);
		assert.ok(/(km| m)<\/text>/.test(markup), "a distance unit is shown");
	} finally {
		await session.stop();
	}
});

test("a key press reaches the game", async function () {
	const session = await startSession();
	try {
		session.deck.send("willAppear", { action: ACTION.sequence, settings: {} }, "ctx-seq");
		session.deck.send("didReceiveSettings", { settings: {} }, "ctx-seq");
		await session.deck.waitFor(function (message) {
			return message.event === "setImage" && message.context === "ctx-seq";
		}, 6000);

		const before = session.krpc.state.vehicle.sequence.number;
		session.deck.send("keyDown", { settings: {} }, "ctx-seq");
		await session.deck.waitFor(function () {
			return session.krpc.state.vehicle.sequence.number === before + 1;
		}, 4000);

		const after = await session.deck.waitFor(function (message) {
			return (
				message.event === "setImage" &&
				message.context === "ctx-seq" &&
				decodeURIComponent(message.payload.image).indexOf(">" + (before + 1) + "<") >= 0
			);
		}, 4000);
		assert.ok(after, "the key redraws with the new sequence number");
	} finally {
		await session.stop();
	}
});

test("the engine key toggles the engine and shows its state", async function () {
	const session = await startSession();
	try {
		session.deck.send("willAppear", { action: ACTION.engine, settings: {} }, "ctx-engine");
		session.deck.send("didReceiveSettings", { settings: {} }, "ctx-engine");
		await session.deck.waitFor(function (message) {
			return (
				message.event === "setImage" &&
				message.context === "ctx-engine" &&
				decoded(message.payload.image).indexOf(">OFF<") >= 0
			);
		}, 6000);

		session.deck.send("keyDown", { settings: {} }, "ctx-engine");
		await session.deck.waitFor(function (message) {
			return (
				message.event === "setImage" &&
				message.context === "ctx-engine" &&
				decoded(message.payload.image).indexOf(">ON<") >= 0
			);
		}, 4000);
		assert.strictEqual(session.krpc.state.vehicle.engineOn, true);
	} finally {
		await session.stop();
	}
});

test("a dial press drives the throttle to zero and the touchscreen follows", async function () {
	const session = await startSession();
	try {
		session.krpc.state.vehicle.throttle = 0.7;
		session.deck.send("willAppear", { action: UUID + ".throttle", settings: {} }, "ctx-throttle");
		session.deck.send("didReceiveSettings", { settings: {} }, "ctx-throttle");

		await session.deck.waitFor(function (message) {
			return message.event === "setFeedback" && message.context === "ctx-throttle";
		}, 6000);

		session.deck.send("dialPress", { pressed: true }, "ctx-throttle");
		await session.deck.waitFor(function () {
			return session.krpc.state.vehicle.throttle === 0;
		}, 4000);

		const feedback = await session.deck.waitFor(function (message) {
			return (
				message.event === "setFeedback" &&
				message.context === "ctx-throttle" &&
				message.payload.value === "0%"
			);
		}, 4000);
		assert.strictEqual(feedback.payload.title, "THROTTLE");
	} finally {
		await session.stop();
	}
});

test("a key press while the game is away shows a warning, not a crash", async function () {
	const session = await startSession();
	try {
		session.deck.send("willAppear", { action: ACTION.engine, settings: {} }, "ctx-engine");
		session.deck.send("didReceiveSettings", { settings: {} }, "ctx-engine");
		await session.deck.waitFor(function (message) {
			return message.event === "setImage" && message.context === "ctx-engine";
		}, 6000);

		await session.krpc.close();
		session.deck.send("keyDown", { settings: {} }, "ctx-engine");
		const alert = await session.deck.waitFor(function (message) {
			return message.event === "showAlert" && message.context === "ctx-engine";
		}, 6000);
		assert.strictEqual(alert.context, "ctx-engine");
	} finally {
		await session.stop();
	}
});
