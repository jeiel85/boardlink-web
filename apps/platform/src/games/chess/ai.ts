// Chess AI brain. Heuristic = material balance from the AI's perspective.
// Move ordering puts captures first to help alpha-beta prune. Strong enough to
// take hanging material and find short tactics / mates at modest depth.

import type { GameBrain } from '../_shared/ai.js';
import { TERMINAL_SCORE } from '../_shared/ai.js';
import type { ChessState, ChessCommand } from './index.js';

const VALUE: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

export const chessBrain: GameBrain = {
  seatToMove: (state) => {
    const s = state as ChessState;
    return s.turn === 'w' ? s.whiteSeat : s.whiteSeat ^ 1;
  },

  actorFor: (state, seat) => ({ userId: (state as ChessState).seats[seat], seatIndex: seat }),

  evaluate: (state, seat) => {
    const s = state as ChessState;
    const myColor = seat === s.whiteSeat ? 'w' : 'b';
    let score = 0;
    for (const code of s.board) {
      if (code === '') continue;
      const v = VALUE[code.toUpperCase()] ?? 0;
      const color = code === code.toUpperCase() ? 'w' : 'b';
      score += color === myColor ? v : -v;
    }
    return score;
  },

  scoreTerminal: (result, state, seat) => {
    const r = result as { result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' };
    if (r.result === 'DRAW') return 0;
    const myWin = seat === (state as ChessState).whiteSeat ? 'WHITE_WIN' : 'BLACK_WIN';
    return r.result === myWin ? TERMINAL_SCORE : -TERMINAL_SCORE;
  },

  moves: (module, state, seat) => {
    const s = state as ChessState;
    const actor = { userId: s.seats[seat], seatIndex: seat };
    const cmds = (module.enumerateCommands?.({ state, actor }) ?? []) as ChessCommand[];
    // captures first
    return [...cmds].sort((a, b) => {
      const ca = s.board[a.to] !== '' ? 1 : 0;
      const cb = s.board[b.to] !== '' ? 1 : 0;
      return cb - ca;
    });
  },
};
