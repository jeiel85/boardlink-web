// Bubble Siege — goal-06 game module.
// 2-player asymmetric, real-time: in each round the attacker spawns balls and the
// defender pops them. Roles switch between the two rounds. Each player's score is
// the number of balls still alive at the end of THEIR attack round; higher total
// wins, equal is a draw.
//
// Conforms to docs/10-bubble-siege.md.
// Pure TypeScript; no Cloudflare, React, or Node.js imports. Deterministic:
// no Date.now / Math.random — time enters only via serverReceivedAtMs / serverMs
// arguments, all coordinates are integers, distance checks use integer math.

import type {
  GameModule,
  GameMetadata,
  CommandValidation,
  GameActor,
  GameViewer,
  GamePlayer,
} from '@boardlink/protocol';
import { computeStateHash } from '@boardlink/protocol';

// ---------- constants (spec defaults) ----------

const ROUND_DURATION_MS = 10_000;
const COUNTDOWN_MS = 3_000;
const MAX_BALLS = 12;
const SPAWN_COOLDOWN_MS = 120;
const BALL_RADIUS = 45;
const EDGE_MARGIN = 20; // beyond radius
const MIN_CENTER_DISTANCE = 65;
const POP_TOLERANCE = 15; // documented accessibility tolerance
const TOTAL_ROUNDS = 2;
const ARENA_SIZE = 1000;

// ---------- domain types ----------

export type Side = 'A' | 'B';

export interface Ball {
  id: string;
  x: number;
  y: number;
  radius: number;
  spawnedAtServerMs: number;
}

export interface BubbleSiegeConfig {
  roundDurationMs: number;
  countdownMs: number;
  maxBalls: number;
  spawnCooldownMs: number;
  ballRadius: number;
  edgeMargin: number;
  minCenterDistance: number;
  popTolerance: number;
}

export interface BubbleSiegeState {
  phase: 'COUNTDOWN' | 'ACTIVE' | 'GAME_OVER';
  currentRound: number; // 1..TOTAL_ROUNDS
  countdownEndMs: number; // COUNTDOWN ends → round becomes ACTIVE
  roundEndMs: number; // ACTIVE round ends
  balls: Record<string, Ball>; // live (unpopped) balls in the current round
  playerA: string; // seat 0 userId
  playerB: string; // seat 1 userId
  firstAttacker: Side; // who attacks in round 1 (seed-derived)
  attackerLastSpawnMs: number;
  scoreA: number | null; // balls alive at end of A's attack round
  scoreB: number | null;
  // flattened config (kept on state so evolve/decide need no external lookup)
  roundDurationMs: number;
  countdownMs: number;
  maxBalls: number;
  spawnCooldownMs: number;
  ballRadius: number;
  edgeMargin: number;
  minCenterDistance: number;
  popTolerance: number;
}

// ---------- command types ----------

export interface SpawnBallCommand {
  type: 'SPAWN_BALL';
  commandId: string;
  x: number;
  y: number;
  clientInputAtMs?: number;
}

export interface PopBallCommand {
  type: 'POP_BALL';
  commandId: string;
  ballId: string;
  x: number;
  y: number;
  clientInputAtMs?: number;
}

export type BubbleSiegeCommand = SpawnBallCommand | PopBallCommand;

// ---------- event types ----------

export interface BallSpawnedEvent {
  type: 'BALL_SPAWNED';
  ballId: string;
  x: number;
  y: number;
  radius: number;
  spawnedAtServerMs: number;
}

export interface BallPoppedEvent {
  type: 'BALL_POPPED';
  ballId: string;
  poppedAtServerMs: number;
}

export interface RoundStartedEvent {
  type: 'ROUND_STARTED';
  round: number;
  attackerSide: Side;
  startedAtServerMs: number;
}

export interface RoundEndedEvent {
  type: 'ROUND_ENDED';
  round: number;
  attackerSide: Side;
  score: number; // surviving balls = attacker's round score
  endedAtServerMs: number;
  nextCountdownEndMs: number | null; // null when this was the last round
  nextRoundEndMs: number | null;
}

export interface GameOverEvent {
  type: 'GAME_OVER';
  scoreA: number;
  scoreB: number;
  winnerId: string | null; // null = draw
}

export type BubbleSiegeEvent =
  | BallSpawnedEvent
  | BallPoppedEvent
  | RoundStartedEvent
  | RoundEndedEvent
  | GameOverEvent;

