# Domain Model

## Identity terms

### DeviceIdentity

A cryptographic identity stored in one browser profile or installed PWA storage partition.

Fields:

- `publicId`
- `publicKeyJwk`
- encrypted or IndexedDB-stored private key
- `friendCode`
- generated display name
- identity version
- created timestamp

### PublicProfile

Safe-to-share projection:

- public ID fingerprint
- current friend code
- generated display name
- supported protocol version
- avatar seed from a fixed local icon set

No photo upload or free-text biography.

### Session

Short-lived proof that the current connection controls a device identity.

### PeerConnection

One browser tab or PWA window connected to a service.

### Player

A participant in a room. A player references a public identity but is room-scoped.

### Seat

A role in a game, such as black/white, attacker/defender, host/caller.

### Team

A set of players sharing a game objective.

### Spectator

A room member without command permissions.

## Room lifecycle

```text
CREATED
→ LOBBY
→ CONFIGURING
→ READY_CHECK
→ STARTING
→ IN_MATCH
→ PAUSED
→ COMPLETED
→ CLOSED
```

Allowed alternate transitions:

- Any pre-match state → CLOSED
- IN_MATCH → PAUSED → IN_MATCH
- IN_MATCH → COMPLETED
- PAUSED → COMPLETED or CLOSED

Transitions are server-enforced.

## Membership lifecycle

```text
INVITED
→ JOINING
→ CONNECTED
→ READY
→ PLAYING
→ DISCONNECTED
→ RECONNECTING
→ CONNECTED
→ LEFT
```

## Core entities

### Room

- room ID
- room code
- game ID
- game module version
- protocol version
- room phase
- owner public ID
- members
- seats
- configuration
- current match ID
- created time
- expiry time

The owner controls lobby settings but is not the authoritative game server. `RoomDO` is authoritative.

### Match

- match ID
- room ID
- game configuration
- random seed
- phase
- current authoritative state
- event sequence
- started time
- ended time
- result
- reconnect policy

### Command

A request to change state.

Every command includes:

- command ID
- match ID
- sender session
- client sequence
- protocol version
- game command payload

### Event

An accepted authoritative change.

Every event includes:

- event ID
- match ID
- server sequence
- server timestamp
- event type
- payload
- optional state hash

## ID policy

- Internal database IDs: opaque, never user-entered.
- Public IDs: derived or random, non-sequential.
- Friend codes: short, rotatable, rate-limited.
- Room codes: short-lived, unambiguous alphabet.
- Invitation tokens: high-entropy, short-lived, URL-safe.
- Resume tokens: high-entropy, room-scoped, rotated after use.

Recommended user-facing alphabet:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

Exclude visually ambiguous characters.

## Error model

Errors must be typed.

Categories:

- `VALIDATION_ERROR`
- `AUTHENTICATION_REQUIRED`
- `IDENTITY_PROOF_FAILED`
- `ROOM_NOT_FOUND`
- `ROOM_EXPIRED`
- `ROOM_FULL`
- `INVITATION_EXPIRED`
- `PROTOCOL_INCOMPATIBLE`
- `GAME_VERSION_INCOMPATIBLE`
- `COMMAND_REJECTED`
- `RATE_LIMITED`
- `CONNECTION_REPLACED`
- `UNSUPPORTED_BROWSER`
- `INTERNAL_ERROR`

Do not send stack traces or internal object IDs to clients.
