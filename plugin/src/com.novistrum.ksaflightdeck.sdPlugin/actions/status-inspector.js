"use strict";

(function () {
	var host = document.getElementById("host");
	var port = document.getElementById("port");
	var pollMs = document.getElementById("pollMs");
	var test = document.getElementById("test");
	var status = document.getElementById("status");

	var DEFAULTS = { host: "127.0.0.1", port: 50000, pollMs: 250 };

	function save() {
		PI.setGlobalSettings({
			host: host.value.trim() || DEFAULTS.host,
			port: Number(port.value) > 0 ? Math.floor(Number(port.value)) : DEFAULTS.port,
			pollMs: Number(pollMs.value) > 0 ? Math.floor(Number(pollMs.value)) : DEFAULTS.pollMs
		});
	}

	PI.onGlobalSettings(function (settings) {
		host.value = settings.host || DEFAULTS.host;
		port.value = settings.port || DEFAULTS.port;
		pollMs.value = settings.pollMs || DEFAULTS.pollMs;
	});

	PI.onPluginMessage(function (payload) {
		if (!payload || payload.command !== "test") {
			return;
		}
		status.className = "status " + (payload.ok ? "ok" : "bad");
		status.textContent = payload.message || (payload.ok ? "Connected." : "Could not connect.");
	});

	[host, port, pollMs].forEach(function (input) {
		input.addEventListener("change", save);
		input.addEventListener("blur", save);
	});

	test.addEventListener("click", function () {
		save();
		status.className = "status";
		status.textContent = "Asking " + (host.value || DEFAULTS.host) + ":" + (port.value || DEFAULTS.port) + "…";
		PI.sendToPlugin({ command: "test" });
	});
})();
