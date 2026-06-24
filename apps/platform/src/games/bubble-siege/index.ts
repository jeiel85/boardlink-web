// Bubble Siege — goal-06 game module.
// 2-player asymmetric: Attacker spawns balls, Defender pops them.
// Pure TypeScript; no Cloudflare, React, or Node.js imports.

import type {
  GameModule,
  GameMetadata,
  CommandValidation,
  GameActor,
  GameViewer,
  GamePlayer,
} from '@boardlink/protocol';
import { computeStateHash } from '@boardlink/protocol';

// ---------- constants ----------

const ROUND_DURATION_MS = 10_000;
const BALL_TTL_MS = 10_000;
const MAX_BALLS = 12;
const SPAWN_COOLDOWN_MS = 120;
const TOTAL_ROUNDS = 2;
const ARENA_SIZE = 1000;

// ---------- domain types ----------

export interface Ball {
  id: string;
  x: number;
  y: number;
  spawnedAtMs: number;
  expiresAtMs: number;
}

export interface RoundScore {
  attackerScore: number;
  defenderScore: number;
}

export interface BubbleSiegeConfig {
  roundDurationMs: number;
  ballTtlMs: number;
  maxBalls: number;
  spawnCooldownMs: number;
}

export interface BubbleSiegeState {
  phase: 'WAITING' | 'IN_ROUND' | 'ROUND_END' | 'GAME_OVER';
  currentRound: number;
  roundStartMs: number;
  roundEndMs: number;
  balls: Record<string, Ball>;
  attackerUserId: string;
  defenderUserId: string;
  attackerLastSpawnMs: number;
  roundDurationMs: number;
  ballTtlMs: number;
  maxBalls: number;
  spawnCooldownMs: number;
  scores: RoundScore[];
}

// ---------- command types ----------

export interface SpawnBallCommand {
  type: 'SPAWN_BALL';
  ballId: string;
  x: number;
  y: number;
}

export interface PopBallCommand {
  type: 'POP_BALL';
  ballId: string;
}

export type BubbleSiegeCommand = SpawnBallCommand | PopBallCommand;

// ---------- event types ----------

export interface BallSpawnedEvent {
  type: 'BALL_SPAWNED';
  ballId: string;
  x: number;
  y: number;
  spawnedAtMs: number;
  expiresAtMs: number;
}

export interface BallPoppedEvent {
  type: 'BALL_POPPED';
  ballId: string;
  poppedAtMs: number;
}

export interface RoundEndedEvent {
  type: 'ROUND_ENDED';
  round: number;
  survivingBallCount: number;
  poppedBallCount: number;
  attackerScore: number;
  defenderScore: number;
}

export interface GameOverEvent {
  type: 'GAME_OVER';
  attackerTotal: number;
  defenderTotal: number;
  winnerId: string;
}

export type BubbleSiegeEvent = BallSpawnedEvent | BallPoppedEvent | RoundEndedEvent | GameOverEvent;

// ---------- views ----------

export interface BubbleSiegeView {
  phase: BubbleSiegeState['phase'];
  currentRound: number;
  myRole: 'ATTACKER' | 'DEFENDER' | 'SPECTATOR';
  balls: Ball[];
  scores: RoundScore[];
  roundEndMs: number;
}

export interface BubbleSiegeResult {
  winnerId: string;
  attackerTotal: number;
  defenderTotal: number;
}

// ---------- helpers ----------

function activeBalls(state: BubbleSiegeState, nowMs: number): Ball[] {
  return Object.values(state.balls).filter((b) => b.expiresAtMs > nowMs);
}

