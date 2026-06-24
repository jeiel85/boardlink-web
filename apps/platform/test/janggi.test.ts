import { describe, it, expect } from 'vitest';
import { janggiGame, type JanggiState, type JanggiCommand } from '../src/games/janggi/index.js';
import type { GamePlayer, GameActor } from '@boardlink/protocol';

const PLAYERS: GamePlayer[] = [
  { userId: 'pa', displayName: 'Cho', seatIndex: 0 },
  { userId: 'pb', displayName: 'Han', seatIndex: 1 },
];

const W = 9;
const idx = (x: number, y: number): number => y * W + x;

function initial(seed = 'janggi-seed'): JanggiState {
  return janggiGame.createInitialState({
    config: janggiGame.validateConfig(),
    players: PLAYERS,
    seed,
    startsAtServerMs: 0,
  });
}

// Build a sparse board. Both generals are required for legal-move filtering, so
// defaults are placed at the palace centres unless the caller supplies them.
function build(pieces: Record<number, string>, turnSeat: number): JanggiState {
  const values = Object.values(pieces);
  const board = new Array(W * 10).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  if (!values.includes('0G')) board[idx(4, 1)] = '0G';
  if (!values.includes('1G')) board[idx(4, 8)] = '1G';
  return {
    phase: 'IN_PROGRESS',
    board,
    seats: ['pa', 'pb'],
    turnSeat,
    moveCount: 0,
    lastMove: null,
    winnerId: null,
    winnerSeat: null,
    reason: null,
  };
}

function canMove(state: JanggiState, from: number, to: number): boolean {
  const actor: GameActor = { userId: state.seats[state.turnSeat], seatIndex: state.turnSeat };
  return janggiGame.validateCommand({
    state,
    actor,
    command: { type: 'MOVE', from, to },
    serverReceivedAtMs: 0,
  }).valid;
}

function doMove(state: JanggiState, from: number, to: number) {
  const actor: GameActor = { userId: state.seats[state.turnSeat], seatIndex: state.turnSeat };
  const command: JanggiCommand = { type: 'MOVE', from, to };
  const events = janggiGame.decide({ state, actor, command, serverReceivedAtMs: 0 });
  const next = events.reduce((s, e) => janggiGame.evolve(s, e), state);
  return { events, state: next };
}

// ---------- setup ----------

describe('janggi: setup', () => {
  it('lays out the standard position', () => {
    const s = initial();
    expect(s.board[idx(4, 1)]).toBe('0G');
    expect(s.board[idx(4, 8)]).toBe('1G');
    expect(s.board[idx(0, 0)]).toBe('0R');
    expect(s.board[idx(1, 2)]).toBe('0C');
    expect(s.board[idx(0, 3)]).toBe('0P');
    expect(s.board.filter((c) => c === '0P')).toHaveLength(5);
    expect([0, 1]).toContain(s.turnSeat);
  });
});

// ---------- general ----------

describe('janggi: general', () => {
  it('moves one step orthogonally and along palace diagonals, confined to the palace', () => {
    const s = build({ [idx(4, 1)]: '0G' }, 0);
    expect(canMove(s, idx(4, 1), idx(4, 2))).toBe(true); // orthogonal
    expect(canMove(s, idx(4, 1), idx(3, 0))).toBe(true); // palace diagonal
    expect(canMove(s, idx(4, 1), idx(5, 2))).toBe(true); // palace diagonal

    const edge = build({ [idx(3, 1)]: '0G' }, 0);
    expect(canMove(edge, idx(3, 1), idx(4, 1))).toBe(true); // stay in palace
    expect(canMove(edge, idx(3, 1), idx(2, 1))).toBe(false); // would leave palace
  });
});

// ---------- horse ----------

describe('janggi: horse (leg-block)', () => {
  it('moves like a knight but is blocked by an occupied leg', () => {
    const open = build({ [idx(4, 4)]: '0H' }, 0);
    expect(canMove(open, idx(4, 4), idx(5, 6))).toBe(true);
    expect(canMove(open, idx(4, 4), idx(3, 6))).toBe(true);

    const blocked = build({ [idx(4, 4)]: '0H', [idx(4, 5)]: '0P' }, 0);
    expect(canMove(blocked, idx(4, 4), idx(5, 6))).toBe(false);
    expect(canMove(blocked, idx(4, 4), idx(3, 6))).toBe(false);
  });
});

// ---------- elephant ----------

describe('janggi: elephant (path-block)', () => {
  it('moves 2-then-diagonal and is blocked along the path', () => {
    const open = build({ [idx(4, 3)]: '0E' }, 0);
    expect(canMove(open, idx(4, 3), idx(6, 6))).toBe(true);
    expect(canMove(open, idx(4, 3), idx(2, 6))).toBe(true);

    const blocked = build({ [idx(4, 3)]: '0E', [idx(4, 4)]: '0P' }, 0);
    expect(canMove(blocked, idx(4, 3), idx(6, 6))).toBe(false);
    expect(canMove(blocked, idx(4, 3), idx(2, 6))).toBe(false);
  });
});

// ---------- chariot ----------

