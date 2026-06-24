import { describe, it, expect } from 'vitest';
import {
  chessGame,
  type ChessState,
  type ChessCommand,
  type ChessEvent,
} from '../src/games/chess/index.js';
import type { GamePlayer, GameActor } from '@boardlink/protocol';

const PLAYERS: GamePlayer[] = [
  { userId: 'pa', displayName: 'Alice', seatIndex: 0 },
  { userId: 'pb', displayName: 'Bob', seatIndex: 1 },
];

const idx = (x: number, y: number): number => y * 8 + x;

// White = seat 0, deterministic, for readable tests.
function initial(): ChessState {
  return chessGame.createInitialState({
    config: chessGame.validateConfig({ whiteSeatFromSeed: false }),
    players: PLAYERS,
    seed: 'chess-seed',
    startsAtServerMs: 0,
  });
}

function emptyState(
  pieces: Record<number, string>,
  turn: 'w' | 'b',
  overrides: Partial<ChessState> = {},
): ChessState {
  const base = initial();
  const board = new Array(64).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  return {
    ...base,
    board,
    turn,
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    enPassant: null,
    ...overrides,
  };
}

interface RunResult {
  ok: boolean;
  reason?: string;
  state: ChessState;
  events: readonly ChessEvent[];
}

function move(
  state: ChessState,
  from: number,
  to: number,
  promotion?: 'Q' | 'R' | 'B' | 'N',
): RunResult {
  const seat = state.turn === 'w' ? state.whiteSeat : state.whiteSeat ^ 1;
  const actor: GameActor = { userId: state.seats[seat], seatIndex: seat };
  const command: ChessCommand = { type: 'MOVE', from, to, ...(promotion ? { promotion } : {}) };
  const v = chessGame.validateCommand({ state, actor, command, serverReceivedAtMs: 0 });
  if (!v.valid) return { ok: false, reason: v.reason, state, events: [] };
  const events = chessGame.decide({ state, actor, command, serverReceivedAtMs: 0 });
  const next = events.reduce((s, e) => chessGame.evolve(s, e), state);
  return { ok: true, state: next, events };
}

// ---------- config / setup ----------

describe('chess: setup', () => {
  it('config controls seed-derived white seat', () => {
    expect(chessGame.validateConfig({}).whiteSeatFromSeed).toBe(true);
    expect(chessGame.validateConfig({ whiteSeatFromSeed: false }).whiteSeatFromSeed).toBe(false);
    expect(initial().whiteSeat).toBe(0);
  });

  it('lays out the standard starting position', () => {
    const s = initial();
    expect(s.board[idx(4, 0)]).toBe('K');
    expect(s.board[idx(3, 0)]).toBe('Q');
    expect(s.board[idx(4, 7)]).toBe('k');
    expect(s.board.filter((c) => c === 'P')).toHaveLength(8);
    expect(s.board.filter((c) => c === 'p')).toHaveLength(8);
    expect(s.turn).toBe('w');
  });
});

// ---------- move legality ----------

describe('chess: move legality', () => {
  it('allows a pawn double-step and a knight move, rejects illegal ones', () => {
    const s = initial();
    expect(move(s, idx(4, 1), idx(4, 3)).ok).toBe(true); // e2-e4
    expect(move(s, idx(1, 0), idx(2, 2)).ok).toBe(true); // Nb1-c3
    expect(move(s, idx(4, 1), idx(4, 4)).ok).toBe(false); // e2-e5 (3 squares)
    expect(move(s, idx(4, 1), idx(4, 1)).ok).toBe(false); // no move
  });

  it('rejects moving on the opponent’s turn', () => {
    const s = initial();
    const blackActor: GameActor = { userId: s.seats[1], seatIndex: 1 };
    const v = chessGame.validateCommand({
      state: s,
      actor: blackActor,
      command: { type: 'MOVE', from: idx(4, 6), to: idx(4, 4) },
      serverReceivedAtMs: 0,
    });
    expect(v.valid).toBe(false);
  });

  it('forbids a move that leaves your own king in check (pin)', () => {
    // White king e1, white bishop e2 pinned by black rook e8; bishop cannot leave the file.
    const s = emptyState(
      { [idx(4, 0)]: 'K', [idx(4, 1)]: 'B', [idx(4, 7)]: 'r', [idx(0, 7)]: 'k' },
      'w',
    );
    expect(move(s, idx(4, 1), idx(5, 2)).ok).toBe(false); // Be2 off the e-file → exposes king
    expect(move(s, idx(4, 0), idx(3, 0)).ok).toBe(true); // king may step aside to d1
  });
});

// ---------- checkmate ----------

