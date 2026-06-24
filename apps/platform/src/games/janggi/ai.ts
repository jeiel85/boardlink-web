// Janggi AI brain. Heuristic = material balance using conventional Janggi piece
// values (Chariot 13, Cannon 7, Horse 5, Elephant/Guard 3, Soldier 2; the
// General is scored 0 because its capture is already a terminal result).
// Move ordering puts captures first.

import type { GameBrain } from '../_shared/ai.js';
import { TERMINAL_SCORE } from '../_shared/ai.js';
import type { JanggiState, JanggiCommand } from './index.js';

const VALUE: Record<string, number> = { G: 0, R: 13, C: 7, H: 5, E: 3, S: 3, P: 2 };

export const janggiBrain: GameBrain = {
  seatToMove: (state) => (state as JanggiState).turnSeat,

  actorFor: (state, seat) => ({ userId: (state as JanggiState).seats[seat], seatIndex: seat }),

  evaluate: (state, seat) => {
    const s = state as JanggiState;
    const myColor = String(seat);
    let score = 0;
    for (const code of s.board) {
      if (code === '') continue;
      const v = VALUE[code[1]] ?? 0;
      score += code[0] === myColor ? v : -v;
    }
    return score;
  },

  scoreTerminal: (result, _state, seat) => {
    const r = result as { winnerSeat: number | null };
    if (r.winnerSeat === null) return 0;
    return r.winnerSeat === seat ? TERMINAL_SCORE : -TERMINAL_SCORE;
  },

  moves: (module, state, seat) => {
    const s = state as JanggiState;
    const actor = { userId: s.seats[seat], seatIndex: seat };
    const cmds = (module.enumerateCommands?.({ state, actor }) ?? []) as JanggiCommand[];
    return [...cmds].sort((a, b) => {
      const ca = s.board[a.to] !== '' ? 1 : 0;
      const cb = s.board[b.to] !== '' ? 1 : 0;
      return cb - ca;
    });
  },
};
