"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SDP = path.join(__dirname, "..", "src", "com.novistrum.ksaflightdeck.sdPlugin");
const ksa = require(path.join(SDP, "lib", "ksa"));

function read(relative) {
	return fs.readFileSync(path.join(SDP, relative), "utf8");
}

function exists(relative) {
	return fs.existsSync(path.join(SDP, relative));
}

function pngSize(relative) {
	const buffer = fs.readFileSync(path.join(SDP, relative));
	assert.strictEqual(buffer.slice(1, 4).toString("ascii"), "PNG", relative + " is not a PNG");
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const manifest = JSON.parse(read("manifest.json"));

test("the manifest describes the plugin and its actions", function () {
	assert.strictEqual(manifest.SDKVersion, 2);
	assert.ok(manifest.Name.length > 0);
	assert.ok(manifest.Author.length > 0);
	assert.ok(
		manifest.Version.match(/^\d+\.\d+\.\d+(\.\d+)?$/),
		"version is major.minor.patch[.build]"
	);
	assert.ok(exists(manifest.CodePath), "CodePath exists");
	assert.ok(manifest.Actions.length >= 6, "the plugin offers its actions");
	const uuids = new Set();
	manifest.Actions.forEach(function (action) {
		assert.ok(action.UUID.startsWith("com.novistrum.ksaflightdeck."), action.UUID + " is namespaced");
		assert.ok(!uuids.has(action.UUID), "duplicate action uuid " + action.UUID);
		uuids.add(action.UUID);
		assert.ok(action.Name.length > 0, action.UUID + " has a name");
		assert.ok(action.Tooltip.length > 0, action.UUID + " has a tooltip");
		assert.ok(action.States.length > 0, action.UUID + " has a state");
		action.States.forEach(function (state) {
			assert.ok(exists(state.Image + ".png"), action.UUID + " state image " + state.Image);
		});
		if (action.PropertyInspectorPath) {
			assert.ok(exists(action.PropertyInspectorPath), action.UUID + " inspector exists");
		}
	});
});

test("every action in the manifest is handled by the plugin", function () {
	const app = require(path.join(SDP, "bin", "plugin.js"));
	const handled = Object.keys(app.ACTION).map(function (key) {
		return app.ACTION[key];
	});
	manifest.Actions.forEach(function (action) {
		assert.ok(handled.indexOf(action.UUID) >= 0, action.UUID + " is not handled in app.js");
	});
});

test("the plugin runs on Node, as the current SDK expects", function () {
	assert.strictEqual(manifest.CodePath, "bin/plugin.js");
	assert.ok(exists(manifest.CodePath), "the entry point exists");
	assert.ok(manifest.Nodejs && manifest.Nodejs.Version, "the manifest asks for a Node runtime");
	assert.ok(!exists("app.html"), "no legacy page entry point is shipped");
});

test("icons exist at the sizes Stream Deck asks for", function () {
	assert.deepStrictEqual(pngSize(manifest.Icon + ".png"), { width: 28, height: 28 });
	assert.deepStrictEqual(pngSize(manifest.Icon + "@2x.png"), { width: 56, height: 56 });
	assert.deepStrictEqual(pngSize(manifest.CategoryIcon + ".png"), { width: 28, height: 28 });

	manifest.Actions.forEach(function (action) {
		assert.deepStrictEqual(pngSize(action.Icon + ".png"), { width: 20, height: 20 }, action.Icon);
		assert.deepStrictEqual(pngSize(action.Icon + "@2x.png"), { width: 40, height: 40 }, action.Icon + "@2x");
		action.States.forEach(function (state) {
			assert.deepStrictEqual(pngSize(state.Image + ".png"), { width: 72, height: 72 }, state.Image);
			assert.deepStrictEqual(
				pngSize(state.Image + "@2x.png"),
				{ width: 144, height: 144 },
				state.Image + "@2x"
			);
		});
	});
});

test("encoder layouts are valid and referenced", function () {
	manifest.Actions.forEach(function (action) {
		if (!action.Encoder) {
			return;
		}
		assert.ok(exists(action.Encoder.layout), action.UUID + " layout exists");
		const layout = JSON.parse(read(action.Encoder.layout));
		assert.ok(Array.isArray(layout.items) && layout.items.length > 0, "layout has items");
		layout.items.forEach(function (item) {
			assert.ok(item.key, "layout item has a key");
			assert.strictEqual(item.type, "text", "only text items are used");
			assert.strictEqual(item.rect.length, 4, "layout item has a rect");
		});
	});
});

test("the readout inspector offers exactly the readouts the plugin knows", function () {
	const html = read("actions/readout-inspector.html");
	const offered = [];
	const pattern = /data-metric="([^"]+)"/g;
	let match = pattern.exec(html);
	while (match) {
		offered.push(match[1]);
		match = pattern.exec(html);
	}
	const known = ksa.METRICS.map(function (metric) {
		return metric.id;
	});
	assert.deepStrictEqual(offered.slice().sort(), known.slice().sort());
});

test("the auto-pilot inspector offers exactly the modes the plugin knows", function () {
	const html = read("actions/autopilot-inspector.html");
	const offered = [];
	const pattern = /data-mode="([^"]+)"/g;
	let match = pattern.exec(html);
	while (match) {
		offered.push(match[1]);
		match = pattern.exec(html);
	}
	const known = ksa.AUTO_PILOT_MODES.map(function (mode) {
		return mode.name;
	});
	assert.deepStrictEqual(offered.slice().sort(), known.slice().sort());
});

test("the toggle inspector offers exactly the toggles the plugin knows", function () {
	const html = read("actions/toggle-inspector.html");
	const offered = [];
	const pattern = /data-toggle="([^"]+)"/g;
	let match = pattern.exec(html);
	while (match) {
		offered.push(match[1]);
		match = pattern.exec(html);
	}
	assert.deepStrictEqual(offered.slice().sort(), Object.keys(ksa.TOGGLES).sort());
});

test("every property inspector loads the shared plumbing", function () {
	manifest.Actions.forEach(function (action) {
		if (!action.PropertyInspectorPath) {
			return;
		}
		const html = read(action.PropertyInspectorPath);
		assert.ok(html.indexOf('src="pi.js"') >= 0, action.PropertyInspectorPath + " loads pi.js");
		assert.ok(html.indexOf('href="pi.css"') >= 0, action.PropertyInspectorPath + " loads pi.css");
	});
});

test("the plugin module graph loads without a game or Stream Deck", function () {
	const app = require(path.join(SDP, "bin", "plugin.js"));
	assert.ok(app.ACTION.readout.indexOf("readout") > 0);
	assert.strictEqual(typeof app.start, "function");
});

test("the localization file covers every action", function () {
	const localization = JSON.parse(read("en.json"));
	assert.ok(localization.Name.length > 0);
	manifest.Actions.forEach(function (action) {
		assert.ok(localization[action.UUID], action.UUID + " is localized");
		assert.ok(localization[action.UUID].Name.length > 0);
		assert.ok(localization[action.UUID].Tooltip.length > 0);
	});
});