describe('chess: checkmate', () => {
  it("detects Fool's mate (fastest checkmate)", () => {
    let s = initial();
    s = move(s, idx(5, 1), idx(5, 2)).state; // 1. f3
    s = move(s, idx(4, 6), idx(4, 4)).state; // 1... e5
    s = move(s, idx(6, 1), idx(6, 3)).state; // 2. g4
    const mate = move(s, idx(3, 7), idx(7, 3)); // 2... Qh4#
    expect(mate.ok).toBe(true);
    const ended = mate.events.find((e) => e.type === 'GAME_ENDED') as
      | { result: string; reason: string }
      | undefined;
    expect(ended).toBeDefined();
    expect(ended!.result).toBe('BLACK_WIN');
    expect(ended!.reason).toBe('checkmate');

    const result = chessGame.evaluateResult(mate.state);
    expect(result).toEqual({
      winnerId: mate.state.seats[1],
      result: 'BLACK_WIN',
      reason: 'checkmate',
    });
    expect(mate.state.phase).toBe('COMPLETED');
  });
});

// ---------- stalemate ----------

describe('chess: stalemate', () => {
  it('detects stalemate as a draw', () => {
    // Black king h8 only. White Kf7, Qg3 → Qg6 stalemates (king not in check, no moves).
    const s = emptyState({ [idx(7, 7)]: 'k', [idx(5, 6)]: 'K', [idx(6, 2)]: 'Q' }, 'w');
    const r = move(s, idx(6, 2), idx(6, 5)); // Qg6
    expect(r.ok).toBe(true);
    const ended = r.events.find((e) => e.type === 'GAME_ENDED') as
      | { result: string; reason: string }
      | undefined;
    expect(ended).toBeDefined();
    expect(ended!.result).toBe('DRAW');
    expect(ended!.reason).toBe('stalemate');
    expect(chessGame.evaluateResult(r.state)?.winnerId).toBeNull();
  });
});

// ---------- special moves ----------

describe('chess: special moves', () => {
  it('captures en passant', () => {
    const s = emptyState(
      { [idx(4, 4)]: 'P', [idx(3, 6)]: 'p', [idx(4, 0)]: 'K', [idx(4, 7)]: 'k' },
      'b',
    );
    const dbl = move(s, idx(3, 6), idx(3, 4)); // ...d5
    expect(dbl.ok).toBe(true);
    expect(dbl.state.enPassant).toBe(idx(3, 5));
    const ep = move(dbl.state, idx(4, 4), idx(3, 5)); // exd6 e.p.
    expect(ep.ok).toBe(true);
    expect(ep.events.some((e) => e.type === 'MOVE_MADE' && e.isEnPassant)).toBe(true);
    expect(ep.state.board[idx(3, 5)]).toBe('P');
    expect(ep.state.board[idx(4, 4)]).toBe('');
    expect(ep.state.board[idx(3, 4)]).toBe(''); // captured pawn removed
  });

  it('castles kingside', () => {
    const s = emptyState({ [idx(4, 0)]: 'K', [idx(7, 0)]: 'R', [idx(4, 7)]: 'k' }, 'w', {
      castling: { wK: true, wQ: false, bK: false, bQ: false },
    });
    const r = move(s, idx(4, 0), idx(6, 0)); // O-O
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.type === 'MOVE_MADE' && e.castle === 'K')).toBe(true);
    expect(r.state.board[idx(6, 0)]).toBe('K');
    expect(r.state.board[idx(5, 0)]).toBe('R');
    expect(r.state.board[idx(7, 0)]).toBe('');
  });

  it('promotes a pawn', () => {
    const s = emptyState({ [idx(4, 6)]: 'P', [idx(4, 0)]: 'K', [idx(0, 7)]: 'k' }, 'w');
    const r = move(s, idx(4, 6), idx(4, 7), 'Q');
    expect(r.ok).toBe(true);
    expect(r.state.board[idx(4, 7)]).toBe('Q');
  });
});

// ---------- replay & serialization ----------

describe('chess: replay & serialization', () => {
  function foolsMate(): { state: ChessState; events: ChessEvent[] } {
    let s = initial();
    const events: ChessEvent[] = [];
    const step = (from: number, to: number) => {
      const r = move(s, from, to);
      events.push(...r.events);
      s = r.state;
    };
    step(idx(5, 1), idx(5, 2));
    step(idx(4, 6), idx(4, 4));
    step(idx(6, 1), idx(6, 3));
    step(idx(3, 7), idx(7, 3));
    return { state: s, events };
  }

  it('replaying the event log reproduces the final hash and result', async () => {
    const { state, events } = foolsMate();
    let replay = initial();
    for (const e of events) replay = chessGame.evolve(replay, e);
    expect(await chessGame.canonicalHash(replay)).toBe(await chessGame.canonicalHash(state));
    expect(chessGame.evaluateResult(replay)).toEqual(chessGame.evaluateResult(state));
  });

  it('serialize → deserialize round-trips to the same hash', async () => {
    const { state } = foolsMate();
    const revived = chessGame.deserializeState(
      JSON.parse(JSON.stringify(chessGame.serializeState(state))),
    );
    expect(await chessGame.canonicalHash(revived)).toBe(await chessGame.canonicalHash(state));
  });
});
