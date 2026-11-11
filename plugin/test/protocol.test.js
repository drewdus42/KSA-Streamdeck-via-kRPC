"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const schema = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/protobuf");
const values = require("../src/com.novistrum.ksaflightdeck.sdPlugin/lib/krpc-values");

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "golden.json"), "utf8"));

// The golden vectors come from the reference kRPC 0.7.0 implementation, so these
// tests prove the JavaScript codec speaks the same bytes as the python client.

test("decoding and re-encoding a reference message reproduces its bytes exactly", function () {
	for (const vector of golden.messages) {
		const buffer = Buffer.from(vector.hex, "hex");
		const decoded = schema.decodeMessage(vector.type, buffer);
		const encoded = schema.encodeMessage(vector.type, decoded);
		assert.strictEqual(
			encoded.toString("hex"),
			vector.hex,
			"message " + vector.name + " did not round trip"
		);
	}
});

test("a reference connection request decodes to the expected field values", function () {
	const vector = golden.messages.find(function (entry) {
		return entry.name === "connection_request";
	});
	const decoded = schema.decodeMessage("ConnectionRequest", Buffer.from(vector.hex, "hex"));
	assert.strictEqual(decoded.client_name, "KSA Flight Deck");
	assert.strictEqual(decoded.protocol_version, 1);
	assert.strictEqual(decoded.type || 0, 0, "RPC is the default connection type");
});

test("a reference request decodes to two calls with ordered arguments", function () {
	const vector = golden.messages.find(function (entry) {
		return entry.name === "request";
	});
	const decoded = schema.decodeMessage("Request", Buffer.from(vector.hex, "hex"));
	assert.strictEqual(decoded.calls.length, 2);
	assert.strictEqual(decoded.calls[0].service, "KSA");
	assert.strictEqual(decoded.calls[0].procedure, "GetUT");
	assert.strictEqual(decoded.calls[0].arguments[0].position || 0, 0);
	assert.strictEqual(decoded.calls[1].procedure, "GetMeanAltitude");
	assert.strictEqual(decoded.calls[1].arguments[1].is_null, true);
});

test("a reference response decodes results and errors in order", function () {
	const vector = golden.messages.find(function (entry) {
		return entry.name === "response";
	});
	const decoded = schema.decodeMessage("Response", Buffer.from(vector.hex, "hex"));
	assert.strictEqual(decoded.results.length, 2);
	assert.strictEqual(decoded.results[0].value.length, 8);
	assert.strictEqual(decoded.results[1].error.name, "NoSuchThing");
});

test("a reference services message decodes the whole reflection tree", function () {
	const vector = golden.messages.find(function (entry) {
		return entry.name === "services";
	});
	const decoded = schema.decodeMessage("Services", Buffer.from(vector.hex, "hex"));
	const service = decoded.services[0];
	assert.strictEqual(service.name, "KSA");
	assert.strictEqual(service.procedures[0].name, "GetActiveVehicle");
	assert.strictEqual(service.procedures[0].return_type.code, schema.TYPE_CODES.CLASS);
	assert.strictEqual(service.procedures[0].return_type.name, "Vehicle");
	assert.strictEqual(service.procedures[0].parameters[0].name, "reference_frame");
	assert.strictEqual(service.procedures[0].parameters[0].has_default_value, true);
	assert.strictEqual(service.procedures[0].game_scenes[0], 1);
	assert.strictEqual(service.enumerations[0].values[0].name, "AUTO_PILOT_MODE_PROGRADE");
	assert.strictEqual(service.structs[0].fields[0].type.code, schema.TYPE_CODES.DOUBLE);
});

test("reference values decode to the values they were produced from", function () {
	const codec = values.createCodec({
		enumerations: new Map([
			[
				"KSA.Situation",
				{ values: [{ name: "SITUATION_LANDED", value: 3 }] }
			]
		])
	});
	for (const vector of golden.values) {
		const decoded = codec.decode(vector.type, Buffer.from(vector.hex, "hex"));
		const expected = vector.value;
		if (vector.name === "bytes") {
			assert.strictEqual(decoded.toString("hex"), expected, "value " + vector.name);
		} else if (vector.name === "dictionary") {
			assert.deepStrictEqual(
				decoded.slice().sort(),
				expected.slice().sort(),
				"value " + vector.name
			);
		} else if (vector.name === "string_empty" || vector.name === "list_empty") {
			assert.deepStrictEqual(decoded === null ? [] : decoded, expected, "value " + vector.name);
		} else if (vector.name === "bool_false") {
			assert.strictEqual(decoded, false, "value " + vector.name);
		} else {
			assert.deepStrictEqual(decoded, expected, "value " + vector.name);
		}
	}
});

