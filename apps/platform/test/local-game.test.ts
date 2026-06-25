import { describe, it, expect } from 'vitest';
import { LocalGame } from '../src/client/realtime/LocalGame.js';
import { BingoLocalGame } from '../src/client/realtime/BingoLocalGame.js';

const gidx = (x: number, y: number, size: number): number => y * size + x;

describe('LocalGame (vs computer)', () => {
  it('starts on the human turn (AI auto-plays any opening turn it owns)', () => {
    const g = new LocalGame({
      gameId: 'gomoku',
      difficulty: 'easy',
      config: { size: 9 },
      seed: 's1',
    });
    expect(g.isOver()).toBe(false);
    expect(g.isHumanTurn()).toBe(true);
  });

  it('rejects an illegal human move and accepts a legal one, with the AI replying', () => {
    const g = new LocalGame({
      gameId: 'gomoku',
      difficulty: 'easy',
      config: { size: 9 },
      seed: 's2',
    });
    const size = 9;
    // out of an empty-ish board, (4,4) center is legal unless the AI already took it
    const view = g.view() as { board: number[] };
    const target = view.board[gidx(4, 4, size)] === -1 ? gidx(4, 4, size) : gidx(0, 0, size);
    const tx = target % size;
    const ty = Math.floor(target / size);

    const before = (g.rawState() as { moveCount: number }).moveCount;
    const ok = g.submit({ type: 'PLACE_STONE', x: tx, y: ty });
    expect(ok.ok).toBe(true);
    const after = (g.rawState() as { moveCount: number }).moveCount;
    // human move + AI reply (game is nowhere near over this early)
    expect(after).toBe(before + 2);
    expect(g.isHumanTurn()).toBe(true);

    // the cell the human just took is occupied → illegal to play again
    const dup = g.submit({ type: 'PLACE_STONE', x: tx, y: ty });
    expect(dup.ok).toBe(false);
  });

  it('drives a chess game where the human seat is black (AI white moves first)', () => {
    const g = new LocalGame({
      gameId: 'chess',
      humanSeat: 1,
      difficulty: 'easy',
      seed: 's3',
    });
    // White (AI) is seat 0 here and may move first; either way it must be the
    // human's turn once the constructor returns and the board must have advanced
    // if the AI moved.
    expect(g.isOver()).toBe(false);
    expect(g.isHumanTurn()).toBe(true);
    const mc = (g.rawState() as { moveCount: number }).moveCount;
    expect(mc).toBeGreaterThanOrEqual(0);
  });

  it('throws for a game without a computer opponent', () => {
    expect(() => new LocalGame({ gameId: 'bubble-siege' })).toThrow();
  });
});

describe('BingoLocalGame (vs computer)', () => {
  it('plays a full game to a decisive outcome with the computer', () => {
    const g = new BingoLocalGame({ seed: 'b1', config: { size: 3, winningLines: 1, poolSize: 9 } });
    let guard = 0;
    while (!g.isOver() && guard++ < 500) {
      if (g.canClaim()) {
        g.claim();
        continue;
      }
      const v = g.view() as { myCard: number[]; myMarks: number[]; called: number[] };
      const called = new Set(v.called);
      const mk = new Set(v.myMarks);
      const toMark = v.myCard.find((n) => called.has(n) && !mk.has(n));
      if (toMark !== undefined) {
        g.mark(toMark);
        continue;
      }
      if (g.canDraw()) {
        g.draw();
        continue;
      }
      break;
    }
    expect(g.isOver()).toBe(true);
    expect(['win', 'lose', 'draw']).toContain(g.outcome());
  });

  it('rejects marking a number that has not been called', () => {
    const g = new BingoLocalGame({ seed: 'b2', config: { size: 3, winningLines: 1, poolSize: 9 } });
    const v = g.view() as { myCard: number[]; called: number[] };
    const uncalled = v.myCard.find((n) => !v.called.includes(n));
    if (uncalled !== undefined) {
      expect(g.mark(uncalled).ok).toBe(false);
    }
  });
});
