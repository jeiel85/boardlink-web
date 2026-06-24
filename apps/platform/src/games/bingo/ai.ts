// Bingo auto-opponent. Bingo is a luck game, so there is no search — the bot
// just plays greedily through the game's own legal commands: claim a win the
// moment it is available, otherwise mark any called number on its card, and draw
// when it is its turn. Difficulty is irrelevant and ignored.

import type { AiController } from '../_shared/ai.js';
import { bingoGame } from './index.js';
import type { BingoState, BingoCommand } from './index.js';

export const bingoController: AiController = {
  seatToMove: (state) => (state as BingoState).turnSeat,

  chooseCommand: ({ state, seat }) => {
    const s = state as BingoState;
    const actor = { userId: s.seats[seat], seatIndex: seat };
    const cmds = (bingoGame.enumerateCommands?.({ state: s, actor }) ?? []) as BingoCommand[];
    return (
      cmds.find((c) => c.type === 'CLAIM_BINGO') ??
      cmds.find((c) => c.type === 'MARK') ??
      cmds.find((c) => c.type === 'DRAW') ??
      null
    );
  },
};
