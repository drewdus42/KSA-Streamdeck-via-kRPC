# KSA Flight Deck

Stream Deck controls and live readouts for **Kitten Space Agency**, over the
[kRPC](https://krpc.github.io/krpc/experimental/ksa/) mod.

There is no companion mod to install: kRPC already exposes the whole game API, so this
plugin is a single Stream Deck plugin that speaks kRPC's own protocol.

```
┌─────────────┐   key / dial   ┌───────────────────┐   kRPC over TCP   ┌──────────────┐
│ Stream Deck │ ─────────────▶ │ KSA Flight Deck   │ ────────────────▶ │ kRPC mod     │
│  hardware   │ ◀───────────── │ plugin (Node.js)  │ ◀──────────────── │  in KSA      │
└─────────────┘  4 Hz snapshot └───────────────────┘   127.0.0.1:50000 └──────────────┘
```

## What you get

| Action | Controllers | What it does |
| --- | --- | --- |
| **kRPC Status** | key | Link state plus the vehicle under control |
| **Telemetry Readout** | key | Any of 38 readouts: altitude, apoapsis, propellant, g-force, … |
| **Next Sequence** | key | Activates the next sequence and shows which one is live |
| **Engine** | key | Engines on or off, with the state on the key |
| **Auto-Pilot Mode** | key | Engages the auto-pilot in a chosen mode, press again to let go |
| **Control Toggle** | key | RCS, lights, stabilization or pulsed thrust |
| **Throttle** | dial | Turn 1% (5% held), push to cut, touch to open |
| **Time Warp** | dial | Steps the simulation speed, push to pause, touch for 1x |

## Requirements

- Kitten Space Agency with **StarMap** and the [kRPC mod](https://github.com/krpc/krpc/releases)
  (v0.2.0 or newer, the release with the `kRPC` folder)
- Stream Deck **6.9** or newer (the plugin runs on the Node.js runtime that ships with it)
- The kRPC **default server**, which is already configured: *Protocol Buffers over TCP*,
  `127.0.0.1`, RPC port `50000`. You do **not** need the optional gRPC server.

## Install

1. **In game**: open the **kRPC** menu in the menu bar and press **Start servers**. The
   default server listens on `127.0.0.1:50000` and auto-accepts clients.
2. **In Stream Deck**: double-click `plugin/Release/com.novistrum.ksaflightdeck.streamDeckPlugin`.
3. Drag actions from the **KSA Flight Deck** category onto your keys.

The **kRPC Status** key is the one to add first: its property inspector lets you set the
address and port and press **Test connection**.

## Using it

- Keys poll as a group, four times a second, but only while at least one KSA key is
  visible. Nothing is polled when the folder is out of sight.
- When the link drops the keys turn red and retry every 1.5 s; they reconnect on their
  own when the game comes back.
- **Auto-Pilot Mode** shows `HOLD` while the auto-pilot is holding that mode and `OTHER`
  when it is engaged in a different one, so a row of keys reads as a mode selector.
- **Time Warp** steps through pause, 1x, 2x, 5x, 10x, 50x, 100x, 500x, 1 000x, 5 000x,
  10 000x, 50 000x and 100 000x. KSA takes the speed as a number, not as discrete steps,
  so the dial reads back whatever the game reports.
- A readout that this KSA build no longer supports (the mod's compatibility pop-up lists
  them) shows `—` with a `?` badge instead of failing the rest of the snapshot.

## How it works

kRPC publishes its whole API when a client connects (`KRPC.GetServices`), so the plugin
carries no generated stubs: every call is shaped from the reflection the server sends,
which is why it keeps working when the mod adds or renames procedures.

- One request per tick carries every readout the visible keys need, because kRPC allows
  several calls in one request and answers them in order.
- Enumerations, object references, lists, tuples and dictionaries are encoded by the type
  information in that reflection, so `AutoPilot.Mode` can be set by name.
- Remote objects (`Vehicle`, `Flight`, `Control`, …) are resolved once per vehicle and
  cached until the active vehicle changes.
- Keys are drawn as SVG data URIs and only re-sent when the face changes.

The protocol layer is checked against the reference implementation: `test/golden.json` is
generated from the official `krpc` Python package, and `tools/verify-reference.py` drives
the simulator with the real Python client.

Full procedure mapping: [`docs/API.md`](docs/API.md).

## Why there is no client library underneath

kRPC ships official clients for Python, C#, C++, C, Java and Lua, but **not** JavaScript.
Rather than putting a Python process in the middle — which would add a runtime, a second
process and a hop of latency to every keypress — this plugin implements the wire protocol
itself in plain JavaScript on the Node runtime Stream Deck already provides.

| Option | Verdict |
| --- | --- |
| Native TCP client (this plugin) | **Used.** Zero dependencies, one process, works against the mod's default server with no setup |
| Python sidecar over stdio/HTTP | Rejected: needs Python installed, a second process to supervise, and a round trip per call |
| gRPC over HTTP/2 | Possible but not used: the server is off by default, so every user would have to enable and configure it first |
| Official kRPC JavaScript client | Not released yet. When it lands, it slots in behind `call` / `callBatch` in [`lib/krpc-client.js`](plugin/src/com.novistrum.ksaflightdeck.sdPlugin/lib/krpc-client.js) — nothing above that layer knows how the bytes travel |

The kRPC author's advice to use the gRPC server was written before a JavaScript client
existed, and it is the right advice if you do not want to write a protocol client. This
plugin wrote one, and validated it byte for byte against the reference implementation, so
it can use the default server and stay dependency free.

## Develop

```powershell
cd plugin
npm test                              # 78 tests, no game or hardware needed
node test/fake-server.js 50000        # fake kRPC server + simulated vehicle
```

`npm test` includes an end-to-end suite that starts the real plugin process against a
stand-in Stream Deck and a stand-in kRPC server, so it covers the shipped artifact.

The two optional tools are installed on demand rather than checked in:

```powershell
npm install --no-save @elgato/cli     # link / restart / validate / pack
python -m venv tools/.venv-ref        # reference kRPC client for the conformance checks
tools/.venv-ref/Scripts/python.exe -m pip install krpc==0.7.0
tools/.venv-ref/Scripts/python.exe tools/verify-reference.py   # real client, fake server
tools/.venv-ref/Scripts/python.exe tools/gen-golden.py         # regenerate test/golden.json
```

To work on the plugin live in Stream Deck:

```powershell
npx streamdeck link src/com.novistrum.ksaflightdeck.sdPlugin
npx streamdeck restart com.novistrum.ksaflightdeck
npx streamdeck validate src/com.novistrum.ksaflightdeck.sdPlugin
```

Plugin output appears in `%APPDATA%\Elgato\StreamDeck\logs\com.novistrum.ksaflightdeck0.log`.

Build the installable package:

```powershell
.\build.ps1                 # tests, then packages into plugin\Release
.\build.ps1 -SkipTests
.\build.ps1 -Install        # also hands the package to Stream Deck
```

### Layout

```
plugin/
  src/com.novistrum.ksaflightdeck.sdPlugin/   the plugin that ships
    bin/plugin.js          entry point (Node)
    lib/protobuf.js        the kRPC 0.7.0 message schema
    lib/krpc-values.js     value codec driven by the server's reflection
    lib/krpc-client.js     TCP client: handshake, reflection, batched calls
    lib/ksa.js             readouts, snapshot poll, commands
    lib/format.js          units and labels
    lib/render.js          key faces as SVG
    lib/ws.js              WebSocket client for the Stream Deck socket
    lib/sd.js              Stream Deck events and commands
    actions/               property inspectors
    imgs/, layouts/        artwork
  test/                    unit, protocol, and end-to-end tests
  tools/                   fake server helpers, icon generator, reference checks
```

## Notes and limits

- Loopback and unauthenticated: anything on your machine that can reach the port can fly
  your vehicle. Do not set the kRPC address to *Any* unless you mean it.
- Live readouts are polled, not streamed. Polling suits a handful of keys and keeps the
  client simple; kRPC's streams would be the next step for very dense decks.
- Only the active vehicle is addressed. There is no editor, map or KSC support, because
  the kRPC KSA API does not have those yet.
- The plugin follows whatever the mod exposes. After a KSA update, run the mod's
  compatibility pop-up and expect the affected readouts to show `—` until kRPC catches up.