// ---------- views & result ----------

export interface BubbleSiegeView {
  phase: BubbleSiegeState['phase'];
  currentRound: number;
  myRole: 'ATTACKER' | 'DEFENDER' | 'SPECTATOR';
  balls: Ball[];
  activeBallCount: number;
  countdownEndMs: number;
  roundEndMs: number;
  scoreA: number | null;
  scoreB: number | null;
}

export interface BubbleSiegeResult {
  winnerId: string | null;
  scoreA: number;
  scoreB: number;
  isDraw: boolean;
}

// ---------- helpers ----------

function deriveFirstAttacker(seed: string): Side {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return sum % 2 === 0 ? 'A' : 'B';
}

function attackerSideForRound(state: BubbleSiegeState, round: number): Side {
  if (round === 1) return state.firstAttacker;
  return state.firstAttacker === 'A' ? 'B' : 'A';
}

function sideUserId(state: BubbleSiegeState, side: Side): string {
  return side === 'A' ? state.playerA : state.playerB;
}

function currentAttackerId(state: BubbleSiegeState): string {
  return sideUserId(state, attackerSideForRound(state, state.currentRound));
}

function currentDefenderId(state: BubbleSiegeState): string {
  const att = attackerSideForRound(state, state.currentRound);
  return sideUserId(state, att === 'A' ? 'B' : 'A');
}

function liveBallCount(state: BubbleSiegeState): number {
  return Object.keys(state.balls).length;
}

// ---------- metadata ----------

const metadata: GameMetadata = {
  gameId: 'bubble-siege',
  gameVersion: '1.0.0',
  displayNameKey: 'game.bubbleSiege.name',
  minPlayers: 2,
  maxPlayers: 2,
  supportsTeams: false,
  supportsSpectators: true,
  isRealtime: true,
  recommendedOrientation: 'any',
};

// ---------- module ----------

export const bubbleSiegeGame: GameModule<
  BubbleSiegeConfig,
  BubbleSiegeState,
  BubbleSiegeCommand,
  BubbleSiegeEvent,
  BubbleSiegeView,
  BubbleSiegeResult
