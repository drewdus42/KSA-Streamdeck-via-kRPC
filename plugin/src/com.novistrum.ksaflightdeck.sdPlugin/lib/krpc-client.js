/**
 * A kRPC client for the protocol buffered TCP server that the kRPC mod runs.
 *
 * The server publishes its whole API when a client connects (KRPC.GetServices), so
 * every call is shaped from that reflection: the client needs no generated stubs and
 * keeps working when KSA or the mod adds procedures. Requests are strictly one at a
 * time per connection, which is exactly what a poll loop wants, and several calls in
 * one request keep a snapshot down to a single round trip.
 */
"use strict";

const net = require("net");

const schema = require("./protobuf");
const values = require("./krpc-values");

const CONNECTION_TYPE_RPC = 0;
const STATUS_OK = 0;

const DEFAULTS = {
	host: "127.0.0.1",
	port: 50000,
	name: "KSA Flight Deck",
	connectTimeoutMs: 4000,
	requestTimeoutMs: 4000
};

class RpcError extends Error {
	constructor(error, fallback) {
		const service = (error && error.service) || "";
		const rpc = (error && error.name) || "";
		const description = (error && error.description) || fallback || "Remote call failed";
		super(description);
		this.name = rpc || "RpcError";
		this.service = service;
		this.rpc = rpc;
		this.description = description;
		this.code = "rpc";
	}
}

function offlineError(message) {
	const error = new Error(message || "The kRPC server is not reachable");
	error.code = "offline";
	return error;
}

class KrpcError extends Error {
	constructor(message) {
		super(message);
		this.name = "KrpcError";
		this.code = "protocol";
	}
}

function buildRegistry(servicesMessage) {
	const services = new Map();
	const enumerations = new Map();
	const structs = new Map();

	(servicesMessage.services || []).forEach(function (service) {
		const entry = {
			name: service.name,
			documentation: service.documentation || "",
			procedures: new Map(),
			classes: new Map(),
			enumerations: new Map(),
			structs: new Map()
		};
		(service.procedures || []).forEach(function (procedure) {
			entry.procedures.set(procedure.name, {
				name: procedure.name,
				parameters: procedure.parameters || [],
				returnType: procedure.return_type,
				documentation: procedure.documentation || ""
			});
		});
		(service.enumerations || []).forEach(function (enumeration) {
			entry.enumerations.set(enumeration.name, enumeration);
			enumerations.set(service.name + "." + enumeration.name, enumeration);
		});
		(service.structs || []).forEach(function (structure) {
			entry.structs.set(structure.name, structure);
			structs.set(service.name + "." + structure.name, structure);
		});
		(service.classes || []).forEach(function (klass) {
			entry.classes.set(klass.name, klass);
		});
		services.set(service.name, entry);
	});

	return { services: services, enumerations: enumerations, structs: structs };
}

