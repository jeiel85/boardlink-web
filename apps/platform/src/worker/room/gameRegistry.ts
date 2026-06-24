import type { AnyGameModule } from '@boardlink/protocol';
import { counterGame } from './counterGame.js';
import { bubbleSiegeGame } from '../../games/bubble-siege/index.js';
import { bingoGame } from '../../games/bingo/index.js';
import { gomokuGame } from '../../games/gomoku/index.js';

const registry: Record<string, AnyGameModule> = {
  counter: counterGame,
  'bubble-siege': bubbleSiegeGame,
  bingo: bingoGame,
  gomoku: gomokuGame,
};

export function getGame(gameId: string): AnyGameModule | null {
  return registry[gameId] ?? null;
}

export function listGameIds(): string[] {
  return Object.keys(registry);
}
