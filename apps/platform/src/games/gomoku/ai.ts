// Gomoku AI brain. Heuristic = windowed line potential (reward your own lines,
// penalise the opponent's, which makes the search both build threats and block
// them). Candidate moves are narrowed to cells near existing stones to keep the
// branching factor tractable on a large board.

import type { GameBrain } from '../_shared/ai.js';
import { TERMINAL_SCORE } from '../_shared/ai.js';
import type { GomokuState, GomokuCommand } from './index.js';

const EMPTY = -1;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

// Score for n stones (no opponent) inside a winning-length window.
const WINDOW = [0, 1, 12, 120, 1200, 12000];

function windowScore(n: number): number {
  return WINDOW[Math.min(n, WINDOW.length - 1)];
}

export const gomokuBrain: GameBrain = {
  seatToMove: (state) => (state as GomokuState).turnSeat,

  actorFor: (state, seat) => ({ userId: (state as GomokuState).seats[seat], seatIndex: seat }),

  evaluate: (state, seat) => {
    const s = state as GomokuState;
    const { board, size, winLength } = s;
    const opp = seat === 0 ? 1 : 0;
    let score = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (const [dx, dy] of DIRS) {
          const ex = x + dx * (winLength - 1);
          const ey = y + dy * (winLength - 1);
          if (ex < 0 || ex >= size || ey < 0 || ey >= size) continue;
          let me = 0;
          let other = 0;
          for (let k = 0; k < winLength; k++) {
            const c = board[(y + dy * k) * size + (x + dx * k)];
            if (c === seat) me++;
            else if (c === opp) other++;
          }
          if (other === 0) score += windowScore(me);
          if (me === 0) score -= windowScore(other);
        }
      }
    }
    return score;
  },

  scoreTerminal: (result, _state, seat) => {
    const r = result as { winningSeat: number | null; isDraw: boolean };
    if (r.isDraw || r.winningSeat === null) return 0;
    return r.winningSeat === seat ? TERMINAL_SCORE : -TERMINAL_SCORE;
  },

  moves: (_module, state) => {
    const s = state as GomokuState;
    const { board, size } = s;
    const occupied = board.some((c) => c !== EMPTY);
    if (!occupied) {
      const mid = Math.floor(size / 2);
      return [{ type: 'PLACE_STONE', x: mid, y: mid } satisfies GomokuCommand];
    }
    const candidates = new Set<number>();
    for (let i = 0; i < board.length; i++) {
      if (board[i] === EMPTY) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny * size + nx] === EMPTY) {
            candidates.add(ny * size + nx);
          }
        }
      }
    }
    return [...candidates].map(
      (i) =>
        ({ type: 'PLACE_STONE', x: i % size, y: Math.floor(i / size) }) satisfies GomokuCommand,
    );
  },
};
