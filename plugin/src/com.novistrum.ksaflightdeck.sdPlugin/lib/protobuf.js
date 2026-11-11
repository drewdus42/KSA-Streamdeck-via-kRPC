/**
 * The slice of protocol buffers that the kRPC wire protocol uses.
 *
 * Transcribed from protobuf/krpc.proto at tag v0.7.0, the protocol the kRPC for
 * Kitten Space Agency mod speaks (it builds against the KRPC.Core 0.7.0 release).
 * Each message on the wire is prefixed with its size as a varint. Values that
 * travel inside `Argument.value` and `ProcedureResult.value` are *not* tagged
 * protobuf fields; they are bare encodings, which krpc-values.js builds on top of
 * the writers here.
 */
"use strict";

const PROTOCOL_VERSION = 1;

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH = 2;
const WIRE_FIXED32 = 5;

const SCALARS = {
	double: { wire: WIRE_FIXED64 },
	float: { wire: WIRE_FIXED32 },
	sint32: { wire: WIRE_VARINT, zigzag: true },
	sint64: { wire: WIRE_VARINT, zigzag: true },
	int32: { wire: WIRE_VARINT, signed: true },
	int64: { wire: WIRE_VARINT, signed: true },
	uint32: { wire: WIRE_VARINT },
	uint64: { wire: WIRE_VARINT },
	enum: { wire: WIRE_VARINT, signed: true },
	bool: { wire: WIRE_VARINT },
	string: { wire: WIRE_LENGTH },
	bytes: { wire: WIRE_LENGTH }
};

