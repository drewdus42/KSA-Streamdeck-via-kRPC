/**
 * Encodes and decodes the *values* carried inside kRPC messages.
 *
 * An argument or a result holds bare bytes, not a tagged protobuf field: a double
 * is eight little endian bytes, an object is the varint id of the remote object, an
 * enumeration is a zigzag varint of its number, and a collection is a serialized
 * Tuple/List/Set/Dictionary message whose items are themselves bare values. Both
 * sides of the wire shape a value from the `Type` message the server publishes, so
 * this module is driven entirely by reflection.
 */
"use strict";

const schema = require("./protobuf");

const CODE = schema.TYPE_CODES;

const SCALAR_NAMES = {
	[CODE.DOUBLE]: "double",
	[CODE.FLOAT]: "float",
	[CODE.SINT32]: "sint32",
	[CODE.SINT64]: "sint64",
	[CODE.UINT32]: "uint32",
	[CODE.UINT64]: "uint64",
	[CODE.BOOL]: "bool",
	[CODE.STRING]: "string",
	[CODE.BYTES]: "bytes"
};

// Types that travel as a whole protocol buffer message rather than a bare value.
const MESSAGE_NAMES = {
	[CODE.SERVICES]: "Services",
	[CODE.STATUS]: "Status",
	[CODE.EVENT]: "Event",
	[CODE.STREAM]: "Stream",
	[CODE.PROCEDURE_CALL]: "ProcedureCall"
};

function typeName(type) {
	if (!type) {
		return "void";
	}
	switch (type.code) {
		case CODE.CLASS:
		case CODE.ENUMERATION:
			return (type.service ? type.service + "." : "") + (type.name || "?");
		case CODE.TUPLE:
			return (
				"(" +
				(type.types || [])
					.map(function (item) {
						return typeName(item);
					})
					.join(", ") +
				")"
			);
		case CODE.LIST:
		case CODE.SET:
			return typeName((type.types || [])[0]) + "[]";
		case CODE.DICTIONARY: {
			const types = type.types || [];
			return "{" + typeName(types[0]) + ": " + typeName(types[1]) + "}";
		}
		case CODE.STRUCT:
			return (type.service ? type.service + "." : "") + (type.name || "?");
		default:
			return SCALAR_NAMES[type.code] || (schema.TYPE_CODE_NAMES[type.code] || "none").toLowerCase();
	}
}

/** Whether the type carries a value at all (a void procedure has none). */
function hasValue(type) {
	return Boolean(type) && type.code !== CODE.NONE;
}

function encodeScalar(type, value) {
	const writer = new schema.Writer(16);
	schema.writeValue(writer, SCALAR_NAMES[type.code], value);
	return writer.result();
}

/**
 * @param {{ enumerations?: Map<string, object> }} registry  reflection, for enum names
 */
