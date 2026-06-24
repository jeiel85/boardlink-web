// Janggi (장기, Korean chess) — goal-10 game module.
// 2 players, turn-based, no hidden information. 9×10 board with two 3×3 palaces.
// Pieces: General(G/궁), Guard(S/사), Horse(H/마), Elephant(E/상), Chariot(R/차),
// Cannon(C/포), Soldier(P/졸). Implements palace-diagonal movement, horse/elephant
// leg-blocking, cannon screen rules (jump exactly one non-cannon, cannot capture a
// cannon), and checkmate (general capturable with no legal escape).
//
// Scope note: bikjang (facing generals), repetition, and point-counting (점수)
// draw rules are intentionally NOT implemented in v1. A side with no legal move is
// treated as a loss (standard tournament convention — no pass).
//
// Pure TypeScript; no Cloudflare, React, or Node.js imports. Deterministic: the
// first mover is seed-derived. No Date.now / Math.random.

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

// ---------- board geometry ----------
// Index = y*9 + x. x in [0,8] (files), y in [0,9] (ranks). Codes are 2-char:
// color ('0'|'1') + type ('G','S','H','E','R','C','P'); '' is empty.

const W = 9;
const H = 10;
const idx = (x: number, y: number): number => y * W + x;
const fileOf = (i: number): number => i % W;
const rankOf = (i: number): number => Math.floor(i / W);
const inBoard = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H;
const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);

type SeatColor = '0' | '1';

// Palace: files 3..5; seat 0 (bottom) ranks 0..2, seat 1 (top) ranks 7..9.
function inOwnPalace(x: number, y: number, color: SeatColor): boolean {
  if (x < 3 || x > 5) return false;
  return color === '0' ? y >= 0 && y <= 2 : y >= 7 && y <= 9;
}

// Palace diagonal 1-step edges (both palaces), as undirected index pairs.
const PALACE_DIAG_EDGES: ReadonlyArray<readonly [number, number]> = [
  [idx(4, 1), idx(3, 0)],
  [idx(4, 1), idx(5, 0)],
  [idx(4, 1), idx(3, 2)],
  [idx(4, 1), idx(5, 2)],
  [idx(4, 8), idx(3, 7)],
  [idx(4, 8), idx(5, 7)],
  [idx(4, 8), idx(3, 9)],
  [idx(4, 8), idx(5, 9)],
];

// Palace diagonal lines (corner–center–corner) for sliding/jumping pieces.
const PALACE_DIAG_LINES: ReadonlyArray<readonly number[]> = [
  [idx(3, 0), idx(4, 1), idx(5, 2)],
  [idx(5, 0), idx(4, 1), idx(3, 2)],
  [idx(3, 7), idx(4, 8), idx(5, 9)],
  [idx(5, 7), idx(4, 8), idx(3, 9)],
];

function palaceDiagNeighbors(from: number): number[] {
  const out: number[] = [];
  for (const [a, b] of PALACE_DIAG_EDGES) {
    if (a === from) out.push(b);
    else if (b === from) out.push(a);
  }
  return out;
}

function palaceLinesThrough(from: number): readonly number[][] {
  return PALACE_DIAG_LINES.filter((line) => line.includes(from)) as number[][];
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const HORSE_MOVES: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
];
const ELEPHANT_MOVES: ReadonlyArray<readonly [number, number]> = [
  [2, 3],
  [2, -3],
  [-2, 3],
  [-2, -3],
  [3, 2],
  [3, -2],
  [-3, 2],
  [-3, -2],
];

// ---------- domain types ----------

export interface JanggiState {
  phase: 'IN_PROGRESS' | 'COMPLETED';
  board: string[]; // 90 cells
  seats: string[];
  turnSeat: number;
  moveCount: number;
  lastMove: { from: number; to: number } | null;
  winnerId: string | null;
  winnerSeat: number | null;
  reason: string | null;
}

export type JanggiConfig = Record<string, never>;

// ---------- commands ----------

export interface MoveCommand {
  type: 'MOVE';
  from: number;
  to: number;
}
export type JanggiCommand = MoveCommand;

// ---------- events ----------

export interface MoveMadeEvent {
  type: 'MOVE_MADE';
  from: number;
  to: number;
  captured: string; // code captured, or '' if none
}
export interface GameEndedEvent {
  type: 'GAME_ENDED';
  winnerSeat: number | null;
  reason: string;
}
export type JanggiEvent = MoveMadeEvent | GameEndedEvent;

