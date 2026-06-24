import { describe, it, expect } from 'vitest';
import {
  bubbleSiegeGame,
  type BubbleSiegeState,
  type BubbleSiegeCommand,
  type BubbleSiegeEvent,
  type Side,
} from '../src/games/bubble-siege/index.js';
import type { GamePlayer } from '@boardlink/protocol';

// ---------- harness ----------

const PLAYERS: GamePlayer[] = [
  { userId: 'pa', displayName: 'Alice', seatIndex: 0 },
  { userId: 'pb', displayName: 'Bob', seatIndex: 1 },
];

const START_MS = 1_000;
const CONFIG = bubbleSiegeGame.validateConfig({});

function initial(seed = 'match-seed-1', startMs = START_MS): BubbleSiegeState {
  return bubbleSiegeGame.createInitialState({
    config: CONFIG,
    players: PLAYERS,
    seed,
    startsAtServerMs: startMs,
  });
}

function applyAll(state: BubbleSiegeState, events: readonly BubbleSiegeEvent[]): BubbleSiegeState {
  return events.reduce((s, e) => bubbleSiegeGame.evolve(s, e), state);
}

interface Roles {
  attacker: { userId: string; seatIndex: number };
  defender: { userId: string; seatIndex: number };
  attackerSide: Side;
}

function roles(state: BubbleSiegeState): Roles {
  const attackerSide: Side =
    state.currentRound === 1 ? state.firstAttacker : state.firstAttacker === 'A' ? 'B' : 'A';
  const a = { userId: state.playerA, seatIndex: 0 };
  const b = { userId: state.playerB, seatIndex: 1 };
  return attackerSide === 'A'
    ? { attacker: a, defender: b, attackerSide }
    : { attacker: b, defender: a, attackerSide };
}

// Advance a COUNTDOWN state to ACTIVE by ticking at countdownEnd.
function startRound(state: BubbleSiegeState): BubbleSiegeState {
  expect(state.phase).toBe('COUNTDOWN');
  const events = bubbleSiegeGame.onTick!({ state, serverMs: state.countdownEndMs });
  return applyAll(state, events);
}

interface CmdResult {
  ok: boolean;
  reason?: string;
  state: BubbleSiegeState;
  events: readonly BubbleSiegeEvent[];
}

function run(
  state: BubbleSiegeState,
  actor: { userId: string; seatIndex: number },
  command: BubbleSiegeCommand,
  serverMs: number,
): CmdResult {
  const v = bubbleSiegeGame.validateCommand({
    state,
    actor,
    command,
    serverReceivedAtMs: serverMs,
  });
  if (!v.valid) return { ok: false, reason: v.reason, state, events: [] };
  const events = bubbleSiegeGame.decide({ state, actor, command, serverReceivedAtMs: serverMs });
  return { ok: true, state: applyAll(state, events), events };
}

let idCounter = 0;
function spawn(x: number, y: number): BubbleSiegeCommand {
  return { type: 'SPAWN_BALL', commandId: `c${++idCounter}`, x, y };
}
function pop(ballId: string, x: number, y: number): BubbleSiegeCommand {
  return { type: 'POP_BALL', commandId: `c${++idCounter}`, ballId, x, y };
}

// ---------- config validation ----------

describe('bubble-siege: config', () => {
  it('returns spec defaults for empty input', () => {
    const c = bubbleSiegeGame.validateConfig({});
    expect(c.roundDurationMs).toBe(10_000);
    expect(c.countdownMs).toBe(3_000);
    expect(c.maxBalls).toBe(12);
    expect(c.spawnCooldownMs).toBe(120);
    expect(c.ballRadius).toBe(45);
    expect(c.minCenterDistance).toBe(65);
  });

  it('accepts valid overrides and rejects invalid ones', () => {
    const c = bubbleSiegeGame.validateConfig({
      maxBalls: 6,
      spawnCooldownMs: 0,
      roundDurationMs: -1, // invalid → default
      ballRadius: 'big', // invalid → default
    });
    expect(c.maxBalls).toBe(6);
    expect(c.spawnCooldownMs).toBe(0);
    expect(c.roundDurationMs).toBe(10_000);
    expect(c.ballRadius).toBe(45);
  });
});

