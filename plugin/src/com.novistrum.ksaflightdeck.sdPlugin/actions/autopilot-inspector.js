"use strict";

(function () {
	var select = document.getElementById("mode");
	var status = document.getElementById("status");
	var DEFAULT_MODE = "AUTO_PILOT_MODE_PROGRADE";

	function show(mode) {
		var options = Array.prototype.slice.call(select.options);
		var match = options.find(function (option) {
			return option.getAttribute("data-mode") === mode;
		});
		if (match) {
			select.value = match.value;
			status.textContent =
				"The key shows HOLD while the auto-pilot holds " + match.textContent.toLowerCase() + ".";
		}
	}

	PI.onSettings(function (settings) {
		show(settings.mode || DEFAULT_MODE);
	});

	PI.onReady(function () {
		if (!PI.settings().mode) {
			PI.setSettings({ mode: DEFAULT_MODE });
			show(DEFAULT_MODE);
		}
	});

	select.addEventListener("change", function () {
		var option = select.options[select.selectedIndex];
		var mode = option ? option.getAttribute("data-mode") : DEFAULT_MODE;
		PI.setSettings({ mode: mode });
		status.textContent =
			"The key shows HOLD while the auto-pilot holds " +
			(option ? option.textContent.toLowerCase() : mode) +
			".";
	});
})();
