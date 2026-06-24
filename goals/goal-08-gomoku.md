# Goal 08 — Gomoku

## Mission

Add a complete two-player Gomoku game.

## Version 1 rules

- Freestyle Gomoku
- Configurable board size if tested; otherwise fixed 15×15
- Black and white
- Server-authoritative turn
- Exact or at-least-five policy explicitly documented
- Resign
- Draw agreement
- Rematch
- Move history
- Reconnect

Do not implement Renju forbidden moves in this goal.

## Required outcomes

- deterministic rule module
- legal placement
- win detection in all directions
- result
- board renderer
- keyboard and touch operation
- same-device mode
- replay
- local history

## Tests

- horizontal/vertical/diagonal wins
- occupied cell rejected
- wrong turn rejected
- move after result rejected
- reconnect
- replay hash
- board accessibility

## Completion criteria

- Gomoku uses only shared room and game SDK APIs.
