import { describe, it, expect } from 'vitest';
import { getAi } from '../src/games/_shared/aiRegistry.js';
import { rngFromString } from '../src/games/_shared/rng.js';
import { gomokuGame, type GomokuState } from '../src/games/gomoku/index.js';
import { chessGame, type ChessState } from '../src/games/chess/index.js';
import { janggiGame, type JanggiState } from '../src/games/janggi/index.js';
import { bingoGame, type BingoState } from '../src/games/bingo/index.js';

const TWO = [
  { userId: 'a', displayName: 'A', seatIndex: 0 },
  { userId: 'b', displayName: 'B', seatIndex: 1 },
];
const rng = () => rngFromString('ai-test-seed');

// ---------- gomoku ----------

function gomokuState(
  stones: { x: number; y: number; seat: number }[],
  turnSeat: number,
  size = 9,
): GomokuState {
  const base = gomokuGame.createInitialState({
    config: gomokuGame.validateConfig({ size, winLength: 5 }),
    players: TWO,
    seed: 'g',
    startsAtServerMs: 0,
  });
  const board = base.board.slice();
  for (const s of stones) board[s.y * size + s.x] = s.seat;
  return { ...base, board, turnSeat, moveCount: stones.length };
}

describe('gomoku AI', () => {
  const ai = getAi('gomoku')!;

  it('completes its own four-in-a-row to win', () => {
    const s = gomokuState(
      [
        { x: 0, y: 0, seat: 0 },
        { x: 1, y: 0, seat: 0 },
        { x: 2, y: 0, seat: 0 },
        { x: 3, y: 0, seat: 0 },
      ],
      0,
    );
    const cmd = ai.chooseCommand({ state: s, seat: 0, difficulty: 'medium', rng: rng() }) as {
      x: number;
      y: number;
    };
    expect(cmd).toMatchObject({ x: 4, y: 0 });
  });

  it("blocks the opponent's immediate winning move", () => {
    const s = gomokuState(
      [
        { x: 0, y: 0, seat: 1 },
        { x: 1, y: 0, seat: 1 },
        { x: 2, y: 0, seat: 1 },
        { x: 3, y: 0, seat: 1 },
      ],
      0,
    );
    const cmd = ai.chooseCommand({ state: s, seat: 0, difficulty: 'medium', rng: rng() }) as {
      x: number;
      y: number;
    };
    expect(cmd).toMatchObject({ x: 4, y: 0 });
  });
});

// ---------- chess ----------

const cidx = (x: number, y: number): number => y * 8 + x;

function chessState(pieces: Record<number, string>, turn: 'w' | 'b'): ChessState {
  const base = chessGame.createInitialState({
    config: chessGame.validateConfig({ whiteSeatFromSeed: false }),
    players: TWO,
    seed: 'c',
    startsAtServerMs: 0,
  });
  const board = new Array(64).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  return {
    ...base,
    board,
    turn,
    castling: { wK: false, wQ: false, bK: false, bQ: false },
    enPassant: null,
  };
}

function applyChess(state: ChessState, cmd: unknown): ChessState {
  const seat = state.turn === 'w' ? state.whiteSeat : state.whiteSeat ^ 1;
  const actor = { userId: state.seats[seat], seatIndex: seat };
  const events = chessGame.decide({ state, actor, command: cmd, serverReceivedAtMs: 0 });
  return events.reduce((s, e) => chessGame.evolve(s, e), state);
}

describe('chess AI', () => {
  const ai = getAi('chess')!;

  it('captures a hanging queen', () => {
    // White Rd1 can take the black queen on d8 (no defenders).
    const s = chessState(
      { [cidx(4, 0)]: 'K', [cidx(3, 0)]: 'R', [cidx(3, 7)]: 'q', [cidx(4, 7)]: 'k' },
      'w',
    );
    const cmd = ai.chooseCommand({ state: s, seat: 0, difficulty: 'medium', rng: rng() }) as {
      to: number;
    };
    expect(cmd.to).toBe(cidx(3, 7));
  });

  it('plays a mate in one', () => {
    // White Ra1 → a8 is back-rank mate (black king h8 boxed in by g7/h7 pawns).
    const s = chessState(
      {
        [cidx(0, 0)]: 'R',
        [cidx(4, 0)]: 'K',
        [cidx(7, 7)]: 'k',
        [cidx(6, 6)]: 'p',
        [cidx(7, 6)]: 'p',
      },
      'w',
    );
    const cmd = ai.chooseCommand({ state: s, seat: 0, difficulty: 'medium', rng: rng() });
    const after = applyChess(s, cmd);
    expect(after.phase).toBe('COMPLETED');
    expect(chessGame.evaluateResult(after)?.result).toBe('WHITE_WIN');
  });
});

// ---------- janggi ----------

const jidx = (x: number, y: number): number => y * 9 + x;

function janggiState(pieces: Record<number, string>, turnSeat: number): JanggiState {
  const board = new Array(90).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  return {
    phase: 'IN_PROGRESS',
    board,
    seats: ['a', 'b'],
    turnSeat,
    moveCount: 0,
    lastMove: null,
    winnerId: null,
    winnerSeat: null,
    reason: null,
  };
}

describe('janggi AI', () => {
  const ai = getAi('janggi')!;

  it('plays a chariot-ladder mate in one', () => {
    const s = janggiState(
      { [jidx(5, 9)]: '1G', [jidx(0, 8)]: '0R', [jidx(8, 5)]: '0R', [jidx(4, 1)]: '0G' },
      0,
    );
    const cmd = ai.chooseCommand({ state: s, seat: 0, difficulty: 'medium', rng: rng() });
    const actor = { userId: 'a', seatIndex: 0 };
    const events = janggiGame.decide({ state: s, actor, command: cmd, serverReceivedAtMs: 0 });
    const after = events.reduce((st, e) => janggiGame.evolve(st, e), s);
    expect(janggiGame.evaluateResult(after)?.winnerSeat).toBe(0);
  });
});

// ---------- bingo ----------

describe('bingo auto-opponent', () => {
  const ai = getAi('bingo')!;

  it('two bots play a small game to completion with only legal commands', () => {
    let state = bingoGame.createInitialState({
      config: bingoGame.validateConfig({ size: 3, winningLines: 1, poolSize: 9 }),
      players: TWO,
      seed: 'bingo-bots',
      startsAtServerMs: 0,
    }) as BingoState;

    let steps = 0;
    while (bingoGame.evaluateResult(state) === null && steps++ < 500) {
      let progressed = false;
      for (const seat of [0, 1]) {
        if (bingoGame.evaluateResult(state) !== null) break;
        const cmd = ai.chooseCommand({ state, seat, difficulty: 'medium', rng: rng() });
        if (!cmd) continue;
        const actor = { userId: state.seats[seat], seatIndex: seat };
        const v = bingoGame.validateCommand({ state, actor, command: cmd, serverReceivedAtMs: 0 });
        expect(v.valid).toBe(true); // controller only emits legal commands
        const events = bingoGame.decide({ state, actor, command: cmd, serverReceivedAtMs: 0 });
        state = events.reduce((s, e) => bingoGame.evolve(s, e), state) as BingoState;
        progressed = true;
      }
      if (!progressed) break;
    }

    expect(state.phase).toBe('COMPLETED');
    expect(state.winnerId).not.toBeNull();
  });
});
