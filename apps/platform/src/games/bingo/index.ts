// Bingo — goal-07 game module.
// 2–8 players, turn-based. Each player holds a size×size card of distinct numbers
// drawn from a pool. On your turn you DRAW the next number (revealed to everyone);
// you MARK called numbers on your own card; you CLAIM_BINGO once your marks form
// the required number of completed lines. First valid claim wins.
//
// Pure TypeScript; no Cloudflare, React, or Node.js imports. Deterministic: cards
// and the draw order are generated from the match seed via a seeded PRNG, so the
// match replays identically. No Date.now / Math.random.

import type {
  GameModule,
  GameMetadata,
  CommandValidation,
  GameActor,
  GameViewer,
  GamePlayer,
} from '@boardlink/protocol';
import { computeStateHash } from '@boardlink/protocol';
import { rngFromString, shuffle, range, seedFromString } from '../_shared/rng.js';

// ---------- constants ----------

const DEFAULT_SIZE = 5;
const MIN_SIZE = 3;
const MAX_SIZE = 7;
const DEFAULT_WINNING_LINES = 1;

// ---------- domain types ----------

export interface BingoConfig {
  size: number; // card dimension (size×size)
  winningLines: number; // completed lines needed to win
  poolSize: number; // numbers are drawn from [1..poolSize]
}

export interface BingoState {
  phase: 'IN_PROGRESS' | 'COMPLETED';
  size: number;
  winningLines: number;
  seats: string[]; // userId by seat index
  cards: Record<string, number[]>; // userId → flat row-major card (size*size)
  marks: Record<string, number[]>; // userId → marked numbers, kept sorted ascending
  drawOrder: number[]; // full deterministic draw sequence (hidden from clients)
  drawnCount: number; // how many of drawOrder have been revealed
  turnSeat: number; // seat whose turn it is to DRAW
  winnerId: string | null;
}

// ---------- commands ----------

export interface DrawCommand {
  type: 'DRAW';
}
export interface MarkCommand {
  type: 'MARK';
  number: number;
}
export interface ClaimBingoCommand {
  type: 'CLAIM_BINGO';
}
export type BingoCommand = DrawCommand | MarkCommand | ClaimBingoCommand;

// ---------- events ----------

export interface NumberDrawnEvent {
  type: 'NUMBER_DRAWN';
  number: number;
  bySeat: number;
  nextTurnSeat: number;
}
export interface NumberMarkedEvent {
  type: 'NUMBER_MARKED';
  userId: string;
  number: number;
}
export interface BingoWonEvent {
  type: 'BINGO_WON';
  userId: string;
  seat: number;
}
export type BingoEvent = NumberDrawnEvent | NumberMarkedEvent | BingoWonEvent;

// ---------- views & result ----------

export interface BingoPlayerSummary {
  seat: number;
  userId: string;
  markedCount: number;
  completedLines: number;
}

export interface BingoView {
  phase: BingoState['phase'];
  size: number;
  winningLines: number;
  myCard: number[] | null; // null for spectators
  myMarks: number[];
  myCompletedLines: number;
  called: number[]; // revealed numbers only — never future draws
  remaining: number;
  turnSeat: number;
  isMyTurn: boolean;
  players: BingoPlayerSummary[];
  winnerId: string | null;
}

export interface BingoResult {
  winnerId: string | null;
  winningSeat: number | null;
}

// ---------- helpers ----------

function countCompletedLines(card: number[], marked: ReadonlySet<number>, size: number): number {
  let lines = 0;
  for (let r = 0; r < size; r++) {
    let full = true;
    for (let c = 0; c < size; c++) {
      if (!marked.has(card[r * size + c])) {
        full = false;
        break;
      }
    }
    if (full) lines++;
  }
  for (let c = 0; c < size; c++) {
    let full = true;
    for (let r = 0; r < size; r++) {
      if (!marked.has(card[r * size + c])) {
        full = false;
        break;
      }
    }
    if (full) lines++;
  }
  let diag1 = true;
  let diag2 = true;
  for (let i = 0; i < size; i++) {
    if (!marked.has(card[i * size + i])) diag1 = false;
    if (!marked.has(card[i * size + (size - 1 - i)])) diag2 = false;
  }
  if (diag1) lines++;
  if (diag2) lines++;
  return lines;
}

