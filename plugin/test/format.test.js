"use strict";

const test = require("node:test");
const assert = require("node:assert");

const format = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/format");

test("distances pick a readable unit", function () {
	assert.strictEqual(format.distance(840).text, "840 m");
	assert.strictEqual(format.distance(1234).text, "1.23 km");
	assert.strictEqual(format.distance(84000).text, "84.0 km");
	assert.strictEqual(format.distance(12500000).text, "12.50 Mm");
	assert.strictEqual(format.distance(-120).text, "-120 m");
	assert.strictEqual(format.distance(NaN).text, "—");
	assert.strictEqual(format.distance(undefined).text, "—");
});

test("speeds switch to kilometres per second", function () {
	assert.strictEqual(format.speed(145.53).text, "145.5 m/s");
	assert.strictEqual(format.speed(2311).text, "2.31 km/s");
	assert.strictEqual(format.speed(Infinity).text, "—");
});

test("durations read as a countdown", function () {
	assert.strictEqual(format.duration(12.34).text, "12 s");
	assert.strictEqual(format.duration(214).text, "3m 34s");
	assert.strictEqual(format.duration(3725).text, "1h 02m");
	assert.strictEqual(format.duration(183600).text, "2d 03h");
	assert.strictEqual(format.duration(-5).text, "—", "a time in the past has no duration");
	assert.strictEqual(format.duration(NaN).text, "—", "an open orbit has no time to apoapsis");
});

test("universal time reads as a clock", function () {
	assert.strictEqual(format.clock(3725).text, "01:02:05");
	assert.strictEqual(format.clock(90000).text, "T+1d 01:00");
});

test("angles, percentages and factors hug their symbols", function () {
	assert.strictEqual(format.angle(28.63).text, "28.6°");
	assert.strictEqual(format.percent(0.543).text, "54%");
	assert.strictEqual(format.percent(1).text, "100%");
	assert.strictEqual(format.factor(0).text, "PAUSE");
	assert.strictEqual(format.factor(1).text, "1x");
	assert.strictEqual(format.factor(1000).text, "1.0kx");
});

test("engineering values scale by thousands and fall back to base units", function () {
	assert.strictEqual(format.force(215000).text, "215.0 kN");
	assert.strictEqual(format.force(1200000).text, "1.20 MN");
	assert.strictEqual(format.force(840).text, "840 N");
	assert.strictEqual(format.mass(48200).text, "48.2 t");
	assert.strictEqual(format.mass(820).text, "820 kg");
	assert.strictEqual(format.energy(3600000).text, "3.60 MJ");
	assert.strictEqual(format.energy(500).text, "500 J");
	assert.strictEqual(format.power(12500).text, "12.50 kW");
	assert.strictEqual(format.pressure(812.5).text, "812.5 Pa");
	assert.strictEqual(format.gforce(1.432).text, "1.43 g");
});

test("booleans, text and enum names", function () {
	assert.strictEqual(format.boolean(true).text, "ON");
	assert.strictEqual(format.boolean(false).text, "OFF");
	assert.strictEqual(format.boolean(null).text, "—");
	assert.strictEqual(format.text("Grasslands").text, "Grasslands");
	assert.strictEqual(format.text("").text, "—");
	assert.strictEqual(format.enumLabel("AUTO_PILOT_MODE_PROGRADE"), "PROGRADE");
	assert.strictEqual(format.enumLabel("SITUATION_FREEFALL"), "FREEFALL");
	assert.strictEqual(format.enumLabel(""), "");
});

test("an unknown formatter still shows something", function () {
	assert.strictEqual(format.format("nonsense", 12.345).value, "12.35");
});

test("every formatter survives a missing value", function () {
	Object.keys(format.FORMATTERS).forEach(function (name) {
		assert.strictEqual(format.FORMATTERS[name](null).text, "—", name + " on null");
		assert.strictEqual(format.FORMATTERS[name](undefined).text, "—", name + " on undefined");
	});
});
