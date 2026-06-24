// Counter Game — test/demo game module (goal-04).
// Increment/decrement a shared counter. First player to reach the target wins.
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

// ---------- domain types ----------

interface CounterConfig {
  target: number;
  allowNegative: boolean;
}

interface CounterState {
  phase: 'IN_PROGRESS' | 'COMPLETED';
  count: number;
  target: number;
  allowNegative: boolean;
  lastMovedBy: string | null;
}

interface IncrementCommand {
  type: 'INCREMENT';
}

interface DecrementCommand {
  type: 'DECREMENT';
}

interface ResetCommand {
  type: 'RESET';
}

type CounterCommand = IncrementCommand | DecrementCommand | ResetCommand;

interface CounterChangedEvent {
  type: 'COUNTER_CHANGED';
  userId: string;
  delta: number;
  newCount: number;
  serverMs: number;
}

type CounterEvent = CounterChangedEvent;

interface CounterView {
  count: number;
  target: number;
  phase: CounterState['phase'];
  lastMovedBy: string | null;
}

interface CounterResult {
  winnerId: string | null;
  finalCount: number;
}

// ---------- metadata ----------

const metadata: GameMetadata = {
  gameId: 'counter',
  gameVersion: '1.0.0',
  displayNameKey: 'game.counter.name',
  minPlayers: 1,
  maxPlayers: 8,
  supportsTeams: false,
  supportsSpectators: true,
  isRealtime: false,
  recommendedOrientation: 'any',
};

// ---------- module ----------

export const counterGame: GameModule<
  CounterConfig,
  CounterState,
  CounterCommand,
  CounterEvent,
  CounterView,
  CounterResult
> = {
  metadata,

  validateConfig(input: unknown): CounterConfig {
    const c = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    return {
      target: typeof c['target'] === 'number' && c['target'] > 0 ? c['target'] : 10,
      allowNegative: c['allowNegative'] === true,
    };
  },

  createInitialState({
    config,
  }: {
    config: CounterConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): CounterState {
    return {
      phase: 'IN_PROGRESS',
      count: 0,
      target: config.target,
      allowNegative: config.allowNegative,
      lastMovedBy: null,
    };
  },

  validateCommand({
    state,
    command,
  }: {
    state: CounterState;
    actor: GameActor;
    command: CounterCommand;
    serverReceivedAtMs: number;
  }): CommandValidation {
    if (state.phase === 'COMPLETED') {
      return { valid: false, reason: 'Game is already completed' };
    }
    switch (command.type) {
      case 'INCREMENT':
      case 'DECREMENT':
      case 'RESET':
        return { valid: true };
    }
  },

  decide({
    state,
    actor,
    command,
    serverReceivedAtMs,
  }: {
    state: CounterState;
    actor: GameActor;
    command: CounterCommand;
    serverReceivedAtMs: number;
  }): readonly CounterEvent[] {
    let delta: number;
    switch (command.type) {
      case 'INCREMENT':
        delta = 1;
        break;
      case 'DECREMENT':
        delta = -1;
        break;
      case 'RESET':
        delta = -state.count;
        break;
    }

    const newCount = state.count + delta;
    if (!state.allowNegative && newCount < 0) return [];

    return [
      {
        type: 'COUNTER_CHANGED',
        userId: actor.userId,
        delta,
        newCount,
        serverMs: serverReceivedAtMs,
      },
    ];
  },

  evolve(state: CounterState, event: CounterEvent): CounterState {
    switch (event.type) {
      case 'COUNTER_CHANGED':
        return {
          ...state,
          count: event.newCount,
          phase: event.newCount >= state.target ? 'COMPLETED' : 'IN_PROGRESS',
          lastMovedBy: event.userId,
        };
    }
  },

  projectForPlayer({
    state,
    viewer: _viewer,
  }: {
    state: CounterState;
    viewer: GameViewer;
  }): CounterView {
    return {
      count: state.count,
      target: state.target,
      phase: state.phase,
      lastMovedBy: state.lastMovedBy,
    };
  },

  evaluateResult(state: CounterState): CounterResult | null {
    if (state.phase !== 'COMPLETED') return null;
    return {
      winnerId: state.lastMovedBy,
      finalCount: state.count,
    };
  },

  serializeState(state: CounterState): unknown {
    return state;
  },

  deserializeState(input: unknown): CounterState {
    return input as CounterState;
  },

  async canonicalHash(state: CounterState): Promise<string> {
    return computeStateHash(state);
  },
};
