import type { AnyGameModule } from '@boardlink/protocol';
import { counterGame } from './counterGame.js';
import { bubbleSiegeGame } from '../../games/bubble-siege/index.js';
import { bingoGame } from '../../games/bingo/index.js';
import { gomokuGame } from '../../games/gomoku/index.js';
import { chessGame } from '../../games/chess/index.js';
import { janggiGame } from '../../games/janggi/index.js';

const registry: Record<string, AnyGameModule> = {
  counter: counterGame,
  'bubble-siege': bubbleSiegeGame,
  bingo: bingoGame,
  gomoku: gomokuGame,
  chess: chessGame,
  janggi: janggiGame,
};

export function getGame(gameId: string): AnyGameModule | null {
  return registry[gameId] ?? null;
}

export function listGameIds(): string[] {
  return Object.keys(registry);
}
