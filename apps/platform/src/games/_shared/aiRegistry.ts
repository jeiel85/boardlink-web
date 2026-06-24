// Maps a gameId to its AI controller (vs-computer mode). Strategy games use the
// generic minimax engine with a per-game brain; Bingo uses its greedy controller.
// Games without an entry (counter, bubble-siege) have no computer opponent here.

import type { AiController } from './ai.js';
import { minimaxController } from './ai.js';
import { gomokuGame } from '../gomoku/index.js';
import { gomokuBrain } from '../gomoku/ai.js';
import { chessGame } from '../chess/index.js';
import { chessBrain } from '../chess/ai.js';
import { janggiGame } from '../janggi/index.js';
import { janggiBrain } from '../janggi/ai.js';
import { bingoController } from '../bingo/ai.js';

const registry: Record<string, AiController> = {
  gomoku: minimaxController(gomokuGame, gomokuBrain),
  chess: minimaxController(chessGame, chessBrain),
  janggi: minimaxController(janggiGame, janggiBrain),
  bingo: bingoController,
};

export function getAi(gameId: string): AiController | null {
  return registry[gameId] ?? null;
}

export function hasAi(gameId: string): boolean {
  return gameId in registry;
}
