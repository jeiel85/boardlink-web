import { describe, it, expect } from 'vitest';
import { geometry, displayToBoard } from '../src/client/components/vsBoard.js';

describe('vsBoard geometry', () => {
  it('reports board dimensions per game', () => {
    expect(geometry('gomoku', { size: 15 })).toEqual({ rows: 15, cols: 15 });
    expect(geometry('gomoku', { size: 9 })).toEqual({ rows: 9, cols: 9 });
    expect(geometry('chess', {})).toEqual({ rows: 8, cols: 8 });
    expect(geometry('janggi', {})).toEqual({ rows: 10, cols: 9 });
  });
});

describe('vsBoard displayToBoard', () => {
  it('gomoku maps display row/col straight through (no flip)', () => {
    expect(displayToBoard('gomoku', 0, 0, { size: 9 })).toBe(0);
    expect(displayToBoard('gomoku', 1, 0, { size: 9 })).toBe(9);
    expect(displayToBoard('gomoku', 0, 1, { size: 9 })).toBe(1);
  });

  it('chess puts white at the bottom for a white human', () => {
    const v = { myColor: 'w' as const };
    // top-left display cell is a8 (index 56), bottom-left is a1 (0)
    expect(displayToBoard('chess', 0, 0, v)).toBe(56);
    expect(displayToBoard('chess', 7, 0, v)).toBe(0);
    expect(displayToBoard('chess', 7, 7, v)).toBe(7); // bottom-right = h1
  });

  it('chess flips so black sits at the bottom for a black human', () => {
    const v = { myColor: 'b' as const };
    // bottom row should be black's back rank (y=7); bottom-left = h8 (63)
    expect(displayToBoard('chess', 7, 0, v)).toBe(63);
    expect(displayToBoard('chess', 0, 0, v)).toBe(7); // top-left = h1
  });

  it('janggi puts seat 0 at the bottom by default', () => {
    const v = { mySeat: 0 };
    expect(displayToBoard('janggi', 9, 0, v)).toBe(0); // bottom-left = seat-0 home corner
    expect(displayToBoard('janggi', 0, 0, v)).toBe(81); // top-left
  });

  it('janggi flips for seat 1', () => {
    const v = { mySeat: 1 };
    expect(displayToBoard('janggi', 9, 0, v)).toBe(89); // bottom-left mirrors
    expect(displayToBoard('janggi', 0, 0, v)).toBe(8);
  });

  it('every display cell maps to a unique board index (chess, both orientations)', () => {
    for (const myColor of ['w', 'b'] as const) {
      const seen = new Set<number>();
      for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) seen.add(displayToBoard('chess', dr, dc, { myColor }));
      }
      expect(seen.size).toBe(64);
    }
  });

  it('every display cell maps to a unique board index (janggi, both orientations)', () => {
    for (const mySeat of [0, 1]) {
      const seen = new Set<number>();
      for (let dr = 0; dr < 10; dr++) {
        for (let dc = 0; dc < 9; dc++) seen.add(displayToBoard('janggi', dr, dc, { mySeat }));
      }
      expect(seen.size).toBe(90);
    }
  });
});
