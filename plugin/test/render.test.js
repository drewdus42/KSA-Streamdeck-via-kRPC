"use strict";

const test = require("node:test");
const assert = require("node:assert");

const render = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/render");

test("a description is normalised so every face draws the same way", function () {
	const spec = render.spec({ label: "Altitude", value: "84.0", unit: "km", tone: "live" });
	assert.strictEqual(spec.label, "Altitude");
	assert.strictEqual(spec.value, "84.0");
	assert.strictEqual(spec.unit, "km");
	assert.strictEqual(spec.tone, "live");
	assert.ok(spec.valueSize > 0);
});

test("missing values and unknown tones fall back safely", function () {
	const spec = render.spec({ value: null, tone: "chartreuse" });
	assert.strictEqual(spec.value, "—");
	assert.strictEqual(spec.tone, "idle");
	assert.strictEqual(render.spec({}).value, "—");
});

test("long text is trimmed and long values shrink", function () {
	const long = render.spec({ label: "x".repeat(40), value: "1234567890123" });
	assert.ok(long.label.length <= 18);
	assert.ok(long.valueSize < render.spec({ value: "12" }).valueSize);
});

test("a wide value is shrunk until it fits inside the tile", function () {
	const narrow = render.spec({ value: "8" });
	const wide = render.spec({ value: "OFFLINE" });
	assert.ok(wide.valueSize < narrow.valueSize, "a longer value uses a smaller font");
	const pixels = render.textWidth(wide.value) * wide.valueSize;
	assert.ok(pixels <= 130, "the value fits inside the tile: " + Math.round(pixels) + "px");
	const footer = render.spec({ label: "Time to apoapsis" });
	assert.ok(
		render.textWidth(footer.label) * footer.labelSize <= 130,
		"the label fits too"
	);
});

test("a badge makes room by moving the label to the left", function () {
	const plain = render.spec({ label: "Dynamic pressure" });
	const badged = render.spec({ label: "Dynamic pressure", badge: "?" });
	assert.strictEqual(plain.labelAnchor, "middle");
	assert.strictEqual(badged.labelAnchor, "start");
	assert.ok(badged.label.length <= plain.label.length);
	assert.ok(
		render.textWidth(badged.label) * badged.labelSize <= 80,
		"the label stops before the badge"
	);
});

test("the drawing shows the label, value, unit and footer", function () {
	const markup = render.svg(
		render.spec({
			label: "Altitude",
			value: "84.0",
			unit: "km",
			footer: "Kerbal Express",
			tone: "live"
		})
	);
	assert.ok(markup.indexOf("<svg") === 0, "it is an svg document");
	assert.ok(markup.indexOf(">Altitude<") >= 0, "the label is drawn as written");
	assert.ok(markup.indexOf(">84.0<") >= 0, "the value is drawn");
	assert.ok(markup.indexOf(">km<") >= 0, "the unit is drawn");
	assert.ok(markup.indexOf(">Kerbal Express<") >= 0, "the footer is drawn");
	assert.ok(markup.indexOf("#38bdf8") >= 0, "the live tone is applied");
	assert.ok(markup.endsWith("</svg>"));
});

test("the drawing escapes characters that would break the markup", function () {
	const markup = render.svg(render.spec({ label: "A<B", value: "1&2", unit: '"x"' }));
	assert.ok(markup.indexOf("A&lt;B") >= 0);
	assert.ok(markup.indexOf("1&amp;2") >= 0);
	assert.ok(markup.indexOf("&quot;x&quot;") >= 0);
	assert.ok(markup.indexOf("<B") < 0, "no raw angle bracket leaks in");
});

test("the badge is drawn when a readout is unavailable", function () {
	const markup = render.svg(render.spec({ label: "Pressure", value: "—", badge: "?", tone: "warn" }));
	assert.ok(markup.indexOf(">?<") >= 0);
	assert.ok(markup.indexOf("#f59e0b") >= 0, "the warn tone is applied");
});

test("the signature changes when anything visible changes", function () {
	const a = render.spec({ label: "Speed", value: "145.5", unit: "m/s" });
	const b = render.spec({ label: "Speed", value: "146.0", unit: "m/s" });
	const c = render.spec({ label: "Speed", value: "145.5", unit: "m/s" });
	assert.notStrictEqual(render.signature(a), render.signature(b));
	assert.strictEqual(render.signature(a), render.signature(c));
	assert.notStrictEqual(
		render.signature(a),
		render.signature(render.spec({ label: "Speed", value: "145.5", unit: "m/s", tone: "warn" }))
	);
});

test("the renderer only hands back an image when the face changed", function () {
	const renderer = render.createRenderer();
	const face = render.spec({ label: "Speed", value: "145.5", unit: "m/s" });

	const first = renderer.image("key-a", face);
	assert.ok(first.indexOf("data:image/svg+xml") === 0);
	assert.strictEqual(renderer.image("key-a", face), null, "an unchanged face is not re-sent");
	assert.strictEqual(
		renderer.image("key-b", face),
		first,
		"another key showing the same face shares the image"
	);

	renderer.forget("key-a");
	assert.strictEqual(renderer.image("key-a", face), first, "a redrawn key gets the image again");
});

test("an encoded data uri survives a round trip", function () {
	const face = render.spec({ label: "Mass", value: "48.2", unit: "t" });
	const uri = render.dataUri(face);
	const encoded = uri.slice("data:image/svg+xml;charset=utf8,".length);
	assert.strictEqual(decodeURIComponent(encoded), render.svg(face));
});