/** Field tables, transcribed from krpc.proto v0.7.0 in ascending field order. */
const SCHEMA = {
	ConnectionRequest: {
		type: { id: 1, type: "enum" },
		client_name: { id: 2, type: "string" },
		client_identifier: { id: 3, type: "bytes" },
		protocol_version: { id: 4, type: "uint32" }
	},
	ConnectionResponse: {
		status: { id: 1, type: "enum" },
		message: { id: 2, type: "string" },
		client_identifier: { id: 3, type: "bytes" },
		protocol_version: { id: 4, type: "uint32" }
	},
	Request: {
		calls: { id: 1, type: "ProcedureCall", r: true }
	},
	ProcedureCall: {
		service: { id: 1, type: "string" },
		procedure: { id: 2, type: "string" },
		arguments: { id: 3, type: "Argument", r: true },
		service_id: { id: 4, type: "uint32" },
		procedure_id: { id: 5, type: "uint32" }
	},
	Argument: {
		position: { id: 1, type: "uint32" },
		value: { id: 2, type: "bytes" },
		is_null: { id: 3, type: "bool" }
	},
	Response: {
		error: { id: 1, type: "Error" },
		results: { id: 2, type: "ProcedureResult", r: true }
	},
	ProcedureResult: {
		error: { id: 1, type: "Error" },
		value: { id: 2, type: "bytes" },
		is_null: { id: 3, type: "bool" }
	},
	Error: {
		service: { id: 1, type: "string" },
		name: { id: 2, type: "string" },
		description: { id: 3, type: "string" },
		stack_trace: { id: 4, type: "string" }
	},
	StreamUpdate: {
		results: { id: 1, type: "StreamResult", r: true }
	},
	StreamResult: {
		id: { id: 1, type: "uint64" },
		result: { id: 2, type: "ProcedureResult" }
	},
	Services: {
		services: { id: 1, type: "Service", r: true }
	},
	Service: {
		name: { id: 1, type: "string" },
		procedures: { id: 2, type: "Procedure", r: true },
		classes: { id: 3, type: "Class", r: true },
		enumerations: { id: 4, type: "Enumeration", r: true },
		exceptions: { id: 5, type: "Exception", r: true },
		documentation: { id: 6, type: "string" },
		deprecated: { id: 7, type: "bool" },
		deprecated_reason: { id: 8, type: "string" },
		structs: { id: 9, type: "Struct", r: true }
	},
	Procedure: {
		name: { id: 1, type: "string" },
		parameters: { id: 2, type: "Parameter", r: true },
		return_type: { id: 3, type: "Type" },
		documentation: { id: 5, type: "string" },
		game_scenes: { id: 6, type: "enum", r: true },
		deprecated: { id: 7, type: "bool" },
		deprecated_reason: { id: 8, type: "string" }
	},
	Parameter: {
		name: { id: 1, type: "string" },
		type: { id: 2, type: "Type" },
		default_value: { id: 3, type: "bytes" },
		has_default_value: { id: 5, type: "bool" },
		default_value_is_null: { id: 6, type: "bool" }
	},
	Class: {
		name: { id: 1, type: "string" },
		documentation: { id: 2, type: "string" },
		deprecated: { id: 3, type: "bool" },
		deprecated_reason: { id: 4, type: "string" }
	},
	Enumeration: {
		name: { id: 1, type: "string" },
		values: { id: 2, type: "EnumerationValue", r: true },
		documentation: { id: 3, type: "string" },
		deprecated: { id: 4, type: "bool" },
		deprecated_reason: { id: 5, type: "string" }
	},
	EnumerationValue: {
		name: { id: 1, type: "string" },
		value: { id: 2, type: "int32" },
		documentation: { id: 3, type: "string" },
		deprecated: { id: 4, type: "bool" },
		deprecated_reason: { id: 5, type: "string" }
	},
	Exception: {
		name: { id: 1, type: "string" },
		documentation: { id: 2, type: "string" },
		deprecated: { id: 3, type: "bool" },
		deprecated_reason: { id: 4, type: "string" }
	},
	Struct: {
		name: { id: 1, type: "string" },
		fields: { id: 2, type: "StructField", r: true },
		documentation: { id: 3, type: "string" },
		deprecated: { id: 4, type: "bool" },
		deprecated_reason: { id: 5, type: "string" }
	},
	StructField: {
		name: { id: 1, type: "string" },
		type: { id: 2, type: "Type" },
		documentation: { id: 3, type: "string" },
		deprecated: { id: 4, type: "bool" },
		deprecated_reason: { id: 5, type: "string" }
	},
	Type: {
		code: { id: 1, type: "enum" },
		service: { id: 2, type: "string" },
		name: { id: 3, type: "string" },
		types: { id: 4, type: "Type", r: true },
		nullable: { id: 5, type: "bool" }
	},
	Tuple: {
		items: { id: 1, type: "bytes", r: true }
	},
	List: {
		items: { id: 1, type: "bytes", r: true }
	},
	Set: {
		items: { id: 1, type: "bytes", r: true }
	},
	Dictionary: {
		entries: { id: 1, type: "DictionaryEntry", r: true }
	},
	DictionaryEntry: {
		key: { id: 1, type: "bytes" },
		value: { id: 2, type: "bytes" }
	},
	Stream: {
		id: { id: 1, type: "uint64" }
	},
	Event: {
		stream: { id: 1, type: "Stream" }
	},
	Status: {
		version: { id: 1, type: "string" },
		bytes_read: { id: 2, type: "uint64" },
		bytes_written: { id: 3, type: "uint64" },
		bytes_read_rate: { id: 4, type: "float" },
		bytes_written_rate: { id: 5, type: "float" },
		rpcs_executed: { id: 6, type: "uint64" },
		rpc_rate: { id: 7, type: "float" },
		one_rpc_per_update: { id: 8, type: "bool" },
		max_time_per_update: { id: 9, type: "uint32" },
		adaptive_rate_control: { id: 10, type: "bool" },
		blocking_recv: { id: 11, type: "bool" },
		recv_timeout: { id: 12, type: "uint32" },
		time_per_rpc_update: { id: 13, type: "float" },
		poll_time_per_rpc_update: { id: 14, type: "float" },
		exec_time_per_rpc_update: { id: 15, type: "float" },
		stream_rpcs: { id: 16, type: "uint32" },
		stream_rpcs_executed: { id: 17, type: "uint64" },
		stream_rpc_rate: { id: 18, type: "float" },
		time_per_stream_update: { id: 19, type: "float" },
		protocol_version: { id: 20, type: "uint32" }
	},
	MultiplexedRequest: {
		connection_request: { id: 1, type: "ConnectionRequest" },
		request: { id: 2, type: "Request" }
	},
	MultiplexedResponse: {
		response: { id: 1, type: "Response" },
		stream_update: { id: 2, type: "StreamUpdate" }
	}
};

