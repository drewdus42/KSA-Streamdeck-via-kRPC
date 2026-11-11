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
	const longNumber = render.spec({ value: "1234567890123" });
	assert.ok(render.textWidth(longNumber.value) * longNumber.valueSize <= 112,
		"a long counter value fits within the display");
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
	assert.ok(markup.indexOf("#202020") >= 0, "the neutral instrument display is applied");
	assert.ok(markup.includes('height="136" rx="18"'), "the panel has rounded corners");
	assert.ok(markup.includes('height="58" rx="6"'), "the inset display has rounded corners");
	assert.ok(markup.indexOf("Consolas") >= 0, "numerical readouts use the counter font");
	assert.ok(markup.includes('stroke-opacity=".08"'), "counter digits have subtle divisions");
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
	assert.ok(markup.indexOf("#e6df39") >= 0, "the warn tone is applied");
	assert.ok(markup.includes('<rect x="105" y="19" width="18" height="18"'), "the badge stays in the header");
});

test("values are centered in the display and units stay below its border", function () {
	const markup = render.svg(render.spec({ label: "Altitude", value: "24.7", unit: "km", tone: "live" }));
	assert.match(markup, /<text x="72" y="74"[^>]*dominant-baseline="central"[^>]*>24\.7<\/text>/);
	assert.match(markup, /<text x="72" y="123"[^>]*font-size="14"[^>]*>km<\/text>/);
	const status = render.svg(render.spec({ label: "Engine", value: "ON", tone: "on" }));
	assert.match(status, /<text x="72" y="71"[^>]*dominant-baseline="central"[^>]*>ON<\/text>/);
	assert.ok(!status.includes("<circle"), "the panel has no decorative corner bolts");
	const withFooter = render.svg(render.spec({ value: "1", unit: "km", footer: "available" }));
	assert.match(withFooter, /<text x="16" y="123" text-anchor="start"[^>]*>km<\/text>/);
	assert.match(withFooter, /<text x="128" y="123" text-anchor="end"[^>]*>available<\/text>/);
});

test("status colors remain distinct against the dark instrument panel", function () {
	const faces = ["live", "on", "off", "warn", "error"].map(function (tone) {
		return render.svg(render.spec({ label: "Engine", value: "ON", tone: tone }));
	});
	assert.ok(faces.every(function (face) { return face.includes('fill="#121212"'); }));
	assert.ok(faces[1].includes('fill="#24e638"'));
	assert.ok(faces[2].includes('fill="#363636"'));
	assert.ok(faces[3].includes('fill="#e6df39"'));
	assert.ok(faces[4].includes('fill="#cf2525"'));
	assert.ok(!faces[1].includes('stroke-opacity=".08"'), "text buttons have no counter divisions");
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
