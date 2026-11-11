"use strict";

const test = require("node:test");
const assert = require("node:assert");
const net = require("net");

const ws = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/ws");
const sd = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/sd");

/** A WebSocket server that does just enough for the client under test. */
function createEchoServer(options) {
	const settings = options || {};
	const received = [];
	const sockets = new Set();

	const server = net.createServer(function (socket) {
		sockets.add(socket);
		let buffer = Buffer.alloc(0);
		let upgraded = false;
		socket.on("close", function () {
			sockets.delete(socket);
		});
		socket.on("data", function (chunk) {
			buffer = Buffer.concat([buffer, chunk]);
			if (!upgraded) {
				const end = buffer.indexOf("\r\n\r\n");
				if (end < 0) {
					return;
				}
				const head = buffer.subarray(0, end).toString("ascii");
				const keyMatch = /Sec-WebSocket-Key: (.+)/i.exec(head);
				assert.ok(keyMatch, "the client sends a key");
				socket.write(
					"HTTP/1.1 101 Switching Protocols\r\n" +
						"Upgrade: websocket\r\n" +
						"Connection: Upgrade\r\n" +
						"Sec-WebSocket-Accept: " + ws.acceptKey(keyMatch[1].trim()) + "\r\n\r\n"
				);
				buffer = buffer.subarray(end + 4);
				upgraded = true;
				if (settings.onOpen) {
					settings.onOpen(socket);
				}
			}
			for (;;) {
				if (buffer.length < 2) {
					return;
				}
				const opcode = buffer[0] & 0x0f;
				const masked = (buffer[1] & 0x80) !== 0;
				let length = buffer[1] & 0x7f;
				let offset = 2;
				if (length === 126) {
					length = buffer.readUInt16BE(2);
					offset = 4;
				}
				let mask = null;
				if (masked) {
					mask = buffer.subarray(offset, offset + 4);
					offset += 4;
				}
				if (buffer.length < offset + length) {
					return;
				}
				const payload = Buffer.from(buffer.subarray(offset, offset + length));
				if (mask) {
					for (let i = 0; i < payload.length; i++) {
						payload[i] ^= mask[i % 4];
					}
				}
				buffer = buffer.subarray(offset + length);
				if (opcode === 0x1) {
					received.push(payload.toString("utf8"));
					if (settings.onText) {
						settings.onText(socket, payload.toString("utf8"));
					}
				} else if (opcode === 0x8) {
					socket.end();
				}
			}
		});
	});

	return {
		received: received,
		listen: function () {
			return new Promise(function (resolve) {
				server.listen(0, "127.0.0.1", function () {
					resolve(server.address().port);
				});
			});
		},
		close: function () {
			sockets.forEach(function (socket) {
				socket.destroy();
			});
			return new Promise(function (resolve) {
				server.close(function () {
					resolve();
				});
			});
		}
	};
}

/** A server frame, unmasked as servers must send them. */
function serverFrame(text, opcode) {
	const payload = Buffer.from(text, "utf8");
	const head = [];
	head.push(0x80 | (opcode === undefined ? 0x1 : opcode));
	if (payload.length < 126) {
		head.push(payload.length);
	} else {
		head.push(126);
		head.push((payload.length >> 8) & 0xff, payload.length & 0xff);
	}
	return Buffer.concat([Buffer.from(head), payload]);
}

test("the client performs the handshake and sends text frames", async function () {
	const server = createEchoServer();
	const port = await server.listen();
	const client = ws.createClient();
	try {
		await client.connect(port, "127.0.0.1", 2000);
		assert.strictEqual(client.isOpen(), true);
		client.send(JSON.stringify({ event: "registerPlugin", uuid: "test" }));
		await new Promise(function (resolve) {
			setTimeout(resolve, 120);
		});
		assert.strictEqual(server.received.length, 1);
		assert.deepStrictEqual(JSON.parse(server.received[0]), {
			event: "registerPlugin",
			uuid: "test"
		});
	} finally {
		client.close();
		await server.close();
	}
});

