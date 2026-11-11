/**
 * The shared property inspector plumbing. Each inspector page defines a global
 * `connectElgatoStreamDeckSocket`, which Stream Deck calls once the page is ready.
 */
(function () {
	"use strict";

	var socket = null;
	var context = null;
	var actionInfo = null;
	var settings = {};
	var globalSettings = {};
	var settingsHandlers = [];
	var globalHandlers = [];
	var pluginHandlers = [];
	var readyHandlers = [];

	function send(event, payload, targetContext) {
		if (!socket || socket.readyState !== 1) {
			return;
		}
		var message = { event: event };
		var target = targetContext === undefined ? context : targetContext;
		if (target !== null) {
			message.context = target;
		}
		if (payload !== undefined) {
			message.payload = payload;
		}
		socket.send(JSON.stringify(message));
	}

	function notify(handlers, value) {
		handlers.forEach(function (handler) {
			try {
				handler(value);
			} catch (cause) {
				console.error("KSA Flight Deck inspector handler failed", cause);
			}
		});
	}

	window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, info, actionInfoJson) {
		context = uuid;
		try {
			actionInfo = JSON.parse(actionInfoJson || "{}");
		} catch (cause) {
			actionInfo = {};
		}

		socket = new WebSocket("ws://127.0.0.1:" + port);
		socket.onopen = function () {
			socket.send(JSON.stringify({ event: registerEvent, uuid: uuid }));
			send("getSettings");
			send("getGlobalSettings", undefined, "");
			notify(readyHandlers, { actionInfo: actionInfo });
		};
		socket.onmessage = function (message) {
			var data;
			try {
				data = JSON.parse(message.data);
			} catch (cause) {
				return;
			}
			var payload = data.payload || {};
			if (data.event === "didReceiveSettings") {
				settings = payload.settings || {};
				notify(settingsHandlers, settings);
			} else if (data.event === "didReceiveGlobalSettings") {
				globalSettings = payload.settings || {};
				notify(globalHandlers, globalSettings);
			} else if (data.event === "sendToPropertyInspector") {
				notify(pluginHandlers, payload);
			}
		};
	};

	window.PI = {
		onSettings: function (handler) {
			settingsHandlers.push(handler);
			if (Object.keys(settings).length > 0) {
				handler(settings);
			}
		},
		onGlobalSettings: function (handler) {
			globalHandlers.push(handler);
			if (Object.keys(globalSettings).length > 0) {
				handler(globalSettings);
			}
		},
		onPluginMessage: function (handler) {
			pluginHandlers.push(handler);
		},
		onReady: function (handler) {
			readyHandlers.push(handler);
		},
		settings: function () {
			return settings;
		},
		globalSettings: function () {
			return globalSettings;
		},
		actionInfo: function () {
			return actionInfo;
		},
		setSettings: function (next) {
			settings = Object.assign({}, settings, next);
			send("setSettings", settings);
		},
		setGlobalSettings: function (next) {
			globalSettings = Object.assign({}, globalSettings, next);
			send("setGlobalSettings", globalSettings, "");
		},
		sendToPlugin: function (payload) {
			send("sendToPlugin", payload);
		}
	};
})();
