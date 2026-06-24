# Realtime Protocol

## Encoding

Version 1 uses UTF-8 JSON.

Reasons:

- Easy inspection during development
- Straightforward Zod validation
- Small board-game messages
- Easier protocol fixture review

Do not switch to MessagePack until production measurements show a meaningful need.

## Envelope

```ts
interface ProtocolEnvelope<TType extends string, TPayload> {
  protocolVersion: 1;
  messageId: string;
  messageType: TType;
  roomId?: string;
  matchId?: string;
  senderPublicId?: string;
  clientSequence?: number;
  serverSequence?: number;
  sentAtClientMs?: number;
  sentAtServerMs?: number;
  acknowledgement?: number;
  payload: TPayload;
}
```

## Message families

### Connection

- `CLIENT_HELLO`
- `SERVER_CHALLENGE`
- `CLIENT_PROOF`
- `SESSION_ACCEPTED`
- `SESSION_REJECTED`
- `PING`
- `PONG`
- `ERROR`

### Presence and invitations

- `PRESENCE_ENABLE`
- `PRESENCE_DISABLE`
- `PRESENCE_SNAPSHOT`
- `PRESENCE_JOINED`
- `PRESENCE_LEFT`
- `INVITE_SEND`
- `INVITE_RECEIVED`
- `INVITE_ACCEPT`
- `INVITE_DECLINE`
- `PAIRING_CODE`

### Room

- `ROOM_CREATE`
- `ROOM_CREATED`
- `ROOM_JOIN`
- `ROOM_JOINED`
- `ROOM_LEAVE`
- `ROOM_MEMBER_JOINED`
- `ROOM_MEMBER_LEFT`
- `ROOM_READY_SET`
- `ROOM_CONFIG_UPDATE`
- `ROOM_SNAPSHOT`

### Match

- `MATCH_START_REQUEST`
- `MATCH_SCHEDULED`
- `MATCH_STARTED`
- `GAME_COMMAND`
- `GAME_EVENT`
- `STATE_HASH`
- `RESYNC_REQUEST`
- `STATE_SNAPSHOT`
- `MATCH_PAUSED`
- `MATCH_RESUMED`
- `MATCH_COMPLETED`
- `MATCH_ABORTED`

## Ordering

- Clients maintain `clientSequence` per connection.
- The server assigns `serverSequence` per match.
- Duplicate `messageId` values are ignored.
- A client applies only the next expected `serverSequence`.
- Gaps trigger a bounded wait, then `RESYNC_REQUEST`.
- Events are idempotent when replayed by ID.
- Snapshots include the last included sequence.

## Reconnection

Client sends:

```json
{
  "messageType": "ROOM_JOIN",
  "payload": {
    "roomCode": "K7M2QA",
    "resumeToken": "opaque-token",
    "lastAppliedServerSequence": 42,
    "lastStateHash": "sha256-base64url"
  }
}
```

Server chooses:

- Send missing events
- Send complete snapshot
- Reject expired resume token
- Report completed match
- Report room closed

## State hash

Use canonical serialization.

Requirements:

- Stable property order
- No `undefined`
- No locale-dependent formatting
- No floating-point values unless quantized
- IDs sorted where order is semantically irrelevant
- SHA-256 hash

Do not hash UI-only state.

## Match timing

- Server schedules real-time round start at least 3 seconds ahead.
- Clients perform ping samples before the round.
- UI countdown is based on estimated server offset.
- Server receive time is authoritative in version 1.
- A degraded-latency warning appears when thresholds are exceeded.
- No ranked result is offered.

## Message size and frequency

Initial application limits:

- Maximum decoded WebSocket message: 16 KiB
- Maximum room snapshot: 64 KiB, chunk if needed
- Connection messages: 20 per 10 seconds
- Lobby commands: 10 per 10 seconds
- Bubble Siege commands: game-specific limit
- Invalid schema attempts: disconnect after a small threshold
- Oversized message: immediate reject and possible disconnect

OWASP gives larger general examples, but this product's command payloads are tiny, so tighter limits are appropriate.

## Origin and session checks

For every WebSocket upgrade:

- Validate `Origin` against explicit production and preview allowlists.
- Reject missing or unexpected origins except controlled test environments.
- Require an identity proof challenge.
- Bind session token to public identity and connection.
- Rotate resume token after successful resume.
- Re-check room permission for every command.

## Version compatibility

Handshake includes:

- app version
- build ID
- protocol version
- game module versions
- capability flags

Policy:

- Same protocol major required
- Server may support multiple minor versions during rollout
- New matches require supported game module version
- Existing matches must use the version that created them
- Incompatible clients receive an update screen before joining
