// Same-device "vs computer" driver (docs/09 LocalRoomAuthority). Runs a full
// match locally against the AI using the same game modules and rules as online
// play — no server, no WebSocket. Supports the alternating-turn strategy games
// (Gomoku, Chess, Janggi); Bingo's multi-action turns use its controller directly.
//
// The human submits commands; after each accepted command the AI plays out any
// turns that belong to it until it is the human's move again (or the game ends).

import { getGame } from '../../worker/room/gameRegistry.js';
import { getAi } from '../../games/_shared/aiRegistry.js';
import type { AiController, Difficulty } from '../../games/_shared/ai.js';
import { rngFromString } from '../../games/_shared/rng.js';
import type { AnyGameModule } from '@boardlink/protocol';

const HUMAN_ID = 'human';
const CPU_ID = 'cpu';

export interface LocalGameOptions {
  gameId: string;
  humanSeat?: 0 | 1;
  difficulty?: Difficulty;
  config?: unknown;
  seed?: string;
  humanName?: string;
  aiName?: string;
}

export interface SubmitResult {
  ok: boolean;
  reason?: string;
}

export class LocalGame {
  readonly humanSeat: 0 | 1;
  readonly aiSeat: 0 | 1;
  readonly difficulty: Difficulty;
  private readonly module: AnyGameModule;
  private readonly ai: AiController;
  private readonly rng: () => number;
  private state: unknown;

  constructor(opts: LocalGameOptions) {
    const module = getGame(opts.gameId);
    if (!module) throw new Error(`Unknown game: ${opts.gameId}`);
    const ai = getAi(opts.gameId);
    if (!ai) throw new Error(`No computer opponent available for: ${opts.gameId}`);
    this.module = module;
    this.ai = ai;
    this.humanSeat = opts.humanSeat ?? 0;
    this.aiSeat = this.humanSeat === 0 ? 1 : 0;
    this.difficulty = opts.difficulty ?? 'medium';
    const seed = opts.seed ?? 'local-game';
    this.rng = rngFromString(`${seed}:ai`);

    const players = [0, 1].map((seat) =>
      seat === this.humanSeat
        ? { userId: HUMAN_ID, displayName: opts.humanName ?? 'You', seatIndex: seat }
        : { userId: CPU_ID, displayName: opts.aiName ?? 'Computer', seatIndex: seat },
    );

    this.state = module.createInitialState({
      config: module.validateConfig(opts.config),
      players,
      seed,
      startsAtServerMs: 0,
    });

    // The AI moves first if the opening turn belongs to it.
    this.runAi();
  }

  // Player projection for the human seat.
  view(): unknown {
    return this.module.projectForPlayer({
      state: this.state,
      viewer: { userId: HUMAN_ID, seatIndex: this.humanSeat },
    });
  }

  rawState(): unknown {
    return this.state;
  }

  result(): unknown {
    return this.module.evaluateResult(this.state);
  }

  isOver(): boolean {
    return this.module.evaluateResult(this.state) !== null;
  }

  isHumanTurn(): boolean {
    return !this.isOver() && this.ai.seatToMove(this.state) === this.humanSeat;
  }

  submit(command: unknown): SubmitResult {
    if (this.isOver()) return { ok: false, reason: 'Game is already over' };
    const actor = { userId: HUMAN_ID, seatIndex: this.humanSeat };
    const v = this.module.validateCommand({
      state: this.state,
      actor,
      command,
      serverReceivedAtMs: 0,
    });
    if (!v.valid) return { ok: false, reason: v.reason };
    this.apply(command, actor);
    this.runAi();
    return { ok: true };
  }

  private apply(command: unknown, actor: { userId: string; seatIndex: number }): void {
    const events = this.module.decide({ state: this.state, actor, command, serverReceivedAtMs: 0 });
    for (const event of events) this.state = this.module.evolve(this.state, event);
  }

  private runAi(): void {
    const actor = { userId: CPU_ID, seatIndex: this.aiSeat };
    let guard = 0;
    while (
      this.module.evaluateResult(this.state) === null &&
      this.ai.seatToMove(this.state) === this.aiSeat &&
      guard++ < 1000
    ) {
      const command = this.ai.chooseCommand({
        state: this.state,
        seat: this.aiSeat,
        difficulty: this.difficulty,
        rng: this.rng,
      });
      if (command == null) break;
      this.apply(command, actor);
    }
  }
}
