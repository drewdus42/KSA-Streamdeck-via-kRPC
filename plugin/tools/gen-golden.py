"""Generate golden protocol vectors from the reference kRPC implementation.

Run with the reference virtual environment:

    tools/.venv-ref/Scripts/python.exe tools/gen-golden.py

The output (test/golden.json) is checked in so the JavaScript tests need no
Python. It targets the kRPC 0.7.0 protocol, which is what the kRPC for Kitten
Space Agency mod serves. Regenerate only when the protocol changes.
"""

import binascii
import json
import os
import struct

import krpc.schema.KRPC_pb2 as K
from krpc.decoder import Decoder
from krpc.encoder import Encoder
from krpc.types import Types

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "test", "golden.json")

types = Types()

messages = []
values = []


def add_message(name, message):
    messages.append(
        {
            "name": name,
            "type": message.DESCRIPTOR.name,
            "hex": message.SerializeToString().hex(),
        }
    )


def type_message(code, **fields):
    message = K.Type(code=code)
    for key, value in fields.items():
        if isinstance(value, (list, tuple)):
            getattr(message, key).extend(value)
        else:
            setattr(message, key, value)
    return message


def add_value(name, type_msg, value, json_value, check=True):
    spec = types.as_type(type_msg)
    encoded = Encoder.encode(value, spec)
    if check:
        decoded = Decoder.decode(None, encoded, spec)
        assert decoded == value, (name, decoded, value)
    values.append(
        {
            "name": name,
            "type": type_message_to_json(type_msg),
            "hex": binascii.hexlify(encoded).decode("ascii"),
            "value": json_value,
        }
    )


def type_message_to_json(type_msg):
    out = {"code": type_msg.code}
    if type_msg.service:
        out["service"] = type_msg.service
    if type_msg.name:
        out["name"] = type_msg.name
    if type_msg.types:
        out["types"] = [type_message_to_json(t) for t in type_msg.types]
    if type_msg.nullable:
        out["nullable"] = True
    return out


class FakeObject:
    def __init__(self, object_id):
        self._object_id = object_id


class FakeEnum:
    def __init__(self, value):
        self.value = value


# ---------------------------------------------------------------- messages

add_message(
    "connection_request",
    K.ConnectionRequest(
        type=K.ConnectionRequest.RPC,
        client_name="KSA Flight Deck",
        protocol_version=1,
    ),
)

add_message(
    "connection_request_stream",
    K.ConnectionRequest(
        type=K.ConnectionRequest.STREAM,
        protocol_version=1,
        client_identifier=bytes(range(16)),
    ),
)

add_message(
    "connection_response",
    K.ConnectionResponse(
        status=K.ConnectionResponse.OK,
        message="accepted",
        client_identifier=b"\x01\x02\x03",
        protocol_version=1,
    ),
)

call = K.ProcedureCall(service="KSA", procedure="GetUT", service_id=3, procedure_id=11)
call.arguments.append(K.Argument(position=0, value=struct.pack("<d", 1.5)))
second = K.ProcedureCall(service="Flight", procedure="GetMeanAltitude")
second.arguments.append(K.Argument(position=0, value=b"\x2a"))
second.arguments.append(K.Argument(position=1, is_null=True))
request = K.Request()
request.calls.extend([call, second])
add_message("request", request)

result = K.ProcedureResult(value=struct.pack("<d", 42.25))
failure = K.ProcedureResult(
    error=K.Error(service="KSA", name="NoSuchThing", description="boom", stack_trace="at x")
)
response = K.Response()
response.results.extend([result, failure])
add_message("response", response)

update = K.StreamUpdate()
streamed = update.results.add()
streamed.id = 3
streamed.result.value = struct.pack("<f", 1.5)
add_message("stream_update", update)