test("values encode back to the exact reference bytes", function () {
	const codec = values.createCodec({
		enumerations: new Map([["KSA.Situation", { values: [{ name: "SITUATION_LANDED", value: 3 }] }]])
	});
	for (const vector of golden.values) {
		const input =
			vector.name === "bytes" ? Buffer.from(vector.value, "hex") : vector.value;
		const encoded = codec.encode(vector.type, input);
		assert.strictEqual(
			encoded.toString("hex"),
			vector.hex,
			"value " + vector.name + " did not encode to the reference bytes"
		);
	}
});

test("an enumeration can be written by name and read back by number", function () {
	const codec = values.createCodec({
		enumerations: new Map([
			[
				"KSA.AutoPilotMode",
				{
					values: [
						{ name: "AUTO_PILOT_MODE_HOLD", value: 0 },
						{ name: "AUTO_PILOT_MODE_PROGRADE", value: 1 }
					]
				}
			]
		])
	});
	const type = { code: schema.TYPE_CODES.ENUMERATION, service: "KSA", name: "AutoPilotMode" };
	const encoded = codec.encode(type, "AUTO_PILOT_MODE_PROGRADE");
	assert.strictEqual(codec.decode(type, encoded), 1);
	assert.strictEqual(codec.enumName(type, 1), "AUTO_PILOT_MODE_PROGRADE");
	assert.throws(function () {
		codec.encode(type, "AUTO_PILOT_MODE_SIDEWAYS");
	}, /Unknown value/);
});

test("frames carry a varint size prefix and survive being split anywhere", function () {
	const body = schema.encodeMessage("Request", {
		calls: [{ service: "KSA", procedure: "GetUT", arguments: [] }]
	});
	const framed = schema.frame("Request", {
		calls: [{ service: "KSA", procedure: "GetUT", arguments: [] }]
	});
	assert.strictEqual(framed.length, body.length + 1);
	assert.strictEqual(framed[0], body.length);

	const reader = new schema.FrameReader();
	for (let i = 0; i < framed.length; i++) {
		reader.push(framed.subarray(i, i + 1));
		if (i < framed.length - 1) {
			assert.strictEqual(reader.next(), null, "no message before the last byte");
		}
	}
	const complete = reader.next();
	assert.deepStrictEqual(Buffer.from(complete), body);
	assert.strictEqual(reader.next(), null);
});

test("a large message uses a multi byte size prefix", function () {
	const calls = [];
	for (let i = 0; i < 40; i++) {
		calls.push({ service: "KSA", procedure: "GetUT", arguments: [] });
	}
	const framed = schema.frame("Request", { calls: calls });
	const reader = new schema.FrameReader();
	reader.push(framed);
	const body = reader.next();
	assert.ok(body.length > 127, "message should be big enough for a two byte prefix");
	assert.strictEqual(schema.decodeMessage("Request", body).calls.length, 40);
});

test("type names describe reflected types for messages", function () {
	const code = schema.TYPE_CODES;
	assert.strictEqual(values.typeName({ code: code.DOUBLE }), "double");
	assert.strictEqual(values.typeName({ code: code.CLASS, service: "KSA", name: "Vehicle" }), "KSA.Vehicle");
	assert.strictEqual(
		values.typeName({ code: code.TUPLE, types: [{ code: code.DOUBLE }, { code: code.DOUBLE }] }),
		"(double, double)"
	);
	assert.strictEqual(values.typeName({ code: code.LIST, types: [{ code: code.FLOAT }] }), "float[]");
	assert.strictEqual(values.hasValue(undefined), false);
	assert.strictEqual(values.hasValue({ code: code.NONE }), false);
	assert.strictEqual(values.hasValue({ code: code.DOUBLE }), true);
});
