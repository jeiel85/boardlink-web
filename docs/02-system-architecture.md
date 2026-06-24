# System Architecture

## High-level topology

```text
Browser / Installed PWA
├─ React UI
├─ Game renderer
├─ Local identity and friend store
├─ PWA lifecycle manager
├─ Browser-context gate
└─ WebSocket client
        │
        ▼
Cloudflare Worker
├─ Static assets
├─ HTTP API router
├─ Origin and schema validation
├─ Anonymous identity challenge
├─ Rate-limit enforcement
├─ Invitation and directory API
└─ Durable Object routing
        │
        ├─ RoomDO(roomId)
        ├─ UserSessionDO(publicId)
        └─ NetworkPresenceDO(networkBucket)

D1
└─ Public friend-code directory and revocation metadata
```

## Primary deployment model

Use a Cloudflare Worker with static assets built through the Cloudflare Vite plugin.

Reasons:

- One deployable unit for SPA assets and APIs
- Direct access to Workers and Durable Object bindings
- Edge delivery
- Durable Objects provide serialized stateful coordination
- WebSocket Hibernation reduces idle connection duration cost
- Official Workers Vitest integration is available

## Durable Object partitioning

### RoomDO

One object per room ID.

Responsibilities:

- Room lifecycle
- Membership
- Roles and seats
- Ready state
- Match state machine
- Command validation
- Event sequencing
- Authoritative timers
- Snapshots
- Reconnection
- WebSocket broadcasting
- Room TTL and cleanup alarm

Never route unrelated rooms to the same object.

### UserSessionDO

One object per anonymous public identity.

Responsibilities:

- Current online session
- Active device tab
- Incoming invitations
- Block list cache
- Presence state
- Short-lived authenticated session tokens
- Friend request coordination when both parties are online

Do not persist a permanent social graph here.

### NetworkPresenceDO

One object per temporary network bucket.

Responsibilities:

- Opt-in discoverable users
- Presence expiry
- Nearby-list subscriptions
- Invite initiation
- Confirmation-code session
- Automatic cleanup

A network bucket is server-internal and never sent to a client.

## D1 usage

Use D1 only for data requiring a shared directory and uniqueness constraints.

Suggested tables:

- `friend_code_directory`
- `friend_code_history`
- `revoked_public_ids`
- `abuse_counters` only if the rate-limit binding is insufficient
- `schema_migrations`

Do not store:

- Raw IP addresses
- Private keys
- Permanent match event logs
- Public chat
- Location
- Contact information

## Client storage

Use IndexedDB for:

- Device identity and key pair
- Friend list
- Block list
- Settings
- Install-dismissal state
- Local match history
- Local game preferences
- Encrypted recovery export metadata

Use localStorage only for tiny non-sensitive UI hints if needed. Do not place private keys or long-lived bearer tokens in localStorage.

## State authority

```text
Client intent
→ command
→ RoomDO validates
→ RoomDO emits event with sequence
→ all clients apply event
→ periodic state hash comparison
→ snapshot if divergence is detected
```

The client may show an optimistic visual effect, but authoritative state changes only through accepted server events.

## Transport phases

### Version 1

WebSocket only.

Benefits:

- One authority path
- Simplest reconnection model
- Lowest implementation risk
- Consistent behavior across browsers

### Version 2

WebRTC DataChannel preferred for compatible peer data, WebSocket retained for:

- Signaling
- Authority or arbitration
- Fallback
- Reconnection
- Participants that cannot establish direct connections

Do not design game modules around WebRTC assumptions.

## Room location and latency

A Durable Object instance has a single location. Initial placement may favor the first request. For casual games this is acceptable, but real-time latency may be asymmetric.

Initial policy:

- Friendly matches only
- Measure RTT before real-time rounds
- Warn at degraded latency
- Use server-received time for authoritative acceptance
- Record latency buckets without long-lived identity
- Do not offer ranked Bubble Siege

## Failure domains

| Failure                      | Required behavior                                        |
| ---------------------------- | -------------------------------------------------------- |
| Client refresh               | Resume with token and last sequence                      |
| Client duplicate tab         | One tab owns active session                              |
| Worker redeploy              | Existing protocol-compatible rooms continue or reconnect |
| Service-worker update        | Defer activation until no match                          |
| WebSocket interruption       | Exponential reconnect with upper bound                   |
| RoomDO wake from hibernation | Restore session metadata and state                       |
| Stale client version         | Reject new match; explain update                         |
| Presence object expires      | User disappears from nearby list                         |
| Host disappears              | Server remains authority; match pause policy applies     |
| D1 unavailable               | Existing rooms continue; new friend-code lookup degrades |

## Architecture boundaries

```text
packages/domain
  Pure TypeScript. No browser or Cloudflare APIs.

packages/protocol
  DTO schemas, encoding, compatibility, IDs.

packages/game-sdk
  Generic deterministic game contracts.

packages/games/*
  Pure game rules and deterministic reducers.

apps/platform/client
  React, browser APIs, rendering, IndexedDB.

apps/platform/worker
  Cloudflare Worker routing and Durable Objects.
```
