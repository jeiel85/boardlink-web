# Merge Guide

## If you already have the original BoardLink design bundle

Copy these folders into the existing project documentation root:

- `docs/`
- `goals/`
- `contracts/`
- `reference/`

## Suggested next prompt for your coding agent

```text
Read AGENTS.md and the original BoardLink architecture docs first.
Then read docs/17-game-expansion-strategy.md through docs/21-game-pack-integration.md.
Treat those as an extension to the product roadmap.

Do not start Goal 11 until Goals 00–10 and the shared runtime are stable.
When ready, implement goals/goal-11-game-pack-1.md exactly, with tests and documentation.
```
