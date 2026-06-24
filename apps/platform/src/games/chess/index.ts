// Chess — goal-10 game module.
// 2 players, turn-based, no hidden information. Full standard movement: pawn
// (incl. double-step, en passant, promotion), knight, bishop, rook, queen, king
// (incl. castling), with legal-move filtering (cannot leave your own king in
// check), checkmate and stalemate detection.
//
// Scope note: threefold-repetition, the fifty-move rule, and insufficient-material
// draws are intentionally NOT implemented in v1 (they need move-history tracking
// and matter little for casual play). Stalemate IS handled.
//
// Pure TypeScript; no Cloudflare, React, or Node.js imports. Deterministic: the
// white seat is derived from the match seed; no Date.now / Math.random.

import type {
  GameModule,
  GameMetadata,
  CommandValidation,
  GameActor,
  GameViewer,
  GamePlayer,
} from '@boardlink/protocol';
import { computeStateHash } from '@boardlink/protocol';
import { seedFromString } from '../_shared/rng.js';

// ---------- board helpers ----------
// Board is a 64-length array of FEN-ish codes: '' empty, uppercase = white
// (PNBRQK), lowercase = black (pnbrqk). Index = y*8 + x, y=0 is white's back rank.

type Color = 'w' | 'b';

const idx = (x: number, y: number): number => y * 8 + x;
const fileOf = (i: number): number => i % 8;
const rankOf = (i: number): number => Math.floor(i / 8);
const inBounds = (x: number, y: number): boolean => x >= 0 && x < 8 && y >= 0 && y < 8;

function colorOf(code: string): Color | null {
  if (code === '') return null;
  return code === code.toUpperCase() ? 'w' : 'b';
}

function withColor(piece: string, color: Color): string {
  return color === 'w' ? piece.toUpperCase() : piece.toLowerCase();
}

const KNIGHT_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const ROOK_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BISHOP_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

// ---------- domain types ----------

export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

export interface ChessState {
  phase: 'IN_PROGRESS' | 'COMPLETED';
  board: string[];
  seats: string[];
  whiteSeat: number;
  turn: Color;
  castling: CastlingRights;
  enPassant: number | null; // square index a pawn may capture onto this turn
  moveCount: number;
  lastMove: { from: number; to: number } | null;
  winnerId: string | null;
  result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | null;
  resultReason: string | null;
}

export interface ChessConfig {
  whiteSeatFromSeed: boolean;
}

interface Move {
  from: number;
  to: number;
  promotion: 'Q' | 'R' | 'B' | 'N' | null;
  isEnPassant: boolean;
  castle: 'K' | 'Q' | null;
}

// ---------- commands ----------

export interface MoveCommand {
  type: 'MOVE';
  from: number;
  to: number;
  promotion?: 'Q' | 'R' | 'B' | 'N';
}
export type ChessCommand = MoveCommand;

// ---------- events ----------

export interface MoveMadeEvent {
  type: 'MOVE_MADE';
  from: number;
  to: number;
  promotion: 'Q' | 'R' | 'B' | 'N' | null;
  isEnPassant: boolean;
  castle: 'K' | 'Q' | null;
}
export interface GameEndedEvent {
  type: 'GAME_ENDED';
  result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW';
  reason: string;
}
export type ChessEvent = MoveMadeEvent | GameEndedEvent;

// ---------- views & result ----------

export interface ChessView {
  phase: ChessState['phase'];
  board: string[];
  myColor: Color | null;
  turn: Color;
  isMyTurn: boolean;
  inCheck: boolean;
  castling: CastlingRights;
  enPassant: number | null;
  lastMove: { from: number; to: number } | null;
  winnerId: string | null;
  result: ChessState['result'];
  resultReason: string | null;
}

export interface ChessResult {
  winnerId: string | null;
  result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW';
  reason: string;
}

// ---------- initial position ----------

function startingBoard(): string[] {
  const b = new Array(64).fill('');
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let x = 0; x < 8; x++) {
    b[idx(x, 0)] = back[x]; // white back rank
    b[idx(x, 1)] = 'P'; // white pawns
    b[idx(x, 6)] = 'p'; // black pawns
    b[idx(x, 7)] = back[x].toLowerCase(); // black back rank
  }
  return b;
}

// ---------- attack / move generation ----------

function findKing(board: string[], color: Color): number {
  const k = withColor('K', color);
  for (let i = 0; i < 64; i++) if (board[i] === k) return i;
  return -1;
}

