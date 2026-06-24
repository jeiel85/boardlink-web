# Goal 04 — Server-Authoritative Room Runtime

## Mission

Implement the reusable Durable Object room engine and versioned WebSocket protocol.

## Required outcomes

- WebSocket upgrade route
- Origin validation
- identity-authenticated session
- Hibernation WebSocket API
- room lifecycle state machine
- member and seat model
- lobby configuration
- ready check
- authoritative command/event pipeline
- server sequence
- duplicate suppression
- acknowledgements
- state snapshots
- state hash
- reconnect/resume
- connection replacement
- alarms and TTL cleanup
- message size and rate limits
- compatibility handshake

## Constraints

- Room owner is not state authority.
- No game-specific branching in transport.
- No wall-clock reads in game reducers.
- Every external payload uses runtime schema validation.
- No automatic PWA reload in room.
- Keep recent event history bounded by snapshots.

## Test game

Implement a hidden development-only counter game:

- client requests increment
- server validates
- server emits event
- all peers converge

Remove it from public registry later, but keep it as a test fixture.

## Tests

- two clients converge
- duplicate command ignored
- out-of-order event triggers resync
- stale resume token rejected
- reconnect receives missing events
- large gap receives snapshot
- object hibernates/wakes without losing membership metadata
- cleanup alarm closes expired room
- incompatible protocol rejected
- multi-tab takeover replaces old connection
- oversized message rejected
- unexpected Origin rejected

## Completion criteria

- Four browser contexts can join one test room and maintain identical state through reconnects.
