"use strict";

(function () {
	var select = document.getElementById("toggle");
	var status = document.getElementById("status");
	var DEFAULT_TOGGLE = "rcs";

	function show(toggle) {
		var options = Array.prototype.slice.call(select.options);
		var match = options.find(function (option) {
			return option.getAttribute("data-toggle") === toggle;
		});
		if (match) {
			select.value = match.value;
			status.textContent = "The key toggles " + match.textContent.toLowerCase() + " and shows its state.";
		}
	}

	PI.onSettings(function (settings) {
		show(settings.toggle || DEFAULT_TOGGLE);
	});

	PI.onReady(function () {
		if (!PI.settings().toggle) {
			PI.setSettings({ toggle: DEFAULT_TOGGLE });
			show(DEFAULT_TOGGLE);
		}
	});

	select.addEventListener("change", function () {
		var option = select.options[select.selectedIndex];
		var toggle = option ? option.getAttribute("data-toggle") : DEFAULT_TOGGLE;
		PI.setSettings({ toggle: toggle });
		status.textContent =
			"The key toggles " + (option ? option.textContent.toLowerCase() : toggle) + " and shows its state.";
	});
})();
