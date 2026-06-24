# Goal 07 — Multiplayer Bingo

## Mission

Add a configurable multiplayer Bingo game to validate 1:N room behavior.

## Initial modes

- Caller-hosted number draw
- Automatic number draw
- 2–32 players
- Personal board
- Multiple winners
- Optional teams
- Spectator display placeholder

## Required outcomes

- deterministic board generation from seed
- server-authoritative draw sequence
- marked-cell validation
- winning-pattern validation
- reconnect and snapshot
- late-join policy
- result ordering
- accessible non-color-only marking
- same-device mode where practical

## Randomness

Use server seed for version 1.

Document a later commit-reveal shared-seed mode, but do not delay the initial release unless fairness requirements demand it.

## Tests

- identical seed produces identical board
- no duplicate drawn number
- valid and invalid Bingo claim
- multiple simultaneous winners
- 32 simulated clients
- reconnect after several draws
- state replay

## Completion criteria

- One room supports at least 32 simulated participants within resource limits.
