import { describe, it, expect } from 'vitest';
import {
  bingoGame,
  type BingoState,
  type BingoCommand,
  type BingoEvent,
} from '../src/games/bingo/index.js';
import type { GamePlayer, GameActor } from '@boardlink/protocol';

const PLAYERS: GamePlayer[] = [
  { userId: 'pa', displayName: 'Alice', seatIndex: 0 },
  { userId: 'pb', displayName: 'Bob', seatIndex: 1 },
];

const CONFIG = bingoGame.validateConfig({});

function initial(seed = 'bingo-seed', players: GamePlayer[] = PLAYERS): BingoState {
  return bingoGame.createInitialState({
    config: CONFIG,
    players,
    seed,
    startsAtServerMs: 0,
  });
}

function actor(state: BingoState, seat: number): GameActor {
  return { userId: state.seats[seat], seatIndex: seat };
}

interface RunResult {
  ok: boolean;
  reason?: string;
  state: BingoState;
  events: readonly BingoEvent[];
}

function run(state: BingoState, a: GameActor, command: BingoCommand): RunResult {
  const v = bingoGame.validateCommand({ state, actor: a, command, serverReceivedAtMs: 0 });
  if (!v.valid) return { ok: false, reason: v.reason, state, events: [] };
  const events = bingoGame.decide({ state, actor: a, command, serverReceivedAtMs: 0 });
  const next = events.reduce((s, e) => bingoGame.evolve(s, e), state);
  return { ok: true, state: next, events };
}

// ---------- config ----------

describe('bingo: config', () => {
  it('returns defaults and clamps out-of-range input', () => {
    const c = bingoGame.validateConfig({});
    expect(c.size).toBe(5);
    expect(c.winningLines).toBe(1);
    expect(c.poolSize).toBeGreaterThanOrEqual(25);

    expect(bingoGame.validateConfig({ size: 1 }).size).toBe(3); // clamp up
    expect(bingoGame.validateConfig({ size: 99 }).size).toBe(7); // clamp down
    expect(bingoGame.validateConfig({ winningLines: 0 }).winningLines).toBe(1);
    expect(bingoGame.validateConfig({ poolSize: 5 }).poolSize).toBeGreaterThanOrEqual(25);
  });
});

// ---------- initial state ----------

describe('bingo: initial state', () => {
  it('deals distinct cards from the pool, empty marks, full hidden draw order', () => {
    const s = initial();
    expect(s.phase).toBe('IN_PROGRESS');
    expect(s.seats).toEqual(['pa', 'pb']);
    expect(s.drawnCount).toBe(0);
    expect(s.turnSeat).toBeGreaterThanOrEqual(0);
    expect(s.turnSeat).toBeLessThan(2);

    for (const uid of s.seats) {
      const card = s.cards[uid];
      expect(card).toHaveLength(CONFIG.size * CONFIG.size);
      expect(new Set(card).size).toBe(card.length); // distinct
      for (const n of card) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(CONFIG.poolSize);
      }
      expect(s.marks[uid]).toEqual([]);
    }
    // drawOrder is a full permutation of the pool
    expect(s.drawOrder).toHaveLength(CONFIG.poolSize);
    expect(new Set(s.drawOrder).size).toBe(CONFIG.poolSize);
  });

  it('is deterministic for the same seed and differs for another', () => {
    expect(initial('seed-x')).toEqual(initial('seed-x'));
    expect(initial('seed-x').drawOrder).not.toEqual(initial('seed-y').drawOrder);
  });
});

// ---------- DRAW ----------

describe('bingo: draw', () => {
  it('only the turn-holder may draw; draw reveals next number and rotates turn', () => {
    const s = initial();
    const other = (s.turnSeat + 1) % 2;
    expect(run(s, actor(s, other), { type: 'DRAW' }).ok).toBe(false);

    const r = run(s, actor(s, s.turnSeat), { type: 'DRAW' });
    expect(r.ok).toBe(true);
    expect(r.state.drawnCount).toBe(1);
    expect(r.state.turnSeat).toBe(other);
    const ev = r.events[0];
    expect(ev.type).toBe('NUMBER_DRAWN');
    expect((ev as { number: number }).number).toBe(s.drawOrder[0]);
  });

  it('rejects draw when the bag is exhausted', () => {
    let s = initial();
    for (let i = 0; i < s.drawOrder.length; i++) {
      s = run(s, actor(s, s.turnSeat), { type: 'DRAW' }).state;
    }
    expect(run(s, actor(s, s.turnSeat), { type: 'DRAW' }).ok).toBe(false);
  });
});

// ---------- MARK ----------

