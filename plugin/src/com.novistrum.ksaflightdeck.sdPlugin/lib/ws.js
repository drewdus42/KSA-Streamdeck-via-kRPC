/**
 * A WebSocket client just big enough for the Stream Deck socket.
 *
 * Stream Deck plugins speak JSON over a loopback WebSocket, and a Node plugin has to
 * bring its own client. Only what the protocol needs is implemented: one connection,
 * text frames, fragmentation, and the control frames for ping and close.
 */
"use strict";

const net = require("net");
const crypto = require("crypto");
const { EventEmitter } = require("events");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OPCODE = {
	continuation: 0x0,
	text: 0x1,
	binary: 0x2,
	close: 0x8,
	ping: 0x9,
	pong: 0xa
};

const MAX_PAYLOAD = 16 * 1024 * 1024;

function acceptKey(key) {
	return crypto
		.createHash("sha1")
		.update(key + GUID)
		.digest("base64");
}

function encodeFrame(opcode, payload, compress) {
	const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
	const length = data.length;
	let header;
	if (length < 126) {
		header = Buffer.alloc(2);
		header[0] = 0x80 | opcode;
		header[1] = 0x80 | length;
	} else if (length < 65536) {
		header = Buffer.alloc(4);
		header[0] = 0x80 | opcode;
		header[1] = 0x80 | 126;
		header.writeUInt16BE(length, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x80 | opcode;
		header[1] = 0x80 | 127;
		header.writeBigUInt64BE(BigInt(length), 2);
	}
	const mask = crypto.randomBytes(4);
	const masked = Buffer.allocUnsafe(length);
	for (let i = 0; i < length; i++) {
		masked[i] = data[i] ^ mask[i % 4];
	}
	return Buffer.concat([header, mask, masked]);
}

function createClient() {
	const emitter = new EventEmitter();
	let socket = null;
	let buffer = Buffer.alloc(0);
	let handshakeDone = false;
	let fragments = [];
	let closeSent = false;

	function fail(message) {
		emitter.emit("error", new Error(message));
	}

	function sendFrame(opcode, payload) {
		if (!socket || !handshakeDone) {
			return false;
		}
		socket.write(encodeFrame(opcode, payload || Buffer.alloc(0)));
		return true;
	}

	function readFrame() {
		if (buffer.length < 2) {
			return false;
		}
		const first = buffer[0];
		const second = buffer[1];
		const fin = (first & 0x80) !== 0;
		const opcode = first & 0x0f;
		const masked = (second & 0x80) !== 0;
		let length = second & 0x7f;
		let offset = 2;
		if (length === 126) {
			if (buffer.length < 4) {
				return false;
			}
			length = buffer.readUInt16BE(2);
			offset = 4;
		} else if (length === 127) {
			if (buffer.length < 10) {
				return false;
			}
			const big = buffer.readBigUInt64BE(2);
			if (big > BigInt(MAX_PAYLOAD)) {
				fail("The Stream Deck sent a frame that is too large");
				return false;
			}
			length = Number(big);
			offset = 10;
		}
		let mask = null;
		if (masked) {
			if (buffer.length < offset + 4) {
				return false;
			}
			mask = buffer.subarray(offset, offset + 4);
			offset += 4;
		}
		if (buffer.length < offset + length) {
			return false;
		}
		const payload = Buffer.from(buffer.subarray(offset, offset + length));
		if (mask) {
			for (let i = 0; i < payload.length; i++) {
				payload[i] ^= mask[i % 4];
			}
		}
		buffer = buffer.subarray(offset + length);
		handleFrame(fin, opcode, payload);
		return true;
	}

	function handleFrame(fin, opcode, payload) {
		if (opcode === OPCODE.ping) {
			sendFrame(OPCODE.pong, payload);
			return;
		}
		if (opcode === OPCODE.pong) {
			return;
		}
		if (opcode === OPCODE.close) {
			if (!closeSent) {
				closeSent = true;
				sendFrame(OPCODE.close, payload.subarray(0, 2));
			}
			if (socket) {
				socket.end();
			}
			emitter.emit("close");
			return;
		}
		if (opcode === OPCODE.text || opcode === OPCODE.binary || opcode === OPCODE.continuation) {
			fragments.push(payload);
			if (!fin) {
				return;
			}
			const complete = Buffer.concat(fragments);
			fragments = [];
			emitter.emit("message", complete.toString("utf8"));
		}
	}

	function onData(chunk) {
		buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
		if (!handshakeDone) {
			const end = buffer.indexOf("\r\n\r\n");
			if (end < 0) {
				return;
			}
			const head = buffer.subarray(0, end).toString("ascii");
			const rest = buffer.subarray(end + 4);
			const statusLine = head.split("\r\n")[0] || "";
			if (statusLine.indexOf("101") < 0) {
				fail("Stream Deck refused the WebSocket handshake: " + statusLine);
				return;
			}
			handshakeDone = true;
			buffer = rest;
			emitter.emit("open");
		}
		while (readFrame()) {
			// Keep draining complete frames.
		}
	}

	function connect(port, host, timeoutMs) {
		return new Promise(function (resolve, reject) {
			const key = crypto.randomBytes(16).toString("base64");
			let settled = false;
			const address = host || "127.0.0.1";
			socket = net.createConnection({ host: address, port: port });

			const timer = setTimeout(function () {
				if (settled) {
					return;
				}
				settled = true;
				socket.destroy();
				reject(new Error("Timed out connecting to Stream Deck on " + address + ":" + port));
			}, timeoutMs || 4000);

			emitter.once("open", function () {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				resolve();
			});

			socket.once("error", function (cause) {
				if (settled) {
					emitter.emit("close");
					return;
				}
				settled = true;
				clearTimeout(timer);
				reject(cause);
			});

			socket.on("close", function () {
				if (settled) {
					emitter.emit("close");
				}
			});

			socket.once("connect", function () {
				socket.write(
					"GET / HTTP/1.1\r\n" +
						"Host: " + address + ":" + port + "\r\n" +
						"Upgrade: websocket\r\n" +
						"Connection: Upgrade\r\n" +
						"Sec-WebSocket-Key: " + key + "\r\n" +
						"Sec-WebSocket-Version: 13\r\n\r\n"
				);
			});

			socket.on("data", onData);
		});
	}

	function send(text) {
		return sendFrame(OPCODE.text, Buffer.from(text, "utf8"));
	}

	function close() {
		if (!socket) {
			return;
		}
		if (handshakeDone && !closeSent) {
			closeSent = true;
			sendFrame(OPCODE.close, Buffer.alloc(0));
		}
		const current = socket;
		socket = null;
		handshakeDone = false;
		current.end();
		setTimeout(function () {
			if (!current.destroyed) {
				current.destroy();
			}
		}, 200).unref();
	}

	return {
		connect: connect,
		send: send,
		close: close,
		on: emitter.on.bind(emitter),
		once: emitter.once.bind(emitter),
		isOpen: function () {
			return handshakeDone;
		}
	};
}

module.exports = {
	createClient: createClient,
	encodeFrame: encodeFrame,
	acceptKey: acceptKey,
	OPCODE: OPCODE
};