function calledSet(state: BingoState): Set<number> {
  return new Set(state.drawOrder.slice(0, state.drawnCount));
}

// ---------- metadata ----------

const metadata: GameMetadata = {
  gameId: 'bingo',
  gameVersion: '1.0.0',
  displayNameKey: 'game.bingo.name',
  minPlayers: 2,
  maxPlayers: 8,
  supportsTeams: false,
  supportsSpectators: true,
  isRealtime: false,
  recommendedOrientation: 'portrait',
};

// ---------- module ----------

export const bingoGame: GameModule<
  BingoConfig,
  BingoState,
  BingoCommand,
  BingoEvent,
  BingoView,
  BingoResult
> = {
  metadata,

  validateConfig(input: unknown): BingoConfig {
    const c = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    let size = typeof c['size'] === 'number' ? Math.floor(c['size']) : DEFAULT_SIZE;
    if (size < MIN_SIZE) size = MIN_SIZE;
    if (size > MAX_SIZE) size = MAX_SIZE;
    const cells = size * size;
    const maxLines = 2 * size + 2;
    let winningLines =
      typeof c['winningLines'] === 'number' ? Math.floor(c['winningLines']) : DEFAULT_WINNING_LINES;
    if (winningLines < 1) winningLines = 1;
    if (winningLines > maxLines) winningLines = maxLines;
    // Pool must hold at least one full card; default to 3× the card for variety.
    const defaultPool = Math.max(cells * 3, cells + 15);
    let poolSize = typeof c['poolSize'] === 'number' ? Math.floor(c['poolSize']) : defaultPool;
    if (poolSize < cells) poolSize = cells;
    return { size, winningLines, poolSize };
  },

  createInitialState({
    config,
    players,
    seed,
  }: {
    config: BingoConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): BingoState {
    const pool = range(1, config.poolSize);
    const drawOrder = shuffle(pool, rngFromString(`${seed}:draw`));
    const cells = config.size * config.size;
    const seats: string[] = [];
    const cards: Record<string, number[]> = {};
    const marks: Record<string, number[]> = {};
    players.forEach((p, seatIndex) => {
      seats[seatIndex] = p.userId;
      cards[p.userId] = shuffle(pool, rngFromString(`${seed}:card:${seatIndex}`)).slice(0, cells);
      marks[p.userId] = [];
    });
    const turnSeat = seedFromString(`${seed}:turn`) % players.length;
    return {
      phase: 'IN_PROGRESS',
      size: config.size,
      winningLines: config.winningLines,
      seats,
      cards,
      marks,
      drawOrder,
      drawnCount: 0,
      turnSeat,
      winnerId: null,
    };
  },

  validateCommand({
    state,
    actor,
    command,
  }: {
    state: BingoState;
    actor: GameActor;
    command: BingoCommand;
    serverReceivedAtMs: number;
  }): CommandValidation {
    if (state.phase !== 'IN_PROGRESS') {
      return { valid: false, reason: 'Game is already completed' };
    }
    const card = state.cards[actor.userId];
    if (!card) {
      return { valid: false, reason: 'Only seated players can act' };
    }

    switch (command.type) {
      case 'DRAW': {
        if (actor.seatIndex !== state.turnSeat) {
          return { valid: false, reason: 'Not your turn to draw' };
        }
        if (state.drawnCount >= state.drawOrder.length) {
          return { valid: false, reason: 'No numbers left to draw' };
        }
        return { valid: true };
      }
      case 'MARK': {
        if (!card.includes(command.number)) {
          return { valid: false, reason: 'Number is not on your card' };
        }
        if (!calledSet(state).has(command.number)) {
          return { valid: false, reason: 'Number has not been called yet' };
        }
        if (state.marks[actor.userId].includes(command.number)) {
          return { valid: false, reason: 'Number already marked' };
        }
        return { valid: true };
      }
      case 'CLAIM_BINGO': {
        const marked = new Set(state.marks[actor.userId]);
        const lines = countCompletedLines(card, marked, state.size);
        if (lines < state.winningLines) {
          return {
            valid: false,
            reason: `Need ${state.winningLines} completed line(s), have ${lines}`,
          };
        }
        return { valid: true };
      }
    }
  },

  decide({
    state,
    actor,
    command,
  }: {
    state: BingoState;
    actor: GameActor;
    command: BingoCommand;
    serverReceivedAtMs: number;
  }): readonly BingoEvent[] {
    switch (command.type) {
      case 'DRAW':
        return [
          {
            type: 'NUMBER_DRAWN',
            number: state.drawOrder[state.drawnCount],
            bySeat: actor.seatIndex,
            nextTurnSeat: (state.turnSeat + 1) % state.seats.length,
          },
        ];
      case 'MARK':
        return [{ type: 'NUMBER_MARKED', userId: actor.userId, number: command.number }];
      case 'CLAIM_BINGO':
        return [{ type: 'BINGO_WON', userId: actor.userId, seat: actor.seatIndex }];
    }
  },

  evolve(state: BingoState, event: BingoEvent): BingoState {
    switch (event.type) {
      case 'NUMBER_DRAWN':
        return { ...state, drawnCount: state.drawnCount + 1, turnSeat: event.nextTurnSeat };
      case 'NUMBER_MARKED': {
        const existing = state.marks[event.userId] ?? [];
        if (existing.includes(event.number)) return state;
        const updated = [...existing, event.number].sort((a, b) => a - b);
        return { ...state, marks: { ...state.marks, [event.userId]: updated } };
      }
      case 'BINGO_WON':
        return { ...state, phase: 'COMPLETED', winnerId: event.userId };
    }
  },

  projectForPlayer({ state, viewer }: { state: BingoState; viewer: GameViewer }): BingoView {
    const myCard = state.cards[viewer.userId] ?? null;
    const myMarks = state.marks[viewer.userId] ?? [];
    const myCompletedLines = myCard ? countCompletedLines(myCard, new Set(myMarks), state.size) : 0;
    const players: BingoPlayerSummary[] = state.seats.map((userId, seat) => {
      const card = state.cards[userId];
      const marked = new Set(state.marks[userId] ?? []);
      return {
        seat,
        userId,
        markedCount: state.marks[userId]?.length ?? 0,
        completedLines: card ? countCompletedLines(card, marked, state.size) : 0,
      };
    });
    return {
      phase: state.phase,
      size: state.size,
      winningLines: state.winningLines,
      myCard,
      myMarks,
      myCompletedLines,
      called: state.drawOrder.slice(0, state.drawnCount),
      remaining: state.drawOrder.length - state.drawnCount,
      turnSeat: state.turnSeat,
      isMyTurn: viewer.seatIndex === state.turnSeat,
      players,
      winnerId: state.winnerId,
    };
  },

  evaluateResult(state: BingoState): BingoResult | null {
    if (state.phase !== 'COMPLETED') return null;
    const winningSeat = state.winnerId ? state.seats.indexOf(state.winnerId) : -1;
    return { winnerId: state.winnerId, winningSeat: winningSeat < 0 ? null : winningSeat };
  },

  serializeState(state: BingoState): unknown {
    return state;
  },

  deserializeState(input: unknown): BingoState {
    return input as BingoState;
  },

  async canonicalHash(state: BingoState): Promise<string> {
    return computeStateHash(state);
  },
};
