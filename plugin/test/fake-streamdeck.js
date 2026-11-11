/**
 * A stand-in for the Stream Deck application's plugin socket.
 *
 * Stream Deck starts a plugin with `-port <n>` and expects it to connect over a
 * WebSocket and register. This speaks just enough of that protocol to drive the real
 * plugin process in tests: it accepts the connection, records the events a plugin
 * sends, and can push events to it.
 */
"use strict";

const net = require("net");
const ws = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/ws");

function serverFrame(text) {
	const payload = Buffer.from(text, "utf8");
	const head = [0x81];
	if (payload.length < 126) {
		head.push(payload.length);
	} else if (payload.length < 65536) {
		head.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
	} else {
		head.push(127, 0, 0, 0, 0);
		const size = Buffer.alloc(4);
		size.writeUInt32BE(payload.length);
		return Buffer.concat([Buffer.from(head), size, payload]);
	}
	return Buffer.concat([Buffer.from(head), payload]);
}

function createFakeStreamDeck() {
	const server = net.Server();
	const received = [];
	const waiters = [];
	const sockets = new Set();
	let socket = null;
	let port = null;

	function deliver(message) {
		received.push(message);
		for (let i = waiters.length - 1; i >= 0; i--) {
			const waiter = waiters[i];
			if (waiter.predicate(message)) {
				waiters.splice(i, 1);
				clearTimeout(waiter.timer);
				waiter.resolve(message);
			}
		}
	}

	function handle(socket) {
		sockets.add(socket);
		let buffer = Buffer.alloc(0);
		let upgraded = false;
		socket.on("close", function () {
			sockets.delete(socket);
		});
		socket.on("error", function () {
			sockets.delete(socket);
		});
		socket.on("data", function onData(chunk) {
			buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
			if (!upgraded) {
				const end = buffer.indexOf("\r\n\r\n");
				if (end < 0) {
					return;
				}
				const head = buffer.subarray(0, end).toString("ascii");
				const key = /Sec-WebSocket-Key: (.+)/i.exec(head);
				socket.write(
					"HTTP/1.1 101 Switching Protocols\r\n" +
						"Upgrade: websocket\r\n" +
						"Connection: Upgrade\r\n" +
						"Sec-WebSocket-Accept: " + ws.acceptKey(key[1].trim()) + "\r\n\r\n"
				);
				buffer = buffer.subarray(end + 4);
				upgraded = true;
			}
			for (;;) {
				if (buffer.length < 2) {
					return;
				}
				const opcode = buffer[0] & 0x0f;
				let length = buffer[1] & 0x7f;
				let offset = 2;
				if (length === 126) {
					if (buffer.length < 4) {
						return;
					}
					length = buffer.readUInt16BE(2);
					offset = 4;
				} else if (length === 127) {
					if (buffer.length < 10) {
						return;
					}
					length = Number(buffer.readBigUInt64BE(2));
					offset = 10;
				}
				const masked = (buffer[1] & 0x80) !== 0;
				let mask = null;
				if (masked) {
					if (buffer.length < offset + 4) {
						return;
					}
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
					try {
						deliver(JSON.parse(payload.toString("utf8")));
					} catch (cause) {
						// Ignore anything that is not a JSON event.
					}
				}
			}
		});
	}

	server.on("connection", handle);

	return {
		received: received,
		listen: function () {
			return new Promise(function (resolve) {
				server.listen(0, "127.0.0.1", function () {
					port = server.address().port;
					resolve(port);
				});
			});
		},
		port: function () {
			return port;
		},
		send: function (event, payload, context) {
			const message = { event: event };
			if (payload !== undefined) {
				message.payload = payload;
			}
			if (context) {
				message.context = context;
			}
			sockets.forEach(function (target) {
				target.write(serverFrame(JSON.stringify(message)));
			});
			return message;
		},
		/** Resolve with the first event matching the predicate, past or future. */
		waitFor: function (predicate, timeoutMs) {
			const existing = received.find(predicate);
			if (existing) {
				return Promise.resolve(existing);
			}
			return new Promise(function (resolve, reject) {
				const waiter = {
					predicate: predicate,
					resolve: resolve,
					timer: setTimeout(function () {
						const index = waiters.indexOf(waiter);
						if (index >= 0) {
							waiters.splice(index, 1);
						}
						reject(
							new Error(
								"Timed out waiting for a Stream Deck event. Seen: " +
									JSON.stringify(received.map(function (entry) { return entry.event; }))
							)
						);
					}, timeoutMs || 4000)
				};
				waiters.push(waiter);
			});
		},
		reset: function () {
			received.length = 0;
		},
		close: function () {
			sockets.forEach(function (target) {
				target.destroy();
			});
			return new Promise(function (resolve) {
				server.close(function () {
					resolve();
				});
			});
		}
	};
}

module.exports = {
	createFakeStreamDeck: createFakeStreamDeck
};
