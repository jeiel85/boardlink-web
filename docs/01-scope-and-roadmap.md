# Scope and Roadmap

## Delivery model

Development is divided into goals. Each goal must produce a deployable, tested increment.

## Release train

### Foundation release

- Goal 00 — Repository and Cloudflare bootstrap
- Goal 01 — PWA shell, browser context, installation UX
- Goal 02 — Anonymous device identity and local persistence
- Goal 03 — Presence, friend codes, invitations
- Goal 04 — Room runtime and WebSocket protocol
- Goal 05 — Shared game SDK and same-device mode

### First public game release

- Goal 06 — Bubble Siege
- Goal 07 — Bingo
- Goal 08 — Gomoku
- Goal 09 — Security, compatibility, operations, launch

### Later releases

- Goal 10 — Chess and Janggi
- WebRTC direct transport
- Team modes
- Spectators
- Tournament support
- Optional AI
- Experimental QR-only offline pairing

## Release gates

### Internal alpha

- One desktop browser and one Android browser
- Bubble Siege end-to-end
- Room reconnection
- No public domain yet

### Closed beta

- Android, iOS, desktop matrix
- Nearby discovery and online friend codes
- Invitation handoff from KakaoTalk
- PWA installation and update flow
- Abuse controls enabled

### Public beta

- Bubble Siege, Bingo, Gomoku
- Privacy and terms published
- Production rollback procedure tested
- Rate limits tuned
- No critical or high vulnerabilities
- No known deterministic-state divergence

### Stable

- 30 days of public-beta operational evidence
- Error budget defined
- Compatibility matrix updated
- Recovery and deletion requests handled
- Costs monitored
- No unresolved data-retention ambiguity

## Feature priority

| Priority | Feature                                |
| -------- | -------------------------------------- |
| P0       | Anonymous identity                     |
| P0       | QR/link/room-code join                 |
| P0       | Server-authoritative WebSocket room    |
| P0       | Reconnection and duplicate suppression |
| P0       | PWA update deferral                    |
| P0       | In-app browser handoff                 |
| P0       | Bubble Siege fairness rules            |
| P1       | Nearby estimate                        |
| P1       | Online friends                         |
| P1       | Bingo                                  |
| P1       | Gomoku                                 |
| P2       | WebRTC                                 |
| P2       | Spectators                             |
| P2       | Team play                              |
| P3       | Chess/Janggi                           |
| P3       | AI                                     |

## Scope control rule

Do not add a new game until:

- Shared domain interfaces are stable.
- Protocol compatibility tests exist.
- Room lifecycle and cleanup are reliable.
- The previous game has deterministic replay tests.
- Browser matrix failures are documented.
