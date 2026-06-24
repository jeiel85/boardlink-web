# Goal 05 — Shared Game SDK and Local Authority

## Mission

Implement the deterministic game plugin contract, registry, replay/testkit, renderer projection, and same-device local mode.

## Required outcomes

- `GameModule` interface
- generic config/state/command/event/result types
- explicit registry
- deterministic local authority
- server adapter
- player projection
- spectator projection placeholder
- canonical serialization
- SHA-256 state hash
- replay engine
- fuzz/property test helpers
- game shell UI
- local match history

## Constraints

- No game imports React or Cloudflare APIs.
- Local and online modes use the same rules.
- Randomness is seeded.
- Time is passed explicitly.
- Unknown game ID is rejected.
- Remote dynamic game code is forbidden.

## Reference game

Convert the development counter game into a complete SDK test fixture.

## Tests

- same event log gives same state and result
- serialization round trip
- state hash fixture
- invalid command never mutates state
- local authority and RoomDO adapter produce same events
- player projection hides restricted fields

## Completion criteria

- A new game can be added through one package and one registry entry without changing transport code.
