# Bubble Siege Game Specification

## Concept

Two players alternate attack and defense.

- The attacker touches an empty arena to create balls.
- The defender touches existing balls to pop them.
- The number of simultaneously active balls is capped.
- When a ball is popped, the attacker may create another.
- At the end of the short round, remaining balls are the attacker's score.
- Roles switch.
- Higher score wins.

## Game metadata

```text
gameId: bubble-siege
gameVersion: 1.0.0
players: exactly 2
mode: real-time asymmetric
match duration: approximately 26–35 seconds
orientation: any, square arena
ranked: no
```

## Version 1 default rules

| Setting                 |                Default |
| ----------------------- | ---------------------: |
| Round duration          |              10,000 ms |
| Countdown               |               3,000 ms |
| Maximum active balls    |                     12 |
| Spawn cooldown          |                 120 ms |
| Ball radius             |       45 logical units |
| Arena                   |          1,000 × 1,000 |
| Edge margin             | 20 units beyond radius |
| Minimum center distance |               65 units |
| Active pointers         |                      1 |
| Rounds                  |                      2 |
| Tie result              |                   Draw |
| Input authority         |    Server receive time |

Coordinates are integers in `[0, 1000]`.

## Match flow

```text
LOBBY
→ READY
→ ROLE_ASSIGNMENT
→ ROUND_1_COUNTDOWN
→ ROUND_1_ACTIVE
→ ROUND_1_RESULT
→ ROLE_SWITCH
→ ROUND_2_COUNTDOWN
→ ROUND_2_ACTIVE
→ MATCH_RESULT
```

The first attacker is chosen from a server-provided seed. Roles always switch.

## Scoring

At the authoritative round end:

```text
roundScore = activeBallCount
```

Final:

- Player A score = balls remaining during A attack round.
- Player B score = balls remaining during B attack round.
- Higher score wins.
- Equal score is a draw in version 1.

Spawn and pop counts may be displayed as non-scoring statistics.

## Attacker command

```ts
interface SpawnBallCommand {
  type: 'SPAWN_BALL';
  commandId: string;
  x: number;
  y: number;
  clientInputAtMs: number;
}
```

Server validates:

- Actor is current attacker
- Phase is active
- Command is not duplicate
- Server received before round end
- Spawn cooldown elapsed
- Active count below cap
- Coordinates are integers and within bounds
- Edge margin satisfied
- Minimum center distance satisfied
- Command rate not exceeded

Accepted event:

```ts
interface BallSpawnedEvent {
  type: 'BALL_SPAWNED';
  ballId: string;
  x: number;
  y: number;
  radius: number;
  spawnedAtServerMs: number;
}
```

## Defender command

```ts
interface PopBallCommand {
  type: 'POP_BALL';
  commandId: string;
  ballId: string;
  x: number;
  y: number;
  clientInputAtMs: number;
}
```

Server validates:

- Actor is current defender
- Phase is active
- Server received before round end
- Ball exists and is active
- Pointer coordinates are inside ball hit radius with a small documented accessibility tolerance
- Command rate not exceeded
- Command is not duplicate

Accepted event:

```ts
interface BallPoppedEvent {
  type: 'BALL_POPPED';
  ballId: string;
  poppedAtServerMs: number;
}
```

## Input policy

- Accept the primary pointer only.
- Ignore secondary simultaneous pointers.
- Prevent browser scrolling and zoom gestures inside the arena.
- Mouse, touch, and pen use the same Pointer Events path.
- Context menu is disabled only inside the arena.
- Keyboard-accessible practice mode is desirable but not required for real-time competitive parity.

## Rendering

### Attacker

- On pointer input, render a translucent pending ball immediately.
- Accepted: transition to authoritative ball.
- Rejected: shrink/fade pending ball.
- Do not count pending balls as score.

### Defender

- On pointer input, play immediate local pop feedback.
- Reconcile with authoritative event.
- If rejected because already popped, do not restore a distracting full animation; reconcile quietly.

### Both

- Display countdown
- Display active ball count
- Display connection quality
- Display role
- Respect reduced motion
- Optional sound and vibration toggles
- Never rely only on color to distinguish pending/active/popped

## Timing and fairness

Version 1 is casual.

- Server receive time decides whether input is before round end.
- Before each round, collect multiple RTT samples.
- If RTT is high or unstable, show a warning.
- Do not hide latency.
- Do not implement leaderboard or prizes.
- Future direct WebRTC transport may reduce same-network latency but does not eliminate automation cheats.

Suggested thresholds:

| Condition               | UI               |
| ----------------------- | ---------------- |
| median RTT < 100 ms     | Good             |
| 100–250 ms              | Fair             |
| > 250 ms or high jitter | Degraded warning |

Tune thresholds after real-device testing.

## Disconnect and lifecycle policy

- If either player disconnects during countdown, pause countdown.
- If either player disconnects during an active round, abort the round.
- Allow one automatic replay of an aborted round.
- Repeated disconnect by the same player ends match as incomplete, not a ranked loss.
- Page hidden, orientation changed, or browser backgrounded during active round follows the same abort policy.
- Room remains resumable for a short TTL.

## Anti-cheat boundary

Server validation prevents simple illegal commands, but cannot prevent:

- Automated clicking
- Modified clients
- Screen-reading automation
- Multiple physical input devices
- Intentional network disruption

Therefore the initial game is a friendly game.

## Required test vectors

- Spawn at exact edge boundary
- Spawn just outside edge boundary
- Spawn at cooldown boundary
- Thirteenth ball rejected when cap is 12
- Pop and spawn arriving close together
- Duplicate pop command
- Pop after round end
- Spawn after round end
- Both final commands at the same timestamp
- Disconnect at 9.9 seconds
- State replay produces identical score
- Different viewport sizes produce same logical coordinates