// ---------- views & result ----------

export interface JanggiView {
  phase: JanggiState['phase'];
  board: string[];
  mySeat: number | null;
  turnSeat: number;
  isMyTurn: boolean;
  inCheck: boolean;
  lastMove: { from: number; to: number } | null;
  winnerId: string | null;
  winnerSeat: number | null;
  reason: string | null;
}

export interface JanggiResult {
  winnerId: string | null;
  winnerSeat: number | null;
  reason: string;
}

// ---------- helpers ----------

const colorOf = (code: string): SeatColor | null => (code === '' ? null : (code[0] as SeatColor));
const typeOf = (code: string): string => code[1];
const colorForSeat = (seat: number): SeatColor => (seat === 0 ? '0' : '1');

function startingBoard(): string[] {
  const b = new Array(W * H).fill('');
  // Symmetric standard setup: R H E S _ S E H R on the back rank.
  const back = ['R', 'H', 'E', 'S', '', 'S', 'E', 'H', 'R'];
  for (let x = 0; x < W; x++) {
    if (back[x]) {
      b[idx(x, 0)] = '0' + back[x];
      b[idx(x, 9)] = '1' + back[x];
    }
  }
  b[idx(4, 1)] = '0G'; // generals at palace centre
  b[idx(4, 8)] = '1G';
  b[idx(1, 2)] = '0C'; // cannons
  b[idx(7, 2)] = '0C';
  b[idx(1, 7)] = '1C';
  b[idx(7, 7)] = '1C';
  for (const x of [0, 2, 4, 6, 8]) {
    b[idx(x, 3)] = '0P'; // soldiers
    b[idx(x, 6)] = '1P';
  }
  return b;
}