// Is square `target` attacked by any piece of `byColor`?
function isSquareAttacked(board: string[], target: number, byColor: Color): boolean {
  const tx = fileOf(target);
  const ty = rankOf(target);

  // Pawns: a `byColor` pawn attacks diagonally forward.
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const dx of [-1, 1]) {
    const px = tx + dx;
    const py = ty - pawnDir; // attacker sits one rank behind the target (relative to its forward dir)
    if (inBounds(px, py) && board[idx(px, py)] === withColor('P', byColor)) return true;
  }

  // Knights
  for (const [dx, dy] of KNIGHT_DELTAS) {
    const x = tx + dx;
    const y = ty + dy;
    if (inBounds(x, y) && board[idx(x, y)] === withColor('N', byColor)) return true;
  }

  // King adjacency
  for (const [dx, dy] of KING_DELTAS) {
    const x = tx + dx;
    const y = ty + dy;
    if (inBounds(x, y) && board[idx(x, y)] === withColor('K', byColor)) return true;
  }

  // Sliding: rook/queen orthogonally, bishop/queen diagonally
  const scan = (dirs: ReadonlyArray<readonly [number, number]>, pieces: string[]) => {
    for (const [dx, dy] of dirs) {
      let x = tx + dx;
      let y = ty + dy;
      while (inBounds(x, y)) {
        const code = board[idx(x, y)];
        if (code !== '') {
          if (colorOf(code) === byColor && pieces.includes(code.toUpperCase())) return true;
          break;
        }
        x += dx;
        y += dy;
      }
    }
    return false;
  };
  if (scan(ROOK_DIRS, ['R', 'Q'])) return true;
  if (scan(BISHOP_DIRS, ['B', 'Q'])) return true;

  return false;
}

function isInCheck(board: string[], color: Color): boolean {
  const king = findKing(board, color);
  if (king < 0) return true; // king captured ⇒ treat as in check
  return isSquareAttacked(board, king, color === 'w' ? 'b' : 'w');
}

// Apply a fully-specified move to a board copy (handles capture, promotion,
// en passant, and the castling rook hop). Does not touch rights/turn.
function applyBoard(board: string[], move: Move): string[] {
  const b = board.slice();
  const piece = b[move.from];
  const color = colorOf(piece)!;
  b[move.from] = '';

  if (move.isEnPassant) {
    // captured pawn sits beside the destination, on the mover's origin rank
    b[idx(fileOf(move.to), rankOf(move.from))] = '';
  }

  if (move.promotion) {
    b[move.to] = withColor(move.promotion, color);
  } else {
    b[move.to] = piece;
  }

  if (move.castle) {
    const y = rankOf(move.from);
    if (move.castle === 'K') {
      b[idx(5, y)] = b[idx(7, y)];
      b[idx(7, y)] = '';
    } else {
      b[idx(3, y)] = b[idx(0, y)];
      b[idx(0, y)] = '';
    }
  }

  return b;
}

// Pseudo-legal destinations for the piece on `from` (ignores own-king safety,
// but includes castling legality which depends on attacked squares).
function pseudoMoves(state: ChessState, from: number): Move[] {
  const board = state.board;
  const piece = board[from];
  const color = colorOf(piece);
  if (!color) return [];
  const x = fileOf(from);
  const y = rankOf(from);
  const type = piece.toUpperCase();
  const moves: Move[] = [];

  const pushPlain = (to: number) =>
    moves.push({ from, to, promotion: null, isEnPassant: false, castle: null });

  const addPawnTo = (to: number, isEnPassant: boolean) => {
    const toY = rankOf(to);
    const lastRank = color === 'w' ? 7 : 0;
    if (toY === lastRank) {
      for (const promo of ['Q', 'R', 'B', 'N'] as const) {
        moves.push({ from, to, promotion: promo, isEnPassant, castle: null });
      }
    } else {
      moves.push({ from, to, promotion: null, isEnPassant, castle: null });
    }
  };

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 1 : 6;
    // forward one
    if (inBounds(x, y + dir) && board[idx(x, y + dir)] === '') {
      addPawnTo(idx(x, y + dir), false);
      // forward two
      if (y === startRank && board[idx(x, y + 2 * dir)] === '') {
        moves.push({
          from,
          to: idx(x, y + 2 * dir),
          promotion: null,
          isEnPassant: false,
          castle: null,
        });
      }
    }
    // captures
    for (const dx of [-1, 1]) {
      const cx = x + dx;
      const cy = y + dir;
      if (!inBounds(cx, cy)) continue;
      const target = idx(cx, cy);
      if (board[target] !== '' && colorOf(board[target]) !== color) {
        addPawnTo(target, false);
      } else if (state.enPassant === target) {
        addPawnTo(target, true);
      }
    }
    return moves;
  }

  if (type === 'N') {
    for (const [dx, dy] of KNIGHT_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const code = board[idx(nx, ny)];
      if (code === '' || colorOf(code) !== color) pushPlain(idx(nx, ny));
    }
    return moves;
  }

  if (type === 'K') {
    for (const [dx, dy] of KING_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const code = board[idx(nx, ny)];
      if (code === '' || colorOf(code) !== color) pushPlain(idx(nx, ny));
    }
    // castling
    const enemy: Color = color === 'w' ? 'b' : 'w';
    const rank = color === 'w' ? 0 : 7;
    if (from === idx(4, rank) && !isSquareAttacked(board, from, enemy)) {
      const kSide = color === 'w' ? state.castling.wK : state.castling.bK;
      const qSide = color === 'w' ? state.castling.wQ : state.castling.bQ;
      if (
        kSide &&
        board[idx(5, rank)] === '' &&
        board[idx(6, rank)] === '' &&
        board[idx(7, rank)] === withColor('R', color) &&
        !isSquareAttacked(board, idx(5, rank), enemy) &&
        !isSquareAttacked(board, idx(6, rank), enemy)
      ) {
        moves.push({ from, to: idx(6, rank), promotion: null, isEnPassant: false, castle: 'K' });
      }
      if (
        qSide &&
        board[idx(3, rank)] === '' &&
        board[idx(2, rank)] === '' &&
        board[idx(1, rank)] === '' &&
        board[idx(0, rank)] === withColor('R', color) &&
        !isSquareAttacked(board, idx(3, rank), enemy) &&
        !isSquareAttacked(board, idx(2, rank), enemy)
      ) {
        moves.push({ from, to: idx(2, rank), promotion: null, isEnPassant: false, castle: 'Q' });
      }
    }
    return moves;
  }

  // sliding pieces
  const dirs =
    type === 'R' ? ROOK_DIRS : type === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
  for (const [dx, dy] of dirs) {
    let nx = x + dx;
    let ny = y + dy;
    while (inBounds(nx, ny)) {
      const code = board[idx(nx, ny)];
      if (code === '') {
        pushPlain(idx(nx, ny));
      } else {
        if (colorOf(code) !== color) pushPlain(idx(nx, ny));
        break;
      }
      nx += dx;
      ny += dy;
    }
  }
  return moves;
}