> = {
  metadata,

  validateConfig(input: unknown): BubbleSiegeConfig {
    const c = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    const positive = (key: string, def: number): number =>
      typeof c[key] === 'number' && (c[key] as number) > 0 ? (c[key] as number) : def;
    const nonNegative = (key: string, def: number): number =>
      typeof c[key] === 'number' && (c[key] as number) >= 0 ? (c[key] as number) : def;
    return {
      roundDurationMs: positive('roundDurationMs', ROUND_DURATION_MS),
      countdownMs: positive('countdownMs', COUNTDOWN_MS),
      maxBalls: positive('maxBalls', MAX_BALLS),
      spawnCooldownMs: nonNegative('spawnCooldownMs', SPAWN_COOLDOWN_MS),
      ballRadius: positive('ballRadius', BALL_RADIUS),
      edgeMargin: nonNegative('edgeMargin', EDGE_MARGIN),
      minCenterDistance: positive('minCenterDistance', MIN_CENTER_DISTANCE),
      popTolerance: nonNegative('popTolerance', POP_TOLERANCE),
    };
  },

  createInitialState({
    config,
    players,
    seed,
    startsAtServerMs,
  }: {
    config: BubbleSiegeConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): BubbleSiegeState {
    const countdownEndMs = startsAtServerMs + config.countdownMs;
    const roundEndMs = countdownEndMs + config.roundDurationMs;
    return {
      phase: 'COUNTDOWN',
      currentRound: 1,
      countdownEndMs,
      roundEndMs,
      balls: {},
      playerA: players[0].userId,
      playerB: players[1].userId,
      firstAttacker: deriveFirstAttacker(seed),
      attackerLastSpawnMs: 0,
      scoreA: null,
      scoreB: null,
      roundDurationMs: config.roundDurationMs,
      countdownMs: config.countdownMs,
      maxBalls: config.maxBalls,
      spawnCooldownMs: config.spawnCooldownMs,
      ballRadius: config.ballRadius,
      edgeMargin: config.edgeMargin,
      minCenterDistance: config.minCenterDistance,
      popTolerance: config.popTolerance,
    };
  },

  validateCommand({
    state,
    actor,
    command,
    serverReceivedAtMs,
  }: {
    state: BubbleSiegeState;
    actor: GameActor;
    command: BubbleSiegeCommand;
    serverReceivedAtMs: number;
  }): CommandValidation {
    if (state.phase !== 'ACTIVE') {
      return { valid: false, reason: 'Round is not active' };
    }
    if (serverReceivedAtMs >= state.roundEndMs) {
      return { valid: false, reason: 'Round time has elapsed' };
    }

    switch (command.type) {
      case 'SPAWN_BALL': {
        if (actor.userId !== currentAttackerId(state)) {
          return { valid: false, reason: 'Only the current attacker can spawn balls' };
        }
        if (state.balls[command.commandId]) {
          return { valid: false, reason: 'Duplicate spawn command' };
        }
        if (serverReceivedAtMs - state.attackerLastSpawnMs < state.spawnCooldownMs) {
          return { valid: false, reason: 'Spawn cooldown not elapsed' };
        }
        if (liveBallCount(state) >= state.maxBalls) {
          return { valid: false, reason: 'Maximum active balls reached' };
        }
        const { x, y } = command;
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          return { valid: false, reason: 'Coordinates must be integers' };
        }
        const minCenter = state.ballRadius + state.edgeMargin;
        const maxCenter = ARENA_SIZE - state.ballRadius - state.edgeMargin;
        if (x < minCenter || x > maxCenter || y < minCenter || y > maxCenter) {
          return { valid: false, reason: 'Coordinates violate edge margin' };
        }
        const minDistSq = state.minCenterDistance * state.minCenterDistance;
        for (const ball of Object.values(state.balls)) {
          const dx = ball.x - x;
          const dy = ball.y - y;
          if (dx * dx + dy * dy < minDistSq) {
            return { valid: false, reason: 'Too close to an existing ball' };
          }
        }
        return { valid: true };
      }
      case 'POP_BALL': {
        if (actor.userId !== currentDefenderId(state)) {
          return { valid: false, reason: 'Only the current defender can pop balls' };
        }
        const ball = state.balls[command.ballId];
        if (!ball) {
          return { valid: false, reason: 'Ball not found or already popped' };
        }
        if (!Number.isInteger(command.x) || !Number.isInteger(command.y)) {
          return { valid: false, reason: 'Coordinates must be integers' };
        }
        const dx = ball.x - command.x;
        const dy = ball.y - command.y;
        const hitRadius = ball.radius + state.popTolerance;
        if (dx * dx + dy * dy > hitRadius * hitRadius) {
          return { valid: false, reason: 'Pointer outside ball hit radius' };
        }
        return { valid: true };
      }
    }
  },

  decide({
    state,
    command,
    serverReceivedAtMs,
  }: {
    state: BubbleSiegeState;
    actor: GameActor;
    command: BubbleSiegeCommand;
    serverReceivedAtMs: number;
  }): readonly BubbleSiegeEvent[] {
    switch (command.type) {
      case 'SPAWN_BALL':
        return [
          {
            type: 'BALL_SPAWNED',
            ballId: command.commandId,
            x: command.x,
            y: command.y,
            radius: state.ballRadius,
            spawnedAtServerMs: serverReceivedAtMs,
          },
        ];
      case 'POP_BALL':
        return [
          {
            type: 'BALL_POPPED',
            ballId: command.ballId,
            poppedAtServerMs: serverReceivedAtMs,
          },
        ];
    }
  },

  evolve(state: BubbleSiegeState, event: BubbleSiegeEvent): BubbleSiegeState {
    switch (event.type) {
      case 'BALL_SPAWNED': {
        const balls = {
          ...state.balls,
          [event.ballId]: {
            id: event.ballId,
            x: event.x,
            y: event.y,
            radius: event.radius,
            spawnedAtServerMs: event.spawnedAtServerMs,
          },
        };
        return { ...state, balls, attackerLastSpawnMs: event.spawnedAtServerMs };
      }
      case 'BALL_POPPED': {
        const balls = { ...state.balls };
        delete balls[event.ballId];
        return { ...state, balls };
      }
      case 'ROUND_STARTED': {
        return { ...state, phase: 'ACTIVE' };
      }
      case 'ROUND_ENDED': {
        const scoreA = event.attackerSide === 'A' ? event.score : state.scoreA;
        const scoreB = event.attackerSide === 'B' ? event.score : state.scoreB;
        if (event.nextCountdownEndMs !== null && event.nextRoundEndMs !== null) {
          return {
            ...state,
            scoreA,
            scoreB,
            balls: {},
            phase: 'COUNTDOWN',
            currentRound: state.currentRound + 1,
            countdownEndMs: event.nextCountdownEndMs,
            roundEndMs: event.nextRoundEndMs,
            attackerLastSpawnMs: 0,
          };
        }
        return { ...state, scoreA, scoreB, balls: {} };
      }
      case 'GAME_OVER': {
        return { ...state, phase: 'GAME_OVER', scoreA: event.scoreA, scoreB: event.scoreB };
      }
    }
  },

  projectForPlayer({
    state,
    viewer,
  }: {
    state: BubbleSiegeState;
    viewer: GameViewer;
  }): BubbleSiegeView {
    let myRole: BubbleSiegeView['myRole'] = 'SPECTATOR';
    if (state.phase !== 'GAME_OVER') {
      if (viewer.userId === currentAttackerId(state)) myRole = 'ATTACKER';
      else if (viewer.userId === currentDefenderId(state)) myRole = 'DEFENDER';
    }
    return {
      phase: state.phase,
      currentRound: state.currentRound,
      myRole,
      balls: Object.values(state.balls),
      activeBallCount: liveBallCount(state),
      countdownEndMs: state.countdownEndMs,
      roundEndMs: state.roundEndMs,
      scoreA: state.scoreA,
      scoreB: state.scoreB,
    };
  },

  evaluateResult(state: BubbleSiegeState): BubbleSiegeResult | null {
    if (state.phase !== 'GAME_OVER') return null;
    const scoreA = state.scoreA ?? 0;
    const scoreB = state.scoreB ?? 0;
    const winnerId = scoreA > scoreB ? state.playerA : scoreB > scoreA ? state.playerB : null;
    return { winnerId, scoreA, scoreB, isDraw: winnerId === null };
  },

  getNextAlarmMs(state: BubbleSiegeState, _nowMs: number): number | null {
    if (state.phase === 'COUNTDOWN') return state.countdownEndMs;
    if (state.phase === 'ACTIVE') return state.roundEndMs;
    return null;
  },

  onTick({
    state,
    serverMs,
  }: {
    state: BubbleSiegeState;
    serverMs: number;
  }): readonly BubbleSiegeEvent[] {
    if (state.phase === 'COUNTDOWN') {
      if (serverMs < state.countdownEndMs) return [];
      return [
        {
          type: 'ROUND_STARTED',
          round: state.currentRound,
          attackerSide: attackerSideForRound(state, state.currentRound),
          startedAtServerMs: serverMs,
        },
      ];
    }

    if (state.phase === 'ACTIVE') {
      if (serverMs < state.roundEndMs) return [];
      const attackerSide = attackerSideForRound(state, state.currentRound);
      const score = liveBallCount(state);
      const isLastRound = state.currentRound >= TOTAL_ROUNDS;

      if (!isLastRound) {
        const nextCountdownEndMs = serverMs + state.countdownMs;
        const nextRoundEndMs = nextCountdownEndMs + state.roundDurationMs;
        return [
          {
            type: 'ROUND_ENDED',
            round: state.currentRound,
            attackerSide,
            score,
            endedAtServerMs: serverMs,
            nextCountdownEndMs,
            nextRoundEndMs,
          },
        ];
      }

      const finalScoreA = attackerSide === 'A' ? score : (state.scoreA ?? 0);
      const finalScoreB = attackerSide === 'B' ? score : (state.scoreB ?? 0);
      const winnerId =
        finalScoreA > finalScoreB
          ? state.playerA
          : finalScoreB > finalScoreA
            ? state.playerB
            : null;
      return [
        {
          type: 'ROUND_ENDED',
          round: state.currentRound,
          attackerSide,
          score,
          endedAtServerMs: serverMs,
          nextCountdownEndMs: null,
          nextRoundEndMs: null,
        },
        {
          type: 'GAME_OVER',
          scoreA: finalScoreA,
          scoreB: finalScoreB,
          winnerId,
        },
      ];
    }

    return [];
  },

  serializeState(state: BubbleSiegeState): unknown {
    return state;
  },

  deserializeState(input: unknown): BubbleSiegeState {
    return input as BubbleSiegeState;
  },

  async canonicalHash(state: BubbleSiegeState): Promise<string> {
    return computeStateHash(state);
  },
};
