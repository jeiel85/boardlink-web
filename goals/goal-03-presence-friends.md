# Goal 03 — Nearby Presence, Friends, and Invitations

## Mission

Implement opt-in nearby discovery, online friend presence, friend-code search, invitations, confirmation code, QR/link/room-code entry, and blocking.

## Required outcomes

- Network address normalization
- HMAC network bucket
- no raw IP persistence
- NetworkPresence Durable Object
- UserSession Durable Object
- discoverable 10-minute timer
- heartbeat and expiry
- current nearby snapshot
- friend-code lookup
- online state
- invite send/accept/decline
- confirmation code
- invitation token and route
- room code generation
- QR rendering
- local friend repository
- local block list
- rate limits
- suspicious-flow Turnstile adapter, disabled by default

## Constraints

- Nearby discovery is default off.
- UI explicitly explains approximation.
- Network bucket never reaches a client.
- No offline pending friend-request storage in version 1.
- No permanent server social graph.
- No public user search.
- No free-text names.

## Tests

- two requests in same test network bucket see each other when opt-in
- invisible users never appear
- expiry removes presence
- daily bucket rotation overlap behavior
- blocked user cannot invite
- invite token expires
- room code not enumerable at unrestricted rate
- confirmation codes match both sides
- raw IP absent from storage and structured logs
- carrier-NAT false-positive UX warning exists

## Completion criteria

- Two real devices can find each other through nearby presence or friend code and reach a lobby invitation.