function createCodec(registry) {
	let enums = (registry && registry.enumerations) || new Map();
	let structs = (registry && registry.structs) || new Map();

	/** Point the codec at the reflection of the server it is talking to. */
	function useRegistry(next) {
		enums = (next && next.enumerations) || new Map();
		structs = (next && next.structs) || new Map();
	}

	function enumeration(type) {
		return enums.get(type.service + "." + type.name) || null;
	}

	/** The numeric value of an enumeration, given a number or its name. */
	function enumNumber(type, value) {
		if (typeof value === "number") {
			return value;
		}
		const definition = enumeration(type);
		if (!definition) {
			throw new Error("Unknown enumeration " + typeName(type));
		}
		const found = (definition.values || []).find(function (entry) {
			return entry.name === value;
		});
		if (!found) {
			throw new Error("Unknown value " + value + " for " + typeName(type));
		}
		return found.value;
	}

	/** The declaration name of an enumeration value, e.g. AUTO_PILOT_MODE_PROGRADE. */
	function enumName(type, value) {
		const definition = enumeration(type);
		if (!definition) {
			return String(value);
		}
		const found = (definition.values || []).find(function (entry) {
			return entry.value === value;
		});
		return found ? found.name : String(value);
	}

	/** A value at a position inside another value, which carries its own presence bool. */
	function encodeItem(type, value) {
		if (!type.nullable) {
			return encode(type, value);
		}
		const writer = new schema.Writer(16);
		if (value === null || value === undefined) {
			writer.varint(0);
			return writer.result();
		}
		writer.varint(1);
		writer.raw(encode(type, value));
		return writer.result();
	}

	function encode(type, value) {
		switch (type.code) {
			case CODE.CLASS:
				return encodeScalar({ code: CODE.UINT64 }, Number(value));
			case CODE.ENUMERATION:
				return encodeScalar({ code: CODE.SINT32 }, enumNumber(type, value));
			case CODE.TUPLE:
			case CODE.STRUCT: {
				const itemTypes = itemTypesOf(type, structs);
				return schema.encodeMessage("Tuple", {
					items: itemTypes.map(function (item, index) {
						return encodeItem(item, value[index]);
					})
				});
			}
			case CODE.LIST:
			case CODE.SET:
				return schema.encodeMessage(type.code === CODE.SET ? "Set" : "List", {
					items: toArray(value).map(function (item) {
						return encodeItem((type.types || [])[0] || { code: CODE.NONE }, item);
					})
				});
			case CODE.DICTIONARY: {
				const types = type.types || [];
				const keyType = types[0] || { code: CODE.NONE };
				const valueType = types[1] || { code: CODE.NONE };
				return schema.encodeMessage("Dictionary", {
					entries: dictionaryEntries(value)
						.map(function (entry) {
							return { key: encodeItem(keyType, entry[0]), value: encodeItem(valueType, entry[1]) };
						})
						.sort(function (left, right) {
							return Buffer.compare(left.key, right.key);
						})
				});
			}
			default:
				if (MESSAGE_NAMES[type.code]) {
					return schema.encodeMessage(MESSAGE_NAMES[type.code], value);
				}
				if (!SCALAR_NAMES[type.code]) {
					throw new Error("Cannot encode values of type " + typeName(type));
				}
				return encodeScalar(type, value);
		}
	}

	function decodeItem(type, buffer) {
		if (!type.nullable) {
			return decode(type, buffer);
		}
		const reader = new schema.Reader(buffer);
		const present = reader.varint().value !== 0;
		if (!present) {
			return null;
		}
		return decode(type, buffer.subarray(reader.offset));
	}

	function decode(type, buffer) {
		if (!buffer || buffer.length === 0) {
			return null;
		}
		switch (type.code) {
			case CODE.CLASS:
				return schema.readScalar(new schema.Reader(buffer), "uint64");
			case CODE.ENUMERATION:
				return schema.readScalar(new schema.Reader(buffer), "sint32");
			case CODE.TUPLE:
			case CODE.STRUCT: {
				const message = schema.decodeMessage("Tuple", buffer);
				const itemTypes = itemTypesOf(type, structs);
				return (message.items || []).map(function (item, index) {
					return decodeItem(itemTypes[index] || { code: CODE.NONE }, item);
				});
			}
			case CODE.LIST:
			case CODE.SET: {
				const message = schema.decodeMessage(type.code === CODE.SET ? "Set" : "List", buffer);
				const itemType = (type.types || [])[0] || { code: CODE.NONE };
				return (message.items || []).map(function (item) {
					return decodeItem(itemType, item);
				});
			}
			case CODE.DICTIONARY: {
				const message = schema.decodeMessage("Dictionary", buffer);
				const types = type.types || [];
				const keyType = types[0] || { code: CODE.NONE };
				const valueType = types[1] || { code: CODE.NONE };
				return (message.entries || []).map(function (entry) {
					return [decodeItem(keyType, entry.key || Buffer.alloc(0)), decodeItem(valueType, entry.value || Buffer.alloc(0))];
				});
			}
			default: {
				if (MESSAGE_NAMES[type.code]) {
					return schema.decodeMessage(MESSAGE_NAMES[type.code], buffer);
				}
				const name = SCALAR_NAMES[type.code];
				if (!name) {
					throw new Error("Cannot decode values of type " + typeName(type));
				}
				return schema.readScalar(new schema.Reader(buffer), name);
			}
		}
	}

	return {
		useRegistry: useRegistry,
		encode: encode,
		decode: decode,
		encodeItem: encodeItem,
		decodeItem: decodeItem,
		enumName: enumName,
		enumNumber: enumNumber
	};
}

function itemTypesOf(type, structs) {
	if (type.code === CODE.STRUCT) {
		const definition = structs ? structs.get(type.service + "." + type.name) : null;
		if (!definition) {
			return [];
		}
		return (definition.fields || []).map(function (field) {
			return field.type;
		});
	}
	return type.types || [];
}

function toArray(value) {
	if (Array.isArray(value)) {
		return value;
	}
	if (value === null || value === undefined) {
		return [];
	}
	return Array.from(value);
}

function dictionaryEntries(value) {
	if (Array.isArray(value)) {
		return value.map(function (entry) {
			return Array.isArray(entry) ? entry : [entry.key, entry.value];
		});
	}
	return Object.keys(value).map(function (key) {
		return [key, value[key]];
	});
}

module.exports = {
	CODE: CODE,
	createCodec: createCodec,
	typeName: typeName,
	hasValue: hasValue
};
