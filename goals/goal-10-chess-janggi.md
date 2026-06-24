# Goal 10 — Chess and Janggi Expansion

## Mission

Add Chess and Janggi only after the first public release is stable.

## Chess

Required:

- legal move generation
- check/checkmate/stalemate
- castling
- en passant
- promotion
- repetition handling
- fifty-move rule
- insufficient material
- optional clocks
- PGN export

Prefer a mature, license-compatible rule library only after license review. Keep rendering independent.

## Janggi

Required:

- explicit rule profile
- palace movement
- cannon restrictions
- horse/elephant blocking
- repetition policy
- pass policy
- draw/scoring policy
- move history

Because Janggi rule conventions vary, select and cite a specific ruleset before implementation.

## Completion criteria

- Rule-source documentation exists.
- License review is recorded.
- Golden game fixtures pass.
- No shared platform regression.