service = K.Service(name="KSA")
proc = service.procedures.add()
proc.name = "GetActiveVehicle"
proc.return_type.code = K.Type.CLASS
proc.return_type.service = "KSA"
proc.return_type.name = "Vehicle"
param = proc.parameters.add()
param.name = "reference_frame"
param.type.code = K.Type.CLASS
param.type.service = "ReferenceFrame"
param.type.name = "ReferenceFrame"
param.has_default_value = True
param.default_value_is_null = True
proc.game_scenes.extend([K.Procedure.FLIGHT])
service.classes.add().name = "Vehicle"
enum = service.enumerations.add()
enum.name = "AutoPilotMode"
enum_value = enum.values.add()
enum_value.name = "AUTO_PILOT_MODE_PROGRADE"
enum_value.value = 1
struct_info = service.structs.add()
struct_info.name = "Tuple_double_double_double"
field = struct_info.fields.add()
field.name = "item1"
field.type.code = K.Type.DOUBLE
add_message("services", K.Services(services=[service]))

tuple_msg = K.Tuple()
tuple_msg.items.append(struct.pack("<d", 1.0))
tuple_msg.items.append(struct.pack("<d", 2.0))
add_message("tuple", tuple_msg)

dictionary = K.Dictionary()
entry = dictionary.entries.add()
entry.key = Encoder.encode("fuel", types.string_type)
entry.value = Encoder.encode(12.5, types.double_type)
add_message("dictionary", dictionary)

status = K.Status(
    version="0.2.0",
    bytes_read=1234,
    bytes_written=5678,
    rpcs_executed=90,
    max_time_per_update=5000,
    adaptive_rate_control=True,
    protocol_version=1,
)
add_message("status", status)

# ---------------------------------------------------------------- values

add_value("double", type_message(K.Type.DOUBLE), 1.5, 1.5)
add_value("float", type_message(K.Type.FLOAT), 2.75, 2.75)
add_value("sint32", type_message(K.Type.SINT32), -7, -7)
add_value("sint64", type_message(K.Type.SINT64), 12345678901, 12345678901)
add_value("uint32", type_message(K.Type.UINT32), 300, 300)
add_value("uint64", type_message(K.Type.UINT64), 1234567890123, 1234567890123)
add_value("bool_true", type_message(K.Type.BOOL), True, True)
add_value("bool_false", type_message(K.Type.BOOL), False, False)
add_value("string", type_message(K.Type.STRING), "h\u00e9llo", "h\u00e9llo")
add_value("string_empty", type_message(K.Type.STRING), "", "")
add_value("bytes", type_message(K.Type.BYTES), b"\x00\x01\xff", "0001ff")
add_value(
    "class",
    type_message(K.Type.CLASS, service="KSA", name="Vehicle"),
    FakeObject(42),
    42,
    check=False,
)
add_value(
    "enumeration",
    type_message(K.Type.ENUMERATION, service="KSA", name="Situation"),
    FakeEnum(3),
    3,
    check=False,
)
add_value(
    "list",
    type_message(K.Type.LIST, types=[type_message(K.Type.DOUBLE)]),
    [1.0, -2.5, 3.0],
    [1.0, -2.5, 3.0],
)
add_value("list_empty", type_message(K.Type.LIST, types=[type_message(K.Type.STRING)]), [], [])
add_value(
    "tuple",
    type_message(K.Type.TUPLE, types=[type_message(K.Type.STRING), type_message(K.Type.DOUBLE)]),
    ("a", 2.0),
    ["a", 2.0],
)
add_value(
    "dictionary",
    type_message(
        K.Type.DICTIONARY, types=[type_message(K.Type.STRING), type_message(K.Type.DOUBLE)]
    ),
    {"fuel": 1.0, "oxidizer": 2.0},
    [["fuel", 1.0], ["oxidizer", 2.0]],
)
add_value(
    "nullable_list",
    type_message(K.Type.LIST, types=[type_message(K.Type.DOUBLE, nullable=True)]),
    [1.0, None, 3.0],
    [1.0, None, 3.0],
)

with open(OUT, "w", encoding="utf-8") as handle:
    json.dump({"messages": messages, "values": values}, handle, indent=2, sort_keys=True)
    handle.write("\n")

print("wrote", os.path.normpath(OUT), len(messages), "messages,", len(values), "values")
