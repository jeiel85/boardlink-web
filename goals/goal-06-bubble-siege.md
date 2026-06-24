# Goal 06 — Bubble Siege

## Mission

Implement the original Bubble Siege game exactly as specified in `docs/10-bubble-siege.md`.

## Required outcomes

- pure game module
- two-round role switch
- server-scheduled countdown
- 10-second rounds
- 12-ball cap
- 120 ms spawn cooldown
- square logical arena
- spawn boundary and spacing validation
- pop hit validation
- one-pointer policy
- optimistic visual feedback
- authoritative reconciliation
- connection-quality indicator
- abort/replay policy
- sound and reduced-motion settings
- local same-device practice mode
- match result
- replay and local history

## Constraints

- No client-calculated final score.
- No ranked mode.
- No multitouch advantage.
- No hidden latency.
- No separate online/local rule implementation.
- Page hide or orientation change aborts active round.

## Required tests

Implement every vector listed in `docs/10-bubble-siege.md`.

Add real-device manual test script for:

- phone attacker versus tablet defender
- tablet attacker versus laptop defender
- different aspect ratios
- same Wi-Fi
- mobile network versus Wi-Fi
- KakaoTalk invitation handoff
- installed PWA versus browser

## Completion criteria

- Both clients always display the same final result.
- Full match can be replayed from authoritative events.
- No active-ball count can exceed the configured cap.
- Real-device input remains responsive.