// ---------- initial state & countdown ----------

describe('bubble-siege: lifecycle', () => {
  it('starts in COUNTDOWN with computed boundaries and null scores', () => {
    const s = initial();
    expect(s.phase).toBe('COUNTDOWN');
    expect(s.currentRound).toBe(1);
    expect(s.countdownEndMs).toBe(START_MS + 3_000);
    expect(s.roundEndMs).toBe(START_MS + 3_000 + 10_000);
    expect(s.scoreA).toBeNull();
    expect(s.scoreB).toBeNull();
    expect(['A', 'B']).toContain(s.firstAttacker);
  });

  it('alarm schedule follows the phase machine', () => {
    let s = initial();
    expect(bubbleSiegeGame.getNextAlarmMs!(s, START_MS)).toBe(s.countdownEndMs);
    s = startRound(s);
    expect(s.phase).toBe('ACTIVE');
    expect(bubbleSiegeGame.getNextAlarmMs!(s, s.countdownEndMs)).toBe(s.roundEndMs);
  });

  it('onTick before a boundary is a no-op', () => {
    const s = initial();
    expect(bubbleSiegeGame.onTick!({ state: s, serverMs: s.countdownEndMs - 1 })).toHaveLength(0);
  });
});

// ---------- legal / illegal commands ----------