const TYPE_CODES = {
	NONE: 0,
	DOUBLE: 1,
	FLOAT: 2,
	SINT32: 3,
	SINT64: 4,
	UINT32: 5,
	UINT64: 6,
	BOOL: 7,
	STRING: 8,
	BYTES: 9,
	CLASS: 100,
	ENUMERATION: 101,
	STRUCT: 102,
	EVENT: 200,
	PROCEDURE_CALL: 201,
	STREAM: 202,
	STATUS: 203,
	SERVICES: 204,
	TUPLE: 300,
	LIST: 301,
	SET: 302,
	DICTIONARY: 303
};

const TYPE_CODE_NAMES = {};
Object.keys(TYPE_CODES).forEach(function (name) {
	TYPE_CODE_NAMES[TYPE_CODES[name]] = name;
});

/** Field tables indexed by number, built once per message type. */
const BY_NUMBER = {};
Object.keys(SCHEMA).forEach(function (messageName) {
	const byId = {};
	const fields = SCHEMA[messageName];
	Object.keys(fields).forEach(function (key) {
		byId[fields[key].id] = { key: key, field: fields[key] };
	});
	BY_NUMBER[messageName] = byId;
});

class Writer {
	constructor(capacity) {
		this.buffer = Buffer.allocUnsafe(capacity || 128);
		this.length = 0;
	}

	ensure(extra) {
		const needed = this.length + extra;
		if (needed <= this.buffer.length) {
			return;
		}
		let size = this.buffer.length * 2;
		while (size < needed) {
			size *= 2;
		}
		const next = Buffer.allocUnsafe(size);
		this.buffer.copy(next, 0, 0, this.length);
		this.buffer = next;
	}

	byte(value) {
		this.ensure(1);
		this.buffer[this.length++] = value & 0xff;
	}

	raw(bytes) {
		this.ensure(bytes.length);
		bytes.copy(this.buffer, this.length);
		this.length += bytes.length;
	}

	varint(value) {
		let rest = value;
		while (rest > 0x7f) {
			this.ensure(1);
			this.buffer[this.length++] = (rest % 128) | 0x80;
			rest = Math.floor(rest / 128);
		}
		this.ensure(1);
		this.buffer[this.length++] = rest;
	}

	varintBig(big) {
		let rest = BigInt.asUintN(64, big);
		while (rest > 0x7fn) {
			this.ensure(1);
			this.buffer[this.length++] = Number(rest & 0x7fn) | 0x80;
			rest >>= 7n;
		}
		this.ensure(1);
		this.buffer[this.length++] = Number(rest);
	}

	fixed32(value) {
		this.ensure(4);
		this.buffer.writeFloatLE(value, this.length);
		this.length += 4;
	}

	fixed64(value) {
		this.ensure(8);
		this.buffer.writeDoubleLE(value, this.length);
		this.length += 8;
	}

	tag(id, wire) {
		this.varint(id * 8 + wire);
	}

	result() {
		return this.buffer.slice(0, this.length);
	}
}

class Reader {
	constructor(buffer) {
		this.buffer = buffer;
		this.offset = 0;
	}

	varint() {
		let shift = 1;
		let value = 0;
		let count = 0;
		for (;;) {
			if (this.offset >= this.buffer.length) {
				throw new Error("Truncated varint");
			}
			const byte = this.buffer[this.offset++];
			value += (byte & 0x7f) * shift;
			shift *= 128;
			count++;
			if ((byte & 0x80) === 0) {
				break;
			}
			if (count > 10) {
				throw new Error("Varint too long");
			}
		}
		if (count > 7) {
			this.offset -= count;
			let big = 0n;
			let bits = 0n;
			for (let i = 0; i < count; i++) {
				const byte = this.buffer[this.offset++];
				big |= BigInt(byte & 0x7f) << bits;
				bits += 7n;
			}
			return { value: value, wide: big };
		}
		return { value: value, wide: null };
	}

