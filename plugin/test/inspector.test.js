"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("inspector uses its registration context and action for Stream Deck messages", function () {
	const sent = [];
	let socket;
	class WebSocket {
		constructor() {
			socket = this;
			this.readyState = 1;
		}
		send(message) {
			sent.push(JSON.parse(message));
		}
	}
	const window = {};
	const source = fs.readFileSync(path.join(__dirname, "..", "src", "com.novistrum.ksaflightdeck.sdPlugin", "actions", "pi.js"), "utf8");
	vm.runInNewContext(source, { window, WebSocket, console });
	window.connectElgatoStreamDeckSocket(1234, "inspector-context", "registerPropertyInspector", "{}", JSON.stringify({
		action: "com.novistrum.ksaflightdeck.status"
	}));
	socket.onopen();
	window.PI.setGlobalSettings({ host: "127.0.0.1", port: 50000 });
	window.PI.sendToPlugin({ command: "test" });

	assert.deepStrictEqual(sent[0], { event: "registerPropertyInspector", uuid: "inspector-context" });
	assert.deepStrictEqual(sent[1], { event: "getSettings", context: "inspector-context" });
	assert.deepStrictEqual(sent[2], { event: "getGlobalSettings", context: "inspector-context" });
	assert.deepStrictEqual(sent[3], {
		event: "setGlobalSettings",
		context: "inspector-context",
		payload: { host: "127.0.0.1", port: 50000 }
	});
	assert.deepStrictEqual(sent[4], {
		event: "sendToPlugin",
		action: "com.novistrum.ksaflightdeck.status",
		context: "inspector-context",
		payload: { command: "test" }
	});
});