describe('bubble-siege: command validation', () => {
  it('rejects spawn during countdown', () => {
    const s = initial();
    const { attacker } = roles(s);
    const r = run(s, attacker, spawn(500, 500), s.countdownEndMs - 10);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not active/i);
  });

  it('accepts a legal attacker spawn and records the ball', () => {
    let s = startRound(initial());
    const { attacker } = roles(s);
    const r = run(s, attacker, spawn(500, 500), s.countdownEndMs + 1);
    expect(r.ok).toBe(true);
    s = r.state;
    expect(Object.keys(s.balls)).toHaveLength(1);
    expect(s.attackerLastSpawnMs).toBe(s.countdownEndMs + 1);
  });

  it('rejects spawn by the defender', () => {
    const s = startRound(initial());
    const { defender } = roles(s);
    const r = run(s, defender, spawn(500, 500), s.countdownEndMs + 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/attacker/i);
  });

  it('accepts spawn at exact edge boundary, rejects just outside', () => {
    const s = startRound(initial());
    const { attacker } = roles(s);
    // radius 45 + margin 20 = min center 65; max = 1000 - 65 = 935
    expect(run(s, attacker, spawn(65, 65), s.countdownEndMs + 1).ok).toBe(true);
    expect(run(s, attacker, spawn(935, 935), s.countdownEndMs + 1).ok).toBe(true);
    expect(run(s, attacker, spawn(64, 500), s.countdownEndMs + 1).ok).toBe(false);
    expect(run(s, attacker, spawn(500, 936), s.countdownEndMs + 1).ok).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    const s = startRound(initial());
    const { attacker } = roles(s);
    expect(run(s, attacker, spawn(500.5, 500), s.countdownEndMs + 1).ok).toBe(false);
  });

  it('enforces spawn cooldown at the boundary', () => {
    let s = startRound(initial());
    const { attacker } = roles(s);
    const t0 = s.countdownEndMs + 1;
    s = run(s, attacker, spawn(200, 200), t0).state;
    // 119ms later → rejected, 120ms later → accepted
    expect(run(s, attacker, spawn(400, 400), t0 + 119).ok).toBe(false);
    expect(run(s, attacker, spawn(400, 400), t0 + 120).ok).toBe(true);
  });

  it('rejects the 13th ball when cap is 12', () => {
    let s = startRound(initial());
    const { attacker } = roles(s);
    let t = s.countdownEndMs + 1;
    // place 12 balls spaced far enough apart (>= 65 center distance)
    for (let i = 0; i < 12; i++) {
      const x = 100 + (i % 4) * 200; // 100,300,500,700
      const y = 100 + Math.floor(i / 4) * 200; // 100,300,500
      const r = run(s, attacker, spawn(x, y), t);
      expect(r.ok).toBe(true);
      s = r.state;
      t += 120;
    }
    expect(Object.keys(s.balls)).toHaveLength(12);
    const r13 = run(s, attacker, spawn(900, 500), t);
    expect(r13.ok).toBe(false);
    expect(r13.reason).toMatch(/maximum/i);
  });

  it('rejects a spawn too close to an existing ball', () => {
    let s = startRound(initial());
    const { attacker } = roles(s);
    const t = s.countdownEndMs + 1;
    s = run(s, attacker, spawn(500, 500), t).state;
    // 64 units away (< 65 min center distance) → rejected
    expect(run(s, attacker, spawn(564, 500), t + 120).ok).toBe(false);
    // 65 units away → accepted
    expect(run(s, attacker, spawn(565, 500), t + 120).ok).toBe(true);
  });

  it('pop hit-test: inside radius+tolerance accepted, outside rejected; duplicate rejected', () => {
    let s = startRound(initial());
    const { attacker, defender } = roles(s);
    const t = s.countdownEndMs + 1;
    const spawnRes = run(s, attacker, spawn(500, 500), t);
    s = spawnRes.state;
    const ballId = Object.keys(s.balls)[0];
    // pointer far away → reject
    expect(run(s, defender, pop(ballId, 800, 800), t + 1).ok).toBe(false);
    // within radius(45)+tolerance(15)=60 → accept (50 units away)
    const popRes = run(s, defender, pop(ballId, 540, 530), t + 1);
    expect(popRes.ok).toBe(true);
    s = popRes.state;
    expect(Object.keys(s.balls)).toHaveLength(0);
    // duplicate pop → ball already gone
    expect(run(s, defender, pop(ballId, 500, 500), t + 2).ok).toBe(false);
  });

  it('rejects spawn and pop after round end', () => {
    let s = startRound(initial());
    const { attacker, defender } = roles(s);
    s = run(s, attacker, spawn(500, 500), s.countdownEndMs + 1).state;
    const ballId = Object.keys(s.balls)[0];
    expect(run(s, attacker, spawn(200, 200), s.roundEndMs).ok).toBe(false);
    expect(run(s, defender, pop(ballId, 500, 500), s.roundEndMs).ok).toBe(false);
    expect(run(s, defender, pop(ballId, 500, 500), s.roundEndMs + 5).ok).toBe(false);
  });

  it('accepts two final commands at the same timestamp just before round end', () => {
    let s = startRound(initial());
    const { attacker, defender } = roles(s);
    const tEnd = s.roundEndMs - 1;
    const r1 = run(s, attacker, spawn(300, 300), tEnd);
    expect(r1.ok).toBe(true);
    s = r1.state;
    const ballId = Object.keys(s.balls)[0];
    const r2 = run(s, defender, pop(ballId, 300, 300), tEnd);
    expect(r2.ok).toBe(true);
  });
});

// ---------- role switching & scoring ----------

