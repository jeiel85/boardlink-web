# Goal 09 — Public Release Hardening

## Mission

Prepare the first public release with Bubble Siege, Bingo, and Gomoku.

## Required outcomes

- complete browser/device matrix
- load tests
- abuse tests
- security-header verification
- CSP enforcement
- dependency audit
- privacy notice
- terms of service
- operator contact
- profile reset and deletion controls
- diagnostics export
- incident runbook
- rollback test
- production cost limits
- environment separation
- D1 and Durable Object migration test
- full PWA install/update test
- KakaoTalk/Naver in-app handoff test
- accessibility review
- Korean and English localization review

## Load scenarios

- room creation burst
- many idle lobbies
- many hibernating WebSockets
- 32-player Bingo rooms
- Bubble Siege command bursts
- friend-code enumeration attempt
- nearby presence churn
- reconnect storm after simulated outage

## Security scenarios

- unknown Origin
- oversized frame
- malformed JSON
- valid JSON with invalid schema
- duplicate command
- forged identity
- expired invitation
- stolen resume token
- blocked profile invitation
- old client protocol
- stale PWA assets

## Release decision

Do not launch when:

- state divergence is reproducible
- raw IP appears in logs/storage
- in-app browser loses invitation route
- service worker can reload active match
- cleanup leaks rooms
- rate limits are disabled
- privacy notice is incomplete
- unsupported browser silently fails

## Completion criteria

- Release checklist in `docs/12-testing-release.md` is signed off.
- Production rollback is demonstrated.
- Public beta version is tagged.