function createClient(options) {
	const settings = Object.assign({}, DEFAULTS, options || {});
	const codec = values.createCodec({});

	let socket = null;
	let frames = new schema.FrameReader();
	let connected = false;
	let registry = null;
	let connecting = null;
	let handshake = null;
	let pending = null;
	let queue = Promise.resolve();
	let closeHandlers = [];
	let lastCloseReason = null;
	let clientIdentifier = null;

	function configure(next) {
		if (!next) {
			return { host: settings.host, port: settings.port, name: settings.name };
		}
		if (typeof next.host === "string" && next.host.trim().length > 0) {
			settings.host = next.host.trim();
		}
		const port = Number(next.port);
		if (port > 0 && port <= 65535) {
			settings.port = Math.floor(port);
		}
		if (typeof next.name === "string" && next.name.trim().length > 0) {
			settings.name = next.name.trim();
		}
		return { host: settings.host, port: settings.port, name: settings.name };
	}

	function endpoint() {
		return settings.host + ":" + settings.port;
	}

	function onClose(handler) {
		closeHandlers.push(handler);
		return function unsubscribe() {
			closeHandlers = closeHandlers.filter(function (entry) {
				return entry !== handler;
			});
		};
	}

	function notifyClosed(reason) {
		lastCloseReason = reason;
		closeHandlers.slice().forEach(function (handler) {
			try {
				handler(reason);
			} catch (cause) {
				console.error("kRPC close handler failed", cause);
			}
		});
	}

	function teardown(reason, error) {
		connected = false;
		registry = null;
		lastCloseReason = reason;
		const current = pending;
		pending = null;
		if (current) {
			clearTimeout(current.timer);
			current.reject(error || offlineError(reason));
		}
		if (handshake) {
			const waiting = handshake;
			handshake = null;
			clearTimeout(waiting.timer);
			waiting.reject(error || offlineError(reason));
		}
		if (socket) {
			socket.removeAllListeners();
			socket.destroy();
			socket = null;
		}
		frames = new schema.FrameReader();
		if (reason) {
			notifyClosed(reason);
		}
	}

	function handleMessage(body) {
		if (handshake) {
			let response;
			try {
				response = schema.decodeMessage("ConnectionResponse", body);
			} catch (cause) {
				handshake.reject(new KrpcError("The server did not answer the connection request"));
				handshake = null;
				teardown("handshake", offlineError("The server did not answer the connection request"));
				return;
			}
			const waiting = handshake;
			handshake = null;
			clearTimeout(waiting.timer);
			waiting.resolve(response);
			return;
		}
		if (pending) {
			const current = pending;
			pending = null;
			clearTimeout(current.timer);
			let decoded;
			try {
				decoded = schema.decodeMessage("Response", body);
			} catch (cause) {
				const error = new KrpcError("The server sent a message this client cannot read");
				current.reject(error);
				teardown("protocol", error);
				return;
			}
			current.resolve(decoded);
			return;
		}
		// Nothing is waiting: the server is out of step with this client.
		teardown("protocol", new KrpcError("The server sent an unexpected message"));
	}

	function attach() {
		socket.setNoDelay(true);
		socket.on("data", function (chunk) {
			frames.push(chunk);
			for (;;) {
				let body;
				try {
					body = frames.next();
				} catch (cause) {
					teardown("protocol", new KrpcError("The server sent a malformed message"));
					return;
				}
				if (!body) {
					return;
				}
				handleMessage(body);
			}
		});
		socket.on("error", function (cause) {
			teardown("error", offlineError("Lost the connection to " + endpoint() + ": " + cause.message));
		});
		socket.on("close", function () {
			if (connected || pending || handshake) {
				teardown("closed");
			}
		});
	}

	function openSocket() {
		return new Promise(function (resolve, reject) {
			let settled = false;
			const next = net.createConnection({ host: settings.host, port: settings.port });
			socket = next;
			const timer = setTimeout(function () {
				if (settled) {
					return;
				}
				settled = true;
				next.destroy();
				reject(offlineError("No answer from the kRPC server at " + endpoint()));
			}, settings.connectTimeoutMs);

			next.once("connect", function () {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				resolve();
			});
			next.once("error", function (cause) {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				if (socket === next) {
					socket = null;
				}
				reject(offlineError("Could not reach the kRPC server at " + endpoint() + ": " + cause.message));
			});
		});
	}

	function sendConnectionRequest() {
		return new Promise(function (resolve, reject) {
			handshake = {
				resolve: resolve,
				reject: reject,
				timer: setTimeout(function () {
					if (handshake) {
						handshake = null;
						teardown("handshake", offlineError("The kRPC server did not accept the connection"));
					}
				}, settings.connectTimeoutMs)
			};
			socket.write(
				schema.frame("ConnectionRequest", {
					type: CONNECTION_TYPE_RPC,
					client_name: settings.name,
					protocol_version: schema.PROTOCOL_VERSION
				})
			);
		});
	}

	async function open() {
		if (connected && registry) {
			return registry;
		}
		await openSocket();
		attach();
		const response = await sendConnectionRequest();
		const status = response.status === undefined ? STATUS_OK : response.status;
		if (status !== STATUS_OK) {
			const message =
				"kRPC refused the connection: " + (response.message || "status " + status);
			teardown("refused", offlineError(message));
			throw offlineError(message);
		}
		if (response.protocol_version && response.protocol_version !== schema.PROTOCOL_VERSION) {
			const message =
				"The kRPC server speaks protocol " +
				response.protocol_version +
				", this plugin speaks " +
				schema.PROTOCOL_VERSION +
				". Use a kRPC release from the same series as the mod.";
			teardown("protocol", new KrpcError(message));
			throw new KrpcError(message);
		}
		clientIdentifier = response.client_identifier;
		connected = true;
		const services = await request([
			{ service: "KRPC", procedure: "GetServices", arguments: [] }
		]);
		const first = services.results[0];
		const serverError = services.error || (first && first.error);
		if (serverError) {
			const error = new RpcError(serverError, "The server could not describe its services");
			teardown("protocol", error);
			throw error;
		}
		if (!first) {
			teardown("protocol", new KrpcError("The server did not describe its services"));
			throw new KrpcError("The server did not describe its services");
		}
		registry = buildRegistry(codec.decode({ code: values.CODE.SERVICES }, first.value));
		codec.useRegistry(registry);
		return registry;
	}

	function connect() {
		if (connecting) {
			return connecting;
		}
		connecting = open().finally(function () {
			connecting = null;
		});
		return connecting;
	}

	/** Send one request and resolve with the raw Response message. */
	function request(calls, timeoutMs) {
		return new Promise(function (resolve, reject) {
			if (!socket || !connected) {
				reject(offlineError("Not connected to the kRPC server"));
				return;
			}
			pending = {
				resolve: resolve,
				reject: reject,
				timer: setTimeout(function () {
					teardown("timeout", offlineError("The kRPC server did not answer in time"));
				}, timeoutMs || settings.requestTimeoutMs)
			};
			try {
				socket.write(schema.frame("Request", { calls: calls }));
			} catch (cause) {
				teardown("write", offlineError("Could not send to the kRPC server: " + cause.message));
			}
		});
	}

	function serviceFor(serviceName) {
		if (!registry) {
			return null;
		}
		const direct = registry.services.get(serviceName);
		if (direct) {
			return direct;
		}
		const ksa = registry.services.get("KSA");
		return ksa && ksa.classes.has(serviceName) ? ksa : null;
	}

	function procedureFor(serviceName, procedureName) {
		if (!registry) {
			throw offlineError("Not connected to the kRPC server");
		}
		const service = serviceFor(serviceName);
		if (!service) {
			throw new RpcError(
				{ service: serviceName, name: "NoSuchService", description: "The server has no service " + serviceName },
				"The server has no service " + serviceName
			);
		}
		const procedure = service.procedures.get(procedureName);
		if (!procedure) {
			throw new RpcError(
				{
					service: serviceName,
					name: "NoSuchProcedure",
					description: "The server has no procedure " + serviceName + "." + procedureName
				},
				"The server has no procedure " + serviceName + "." + procedureName
			);
		}
		return procedure;
	}

	function buildCall(serviceName, procedureName, args) {
		const procedure = procedureFor(serviceName, procedureName);
		const parameters = procedure.parameters;
		const list = args || [];
		const callArguments = [];
		for (let position = 0; position < list.length; position++) {
			const value = list[position];
			const parameter = parameters[position];
			if (value === undefined) {
				continue;
			}
			if (!parameter) {
				throw new RpcError(
					{
						service: serviceName,
						name: "TooManyArguments",
						description: serviceName + "." + procedureName + " does not take argument " + position
					},
					"Too many arguments"
				);
			}
			if (value === null) {
				if (!parameter.type || !parameter.type.nullable) {
					throw new RpcError(
						{
							service: serviceName,
							name: "NullArgument",
							description: serviceName + "." + procedureName + " does not accept null for " + parameter.name
						},
						"Null argument"
					);
				}
				callArguments.push({ position: position, is_null: true });
				continue;
			}
			callArguments.push({ position: position, value: codec.encode(parameter.type, value) });
		}
		return {
			service: serviceFor(serviceName).name,
			procedure: procedureName,
			arguments: callArguments,
			returnType: procedure.returnType
		};
	}

	/**
	 * Run several calls in one request. Each entry resolves to
	 * { ok: true, value } or { ok: false, error }, so one broken readout does not
	 * spoil the rest of a snapshot.
	 */
	function callBatch(calls, options) {
		const settingsValue = options || {};
		let prepared;
		try {
			prepared = calls.map(function (entry) {
				return buildCall(entry.service, entry.procedure, entry.args);
			});
		} catch (cause) {
			return Promise.reject(cause);
		}
		const run = function () {
			return request(
				prepared.map(function (call) {
					return {
						service: call.service,
						procedure: call.procedure,
						arguments: call.arguments
					};
				}),
				settingsValue.timeoutMs
			).then(function (response) {
				if (response.error) {
					throw new RpcError(response.error);
				}
				const results = response.results || [];
				if (results.length !== prepared.length) {
					throw new KrpcError(
						"The server answered " + results.length + " of " + prepared.length + " calls"
					);
				}
				return results.map(function (result, index) {
					if (result.error) {
						return { ok: false, error: new RpcError(result.error) };
					}
					if (result.is_null) {
						return { ok: true, value: null };
					}
					const type = prepared[index].returnType;
					if (!type || type.code === values.CODE.NONE) {
						return { ok: true, value: undefined };
					}
					try {
						return { ok: true, value: codec.decode(type, result.value) };
					} catch (cause) {
						return { ok: false, error: cause };
					}
				});
			});
		};
		const next = queue.then(run, run);
		queue = next.then(
			function () {},
			function () {}
		);
		return next;
	}

	/** Run one call and resolve with its value, or throw. */
	function call(serviceName, procedureName, args) {
		return callBatch([{ service: serviceName, procedure: procedureName, args: args }]).then(
			function (results) {
				const result = results[0];
				if (!result.ok) {
					throw result.error;
				}
				return result.value;
			}
		);
	}

	function getStatus() {
		return call("KRPC", "GetStatus", []).then(function (status) {
			return status;
		});
	}

	function close() {
		handshake = null;
		const current = pending;
		pending = null;
		if (current) {
			clearTimeout(current.timer);
			current.reject(offlineError("The connection was closed"));
		}
		if (socket) {
			socket.removeAllListeners();
			socket.destroy();
			socket = null;
		}
		connected = false;
		registry = null;
		frames = new schema.FrameReader();
	}

	return {
		configure: configure,
		settings: function () {
			return { host: settings.host, port: settings.port, name: settings.name };
		},
		endpoint: endpoint,
		connect: connect,
		close: close,
		isConnected: function () {
			return connected;
		},
		clientIdentifier: function () {
			return clientIdentifier;
		},
		registry: function () {
			return registry;
		},
		serviceFor: serviceFor,
		hasProcedure: function (serviceName, procedureName) {
			if (!registry) {
				return false;
			}
			const service = serviceFor(serviceName);
			return Boolean(service && service.procedures.has(procedureName));
		},
		/**
		 * The protocol name of a member, e.g. ("Vehicle", "get", "Name") is
		 * Vehicle_get_Name and ("KSA", "get", "UT") is get_UT. Falls back to the most
		 * likely name so a call fails with a clear error rather than silently.
		 */
		memberProcedure: function (serviceName, kind, memberName) {
			if (!registry) {
				return null;
			}
			const service = serviceFor(serviceName);
			if (!service) {
				return null;
			}
			let candidates;
			if (kind === "static") {
				candidates = [serviceName + "_static_" + memberName, serviceName + "_Static_" + memberName];
			} else if (kind === "get") {
				// The protocol names a property getter get_Name on a class and get_UT on a
				// service; the PascalCase forms are accepted as a fallback.
				candidates = [
					serviceName + "_get_" + memberName,
					"get_" + memberName,
					serviceName + "_Get" + memberName,
					"Get" + memberName
				];
			} else if (kind === "set") {
				candidates = [
					serviceName + "_set_" + memberName,
					"set_" + memberName,
					serviceName + "_Set" + memberName,
					"Set" + memberName
				];
			} else {
				candidates = [serviceName + "_" + memberName, memberName];
			}
			for (let i = 0; i < candidates.length; i++) {
				if (service.procedures.has(candidates[i])) {
					return candidates[i];
				}
			}
			return candidates[0];
		},
		procedures: function (serviceName) {
			if (!registry) {
				return [];
			}
			const service = serviceFor(serviceName);
			return service ? Array.from(service.procedures.keys()) : [];
		},
		enumerations: function (serviceName) {
			if (!registry) {
				return [];
			}
			const service = serviceFor(serviceName);
			return service ? Array.from(service.enumerations.values()) : [];
		},
		call: call,
		callBatch: callBatch,
		getStatus: getStatus,
		onClose: onClose,
		lastCloseReason: function () {
			return lastCloseReason;
		}
	};
}

module.exports = {
	createClient: createClient,
	RpcError: RpcError,
	KrpcError: KrpcError,
	DEFAULTS: DEFAULTS,
	buildRegistry: buildRegistry
};