describe('bubble-siege: rounds, scoring, result', () => {
  it('switches roles between round 1 and round 2', () => {
    let s = startRound(initial());
    const r1 = roles(s);
    // end round 1
    s = applyAll(s, bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs }));
    expect(s.phase).toBe('COUNTDOWN');
    expect(s.currentRound).toBe(2);
    s = startRound(s);
    const r2 = roles(s);
    expect(r2.attackerSide).not.toBe(r1.attackerSide);
    expect(r2.attacker.userId).toBe(r1.defender.userId);
  });

  it('scores each player by balls surviving in their own attack round; higher wins', () => {
    // Round 1: attacker leaves 2 balls alive. Round 2: attacker leaves 1.
    let s = startRound(initial());
    const r1 = roles(s);
    let t = s.countdownEndMs + 1;
    // spawn 3, defender pops 1 → 2 survive
    for (const [x, y] of [
      [200, 200],
      [400, 400],
      [600, 600],
    ]) {
      s = run(s, r1.attacker, spawn(x, y), t).state;
      t += 120;
    }
    const firstBall = Object.keys(s.balls)[0];
    s = run(s, r1.defender, pop(firstBall, 200, 200), t).state;
    expect(liveCount(s)).toBe(2);

    // end round 1
    s = applyAll(s, bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs }));
    // round-1 attacker's score recorded
    const round1Score = r1.attackerSide === 'A' ? s.scoreA : s.scoreB;
    expect(round1Score).toBe(2);

    // round 2
    s = startRound(s);
    const r2 = roles(s);
    let t2 = s.countdownEndMs + 1;
    s = run(s, r2.attacker, spawn(500, 500), t2).state; // 1 ball survives
    t2 += 120;
    expect(liveCount(s)).toBe(1);

    // end round 2 → ROUND_ENDED + GAME_OVER
    const endEvents = bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs });
    expect(endEvents.some((e) => e.type === 'GAME_OVER')).toBe(true);
    s = applyAll(s, endEvents);
    expect(s.phase).toBe('GAME_OVER');

    const result = bubbleSiegeGame.evaluateResult(s);
    expect(result).not.toBeNull();
    expect(result!.isDraw).toBe(false);
    // round-1 attacker scored 2, round-2 attacker scored 1 → round-1 attacker wins
    expect(result!.winnerId).toBe(r1.attacker.userId);
  });

  it('equal scores produce a draw', () => {
    let s = startRound(initial());
    const r1 = roles(s);
    let t = s.countdownEndMs + 1;
    s = run(s, r1.attacker, spawn(500, 500), t).state; // 1 survives
    s = applyAll(s, bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs }));
    s = startRound(s);
    const r2 = roles(s);
    t = s.countdownEndMs + 1;
    s = run(s, r2.attacker, spawn(500, 500), t).state; // 1 survives
    s = applyAll(s, bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs }));
    const result = bubbleSiegeGame.evaluateResult(s)!;
    expect(result.scoreA).toBe(result.scoreB);
    expect(result.isDraw).toBe(true);
    expect(result.winnerId).toBeNull();
  });

  it('evaluateResult is null before game over', () => {
    expect(bubbleSiegeGame.evaluateResult(initial())).toBeNull();
  });
});

function liveCount(s: BubbleSiegeState): number {
  return Object.keys(s.balls).length;
}

// ---------- replay, serialization, determinism ----------

