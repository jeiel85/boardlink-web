# Goal 11 — Game Pack 1: Strategy and Utility Basics

## Mission

Add the first additional game wave after Bubble Siege, Bingo, and Gomoku are already stable.

This goal covers:

- Four in a Row
- Reversi
- Dots and Boxes
- Number Baseball
- Quiz Buzzer
- Rock-Paper-Scissors Tournament

## Required outcomes

### Four in a Row

- fixed board
- turn-based drop logic
- gravity rule
- four-in-line detection
- replay
- same-device mode

### Reversi

- legal move generation
- forced pass
- flip resolution
- final scoring
- replay
- same-device mode

### Dots and Boxes

- 2–4 player support
- line claim
- box detection
- extra-turn rule
- final scoring
- replay
- same-device mode

### Number Baseball

- 1v1 hidden number mode
- 3-digit and 4-digit options
- strike / ball evaluation
- player-specific projection
- rematch
- same-device mode

### Quiz Buzzer

- 2–32 player support
- host view
- participant buzzer view
- first-buzz lockout
- reset
- scoreboard

### Rock-Paper-Scissors Tournament

- simultaneous hidden choice
- reveal step
- tie handling
- bracket mode
- 2–64 participants
- result summary

## Constraints

- All games must use the shared game SDK.
- Hidden-information games must prove projection safety in tests.
- Tournament state must remain deterministic and replayable.

## Required tests

- deterministic replay for every game
- serialization round trip for every game
- invalid move rejection
- reconnect behavior
- same-device mode parity
- RPS simultaneous input test
- Quiz Buzzer first-lock correctness
- Number Baseball hidden-state non-leakage
- Dots and Boxes extra-turn correctness
- Reversi forced-pass correctness
- Four in a Row all direction win checks
