# KSA Flight Deck

Control **Kitten Space Agency** and see live telemetry on your Stream Deck using the
[kRPC mod](https://krpc.github.io/krpc/experimental/ksa/).

## Features

- Live telemetry, including altitude, speed, orbit and propellant.
- Keys for staging, engines, auto-pilot and control toggles.
- Stream Deck + dials for throttle and time warp.

## Requirements

- Kitten Space Agency with [StarMap](https://github.com/StarMapLoader/StarMap/releases)
  and [kRPC for KSA](https://github.com/krpc/krpc/releases) v0.2.0 or newer.
- Stream Deck software 6.9 or newer.

## Installation

1. Download the `.streamDeckPlugin` file from
   [Releases](https://github.com/drewdus42/KSA-Streamdeck-via-kRPC/releases) and
   double-click it to install.
2. In KSA, open the **kRPC** menu and start the server.
3. Add actions from the **KSA Flight Deck** category to your Stream Deck.

The default connection is `127.0.0.1:50000` using Protobuf over TCP. Add the
**kRPC Status** key to change the address or test the connection.

## Troubleshooting

- If the connection fails, check that the kRPC server is online and the address and
  port match its settings.
- If kRPC reports game scene `None`, take control of a vehicle and try again. If it
  persists, check that your game and kRPC mod versions are compatible.
- If a readout shows `?`, it may be unavailable in the current game or mod version.
- The server is unauthenticated. Keep it on loopback unless you intend to allow other
  machines to control your vehicle.

## Development

Run tests and build the installer from the repository root:

```powershell
.\build.ps1
```

The package is created in `plugin\Release`. Use `.\build.ps1 -Install` to open it in
Stream Deck after building. To run tests or the simulated kRPC server separately:

```powershell
cd plugin
npm test
node test/fake-server.js 50000
```

See [docs/API.md](docs/API.md) for the procedure mapping. Plugin logs are in
`%APPDATA%\Elgato\StreamDeck\logs\com.novistrum.ksaflightdeck0.log`.
