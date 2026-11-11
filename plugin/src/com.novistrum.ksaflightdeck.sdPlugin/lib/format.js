/**
 * Turns kRPC numbers into the two part labels a key shows: a short value and its
 * unit. Everything the KSA service returns is SI, so each formatter picks the unit
 * that keeps the number readable at 72 pixels.
 */
"use strict";

const EMPTY = { value: "—", unit: "", text: "—" };

function isNumber(value) {
	return typeof value === "number" && isFinite(value);
}

function label(value, unit) {
	const symbol = unit === "°" || unit === "%" || unit === "x";
	return { value: value, unit: unit, text: unit ? (symbol ? value + unit : value + " " + unit) : value };
}

function scaled(value, options) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	const magnitude = Math.abs(value);
	for (let i = 0; i < options.steps.length; i++) {
		const step = options.steps[i];
		if (magnitude >= step.size) {
			return label((value / step.size).toFixed(step.digits), step.unit);
		}
	}
	return label(value.toFixed(options.baseDigits === undefined ? 0 : options.baseDigits), options.base);
}

function distance(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	const magnitude = Math.abs(value);
	if (magnitude >= 1e9) {
		return label((value / 1e9).toFixed(2), "Gm");
	}
	if (magnitude >= 1e6) {
		return label((value / 1e6).toFixed(2), "Mm");
	}
	if (magnitude >= 1e4) {
		return label((value / 1e3).toFixed(1), "km");
	}
	if (magnitude >= 1e3) {
		return label((value / 1e3).toFixed(2), "km");
	}
	return label(Math.round(value).toString(), "m");
}

function speed(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	if (Math.abs(value) >= 1000) {
		return label((value / 1000).toFixed(2), "km/s");
	}
	return label(value.toFixed(1), "m/s");
}

function duration(value) {
	if (!isNumber(value) || value < 0) {
		return EMPTY;
	}
	if (value < 1) {
		return label(value.toFixed(2), "s");
	}
	if (value < 60) {
		return label(value.toFixed(value < 10 ? 1 : 0), "s");
	}
	if (value < 3600) {
		const minutes = Math.floor(value / 60);
		const seconds = Math.floor(value % 60);
		return label(minutes + "m " + (seconds < 10 ? "0" : "") + seconds + "s", "");
	}
	if (value < 86400) {
		const hours = Math.floor(value / 3600);
		const minutes = Math.floor((value % 3600) / 60);
		return label(hours + "h " + (minutes < 10 ? "0" : "") + minutes + "m", "");
	}
	const days = Math.floor(value / 86400);
	const hours = Math.floor((value % 86400) / 3600);
	return label(days + "d " + (hours < 10 ? "0" : "") + hours + "h", "");
}

function clock(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	const total = Math.floor(value);
	const days = Math.floor(total / 86400);
	const hours = Math.floor((total % 86400) / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const pad = function (part) {
		return part < 10 ? "0" + part : String(part);
	};
	if (days > 0) {
		return label("T+" + days + "d " + pad(hours) + ":" + pad(minutes), "");
	}
	return label(pad(hours) + ":" + pad(minutes) + ":" + pad(seconds), "");
}

function angle(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	return label(value.toFixed(1), "°");
}

function percent(fraction) {
	if (!isNumber(fraction)) {
		return EMPTY;
	}
	return label(Math.round(fraction * 100).toString(), "%");
}

function force(newtons) {
	return scaled(newtons, {
		base: "N",
		steps: [
			{ size: 1e6, unit: "MN", digits: 2 },
			{ size: 1e3, unit: "kN", digits: 1 }
		]
	});
}

function mass(kilograms) {
	if (!isNumber(kilograms)) {
		return EMPTY;
	}
	if (Math.abs(kilograms) >= 1000) {
		return label((kilograms / 1000).toFixed(1), "t");
	}
	return label(kilograms.toFixed(0), "kg");
}

function energy(joules) {
	return scaled(joules, {
		base: "J",
		steps: [
			{ size: 1e9, unit: "GJ", digits: 2 },
			{ size: 1e6, unit: "MJ", digits: 2 },
			{ size: 1e3, unit: "kJ", digits: 1 }
		]
	});
}

function power(watts) {
	return scaled(watts, {
		base: "W",
		baseDigits: 1,
		steps: [
			{ size: 1e6, unit: "MW", digits: 2 },
			{ size: 1e3, unit: "kW", digits: 2 }
		]
	});
}

function pressure(pascals) {
	return scaled(pascals, {
		base: "Pa",
		baseDigits: 1,
		steps: [
			{ size: 1e6, unit: "MPa", digits: 2 },
			{ size: 1e3, unit: "kPa", digits: 1 }
		]
	});
}

function gforce(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	return label(value.toFixed(2), "g");
}

function factor(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	if (value === 0) {
		return label("PAUSE", "");
	}
	if (Math.abs(value) >= 1e6) {
		return label((value / 1e6).toFixed(0) + "M", "x");
	}
	if (Math.abs(value) >= 1e3) {
		return label((value / 1e3).toFixed(1) + "k", "x");
	}
	if (value < 10) {
		return label(value.toFixed(value % 1 === 0 ? 0 : 1), "x");
	}
	return label(value.toFixed(0), "x");
}

function decimal(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	return label(Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2), "");
}

/** A count, with no decimals when it is whole: a stage number, not a measurement. */
function plain(value) {
	if (!isNumber(value)) {
		return EMPTY;
	}
	return label(Number.isInteger(value) ? String(value) : value.toFixed(1), "");
}

function boolean(value) {
	if (typeof value !== "boolean") {
		return EMPTY;
	}
	return label(value ? "ON" : "OFF", "");
}

function text(value) {
	if (value === null || value === undefined || value === "") {
		return EMPTY;
	}
	return label(String(value), "");
}

const FORMATTERS = {
	distance: distance,
	speed: speed,
	duration: duration,
	clock: clock,
	angle: angle,
	percent: percent,
	force: force,
	mass: mass,
	energy: energy,
	power: power,
	pressure: pressure,
	gforce: gforce,
	factor: factor,
	decimal: decimal,
	plain: plain,
	boolean: boolean,
	text: text
};

/**
 * Format a raw value. `kind` names a formatter; anything unknown falls back to a
 * plain decimal so a new readout still shows something.
 */
function format(kind, value) {
	const formatter = FORMATTERS[kind] || decimal;
	return formatter(value);
}

/** AUTO_PILOT_MODE_PROGRADE becomes PROGRADE; SITUATION_LANDED becomes LANDED. */
function enumLabel(name) {
	if (typeof name !== "string" || name.length === 0) {
		return "";
	}
	const stripped = name
		.replace(/^AUTO_PILOT_MODE_/i, "")
		.replace(/^SITUATION_/i, "")
		.replace(/_/g, " ");
	return stripped;
}

module.exports = {
	FORMATTERS: FORMATTERS,
	format: format,
	enumLabel: enumLabel,
	EMPTY: EMPTY,
	distance: distance,
	speed: speed,
	duration: duration,
	clock: clock,
	angle: angle,
	percent: percent,
	force: force,
	mass: mass,
	energy: energy,
	power: power,
	pressure: pressure,
	gforce: gforce,
	factor: factor,
	decimal: decimal,
	plain: plain,
	boolean: boolean,
	text: text
};