	fixed32() {
		const value = this.buffer.readFloatLE(this.offset);
		this.offset += 4;
		return value;
	}

	fixed64() {
		const value = this.buffer.readDoubleLE(this.offset);
		this.offset += 8;
		return value;
	}

	lengthDelimited() {
		const length = this.varint().value;
		const end = this.offset + length;
		if (end > this.buffer.length) {
			throw new Error("Truncated length delimited field");
		}
		const slice = this.buffer.subarray(this.offset, end);
		this.offset = end;
		return slice;
	}

	skip(wire) {
		switch (wire) {
			case WIRE_VARINT:
				this.varint();
				return;
			case WIRE_FIXED64:
				this.offset += 8;
				return;
			case WIRE_LENGTH:
				this.lengthDelimited();
				return;
			case WIRE_FIXED32:
				this.offset += 4;
				return;
			default:
				throw new Error("Unsupported wire type " + wire);
		}
	}
}

function isDefault(value) {
	if (value === undefined || value === null) {
		return true;
	}
	if (typeof value === "number") {
		return value === 0;
	}
	if (typeof value === "boolean") {
		return value === false;
	}
	if (typeof value === "string") {
		return value.length === 0;
	}
	if (Buffer.isBuffer(value)) {
		return value.length === 0;
	}
	return false;
}

function writeValue(writer, type, value) {
	if (Object.prototype.hasOwnProperty.call(SCALARS, type)) {
		const scalar = SCALARS[type];
		switch (type) {
			case "double":
				writer.fixed64(value);
				return;
			case "float":
				writer.fixed32(value);
				return;
			case "bool":
				writer.varint(value ? 1 : 0);
				return;
			case "string": {
				const bytes = Buffer.from(String(value), "utf8");
				writer.varint(bytes.length);
				writer.raw(bytes);
				return;
			}
			case "bytes":
				writer.varint(value.length);
				writer.raw(value);
				return;
			default:
				break;
		}
		if (scalar.zigzag) {
			writer.varint(value >= 0 ? value * 2 : -value * 2 - 1);
			return;
		}
		if (scalar.signed && value < 0) {
			writer.varintBig(BigInt(value));
			return;
		}
		writer.varint(value);
		return;
	}

	const encoded = encodeMessage(type, value);
	writer.varint(encoded.length);
	writer.raw(encoded);
}

function writeField(writer, field, value) {
	const scalar = Object.prototype.hasOwnProperty.call(SCALARS, field.type)
		? SCALARS[field.type]
		: null;
	const wire = scalar ? scalar.wire : WIRE_LENGTH;
	if (field.r) {
		const items = value || [];
		if (items.length === 0) {
			return;
		}
		// proto3 packs repeated scalars: one length delimited field holding every value.
		if (scalar && field.type !== "string" && field.type !== "bytes") {
			const packed = new Writer(16);
			for (let i = 0; i < items.length; i++) {
				writeValue(packed, field.type, items[i]);
			}
			const bytes = packed.result();
			writer.tag(field.id, WIRE_LENGTH);
			writer.varint(bytes.length);
			writer.raw(bytes);
			return;
		}
		for (let i = 0; i < items.length; i++) {
			writer.tag(field.id, wire);
			writeValue(writer, field.type, items[i]);
		}
		return;
	}
	if (isDefault(value)) {
		return;
	}
	writer.tag(field.id, wire);
	writeValue(writer, field.type, value);
}

/** Encode a message of the given schema type. */
function encodeMessage(messageName, value) {
	const fields = SCHEMA[messageName];
	if (!fields) {
		throw new Error("Unknown message type " + messageName);
	}
	const writer = new Writer(128);
	const source = value || {};
	Object.keys(fields).forEach(function (key) {
		writeField(writer, fields[key], source[key]);
	});
	return writer.result();
}

