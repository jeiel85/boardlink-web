# Game Module SDK

## Objective

New games must plug into the platform without modifying room networking, identity, invitation, or PWA systems.

## Core interface

```ts
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

  serializeState(state: TState): unknown;

  deserializeState(input: unknown): TState;

  canonicalHash(state: TState): Promise<string>;
}
```

## Rules

- `createInitialState`, `decide`, `evolve`, and `evaluateResult` are deterministic.
- No direct time reads.
- No random APIs.
- No storage reads.
- No network calls.
- No React imports.
- No floating-point coordinates in authoritative state unless quantized.
- Commands never directly mutate state.
- Events must be replayable.
- Player projections must not reveal hidden information.

## Game metadata

```ts
interface GameMetadata {
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
```

## Match replay

A complete match is reproducible from:

- Game ID and version
- Validated config
- Player seat assignments
- Seed
- Start time
- Ordered authoritative events

Replay tests compare final state hash and result.

## Same-device mode

Same-device mode uses the same game module but a local authority adapter.

```text
UI → LocalRoomAuthority → validate/decide/evolve → UI
```

Do not implement separate game rules for local mode.

## Renderer contract

Renderers consume player projections, not authoritative raw state.

Benefits:

- Hidden-information games
- Spectator projection
- Replay
- Accessibility
- Server/client boundary clarity

## Game registration

Use an explicit registry.

```ts
const gameRegistry = {
  'bubble-siege': bubbleSiegeModule,
  bingo: bingoModule,
  gomoku: gomokuModule,
} satisfies GameRegistry;
```

No dynamic remote code loading.

## Required tests per game

- Config validation
- Legal and illegal command tests
- Deterministic reducer test
- Replay test
- Result calculation test
- Serialization round trip
- Fuzz command sequence
- State hash fixture
- Protocol fixture
- Browser renderer smoke test