// Legal moves for the piece on `from`: pseudo-legal filtered so the mover's king
// is not left in check.
function legalMovesFrom(state: ChessState, from: number): Move[] {
  const color = colorOf(state.board[from]);
  if (!color) return [];
  return pseudoMoves(state, from).filter((m) => !isInCheck(applyBoard(state.board, m), color));
}

function allLegalMoves(state: ChessState, color: Color): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (colorOf(state.board[i]) === color) out.push(...legalMovesFrom(state, i));
  }
  return out;
}

// Full position transition for a move: new board + rights + en passant + turn.
function nextChessState(state: ChessState, move: Move): ChessState {
  const piece = state.board[move.from];
  const color = colorOf(piece)!;
  const board = applyBoard(state.board, move);
  const castling: CastlingRights = { ...state.castling };

  // king move loses both rights
  if (piece.toUpperCase() === 'K') {
    if (color === 'w') {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }
  // rook moving off its home square, or any move onto a rook home square (capture)
  const clearRookRight = (sq: number) => {
    if (sq === idx(0, 0)) castling.wQ = false;
    if (sq === idx(7, 0)) castling.wK = false;
    if (sq === idx(0, 7)) castling.bQ = false;
    if (sq === idx(7, 7)) castling.bK = false;
  };
  clearRookRight(move.from);
  clearRookRight(move.to);

  // en passant target: only when a pawn double-steps
  let enPassant: number | null = null;
  if (piece.toUpperCase() === 'P' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    enPassant = idx(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2);
  }

  return {
    ...state,
    board,
    castling,
    enPassant,
    turn: color === 'w' ? 'b' : 'w',
    moveCount: state.moveCount + 1,
    lastMove: { from: move.from, to: move.to },
  };
}

function deriveMove(state: ChessState, from: number, to: number, promotion?: string): Move | null {
  return (
    legalMovesFrom(state, from).find(
      (m) => m.to === to && (m.promotion === null || m.promotion === (promotion ?? 'Q')),
    ) ?? null
  );
}

function seatColor(state: ChessState, seat: number): Color {
  return seat === state.whiteSeat ? 'w' : 'b';
}

// ---------- metadata ----------

const metadata: GameMetadata = {
  gameId: 'chess',
  gameVersion: '1.0.0',
  displayNameKey: 'game.chess.name',
  minPlayers: 2,
  maxPlayers: 2,
  supportsTeams: false,
  supportsSpectators: true,
  isRealtime: false,
  recommendedOrientation: 'any',
};

// ---------- module ----------

export const chessGame: GameModule<
  ChessConfig,
  ChessState,
  ChessCommand,
  ChessEvent,
  ChessView,
  ChessResult
> = {
  metadata,

  validateConfig(input: unknown): ChessConfig {
    const c = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    return { whiteSeatFromSeed: c['whiteSeatFromSeed'] === false ? false : true };
  },

  createInitialState({
    config,
    players,
    seed,
  }: {
    config: ChessConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): ChessState {
    const whiteSeat = config.whiteSeatFromSeed
      ? seedFromString(`${seed}:white`) % players.length
      : 0;
    return {
      phase: 'IN_PROGRESS',
      board: startingBoard(),
      seats: players.map((p) => p.userId),
      whiteSeat,
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      moveCount: 0,
      lastMove: null,
      winnerId: null,
      result: null,
      resultReason: null,
    };
  },

  validateCommand({
    state,
    actor,
    command,
  }: {
    state: ChessState;
    actor: GameActor;
    command: ChessCommand;
    serverReceivedAtMs: number;
  }): CommandValidation {
    if (state.phase !== 'IN_PROGRESS') {
      return { valid: false, reason: 'Game is already completed' };
    }
    if (seatColor(state, actor.seatIndex) !== state.turn) {
      return { valid: false, reason: 'Not your turn' };
    }
    const { from, to } = command;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      from > 63 ||
      to < 0 ||
      to > 63
    ) {
      return { valid: false, reason: 'Square index out of range' };
    }
    if (colorOf(state.board[from]) !== state.turn) {
      return { valid: false, reason: 'No own piece on the from square' };
    }
    const move = deriveMove(state, from, to, command.promotion);
    if (!move) {
      return { valid: false, reason: 'Illegal move' };
    }
    return { valid: true };
  },

  decide({
    state,
    command,
  }: {
    state: ChessState;
    actor: GameActor;
    command: ChessCommand;
    serverReceivedAtMs: number;
  }): readonly ChessEvent[] {
    const move = deriveMove(state, command.from, command.to, command.promotion)!;
    const events: ChessEvent[] = [
      {
        type: 'MOVE_MADE',
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        isEnPassant: move.isEnPassant,
        castle: move.castle,
      },
    ];

    const after = nextChessState(state, move);
    const opponent = after.turn;
    const opponentHasMoves = allLegalMoves(after, opponent).length > 0;
    if (!opponentHasMoves) {
      if (isInCheck(after.board, opponent)) {
        events.push({
          type: 'GAME_ENDED',
          result: opponent === 'w' ? 'BLACK_WIN' : 'WHITE_WIN',
          reason: 'checkmate',
        });
      } else {
        events.push({ type: 'GAME_ENDED', result: 'DRAW', reason: 'stalemate' });
      }
    }
    return events;
  },

  evolve(state: ChessState, event: ChessEvent): ChessState {
    switch (event.type) {
      case 'MOVE_MADE':
        return nextChessState(state, {
          from: event.from,
          to: event.to,
          promotion: event.promotion,
          isEnPassant: event.isEnPassant,
          castle: event.castle,
        });
      case 'GAME_ENDED': {
        const winnerId =
          event.result === 'WHITE_WIN'
            ? state.seats[state.whiteSeat]
            : event.result === 'BLACK_WIN'
              ? state.seats[state.whiteSeat === 0 ? 1 : 0]
              : null;
        return {
          ...state,
          phase: 'COMPLETED',
          result: event.result,
          resultReason: event.reason,
          winnerId,
        };
      }
    }
  },

  projectForPlayer({ state, viewer }: { state: ChessState; viewer: GameViewer }): ChessView {
    const myColor = viewer.seatIndex === null ? null : seatColor(state, viewer.seatIndex);
    return {
      phase: state.phase,
      board: state.board,
      myColor,
      turn: state.turn,
      isMyTurn: myColor === state.turn && state.phase === 'IN_PROGRESS',
      inCheck: isInCheck(state.board, state.turn),
      castling: state.castling,
      enPassant: state.enPassant,
      lastMove: state.lastMove,
      winnerId: state.winnerId,
      result: state.result,
      resultReason: state.resultReason,
    };
  },

  enumerateCommands({
    state,
    actor,
  }: {
    state: ChessState;
    actor: GameActor;
  }): readonly ChessCommand[] {
    if (state.phase !== 'IN_PROGRESS') return [];
    const color = seatColor(state, actor.seatIndex);
    if (color !== state.turn) return [];
    return allLegalMoves(state, color).map((m) => ({
      type: 'MOVE',
      from: m.from,
      to: m.to,
      ...(m.promotion ? { promotion: m.promotion } : {}),
    }));
  },

  evaluateResult(state: ChessState): ChessResult | null {
    if (state.phase !== 'COMPLETED' || state.result === null) return null;
    return { winnerId: state.winnerId, result: state.result, reason: state.resultReason ?? '' };
  },

  serializeState(state: ChessState): unknown {
    return state;
  },

  deserializeState(input: unknown): ChessState {
    return input as ChessState;
  },

  async canonicalHash(state: ChessState): Promise<string> {
    return computeStateHash(state);
  },
};
