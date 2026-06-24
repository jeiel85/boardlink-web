// Game Module SDK — goal-05
// Pure TypeScript interface; no Cloudflare, React, or Node.js imports allowed in implementations.

export interface GameMetadata {
  gameId: string;
  gameVersion: string;
  displayNameKey: string;
  minPlayers: number;
  maxPlayers: number;
  supportsTeams: boolean;
  supportsSpectators: boolean;
  isRealtime: boolean;
  recommendedOrientation: 'portrait' | 'landscape' | 'any';
}

export interface GamePlayer {
  userId: string;
  displayName: string;
  seatIndex: number;
}

// Actor: a seated player who issued the command
export interface GameActor {
  userId: string;
  seatIndex: number;
}

// Viewer: who is receiving the projected view (null seatIndex = spectator)
export interface GameViewer {
  userId: string;
  seatIndex: number | null;
}

export type CommandValidation = { valid: true } | { valid: false; reason: string };

export interface GameModule<TConfig, TState, TCommand, TEvent, TPlayerView, TResult> {
  readonly metadata: GameMetadata;

  validateConfig(input: unknown): TConfig;

  createInitialState(args: {
    config: TConfig;
    players: readonly GamePlayer[];
    seed: string;
    startsAtServerMs: number;
  }): TState;

  validateCommand(args: {
    state: TState;
    actor: GameActor;
    command: TCommand;
    serverReceivedAtMs: number;
  }): CommandValidation;

  decide(args: {
    state: TState;
    actor: GameActor;
    command: TCommand;
    serverReceivedAtMs: number;
  }): readonly TEvent[];

  evolve(state: TState, event: TEvent): TState;

  projectForPlayer(args: { state: TState; viewer: GameViewer }): TPlayerView;

  evaluateResult(state: TState): TResult | null;

  // Optional: return timestamp (ms) when the next server-side alarm should fire.
  // Return null if the game does not need a timer.
  getNextAlarmMs?(state: TState, nowMs: number): number | null;

  // Optional: called when the alarm fires. Generates events (e.g. round end).
  onTick?(args: { state: TState; serverMs: number }): readonly TEvent[];

  serializeState(state: TState): unknown;

  deserializeState(input: unknown): TState;

  canonicalHash(state: TState): Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any, any, any>;
