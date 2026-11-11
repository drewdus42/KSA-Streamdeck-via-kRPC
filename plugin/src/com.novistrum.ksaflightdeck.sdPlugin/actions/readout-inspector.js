"use strict";

(function () {
	var select = document.getElementById("metric");
	var status = document.getElementById("status");
	var DEFAULT_METRIC = "altitude";

	function show(metric) {
		if (!metric) {
			return;
		}
		var options = Array.prototype.slice.call(select.options);
		var match = options.find(function (option) {
			return option.getAttribute("data-metric") === metric;
		});
		if (match) {
			select.value = match.value;
			status.textContent = "Showing " + match.textContent.toLowerCase() + ".";
		}
	}

	PI.onSettings(function (settings) {
		show(settings.metric || DEFAULT_METRIC);
	});

	PI.onReady(function () {
		if (!PI.settings().metric) {
			PI.setSettings({ metric: DEFAULT_METRIC });
			show(DEFAULT_METRIC);
		}
	});

	select.addEventListener("change", function () {
		var option = select.options[select.selectedIndex];
		var metric = option ? option.getAttribute("data-metric") : DEFAULT_METRIC;
		PI.setSettings({ metric: metric });
		status.textContent = "Showing " + (option ? option.textContent.toLowerCase() : metric) + ".";
	});
})();
