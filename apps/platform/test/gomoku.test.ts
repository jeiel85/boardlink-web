import { describe, it, expect } from 'vitest';
import {
  gomokuGame,
  type GomokuState,
  type GomokuCommand,
  type GomokuEvent,
  type GomokuConfig,
} from '../src/games/gomoku/index.js';
import type { GamePlayer } from '@boardlink/protocol';

const PLAYERS: GamePlayer[] = [
  { userId: 'pa', displayName: 'Alice', seatIndex: 0 },
  { userId: 'pb', displayName: 'Bob', seatIndex: 1 },
];

function initial(seed = 'gomoku-seed', cfg: unknown = {}): GomokuState {
  return gomokuGame.createInitialState({
    config: gomokuGame.validateConfig(cfg),
    players: PLAYERS,
    seed,
    startsAtServerMs: 0,
  });
}

interface RunResult {
  ok: boolean;
  reason?: string;
  state: GomokuState;
  events: readonly GomokuEvent[];
}

function move(state: GomokuState, seat: number, x: number, y: number): RunResult {
  const actor = { userId: state.seats[seat], seatIndex: seat };
  const command: GomokuCommand = { type: 'PLACE_STONE', x, y };
  const v = gomokuGame.validateCommand({ state, actor, command, serverReceivedAtMs: 0 });
  if (!v.valid) return { ok: false, reason: v.reason, state, events: [] };
  const events = gomokuGame.decide({ state, actor, command, serverReceivedAtMs: 0 });
  const next = events.reduce((s, e) => gomokuGame.evolve(s, e), state);
  return { ok: true, state: next, events };
}

// Build a state with the given stones already placed (bypasses turn order — for
// unit-testing win/draw detection on the final move).
function stateWith(
  stones: { x: number; y: number; seat: number }[],
  turnSeat: number,
  cfg: GomokuConfig = gomokuGame.validateConfig({}),
): GomokuState {
  const base = gomokuGame.createInitialState({
    config: cfg,
    players: PLAYERS,
    seed: 's',
    startsAtServerMs: 0,
  });
  const board = base.board.slice();
  for (const s of stones) board[s.y * base.size + s.x] = s.seat;
  return { ...base, board, turnSeat, moveCount: stones.length };
}

// ---------- config ----------

describe('gomoku: config', () => {
  it('defaults and clamps', () => {
    const c = gomokuGame.validateConfig({});
    expect(c.size).toBe(15);
    expect(c.winLength).toBe(5);
    expect(c.allowOverline).toBe(true);

    expect(gomokuGame.validateConfig({ size: 2 }).size).toBe(3);
    expect(gomokuGame.validateConfig({ size: 99 }).size).toBe(19);
    expect(gomokuGame.validateConfig({ winLength: 2 }).winLength).toBe(3);
    // winLength cannot exceed size
    expect(gomokuGame.validateConfig({ size: 5, winLength: 9 }).winLength).toBe(5);
    expect(gomokuGame.validateConfig({ allowOverline: false }).allowOverline).toBe(false);
  });
});

// ---------- initial / turns ----------

describe('gomoku: turns', () => {
  it('starts empty with a seed-derived first mover', () => {
    const s = initial();
    expect(s.phase).toBe('IN_PROGRESS');
    expect(s.board.every((c) => c === -1)).toBe(true);
    expect([0, 1]).toContain(s.turnSeat);
    expect(initial('seed-a').turnSeat).toBe(initial('seed-a').turnSeat); // deterministic
  });

  it('only the turn-holder can place, and placing flips the turn', () => {
    const s = initial();
    const wrong = (s.turnSeat + 1) % 2;
    expect(move(s, wrong, 7, 7).ok).toBe(false);
    const r = move(s, s.turnSeat, 7, 7);
    expect(r.ok).toBe(true);
    expect(r.state.turnSeat).toBe(wrong);
    expect(r.state.moveCount).toBe(1);
    expect(r.state.board[7 * s.size + 7]).toBe(s.turnSeat);
  });

  it('rejects out-of-bounds, non-integer, and occupied cells', () => {
    let s = initial();
    const seat = s.turnSeat;
    expect(move(s, seat, -1, 0).ok).toBe(false);
    expect(move(s, seat, 0, 99).ok).toBe(false);
    expect(move(s, seat, 1.5, 0).ok).toBe(false);
    s = move(s, seat, 5, 5).state;
    // cell now occupied; the other player cannot place there
    expect(move(s, (seat + 1) % 2, 5, 5).ok).toBe(false);
  });
});

// ---------- win detection ----------

