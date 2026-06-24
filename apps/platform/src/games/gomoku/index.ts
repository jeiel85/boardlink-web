// Gomoku (오목) — goal-08 game module.
// 2 players, turn-based, no hidden information. Players alternate placing stones;
// the first to line up `winLength` (default 5) consecutive stones horizontally,
// vertically, or diagonally wins. Freestyle by default (overlines of 6+ also win).
//
// Pure TypeScript; no Cloudflare, React, or Node.js imports. Deterministic: the
// first mover is derived from the match seed; no Date.now / Math.random.

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

// ---------- constants ----------

const DEFAULT_SIZE = 15;
const MIN_SIZE = 3;
const MAX_SIZE = 19;
const DEFAULT_WIN_LENGTH = 5;
const EMPTY = -1;

// 4 axes: horizontal, vertical, main diagonal, anti-diagonal.
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

// ---------- domain types ----------

export interface GomokuConfig {
  size: number;
  winLength: number;
  allowOverline: boolean; // true → runs longer than winLength also win (freestyle)
}

export interface Cell {
  x: number;
  y: number;
}

export interface GomokuState {
  phase: 'IN_PROGRESS' | 'COMPLETED';
  size: number;
  winLength: number;
  allowOverline: boolean;
  board: number[]; // size*size, row-major; EMPTY or a seat index (0/1)
  seats: string[];
  turnSeat: number;
  moveCount: number;
  lastMove: { x: number; y: number; seat: number } | null;
  winnerId: string | null;
  isDraw: boolean;
  winningLine: Cell[] | null;
}

// ---------- commands ----------

export interface PlaceStoneCommand {
  type: 'PLACE_STONE';
  x: number;
  y: number;
}
export type GomokuCommand = PlaceStoneCommand;

// ---------- events ----------

export interface StonePlacedEvent {
  type: 'STONE_PLACED';
  x: number;
  y: number;
  seat: number;
}
export interface GameWonEvent {
  type: 'GAME_WON';
  seat: number;
  winningLine: Cell[];
}
export interface GameDrewEvent {
  type: 'GAME_DREW';
}
export type GomokuEvent = StonePlacedEvent | GameWonEvent | GameDrewEvent;

// ---------- views & result ----------

export interface GomokuView {
  phase: GomokuState['phase'];
  size: number;
  winLength: number;
  board: number[];
  mySeat: number | null;
  turnSeat: number;
  isMyTurn: boolean;
  lastMove: { x: number; y: number; seat: number } | null;
  winnerId: string | null;
  isDraw: boolean;
  winningLine: Cell[] | null;
}

export interface GomokuResult {
  winnerId: string | null;
  winningSeat: number | null;
  isDraw: boolean;
}

// ---------- helpers ----------

// Return the winning run of cells if placing `seat` at (x,y) completes a line on
// the given (pre-placement) board, else null. The cell (x,y) is treated as the
// just-placed stone; neighbours are read from the board.
function winningRun(state: GomokuState, x: number, y: number, seat: number): Cell[] | null {
  const { board, size, winLength, allowOverline } = state;
  const at = (cx: number, cy: number): number =>
    cx < 0 || cy < 0 || cx >= size || cy >= size ? -2 : board[cy * size + cx];

  for (const [dx, dy] of DIRECTIONS) {
    const cells: Cell[] = [{ x, y }];
    for (let cx = x + dx, cy = y + dy; at(cx, cy) === seat; cx += dx, cy += dy) {
      cells.push({ x: cx, y: cy });
    }
    for (let cx = x - dx, cy = y - dy; at(cx, cy) === seat; cx -= dx, cy -= dy) {
      cells.unshift({ x: cx, y: cy });
    }
    const run = cells.length;
    const win = allowOverline ? run >= winLength : run === winLength;
    if (win) return cells;
  }
  return null;
}

// ---------- metadata ----------

const metadata: GameMetadata = {
  gameId: 'gomoku',
  gameVersion: '1.0.0',
  displayNameKey: 'game.gomoku.name',
  minPlayers: 2,
  maxPlayers: 2,
  supportsTeams: false,
  supportsSpectators: true,
  isRealtime: false,
  recommendedOrientation: 'any',
};

// ---------- module ----------

export const gomokuGame: GameModule<
  GomokuConfig,
  GomokuState,
  GomokuCommand,
  GomokuEvent,
  GomokuView,
  GomokuResult