// Squares the piece on `from` can move to / capture, ignoring own-general safety.
// Used both for move generation and (for the enemy) for attack/check detection,
// so it must NOT itself consult check status (no recursion).
function pseudoTargets(board: string[], from: number): number[] {
  const code = board[from];
  const color = colorOf(code);
  if (!color) return [];
  const type = typeOf(code);
  const x = fileOf(from);
  const y = rankOf(from);
  const out: number[] = [];
  const enemyOrEmpty = (i: number): boolean => board[i] === '' || colorOf(board[i]) !== color;

  if (type === 'G' || type === 'S') {
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBoard(nx, ny) && inOwnPalace(nx, ny, color) && enemyOrEmpty(idx(nx, ny))) {
        out.push(idx(nx, ny));
      }
    }
    for (const n of palaceDiagNeighbors(from)) {
      if (inOwnPalace(fileOf(n), rankOf(n), color) && enemyOrEmpty(n)) out.push(n);
    }
    return out;
  }

  if (type === 'H') {
    for (const [dx, dy] of HORSE_MOVES) {
      const legX = Math.abs(dx) === 2 ? x + sign(dx) : x;
      const legY = Math.abs(dy) === 2 ? y + sign(dy) : y;
      if (!inBoard(legX, legY) || board[idx(legX, legY)] !== '') continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBoard(nx, ny) && enemyOrEmpty(idx(nx, ny))) out.push(idx(nx, ny));
    }
    return out;
  }

  if (type === 'E') {
    for (const [dx, dy] of ELEPHANT_MOVES) {
      let leg1x: number;
      let leg1y: number;
      let leg2x: number;
      let leg2y: number;
      if (Math.abs(dy) === 3) {
        leg1x = x;
        leg1y = y + sign(dy);
        leg2x = x + sign(dx);
        leg2y = y + 2 * sign(dy);
      } else {
        leg1x = x + sign(dx);
        leg1y = y;
        leg2x = x + 2 * sign(dx);
        leg2y = y + sign(dy);
      }
      const nx = x + dx;
      const ny = y + dy;
      if (!inBoard(nx, ny)) continue;
      if (board[idx(leg1x, leg1y)] !== '' || board[idx(leg2x, leg2y)] !== '') continue;
      if (enemyOrEmpty(idx(nx, ny))) out.push(idx(nx, ny));
    }
    return out;
  }

  if (type === 'R') {
    for (const [dx, dy] of ORTHO) {
      let nx = x + dx;
      let ny = y + dy;
      while (inBoard(nx, ny)) {
        const t = idx(nx, ny);
        if (board[t] === '') {
          out.push(t);
        } else {
          if (colorOf(board[t]) !== color) out.push(t);
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
    // palace diagonal slides
    for (const line of palaceLinesThrough(from)) {
      const pos = line.indexOf(from);
      for (const step of [1, -1]) {
        let i = pos + step;
        while (i >= 0 && i < line.length) {
          const t = line[i];
          if (board[t] === '') out.push(t);
          else {
            if (colorOf(board[t]) !== color) out.push(t);
            break;
          }
          i += step;
        }
      }
    }
    return out;
  }

  if (type === 'C') {
    for (const [dx, dy] of ORTHO) {
      let nx = x + dx;
      let ny = y + dy;
      // find the screen
      let screen = -1;
      while (inBoard(nx, ny)) {
        if (board[idx(nx, ny)] !== '') {
          screen = idx(nx, ny);
          break;
        }
        nx += dx;
        ny += dy;
      }
      if (screen < 0 || typeOf(board[screen]) === 'C') continue; // need a non-cannon screen
      nx += dx;
      ny += dy;
      while (inBoard(nx, ny)) {
        const t = idx(nx, ny);
        if (board[t] === '') {
          out.push(t);
        } else {
          if (colorOf(board[t]) !== color && typeOf(board[t]) !== 'C') out.push(t);
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
    // palace diagonal jump (corner → center screen → opposite corner)
    for (const line of palaceLinesThrough(from)) {
      const pos = line.indexOf(from);
      if (pos === 1) continue; // centre cannot jump within a 3-point line
      const screen = line[1];
      const dest = pos === 0 ? line[2] : line[0];
      if (board[screen] === '' || typeOf(board[screen]) === 'C') continue;
      if (board[dest] === '') out.push(dest);
      else if (colorOf(board[dest]) !== color && typeOf(board[dest]) !== 'C') out.push(dest);
    }
    return out;
  }

  if (type === 'P') {
    const dir = color === '0' ? 1 : -1;
    // forward
    if (inBoard(x, y + dir) && enemyOrEmpty(idx(x, y + dir))) out.push(idx(x, y + dir));
    // sideways
    for (const dx of [-1, 1]) {
      if (inBoard(x + dx, y) && enemyOrEmpty(idx(x + dx, y))) out.push(idx(x + dx, y));
    }
    // palace diagonal forward
    for (const n of palaceDiagNeighbors(from)) {
      if (sign(rankOf(n) - y) === dir && Math.abs(fileOf(n) - x) === 1 && enemyOrEmpty(n)) {
        out.push(n);
      }
    }
    return out;
  }

  return out;
}

function findGeneral(board: string[], color: SeatColor): number {
  const code = color + 'G';
  for (let i = 0; i < board.length; i++) if (board[i] === code) return i;
  return -1;
}

function isSquareAttacked(board: string[], target: number, byColor: SeatColor): boolean {
  for (let i = 0; i < board.length; i++) {
    if (colorOf(board[i]) === byColor && pseudoTargets(board, i).includes(target)) return true;
  }
  return false;
}

function isInCheck(board: string[], color: SeatColor): boolean {
  const g = findGeneral(board, color);
  if (g < 0) return true;
  return isSquareAttacked(board, g, color === '0' ? '1' : '0');
}

function moveBoard(board: string[], from: number, to: number): string[] {
  const b = board.slice();
  b[to] = b[from];
  b[from] = '';
  return b;
}

function legalTargetsFrom(state: JanggiState, from: number): number[] {
  const color = colorOf(state.board[from]);
  if (!color) return [];
  return pseudoTargets(state.board, from).filter(
    (to) => !isInCheck(moveBoard(state.board, from, to), color),
  );
}

function hasAnyLegalMove(state: JanggiState, color: SeatColor): boolean {
  for (let i = 0; i < state.board.length; i++) {
    if (colorOf(state.board[i]) === color && legalTargetsFrom(state, i).length > 0) return true;
  }
  return false;
}

// ---------- metadata ----------

const metadata: GameMetadata = {
  gameId: 'janggi',
  gameVersion: '1.0.0',
  displayNameKey: 'game.janggi.name',
  minPlayers: 2,
  maxPlayers: 2,
  supportsTeams: false,
  supportsSpectators: true,
  isRealtime: false,
  recommendedOrientation: 'portrait',
};

// ---------- module ----------

export const janggiGame: GameModule<
  JanggiConfig,
  JanggiState,
  JanggiCommand,
  JanggiEvent,
  JanggiView,
  JanggiResult
> = {
  metadata,

  validateConfig(): JanggiConfig {
    return {};
  },

  createInitialState({
    players,
    seed,
  }: {
    config: JanggiConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): JanggiState {
    return {
      phase: 'IN_PROGRESS',
      board: startingBoard(),
      seats: players.map((p) => p.userId),
      turnSeat: seedFromString(`${seed}:first`) % players.length,
      moveCount: 0,
      lastMove: null,
      winnerId: null,
      winnerSeat: null,
      reason: null,
    };
  },

  validateCommand({
    state,
    actor,
    command,
  }: {
    state: JanggiState;
    actor: GameActor;
    command: JanggiCommand;
    serverReceivedAtMs: number;
  }): CommandValidation {
    if (state.phase !== 'IN_PROGRESS') {
      return { valid: false, reason: 'Game is already completed' };
    }
    if (actor.seatIndex !== state.turnSeat) {
      return { valid: false, reason: 'Not your turn' };
    }
    const { from, to } = command;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      from >= W * H ||
      to < 0 ||
      to >= W * H
    ) {
      return { valid: false, reason: 'Square index out of range' };
    }
    if (colorOf(state.board[from]) !== colorForSeat(state.turnSeat)) {
      return { valid: false, reason: 'No own piece on the from square' };
    }
    if (!legalTargetsFrom(state, from).includes(to)) {
      return { valid: false, reason: 'Illegal move' };
    }
    return { valid: true };
  },

  decide({
    state,
    command,
  }: {
    state: JanggiState;
    actor: GameActor;
    command: JanggiCommand;
    serverReceivedAtMs: number;
  }): readonly JanggiEvent[] {
    const { from, to } = command;
    const events: JanggiEvent[] = [{ type: 'MOVE_MADE', from, to, captured: state.board[to] }];

    const afterBoard = moveBoard(state.board, from, to);
    const moverSeat = state.turnSeat;
    const oppSeat = moverSeat === 0 ? 1 : 0;
    const oppColor = colorForSeat(oppSeat);
    const afterState: JanggiState = { ...state, board: afterBoard, turnSeat: oppSeat };

    if (!hasAnyLegalMove(afterState, oppColor)) {
      const reason = isInCheck(afterBoard, oppColor) ? 'checkmate' : 'stalemate';
      events.push({ type: 'GAME_ENDED', winnerSeat: moverSeat, reason });
    }
    return events;
  },

  evolve(state: JanggiState, event: JanggiEvent): JanggiState {
    switch (event.type) {
      case 'MOVE_MADE':
        return {
          ...state,
          board: moveBoard(state.board, event.from, event.to),
          turnSeat: state.turnSeat === 0 ? 1 : 0,
          moveCount: state.moveCount + 1,
          lastMove: { from: event.from, to: event.to },
        };
      case 'GAME_ENDED':
        return {
          ...state,
          phase: 'COMPLETED',
          winnerSeat: event.winnerSeat,
          winnerId: event.winnerSeat === null ? null : state.seats[event.winnerSeat],
          reason: event.reason,
        };
    }
  },

  projectForPlayer({ state, viewer }: { state: JanggiState; viewer: GameViewer }): JanggiView {
    return {
      phase: state.phase,
      board: state.board,
      mySeat: viewer.seatIndex,
      turnSeat: state.turnSeat,
      isMyTurn: viewer.seatIndex === state.turnSeat && state.phase === 'IN_PROGRESS',
      inCheck: isInCheck(state.board, colorForSeat(state.turnSeat)),
      lastMove: state.lastMove,
      winnerId: state.winnerId,
      winnerSeat: state.winnerSeat,
      reason: state.reason,
    };
  },

  evaluateResult(state: JanggiState): JanggiResult | null {
    if (state.phase !== 'COMPLETED') return null;
    return { winnerId: state.winnerId, winnerSeat: state.winnerSeat, reason: state.reason ?? '' };
  },

  serializeState(state: JanggiState): unknown {
    return state;
  },

  deserializeState(input: unknown): JanggiState {
    return input as JanggiState;
  },

  async canonicalHash(state: JanggiState): Promise<string> {
    return computeStateHash(state);
  },
};