test("frames from the server are delivered as messages", async function () {
	let openSocket = null;
	const server = createEchoServer({
		onOpen: function (socket) {
			openSocket = socket;
		}
	});
	const port = await server.listen();
	const client = ws.createClient();
	try {
		await client.connect(port, "127.0.0.1", 2000);
		const messages = [];
		client.on("message", function (text) {
			messages.push(text);
		});
		openSocket.write(serverFrame('{"event":"willAppear"}'));
		openSocket.write(serverFrame("second"));
		await new Promise(function (resolve) {
			setTimeout(resolve, 120);
		});
		assert.deepStrictEqual(messages, ['{"event":"willAppear"}', "second"]);
	} finally {
		client.close();
		await server.close();
	}
});

test("a long message crosses the two byte length boundary", async function () {
	let openSocket = null;
	const server = createEchoServer({
		onOpen: function (socket) {
			openSocket = socket;
		}
	});
	const port = await server.listen();
	const client = ws.createClient();
	try {
		await client.connect(port, "127.0.0.1", 2000);
		const messages = [];
		client.on("message", function (text) {
			messages.push(text);
		});
		const long = "x".repeat(500);
		openSocket.write(serverFrame(long));
		client.send(long);
		await new Promise(function (resolve) {
			setTimeout(resolve, 150);
		});
		assert.deepStrictEqual(messages, [long]);
		assert.strictEqual(server.received[0].length, 500);
	} finally {
		client.close();
		await server.close();
	}
});

test("a fragmented message is put back together", async function () {
	let openSocket = null;
	const server = createEchoServer({
		onOpen: function (socket) {
			openSocket = socket;
		}
	});
	const port = await server.listen();
	const client = ws.createClient();
	try {
		await client.connect(port, "127.0.0.1", 2000);
		const messages = [];
		client.on("message", function (text) {
			messages.push(text);
		});
		const first = Buffer.from('{"event":', "utf8");
		const second = Buffer.from('"ok"}', "utf8");
		openSocket.write(Buffer.concat([Buffer.from([0x01, first.length]), first]));
		openSocket.write(Buffer.concat([Buffer.from([0x80, second.length]), second]));
		await new Promise(function (resolve) {
			setTimeout(resolve, 120);
		});
		assert.deepStrictEqual(messages, ['{"event":"ok"}']);
	} finally {
		client.close();
		await server.close();
	}
});

test("a ping is answered with a pong", async function () {
	let openSocket = null;
	const server = createEchoServer({
		onOpen: function (socket) {
			openSocket = socket;
		}
	});
	const port = await server.listen();
	const client = ws.createClient();
	let pong = false;
	try {
		await client.connect(port, "127.0.0.1", 2000);
		await new Promise(function (resolve) {
			openSocket.on("data", function (chunk) {
				if ((chunk[0] & 0x0f) === 0xa) {
					pong = true;
					resolve();
				}
			});
			openSocket.write(serverFrame("hi", 0x9));
			setTimeout(resolve, 300);
		});
		assert.strictEqual(pong, true);
	} finally {
		client.close();
		await server.close();
	}
});

test("connecting to a socket that is not there fails cleanly", async function () {
	const client = ws.createClient();
	await assert.rejects(
		function () {
			return client.connect(1, "127.0.0.1", 500);
		}
	);
});

test("command line arguments from Stream Deck are read", function () {
	const args = sd.parseArguments([
		"-port", "28196",
		"-pluginUUID", "com.novistrum.ksaflightdeck",
		"-registerEvent", "registerPlugin",
		"-info", '{"devices":[]}'
	]);
	assert.strictEqual(args.port, 28196);
	assert.strictEqual(args.pluginUUID, "com.novistrum.ksaflightdeck");
	assert.strictEqual(args.registerEvent, "registerPlugin");
	assert.strictEqual(args.info, '{"devices":[]}');

	const empty = sd.parseArguments([]);
	assert.strictEqual(empty.port, 0);
	assert.strictEqual(empty.registerEvent, "registerPlugin");
});