function readScalar(reader, type) {
	const scalar = SCALARS[type];
	switch (type) {
		case "double":
			return reader.fixed64();
		case "float":
			return reader.fixed32();
		case "bool":
			return reader.varint().value !== 0;
		case "string":
			return reader.lengthDelimited().toString("utf8");
		case "bytes":
			return Buffer.from(reader.lengthDelimited());
		default:
			break;
	}
	const result = reader.varint();
	if (scalar.zigzag) {
		const raw =
			result.wide === null ? result.value : Number(BigInt.asUintN(64, result.wide));
		return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
	}
	if (scalar.signed) {
		if (result.wide !== null) {
			return Number(BigInt.asIntN(64, result.wide));
		}
		return result.value > 0x7fffffff ? result.value - 0x100000000 : result.value;
	}
	return result.value;
}

/** Decode a buffer holding a message of the given schema type. */
function decodeMessage(messageName, buffer) {
	const fields = SCHEMA[messageName];
	if (!fields) {
		throw new Error("Unknown message type " + messageName);
	}
	const byId = BY_NUMBER[messageName];
	const reader = new Reader(buffer);
	const out = {};
	while (reader.offset < reader.buffer.length) {
		const tagResult = reader.varint();
		if (tagResult.wide !== null) {
			throw new Error("Oversized tag");
		}
		const tag = tagResult.value;
		const id = Math.floor(tag / 8);
		const wire = tag % 8;
		const entry = byId[id];
		if (!entry) {
			reader.skip(wire);
			continue;
		}
		const field = entry.field;
		const scalar = Object.prototype.hasOwnProperty.call(SCALARS, field.type)
			? SCALARS[field.type]
			: null;
		let value;
		if (scalar) {
			if (field.r && wire === WIRE_LENGTH && field.type !== "string" && field.type !== "bytes") {
				// A packed repeated scalar: every value shares one length delimited field.
				const packed = reader.lengthDelimited();
				const inner = new Reader(packed);
				if (!out[entry.key]) {
					out[entry.key] = [];
				}
				while (inner.offset < inner.buffer.length) {
					out[entry.key].push(readScalar(inner, field.type));
				}
				continue;
			}
			value = readScalar(reader, field.type);
		} else if (wire === WIRE_LENGTH) {
			value = decodeMessage(field.type, reader.lengthDelimited());
		} else {
			reader.skip(wire);
			continue;
		}
		if (field.r) {
			if (!out[entry.key]) {
				out[entry.key] = [];
			}
			out[entry.key].push(value);
		} else {
			out[entry.key] = value;
		}
	}
	return out;
}

/** Bytes of a message with its varint size prefix, as kRPC frames them. */
function frame(messageName, value) {
	const body = encodeMessage(messageName, value);
	const writer = new Writer(body.length + 5);
	writer.varint(body.length);
	writer.raw(body);
	return writer.result();
}

/**
 * Splits whatever arrives on the socket into length prefixed message bodies.
 */
class FrameReader {
	constructor() {
		this.buffer = Buffer.alloc(0);
	}

	push(chunk) {
		this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
	}

	/** Next complete message body, or null when only a partial message is buffered. */
	next() {
		let size = 0;
		let shift = 1;
		let offset = 0;
		for (;;) {
			if (offset >= this.buffer.length) {
				return null;
			}
			const byte = this.buffer[offset++];
			size += (byte & 0x7f) * shift;
			shift *= 128;
			if ((byte & 0x80) === 0) {
				break;
			}
			if (offset > 4) {
				throw new Error("Malformed message size");
			}
		}
		if (this.buffer.length < offset + size) {
			return null;
		}
		const body = this.buffer.subarray(offset, offset + size);
		this.buffer = this.buffer.subarray(offset + size);
		return body;
	}
}

module.exports = {
	PROTOCOL_VERSION: PROTOCOL_VERSION,
	SCHEMA: SCHEMA,
	TYPE_CODES: TYPE_CODES,
	TYPE_CODE_NAMES: TYPE_CODE_NAMES,
	Writer: Writer,
	Reader: Reader,
	FrameReader: FrameReader,
	encodeMessage: encodeMessage,
	decodeMessage: decodeMessage,
	frame: frame,
	writeValue: writeValue,
	readScalar: readScalar
};
