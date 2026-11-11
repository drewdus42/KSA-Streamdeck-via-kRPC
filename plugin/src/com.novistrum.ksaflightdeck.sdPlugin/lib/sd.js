/**
 * The Stream Deck side: one WebSocket, event handlers, and the commands this plugin
 * sends. Stream Deck starts the plugin process with the socket's port on the command
 * line, so the connection is the process's link back to the application.
 */
"use strict";

const ws = require("./ws");

/** Read `-port 1234 -pluginUUID ... -registerEvent registerPlugin -info {...}`. */
function parseArguments(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token.charAt(0) === "-" && i + 1 < argv.length) {
			args[token.slice(1)] = argv[i + 1];
			i++;
		}
	}
	return {
		port: Number(args.port) || 0,
		pluginUUID: args.pluginUUID || "",
		registerEvent: args.registerEvent || "registerPlugin",
		info: args.info || "{}"
	};
}

function createConnection() {
	const socket = ws.createClient();
	const handlers = new Map();
	let registered = false;
	let pluginUUID = "";

	function on(eventName, handler) {
		if (!handlers.has(eventName)) {
			handlers.set(eventName, []);
		}
		handlers.get(eventName).push(handler);
		return function off() {
			const list = handlers.get(eventName) || [];
			handlers.set(
				eventName,
				list.filter(function (entry) {
					return entry !== handler;
				})
			);
		};
	}

	function dispatch(message) {
		const named = handlers.get(message.event) || [];
		named.forEach(function (handler) {
			try {
				handler(message);
			} catch (cause) {
				console.error("KSA Flight Deck: handler for " + message.event + " failed", cause);
			}
		});
		const all = handlers.get("*") || [];
		all.forEach(function (handler) {
			try {
				handler(message);
			} catch (cause) {
				console.error("KSA Flight Deck: listener failed", cause);
			}
		});
	}

	socket.on("message", function (text) {
		let message;
		try {
			message = JSON.parse(text);
		} catch (cause) {
			console.error("KSA Flight Deck: unreadable message from Stream Deck", cause);
			return;
		}
		dispatch(message);
	});
	socket.on("close", function () {
		dispatch({ event: "connectionClosed" });
	});
	socket.on("error", function (cause) {
		console.error("KSA Flight Deck: Stream Deck socket error", cause && cause.message);
	});

	function send(event, payload, context, action) {
		const message = { event: event };
		if (payload !== undefined) {
			message.payload = payload;
		}
		if (context) {
			message.context = context;
		}
		if (action) {
			message.action = action;
		}
		return socket.send(JSON.stringify(message));
	}

	async function connect(port, registerEvent, uuid, timeoutMs) {
		await socket.connect(port, "127.0.0.1", timeoutMs);
		socket.send(JSON.stringify({ event: registerEvent, uuid: uuid }));
		pluginUUID = uuid;
		registered = true;
	}

	return {
		connect: connect,
		on: on,
		send: send,
		isRegistered: function () {
			return registered;
		},
		setImage: function (context, dataUrl) {
			if (dataUrl) {
				send("setImage", { image: dataUrl, target: 0 }, context);
			}
		},
		setTitle: function (context, title) {
			send("setTitle", { title: title, target: 0 }, context);
		},
		setState: function (context, state) {
			send("setState", { state: state }, context);
		},
		setFeedback: function (context, feedback) {
			send("setFeedback", feedback, context);
		},
		showAlert: function (context) {
			send("showAlert", {}, context);
		},
		showOk: function (context) {
			send("showOk", {}, context);
		},
		log: function (text) {
			console.log(text);
			send("logMessage", { message: String(text) });
		},
		getSettings: function (context) {
			send("getSettings", {}, context);
		},
		setSettings: function (context, settings) {
			send("setSettings", settings, context);
		},
		getGlobalSettings: function () {
			send("getGlobalSettings", {}, pluginUUID);
		},
		setGlobalSettings: function (settings) {
			send("setGlobalSettings", settings, pluginUUID);
		},
		sendToPropertyInspector: function (context, action, payload) {
			send("sendToPropertyInspector", payload, context, action);
		},
		openUrl: function (url) {
			send("openUrl", { url: url });
		},
		close: function () {
			socket.close();
		}
	};
}

module.exports = {
	createConnection: createConnection,
	parseArguments: parseArguments
};