describe('janggi: chariot', () => {
  it('slides orthogonally and along palace diagonals', () => {
    // own general parked off-centre so the palace centre is free to slide through
    const s = build({ [idx(3, 0)]: '0R', [idx(5, 1)]: '0G' }, 0);
    expect(canMove(s, idx(3, 0), idx(4, 1))).toBe(true); // onto palace centre
    expect(canMove(s, idx(3, 0), idx(5, 2))).toBe(true); // through centre to far corner
    expect(canMove(s, idx(3, 0), idx(0, 0))).toBe(true); // ordinary rank slide
  });
});

// ---------- cannon ----------

describe('janggi: cannon (screen rules)', () => {
  it('must jump exactly one non-cannon screen and cannot capture a cannon', () => {
    const withScreen = build({ [idx(0, 4)]: '0C', [idx(3, 4)]: '0P', [idx(6, 4)]: '1P' }, 0);
    expect(canMove(withScreen, idx(0, 4), idx(4, 4))).toBe(true); // land after screen
    expect(canMove(withScreen, idx(0, 4), idx(6, 4))).toBe(true); // capture enemy beyond
    expect(canMove(withScreen, idx(0, 4), idx(1, 4))).toBe(false); // before the screen

    const noScreen = build({ [idx(0, 4)]: '0C', [idx(6, 4)]: '1P' }, 0);
    expect(canMove(noScreen, idx(0, 4), idx(4, 4))).toBe(false); // nothing to jump

    const cannonScreen = build({ [idx(0, 4)]: '0C', [idx(3, 4)]: '1C' }, 0);
    expect(canMove(cannonScreen, idx(0, 4), idx(4, 4))).toBe(false); // can't jump a cannon

    const cannonTarget = build({ [idx(0, 4)]: '0C', [idx(3, 4)]: '0P', [idx(5, 4)]: '1C' }, 0);
    expect(canMove(cannonTarget, idx(0, 4), idx(4, 4))).toBe(true); // empty landing ok
    expect(canMove(cannonTarget, idx(0, 4), idx(5, 4))).toBe(false); // can't capture a cannon
  });
});

// ---------- soldier ----------

describe('janggi: soldier', () => {
  it('moves forward or sideways but never backward', () => {
    const s = build({ [idx(4, 5)]: '0P' }, 0);
    expect(canMove(s, idx(4, 5), idx(4, 6))).toBe(true); // forward (+y for seat 0)
    expect(canMove(s, idx(4, 5), idx(3, 5))).toBe(true); // sideways
    expect(canMove(s, idx(4, 5), idx(5, 5))).toBe(true); // sideways
    expect(canMove(s, idx(4, 5), idx(4, 4))).toBe(false); // backward forbidden
  });

  it('moves forward along a palace diagonal inside the enemy palace', () => {
    const s = build({ [idx(3, 7)]: '0P', [idx(5, 8)]: '1G' }, 0); // centre (4,8) free
    expect(canMove(s, idx(3, 7), idx(4, 8))).toBe(true);
  });
});

// ---------- checkmate ----------

describe('janggi: checkmate', () => {
  it('detects a chariot-ladder checkmate', () => {
    // Han general cornered at (5,9); Cho rook on rank 8 covers the 8th-rank
    // escapes; the mating rook swings to (8,9) to check along rank 9.
    const s = build(
      { [idx(5, 9)]: '1G', [idx(0, 8)]: '0R', [idx(8, 5)]: '0R', [idx(4, 1)]: '0G' },
      0,
    );
    // not already in check before the move
    expect(canMove(s, idx(8, 5), idx(8, 9))).toBe(true);
    const r = doMove(s, idx(8, 5), idx(8, 9));
    const ended = r.events.find((e) => e.type === 'GAME_ENDED') as
      | { winnerSeat: number; reason: string }
      | undefined;
    expect(ended).toBeDefined();
    expect(ended!.winnerSeat).toBe(0);
    expect(ended!.reason).toBe('checkmate');

    expect(r.state.phase).toBe('COMPLETED');
    expect(janggiGame.evaluateResult(r.state)).toEqual({
      winnerId: 'pa',
      winnerSeat: 0,
      reason: 'checkmate',
    });
  });

  it('evaluateResult is null before completion', () => {
    expect(janggiGame.evaluateResult(initial())).toBeNull();
  });
});

// ---------- replay & serialization ----------

describe('janggi: replay & serialization', () => {
  it('replaying the mating move reproduces the final hash and result', async () => {
    const setup = (): JanggiState =>
      build({ [idx(5, 9)]: '1G', [idx(0, 8)]: '0R', [idx(8, 5)]: '0R', [idx(4, 1)]: '0G' }, 0);
    const r = doMove(setup(), idx(8, 5), idx(8, 9));
    let replay = setup();
    for (const e of r.events) replay = janggiGame.evolve(replay, e);
    expect(await janggiGame.canonicalHash(replay)).toBe(await janggiGame.canonicalHash(r.state));
    expect(janggiGame.evaluateResult(replay)).toEqual(janggiGame.evaluateResult(r.state));
  });

  it('serialize → deserialize round-trips to the same hash', async () => {
    const s = initial();
    const moved = doMove(s, idx(0, 3), idx(0, 4)); // a soldier step
    const revived = janggiGame.deserializeState(
      JSON.parse(JSON.stringify(janggiGame.serializeState(moved.state))),
    );
    expect(await janggiGame.canonicalHash(revived)).toBe(
      await janggiGame.canonicalHash(moved.state),
    );
  });
});
