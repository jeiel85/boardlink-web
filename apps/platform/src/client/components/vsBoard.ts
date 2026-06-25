// Pure board-geometry helpers for the vs-computer UI. Extracted from VsComputer
// so the flip/index math (the bug-prone part of the renderer) is unit-testable
// without a browser. `display` coordinates are row/col as drawn top-left → the
// human's own side is always rendered at the bottom.

export type StrategyGameId = 'gomoku' | 'chess' | 'janggi';

export interface BoardGeometry {
  rows: number;
  cols: number;
}

export interface BoardView {
  size?: number; // gomoku
  myColor?: 'w' | 'b' | null; // chess
  mySeat?: number | null; // janggi / gomoku
}

export function geometry(gameId: StrategyGameId, view: BoardView): BoardGeometry {
  if (gameId === 'gomoku') {
    const size = view.size ?? 15;
    return { rows: size, cols: size };
  }
  if (gameId === 'chess') return { rows: 8, cols: 8 };
  return { rows: 10, cols: 9 }; // janggi
}

// Map a drawn cell (displayRow, displayCol) to the underlying board array index,
// flipping so the viewer's side sits at the bottom.
export function displayToBoard(
  gameId: StrategyGameId,
  dr: number,
  dc: number,
  view: BoardView,
): number {
  if (gameId === 'gomoku') {
    const size = view.size ?? 15;
    return dr * size + dc;
  }
  if (gameId === 'chess') {
    const humanWhite = view.myColor !== 'b';
    const by = humanWhite ? 7 - dr : dr;
    const bx = humanWhite ? dc : 7 - dc;
    return by * 8 + bx;
  }
  // janggi: 9 cols × 10 rows
  const humanBottom = view.mySeat !== 1;
  const by = humanBottom ? 9 - dr : dr;
  const bx = humanBottom ? dc : 8 - dc;
  return by * 9 + bx;
}