> = {
  metadata,

  validateConfig(input: unknown): GomokuConfig {
    const c = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    let size = typeof c['size'] === 'number' ? Math.floor(c['size']) : DEFAULT_SIZE;
    if (size < MIN_SIZE) size = MIN_SIZE;
    if (size > MAX_SIZE) size = MAX_SIZE;
    let winLength =
      typeof c['winLength'] === 'number' ? Math.floor(c['winLength']) : DEFAULT_WIN_LENGTH;
    if (winLength < 3) winLength = 3;
    if (winLength > size) winLength = size;
    const allowOverline = c['allowOverline'] === undefined ? true : c['allowOverline'] === true;
    return { size, winLength, allowOverline };
  },

  createInitialState({
    config,
    players,
    seed,
  }: {
    config: GomokuConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): GomokuState {
    return {
      phase: 'IN_PROGRESS',
      size: config.size,
      winLength: config.winLength,
      allowOverline: config.allowOverline,
      board: new Array(config.size * config.size).fill(EMPTY),
      seats: players.map((p) => p.userId),
      turnSeat: seedFromString(`${seed}:first`) % players.length,
      moveCount: 0,
      lastMove: null,
      winnerId: null,
      isDraw: false,
      winningLine: null,
    };
  },

  validateCommand({
    state,
    actor,
    command,
  }: {
    state: GomokuState;
    actor: GameActor;
    command: GomokuCommand;
    serverReceivedAtMs: number;
  }): CommandValidation {
    if (state.phase !== 'IN_PROGRESS') {
      return { valid: false, reason: 'Game is already completed' };
    }
    if (actor.seatIndex !== state.turnSeat) {
      return { valid: false, reason: 'Not your turn' };
    }
    const { x, y } = command;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { valid: false, reason: 'Coordinates must be integers' };
    }
    if (x < 0 || y < 0 || x >= state.size || y >= state.size) {
      return { valid: false, reason: 'Coordinates out of bounds' };
    }
    if (state.board[y * state.size + x] !== EMPTY) {
      return { valid: false, reason: 'Cell is already occupied' };
    }
    return { valid: true };
  },

  decide({
    state,
    actor,
    command,
  }: {
    state: GomokuState;
    actor: GameActor;
    command: GomokuCommand;
    serverReceivedAtMs: number;
  }): readonly GomokuEvent[] {
    const { x, y } = command;
    const seat = actor.seatIndex;
    const events: GomokuEvent[] = [{ type: 'STONE_PLACED', x, y, seat }];
    const run = winningRun(state, x, y, seat);
    if (run) {
      events.push({ type: 'GAME_WON', seat, winningLine: run });
    } else if (state.moveCount + 1 >= state.size * state.size) {
      events.push({ type: 'GAME_DREW' });
    }
    return events;
  },

  evolve(state: GomokuState, event: GomokuEvent): GomokuState {
    switch (event.type) {
      case 'STONE_PLACED': {
        const board = state.board.slice();
        board[event.y * state.size + event.x] = event.seat;
        return {
          ...state,
          board,
          moveCount: state.moveCount + 1,
          lastMove: { x: event.x, y: event.y, seat: event.seat },
          turnSeat: (state.turnSeat + 1) % state.seats.length,
        };
      }
      case 'GAME_WON':
        return {
          ...state,
          phase: 'COMPLETED',
          winnerId: state.seats[event.seat],
          winningLine: event.winningLine,
        };
      case 'GAME_DREW':
        return { ...state, phase: 'COMPLETED', isDraw: true };
    }
  },

  projectForPlayer({ state, viewer }: { state: GomokuState; viewer: GameViewer }): GomokuView {
    return {
      phase: state.phase,
      size: state.size,
      winLength: state.winLength,
      board: state.board,
      mySeat: viewer.seatIndex,
      turnSeat: state.turnSeat,
      isMyTurn: viewer.seatIndex === state.turnSeat,
      lastMove: state.lastMove,
      winnerId: state.winnerId,
      isDraw: state.isDraw,
      winningLine: state.winningLine,
    };
  },

  enumerateCommands({ state }: { state: GomokuState; actor: GameActor }): readonly GomokuCommand[] {
    if (state.phase !== 'IN_PROGRESS') return [];
    const out: GomokuCommand[] = [];
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] === EMPTY) {
        out.push({ type: 'PLACE_STONE', x: i % state.size, y: Math.floor(i / state.size) });
      }
    }
    return out;
  },

  evaluateResult(state: GomokuState): GomokuResult | null {
    if (state.phase !== 'COMPLETED') return null;
    const winningSeat = state.winnerId ? state.seats.indexOf(state.winnerId) : -1;
    return {
      winnerId: state.winnerId,
      winningSeat: winningSeat < 0 ? null : winningSeat,
      isDraw: state.isDraw,
    };
  },

  serializeState(state: GomokuState): unknown {
    return state;
  },

  deserializeState(input: unknown): GomokuState {
    return input as GomokuState;
  },

  async canonicalHash(state: GomokuState): Promise<string> {
    return computeStateHash(state);
  },
};