describe('bingo: mark', () => {
  it('rejects marking a number not on the card, not called, or already marked', () => {
    let s = initial();
    const a = actor(s, 0);
    const card = s.cards['pa'];
    const onCard = card[0];

    // not called yet
    expect(run(s, a, { type: 'MARK', number: onCard }).ok).toBe(false);

    // a number not on the card (find one in pool but absent from card)
    let notOnCard = -1;
    for (let n = 1; n <= CONFIG.poolSize; n++) {
      if (!card.includes(n)) {
        notOnCard = n;
        break;
      }
    }
    expect(notOnCard).toBeGreaterThan(0);

    // draw until onCard is called
    while (!s.drawOrder.slice(0, s.drawnCount).includes(onCard)) {
      s = run(s, actor(s, s.turnSeat), { type: 'DRAW' }).state;
    }
    // marking a not-on-card number is rejected even if called
    expect(run(s, a, { type: 'MARK', number: notOnCard }).ok).toBe(false);
    // marking the on-card called number works
    const marked = run(s, a, { type: 'MARK', number: onCard });
    expect(marked.ok).toBe(true);
    expect(marked.state.marks['pa']).toContain(onCard);
    // marking it again is rejected
    expect(run(marked.state, a, { type: 'MARK', number: onCard }).ok).toBe(false);
  });
});

// ---------- win / claim ----------

// Drive the match until the player at `seat` completes (and claims) their top row.
function winByTopRow(seed: string): {
  state: BingoState;
  events: BingoEvent[];
  winnerSeat: number;
} {
  let s = initial(seed);
  const events: BingoEvent[] = [];
  const record = (r: RunResult) => {
    events.push(...r.events);
    s = r.state;
  };
  const winnerSeat = 0;
  const winner = () => actor(s, winnerSeat);
  const row = s.cards[s.seats[winnerSeat]].slice(0, s.size);

  for (let guard = 0; guard < s.drawOrder.length + 5; guard++) {
    // mark any row numbers already called
    for (const n of row) {
      const called = s.drawOrder.slice(0, s.drawnCount).includes(n);
      const already = s.marks[s.seats[winnerSeat]].includes(n);
      if (called && !already) record(run(s, winner(), { type: 'MARK', number: n }));
    }
    const marked = new Set(s.marks[s.seats[winnerSeat]]);
    if (row.every((n) => marked.has(n))) break;
    // otherwise draw with whoever's turn it is
    record(run(s, actor(s, s.turnSeat), { type: 'DRAW' }));
  }

  const claim = run(s, winner(), { type: 'CLAIM_BINGO' });
  expect(claim.ok).toBe(true);
  events.push(...claim.events);
  s = claim.state;
  return { state: s, events, winnerSeat };
}

describe('bingo: win', () => {
  it('rejects a claim with no completed line', () => {
    const s = initial();
    expect(run(s, actor(s, 0), { type: 'CLAIM_BINGO' }).ok).toBe(false);
  });

  it('a completed line claim wins and finalizes the result', () => {
    const { state, winnerSeat } = winByTopRow('win-seed');
    expect(state.phase).toBe('COMPLETED');
    expect(state.winnerId).toBe(state.seats[winnerSeat]);

    const result = bingoGame.evaluateResult(state);
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe(state.seats[winnerSeat]);
    expect(result!.winningSeat).toBe(winnerSeat);

    // no commands accepted after completion
    expect(run(state, actor(state, state.turnSeat), { type: 'DRAW' }).ok).toBe(false);
  });

  it('evaluateResult is null before completion', () => {
    expect(bingoGame.evaluateResult(initial())).toBeNull();
  });
});

// ---------- hidden information ----------

describe('bingo: projection (hidden info)', () => {
  it('reveals only called numbers and never another player’s card or future draws', () => {
    let s = initial();
    s = run(s, actor(s, s.turnSeat), { type: 'DRAW' }).state;
    s = run(s, actor(s, s.turnSeat), { type: 'DRAW' }).state;

    const view = bingoGame.projectForPlayer({
      state: s,
      viewer: { userId: 'pa', seatIndex: 0 },
    });
    // own card visible
    expect(view.myCard).toEqual(s.cards['pa']);
    // called equals drawnCount and is the prefix of the hidden draw order
    expect(view.called).toHaveLength(s.drawnCount);
    expect(view.called).toEqual(s.drawOrder.slice(0, s.drawnCount));
    // view shape exposes no future numbers / opponent card layout
    expect(JSON.stringify(view)).not.toContain('drawOrder');
    const opp = view.players.find((p) => p.userId === 'pb')!;
    expect(opp).toBeDefined();
    expect(Object.keys(opp)).toEqual(['seat', 'userId', 'markedCount', 'completedLines']);

    // spectator sees no card
    const spec = bingoGame.projectForPlayer({
      state: s,
      viewer: { userId: 'ghost', seatIndex: null },
    });
    expect(spec.myCard).toBeNull();
  });
});

// ---------- replay & serialization ----------

describe('bingo: replay & serialization', () => {
  it('replaying the event log reproduces the final state hash and result', async () => {
    const { events, state } = winByTopRow('replay-bingo');
    let replay = initial('replay-bingo');
    for (const e of events) replay = bingoGame.evolve(replay, e);
    expect(await bingoGame.canonicalHash(replay)).toBe(await bingoGame.canonicalHash(state));
    expect(bingoGame.evaluateResult(replay)).toEqual(bingoGame.evaluateResult(state));
  });

  it('serialize → deserialize round-trips to the same hash', async () => {
    const { state } = winByTopRow('roundtrip-bingo');
    const revived = bingoGame.deserializeState(
      JSON.parse(JSON.stringify(bingoGame.serializeState(state))),
    );
    expect(await bingoGame.canonicalHash(revived)).toBe(await bingoGame.canonicalHash(state));
  });
});
