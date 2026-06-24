# Deployment and Operations

## Environments

### Local

- Cloudflare Vite plugin
- Local Durable Object and D1 persistence
- Mock email not needed
- Local HTTPS where browser features require secure context

### Preview

- Per-branch or per-PR deployment
- Separate D1 database
- Separate Durable Object namespace/migration path
- Separate secrets
- Preview Origin allowlist
- No production friend directory

### Production

- Custom domain
- Production D1
- Production Durable Objects
- Strict Origin allowlist
- Rate limits enabled
- Privacy and terms pages
- Operational alerting

## Cloudflare bindings

Suggested:

```text
ROOMS               Durable Object
USER_SESSIONS       Durable Object
NETWORK_PRESENCE    Durable Object
DIRECTORY_DB        D1
API_RATE_LIMITER    Rate Limit binding
BUILD_INFO          Version metadata or generated build info
```

Secrets:

```text
NETWORK_BUCKET_SECRET
INVITATION_SIGNING_SECRET
RECOVERY_TRANSFER_SECRET
```

Use separate secrets per environment.

## Durable Object storage

### RoomDO

Persist:

- room metadata
- current phase
- members
- configuration
- match snapshot
- recent authoritative events
- expiry timestamp

Use snapshots to keep replay bounded.

### Hibernation

Use the Hibernation WebSocket API.

Store minimal connection attachment metadata:

- public ID
- room member ID
- connection ID
- protocol version
- last acknowledged sequence

On wake:

- Restore object state
- Validate attachment version
- Reconcile missed state
- Avoid assuming in-memory maps survived

## Cleanup

Use Durable Object alarms.

- Presence cleanup
- Empty room cleanup
- Disconnected match expiry
- Completed match cleanup
- Invitation expiry

Cleanup must be idempotent.

## Observability

No third-party user analytics.

Use privacy-scrubbed operational logs:

- request ID
- build ID
- route
- error code
- room lifecycle category
- protocol version
- game ID
- latency bucket
- no full token
- no raw IP
- no private key
- no full friend code

Aggregate counters:

- active rooms
- connection failures
- reconnect success rate
- command rejection reasons
- cleanup failures
- Durable Object exceptions
- deployment version

## Cost controls

- WebSocket Hibernation
- Room TTL
- Presence TTL
- No permanent match logs
- Message size limits
- Connection caps
- No media transport
- No public always-on lobby
- Load-test rate limits before public promotion

## Rollout

1. Deploy preview.
2. Run protocol compatibility tests.
3. Run smoke E2E.
4. Upload production version.
5. Use controlled rollout/version mechanism when available.
6. Monitor errors and connection failures.
7. Roll back if protocol or room-state errors rise.

## Incident response

Document:

- How to disable room creation
- How to disable nearby discovery
- How to rotate secrets
- How to revoke a friend-code range
- How to force a minimum client build
- How to roll back Worker version
- How to publish a status notice
- How to preserve only the minimum logs needed for investigation

## Data deletion and reset

Because most profile data is local, user reset is immediate on the device.

Server actions:

- Revoke friend code
- Remove online session
- Remove nearby presence
- Close active rooms
- Add public ID revocation marker only if needed to prevent replay

Explain that clearing browser data may already remove local identity.