describe('bubble-siege: replay & serialization', () => {
  // Drive a deterministic full match, capturing every authoritative event.
  function playMatch(seed: string): { events: BubbleSiegeEvent[]; finalState: BubbleSiegeState } {
    let s = initial(seed);
    const events: BubbleSiegeEvent[] = [];
    const record = (evs: readonly BubbleSiegeEvent[]) => {
      events.push(...evs);
      s = applyAll(s, evs);
    };
    // start round 1
    record(bubbleSiegeGame.onTick!({ state: s, serverMs: s.countdownEndMs }));
    const r1 = roles(s);
    let t = s.countdownEndMs + 1;
    for (const [x, y] of [
      [200, 200],
      [400, 400],
      [600, 600],
      [800, 800],
    ]) {
      const res = bubbleSiegeGame.decide({
        state: s,
        actor: r1.attacker,
        command: spawn(x, y),
        serverReceivedAtMs: t,
      });
      record(res);
      t += 120;
    }
    const popId = Object.keys(s.balls)[0];
    record(
      bubbleSiegeGame.decide({
        state: s,
        actor: r1.defender,
        command: pop(popId, 200, 200),
        serverReceivedAtMs: t,
      }),
    );
    record(bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs }));
    // round 2
    record(bubbleSiegeGame.onTick!({ state: s, serverMs: s.countdownEndMs }));
    const r2 = roles(s);
    let t2 = s.countdownEndMs + 1;
    for (const [x, y] of [
      [300, 300],
      [500, 500],
    ]) {
      record(
        bubbleSiegeGame.decide({
          state: s,
          actor: r2.attacker,
          command: spawn(x, y),
          serverReceivedAtMs: t2,
        }),
      );
      t2 += 120;
    }
    record(bubbleSiegeGame.onTick!({ state: s, serverMs: s.roundEndMs }));
    return { events, finalState: s };
  }

  it('replaying the event log reproduces an identical final state hash and result', async () => {
    const { events, finalState } = playMatch('replay-seed');
    let replay = initial('replay-seed');
    for (const e of events) replay = bubbleSiegeGame.evolve(replay, e);

    const h1 = await bubbleSiegeGame.canonicalHash(finalState);
    const h2 = await bubbleSiegeGame.canonicalHash(replay);
    expect(h2).toBe(h1);
    expect(bubbleSiegeGame.evaluateResult(replay)).toEqual(
      bubbleSiegeGame.evaluateResult(finalState),
    );
    expect(finalState.phase).toBe('GAME_OVER');
  });

  it('serialize → deserialize round-trips to the same hash', async () => {
    const { finalState } = playMatch('roundtrip-seed');
    const serialized = bubbleSiegeGame.serializeState(finalState);
    const revived = bubbleSiegeGame.deserializeState(JSON.parse(JSON.stringify(serialized)));
    const h1 = await bubbleSiegeGame.canonicalHash(finalState);
    const h2 = await bubbleSiegeGame.canonicalHash(revived);
    expect(h2).toBe(h1);
  });

  it('state hash is order-independent for ball insertion order but sensitive to ball position', async () => {
    const ball1 = { id: 'c1', x: 200, y: 200, radius: 45, spawnedAtServerMs: 5000 };
    const ball2 = { id: 'c2', x: 400, y: 400, radius: 45, spawnedAtServerMs: 5120 };
    // identical balls inserted in opposite key order → same hash
    const forward = { balls: { c1: ball1, c2: ball2 } };
    const reverse = { balls: { c2: ball2, c1: ball1 } };
    const ha = await bubbleSiegeGame.canonicalHash(forward);
    const hb = await bubbleSiegeGame.canonicalHash(reverse);
    expect(hb).toBe(ha);
    // moving a ball changes the hash
    const moved = { balls: { c1: { ...ball1, x: 999 }, c2: ball2 } };
    const hMoved = await bubbleSiegeGame.canonicalHash(moved);
    expect(hMoved).not.toBe(ha);
  });
});

// ---------- fuzz ----------

describe('bubble-siege: fuzz', () => {
  // Simple deterministic LCG so the fuzz run is reproducible without Math.random.
  function lcg(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  }

  it('never throws and never exceeds invariants under random command spam', () => {
    const rand = lcg(12345);
    let s = startRound(initial('fuzz-seed'));
    const { attacker, defender } = roles(s);
    let t = s.countdownEndMs + 1;
    for (let i = 0; i < 500; i++) {
      const isSpawn = rand() < 0.6;
      const x = 1 + Math.floor(rand() * 999);
      const y = 1 + Math.floor(rand() * 999);
      if (isSpawn) {
        const r = run(s, attacker, spawn(x, y), t);
        if (r.ok) s = r.state;
      } else {
        const ids = Object.keys(s.balls);
        const id = ids.length ? ids[Math.floor(rand() * ids.length)] : 'missing';
        const r = run(s, defender, pop(id, x, y), t);
        if (r.ok) s = r.state;
      }
      // invariants
      expect(liveCount(s)).toBeLessThanOrEqual(CONFIG.maxBalls);
      for (const b of Object.values(s.balls)) {
        expect(Number.isInteger(b.x)).toBe(true);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(1000);
      }
      t += Math.floor(rand() * 200);
      if (t >= s.roundEndMs) break;
    }
  });
});
