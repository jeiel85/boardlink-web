// Shared, view-driven board renderer for the turn-based strategy games. Takes a
// projected player view (the same shape produced by each game module's
// projectForPlayer) plus a click handler, so it is reused by both the
// vs-computer screen and online matches. The board is flipped so the viewer's
// side is at the bottom.

import { displayToBoard, type StrategyGameId } from './vsBoard.js';

const CHESS_GLYPH: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
  P: '♟',
};
const JANGGI_GLYPH: Record<string, string> = {
  G: '宮',
  S: '士',
  H: '馬',
  E: '象',
  R: '車',
  C: '包',
  P: '卒',
};

export interface BoardViewLike {
  board: (number | string)[];
  size?: number;
  myColor?: 'w' | 'b' | null;
  mySeat?: number | null;
  lastMove?: { x: number; y: number } | { from: number; to: number } | null;
}

export function GameBoard({
  gameId,
  view,
  sel,
  targets,
  onCell,
}: {
  gameId: StrategyGameId;
  view: BoardViewLike;
  sel: number | null;
  targets: Set<number>;
  onCell: (boardIdx: number) => void;
}) {
  if (gameId === 'gomoku') {
    const size = view.size ?? 15;
    const last = view.lastMove as { x: number; y: number } | null | undefined;
    const lastIdx = last && 'x' in last ? last.y * size + last.x : -1;
    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = displayToBoard('gomoku', r, c, view);
        const val = view.board[idx] as number;
        cells.push(
          <button
            key={idx}
            onClick={() => onCell(idx)}
            style={{
              ...cell,
              background: '#caa66a',
              border: '1px solid #8a6d3b',
              boxShadow: idx === lastIdx ? 'inset 0 0 0 2px #ef4444' : undefined,
            }}
          >
            {val !== -1 && (
              <span
                style={{
                  ...stone,
                  background:
                    val === view.mySeat
                      ? 'radial-gradient(circle at 35% 30%, #fff, #cbd5e1)'
                      : 'radial-gradient(circle at 35% 30%, #555, #111)',
                }}
              />
            )}
          </button>,
        );
      }
    }
    return <div style={{ ...grid, gridTemplateColumns: `repeat(${size}, 1fr)` }}>{cells}</div>;
  }

  if (gameId === 'chess') {
    const last = view.lastMove as { from: number; to: number } | null | undefined;
    const cells = [];
    for (let dr = 0; dr < 8; dr++) {
      for (let dc = 0; dc < 8; dc++) {
        const idx = displayToBoard('chess', dr, dc, view);
        const code = view.board[idx] as string;
        const dark = (dr + dc) % 2 === 1;
        cells.push(
          <button
            key={idx}
            onClick={() => onCell(idx)}
            style={{
              ...cell,
              background: dark ? '#6b7280' : '#cbd5e1',
              boxShadow:
                idx === sel
                  ? 'inset 0 0 0 3px #6366f1'
                  : targets.has(idx)
                    ? 'inset 0 0 0 3px rgba(16,185,129,0.7)'
                    : last && idx === last.to
                      ? 'inset 0 0 0 2px #ef4444'
                      : undefined,
            }}
          >
            {code !== '' && (
              <span
                style={{
                  ...piece,
                  color: code === code.toUpperCase() ? '#f8fafc' : '#0f172a',
                  textShadow: '0 1px 1px rgba(0,0,0,0.4)',
                }}
              >
                {CHESS_GLYPH[code.toUpperCase()]}
              </span>
            )}
          </button>,
        );
      }
    }
    return <div style={{ ...grid, gridTemplateColumns: 'repeat(8, 1fr)' }}>{cells}</div>;
  }

  // janggi
  const last = view.lastMove as { from: number; to: number } | null | undefined;
  const cells = [];
  for (let dr = 0; dr < 10; dr++) {
    for (let dc = 0; dc < 9; dc++) {
      const idx = displayToBoard('janggi', dr, dc, view);
      const code = view.board[idx] as string;
      cells.push(
        <button
          key={idx}
          onClick={() => onCell(idx)}
          style={{
            ...cell,
            background: '#d8b46a',
            border: '1px solid #9a7b40',
            boxShadow:
              idx === sel
                ? 'inset 0 0 0 3px #6366f1'
                : targets.has(idx)
                  ? 'inset 0 0 0 3px rgba(16,185,129,0.8)'
                  : last && idx === last.to
                    ? 'inset 0 0 0 2px #ef4444'
                    : undefined,
          }}
        >
          {code !== '' && (
            <span style={{ ...janggiPiece, color: code[0] === '0' ? '#15803d' : '#b91c1c' }}>
              {JANGGI_GLYPH[code[1]]}
            </span>
          )}
        </button>,
      );
    }
  }
  return <div style={{ ...grid, gridTemplateColumns: 'repeat(9, 1fr)' }}>{cells}</div>;
}

const grid = {
  display: 'grid',
  width: '100%',
  maxWidth: 360,
  margin: '0 auto',
  gap: 0,
  borderRadius: '0.5rem',
  overflow: 'hidden',
} as const;
const cell = {
  aspectRatio: '1 / 1',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative' as const,
};
const stone = {
  width: '78%',
  height: '78%',
  borderRadius: '50%',
  display: 'block',
  boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
};
const piece = { fontSize: 'min(6vw, 28px)', lineHeight: 1, userSelect: 'none' as const };
const janggiPiece = {
  fontSize: 'min(5vw, 22px)',
  fontWeight: 800,
  lineHeight: 1,
  userSelect: 'none' as const,
};