describe('gomoku: win detection', () => {
  it('detects a horizontal five-in-a-row through full play', () => {
    let s = initial('horiz');
    const winnerSeat = s.turnSeat;
    const loserSeat = (winnerSeat + 1) % 2;
    let wc = 0;
    let lc = 0;
    let lastEvents: readonly GomokuEvent[] = [];
    while (s.phase === 'IN_PROGRESS') {
      const r =
        s.turnSeat === winnerSeat ? move(s, winnerSeat, wc++, 0) : move(s, loserSeat, lc++, 5);
      expect(r.ok).toBe(true);
      s = r.state;
      lastEvents = r.events;
    }
    expect(s.phase).toBe('COMPLETED');
    expect(s.winnerId).toBe(s.seats[winnerSeat]);
    expect(lastEvents.some((e) => e.type === 'GAME_WON')).toBe(true);
    const won = lastEvents.find((e) => e.type === 'GAME_WON') as
      | { winningLine: unknown[] }
      | undefined;
    expect(won!.winningLine).toHaveLength(5);

    const result = gomokuGame.evaluateResult(s);
    expect(result).toEqual({
      winnerId: s.seats[winnerSeat],
      winningSeat: winnerSeat,
      isDraw: false,
    });
  });

  it('detects vertical and diagonal wins on the final placement', () => {
    // vertical: seat 0 at (3,3..6), plays (3,7)
    const vert = stateWith(
      [
        { x: 3, y: 3, seat: 0 },
        { x: 3, y: 4, seat: 0 },
        { x: 3, y: 5, seat: 0 },
        { x: 3, y: 6, seat: 0 },
      ],
      0,
    );
    const vr = move(vert, 0, 3, 7);
    expect(vr.events.some((e) => e.type === 'GAME_WON')).toBe(true);
    expect(vr.state.winnerId).toBe(vert.seats[0]);

    // main diagonal: seat 1 at (1,1),(2,2),(3,3),(4,4), plays (5,5)
    const diag = stateWith(
      [
        { x: 1, y: 1, seat: 1 },
        { x: 2, y: 2, seat: 1 },
        { x: 3, y: 3, seat: 1 },
        { x: 4, y: 4, seat: 1 },
      ],
      1,
    );
    const dr = move(diag, 1, 5, 5);
    expect(dr.events.some((e) => e.type === 'GAME_WON')).toBe(true);
    expect(dr.state.winnerId).toBe(diag.seats[1]);
  });

  it('does not declare a win at four in a row', () => {
    const s = stateWith(
      [
        { x: 0, y: 0, seat: 0 },
        { x: 1, y: 0, seat: 0 },
        { x: 2, y: 0, seat: 0 },
      ],
      0,
    );
    const r = move(s, 0, 3, 0); // makes four
    expect(r.events.some((e) => e.type === 'GAME_WON')).toBe(false);
    expect(r.state.phase).toBe('IN_PROGRESS');
  });

  it('honours allowOverline: a bridged six wins in freestyle but not when disabled', () => {
    const stones = [
      { x: 0, y: 0, seat: 0 },
      { x: 1, y: 0, seat: 0 },
      { x: 2, y: 0, seat: 0 },
      { x: 4, y: 0, seat: 0 },
      { x: 5, y: 0, seat: 0 },
    ];
    // freestyle (default): placing (3,0) makes a run of six → win
    const free = stateWith(stones, 0, gomokuGame.validateConfig({ allowOverline: true }));
    expect(move(free, 0, 3, 0).events.some((e) => e.type === 'GAME_WON')).toBe(true);

    // overline disabled: a run of six is not exactly five → no win
    const strict = stateWith(stones, 0, gomokuGame.validateConfig({ allowOverline: false }));
    expect(move(strict, 0, 3, 0).events.some((e) => e.type === 'GAME_WON')).toBe(false);
  });
});

// ---------- draw ----------

describe('gomoku: draw', () => {
  it('declares a draw when the last cell fills with no line', () => {
    const cfg = gomokuGame.validateConfig({ size: 3, winLength: 3 });
    // 3×3, one empty cell at (2,2), no existing three-in-a-row
    const s = stateWith(
      [
        { x: 0, y: 0, seat: 0 },
        { x: 1, y: 0, seat: 1 },
        { x: 2, y: 0, seat: 0 },
        { x: 0, y: 1, seat: 0 },
        { x: 1, y: 1, seat: 1 },
        { x: 2, y: 1, seat: 1 },
        { x: 0, y: 2, seat: 1 },
        { x: 1, y: 2, seat: 0 },
      ],
      0,
      cfg,
    );
    const r = move(s, 0, 2, 2);
    expect(r.events.some((e) => e.type === 'GAME_DREW')).toBe(true);
    expect(r.state.phase).toBe('COMPLETED');
    expect(r.state.isDraw).toBe(true);
    expect(gomokuGame.evaluateResult(r.state)).toEqual({
      winnerId: null,
      winningSeat: null,
      isDraw: true,
    });
  });

  it('evaluateResult is null before completion', () => {
    expect(gomokuGame.evaluateResult(initial())).toBeNull();
  });
});

// ---------- replay & serialization ----------

describe('gomoku: replay & serialization', () => {
  function playWin(seed: string): { state: GomokuState; events: GomokuEvent[] } {
    let s = initial(seed);
    const winnerSeat = s.turnSeat;
    const loserSeat = (winnerSeat + 1) % 2;
    const events: GomokuEvent[] = [];
    let wc = 0;
    let lc = 0;
    while (s.phase === 'IN_PROGRESS') {
      const r =
        s.turnSeat === winnerSeat ? move(s, winnerSeat, wc++, 0) : move(s, loserSeat, lc++, 5);
      events.push(...r.events);
      s = r.state;
    }
    return { state: s, events };
  }

  it('replaying the event log reproduces the final hash and result', async () => {
    const { state, events } = playWin('replay-gomoku');
    let replay = initial('replay-gomoku');
    for (const e of events) replay = gomokuGame.evolve(replay, e);
    expect(await gomokuGame.canonicalHash(replay)).toBe(await gomokuGame.canonicalHash(state));
    expect(gomokuGame.evaluateResult(replay)).toEqual(gomokuGame.evaluateResult(state));
  });

  it('serialize → deserialize round-trips to the same hash', async () => {
    const { state } = playWin('roundtrip-gomoku');
    const revived = gomokuGame.deserializeState(
      JSON.parse(JSON.stringify(gomokuGame.serializeState(state))),
    );
    expect(await gomokuGame.canonicalHash(revived)).toBe(await gomokuGame.canonicalHash(state));
  });
});