function computeRoundScores(
  state: BubbleSiegeState,
  endMs: number,
): { surviving: number; popped: number } {
  const allBalls = Object.values(state.balls);
  const surviving = allBalls.filter((b) => b.expiresAtMs > endMs).length;
  const popped = allBalls.length - surviving;
  return { surviving, popped };
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
  recommendedOrientation: 'landscape',
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
    return {
      roundDurationMs:
        typeof c['roundDurationMs'] === 'number' ? c['roundDurationMs'] : ROUND_DURATION_MS,
      ballTtlMs: typeof c['ballTtlMs'] === 'number' ? c['ballTtlMs'] : BALL_TTL_MS,
      maxBalls: typeof c['maxBalls'] === 'number' ? c['maxBalls'] : MAX_BALLS,
      spawnCooldownMs:
        typeof c['spawnCooldownMs'] === 'number' ? c['spawnCooldownMs'] : SPAWN_COOLDOWN_MS,
    };
  },

  createInitialState({
    config,
    players,
    startsAtServerMs,
  }: {
    config: BubbleSiegeConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): BubbleSiegeState {
    const attacker = players[0];
    const defender = players[1];
    const roundEndMs = startsAtServerMs + config.roundDurationMs;
    return {
      phase: 'IN_ROUND',
      currentRound: 1,
      roundStartMs: startsAtServerMs,
      roundEndMs,
      balls: {},
      attackerUserId: attacker.userId,
      defenderUserId: defender.userId,
      attackerLastSpawnMs: 0,
      roundDurationMs: config.roundDurationMs,
      ballTtlMs: config.ballTtlMs,
      maxBalls: config.maxBalls,
      spawnCooldownMs: config.spawnCooldownMs,
      scores: [],
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
    if (state.phase !== 'IN_ROUND') {
      return { valid: false, reason: 'Round is not active' };
    }
    if (serverReceivedAtMs >= state.roundEndMs) {
      return { valid: false, reason: 'Round time has elapsed' };
    }

    switch (command.type) {
      case 'SPAWN_BALL': {
        if (actor.userId !== state.attackerUserId) {
          return { valid: false, reason: 'Only the attacker can spawn balls' };
        }
        const cooldownOk = serverReceivedAtMs - state.attackerLastSpawnMs >= state.spawnCooldownMs;
        if (!cooldownOk) {
          return { valid: false, reason: 'Spawn cooldown not elapsed' };
        }
        const liveBalls = activeBalls(state, serverReceivedAtMs);
        if (liveBalls.length >= state.maxBalls) {
          return { valid: false, reason: 'Maximum active balls reached' };
        }
        const x = command.x;
        const y = command.y;
        if (x < 0 || x > ARENA_SIZE || y < 0 || y > ARENA_SIZE) {
          return { valid: false, reason: 'Coordinates out of arena bounds' };
        }
        return { valid: true };
      }
      case 'POP_BALL': {
        if (actor.userId !== state.defenderUserId) {
          return { valid: false, reason: 'Only the defender can pop balls' };
        }
        const ball = state.balls[command.ballId];
        if (!ball) {
          return { valid: false, reason: 'Ball not found' };
        }
        if (ball.expiresAtMs <= serverReceivedAtMs) {
          return { valid: false, reason: 'Ball has already expired' };
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
            ballId: command.ballId,
            x: command.x,
            y: command.y,
            spawnedAtMs: serverReceivedAtMs,
            expiresAtMs: serverReceivedAtMs + state.ballTtlMs,
          },
        ];
      case 'POP_BALL':
        return [
          {
            type: 'BALL_POPPED',
            ballId: command.ballId,
            poppedAtMs: serverReceivedAtMs,
          },
        ];
    }
  },

  evolve(state: BubbleSiegeState, event: BubbleSiegeEvent): BubbleSiegeState {
    switch (event.type) {
      case 'BALL_SPAWNED': {
        const newBalls = {
          ...state.balls,
          [event.ballId]: {
            id: event.ballId,
            x: event.x,
            y: event.y,
            spawnedAtMs: event.spawnedAtMs,
            expiresAtMs: event.expiresAtMs,
          },
        };
        return { ...state, balls: newBalls, attackerLastSpawnMs: event.spawnedAtMs };
      }
      case 'BALL_POPPED': {
        const newBalls = { ...state.balls };
        delete newBalls[event.ballId];
        return { ...state, balls: newBalls };
      }
      case 'ROUND_ENDED': {
        const newScores = [
          ...state.scores,
          { attackerScore: event.attackerScore, defenderScore: event.defenderScore },
        ];
        const nextRound = state.currentRound + 1;
        const isGameOver = nextRound > TOTAL_ROUNDS;
        if (isGameOver) {
          return { ...state, balls: {}, scores: newScores, phase: 'ROUND_END' };
        }
        return {
          ...state,
          balls: {},
          scores: newScores,
          phase: 'ROUND_END',
          currentRound: nextRound,
        };
      }
      case 'GAME_OVER': {
        return { ...state, phase: 'GAME_OVER' };
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
    if (viewer.userId === state.attackerUserId) myRole = 'ATTACKER';
    else if (viewer.userId === state.defenderUserId) myRole = 'DEFENDER';

    return {
      phase: state.phase,
      currentRound: state.currentRound,
      myRole,
      balls: Object.values(state.balls),
      scores: state.scores,
      roundEndMs: state.roundEndMs,
    };
  },

  evaluateResult(state: BubbleSiegeState): BubbleSiegeResult | null {
    if (state.phase !== 'GAME_OVER') return null;
    const attackerTotal = state.scores.reduce((s, r) => s + r.attackerScore, 0);
    const defenderTotal = state.scores.reduce((s, r) => s + r.defenderScore, 0);
    const winnerId = attackerTotal >= defenderTotal ? state.attackerUserId : state.defenderUserId;
    return { winnerId, attackerTotal, defenderTotal };
  },

  getNextAlarmMs(state: BubbleSiegeState, _nowMs: number): number | null {
    if (state.phase === 'IN_ROUND') return state.roundEndMs;
    return null;
  },

  onTick({
    state,
    serverMs,
  }: {
    state: BubbleSiegeState;
    serverMs: number;
  }): readonly BubbleSiegeEvent[] {
    if (state.phase !== 'IN_ROUND') return [];
    if (serverMs < state.roundEndMs) return [];

    const { surviving, popped } = computeRoundScores(state, state.roundEndMs);
    const roundEndedEvent: RoundEndedEvent = {
      type: 'ROUND_ENDED',
      round: state.currentRound,
      survivingBallCount: surviving,
      poppedBallCount: popped,
      attackerScore: surviving,
      defenderScore: popped,
    };

    const isLastRound = state.currentRound >= TOTAL_ROUNDS;
    if (isLastRound) {
      const allScores = [...state.scores, { attackerScore: surviving, defenderScore: popped }];
      const attackerTotal = allScores.reduce((s, r) => s + r.attackerScore, 0);
      const defenderTotal = allScores.reduce((s, r) => s + r.defenderScore, 0);
      const winnerId = attackerTotal >= defenderTotal ? state.attackerUserId : state.defenderUserId;
      const gameOverEvent: GameOverEvent = {
        type: 'GAME_OVER',
        attackerTotal,
        defenderTotal,
        winnerId,
      };
      return [roundEndedEvent, gameOverEvent];
    }

    return [roundEndedEvent];
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
