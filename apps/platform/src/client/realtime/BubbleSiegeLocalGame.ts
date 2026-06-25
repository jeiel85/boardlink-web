// Same-device "vs computer" driver for Bubble Siege. Unlike the turn-based games
// this is real-time: rounds advance on a wall-clock timer (mirroring the server's
// alarm via the module's getNextAlarmMs/onTick), and a reactive bot acts on its
// own interval. The human spawns/pops via the arena UI. Uses the same tested
// game rules — no server. The driver (not the game module) is the time authority,
// so Date.now()/timers/Math-free rng live here, not in the module.

import { bubbleSiegeGame } from '../../games/bubble-siege/index.js';
import type { BubbleSiegeState, BubbleSiegeCommand } from '../../games/bubble-siege/index.js';
import { bubbleSiegeBotCommand } from '../../games/bubble-siege/ai.js';
import { rngFromString } from '../../games/_shared/rng.js';
import type { Difficulty } from '../../games/_shared/ai.js';

const HUMAN_ID = 'human';
const CPU_ID = 'cpu';
const BOT_INTERVAL_MS: Record<Difficulty, number> = { easy: 550, medium: 300, hard: 160 };

export class BubbleSiegeLocalGame {
  readonly humanSeat = 0;
  private readonly botSeat = 1;
  private state: BubbleSiegeState;
  private onChange: (() => void) | null = null;
  private alarmTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setInterval> | null = null;
  private readonly rng: () => number;
  private readonly difficulty: Difficulty;
  private counter = 0;

  constructor(opts: { difficulty?: Difficulty; seed?: string } = {}) {
    this.difficulty = opts.difficulty ?? 'medium';
    const seed = opts.seed ?? 'bubble-local';
    this.rng = rngFromString(seed);
    const players = [
      { userId: HUMAN_ID, displayName: 'You', seatIndex: 0 },
      { userId: CPU_ID, displayName: 'Computer', seatIndex: 1 },
    ];
    this.state = bubbleSiegeGame.createInitialState({
      config: bubbleSiegeGame.validateConfig({}),
      players,
      seed,
      startsAtServerMs: Date.now(),
    });
  }

  start(onChange: () => void): void {
    this.onChange = onChange;
    this.scheduleAlarm();
    this.botTimer = setInterval(() => this.botTick(), BOT_INTERVAL_MS[this.difficulty]);
  }

  destroy(): void {
    if (this.alarmTimer) clearTimeout(this.alarmTimer);
    if (this.botTimer) clearInterval(this.botTimer);
    this.alarmTimer = null;
    this.botTimer = null;
  }

  view(): unknown {
    return bubbleSiegeGame.projectForPlayer({
      state: this.state,
      viewer: { userId: HUMAN_ID, seatIndex: this.humanSeat },
    });
  }

  isOver(): boolean {
    return bubbleSiegeGame.evaluateResult(this.state) !== null;
  }

  outcome(): 'win' | 'lose' | 'draw' | null {
    const r = bubbleSiegeGame.evaluateResult(this.state);
    if (!r) return null;
    if (r.winnerId == null) return 'draw';
    return r.winnerId === HUMAN_ID ? 'win' : 'lose';
  }

  spawn(x: number, y: number): void {
    this.apply(
      { type: 'SPAWN_BALL', commandId: `h${++this.counter}`, x: Math.round(x), y: Math.round(y) },
      this.humanSeat,
    );
  }

  pop(ballId: string, x: number, y: number): void {
    this.apply(
      {
        type: 'POP_BALL',
        commandId: `h${++this.counter}`,
        ballId,
        x: Math.round(x),
        y: Math.round(y),
      },
      this.humanSeat,
    );
  }

  // ---------- internals ----------

  private apply(cmd: BubbleSiegeCommand, seat: number): void {
    if (this.isOver()) return;
    const actor = { userId: seat === 0 ? HUMAN_ID : CPU_ID, seatIndex: seat };
    const now = Date.now();
    const v = bubbleSiegeGame.validateCommand({
      state: this.state,
      actor,
      command: cmd,
      serverReceivedAtMs: now,
    });
    if (!v.valid) return;
    const events = bubbleSiegeGame.decide({
      state: this.state,
      actor,
      command: cmd,
      serverReceivedAtMs: now,
    });
    for (const e of events) this.state = bubbleSiegeGame.evolve(this.state, e);
    this.onChange?.();
  }

  private scheduleAlarm(): void {
    const next = bubbleSiegeGame.getNextAlarmMs?.(this.state, Date.now());
    if (next == null) return;
    const delay = Math.max(0, next - Date.now()) + 5;
    this.alarmTimer = setTimeout(() => this.fireAlarm(), delay);
  }

  private fireAlarm(): void {
    this.alarmTimer = null;
    if (this.isOver()) return;
    const events = bubbleSiegeGame.onTick?.({ state: this.state, serverMs: Date.now() }) ?? [];
    for (const e of events) this.state = bubbleSiegeGame.evolve(this.state, e);
    this.onChange?.();
    if (this.isOver()) {
      this.destroy();
      return;
    }
    this.scheduleAlarm();
  }

  private botTick(): void {
    if (this.isOver() || this.state.phase !== 'ACTIVE') return;
    const cmd = bubbleSiegeBotCommand(this.state, this.botSeat, this.rng, ++this.counter);
    if (cmd) this.apply(cmd, this.botSeat);
  }
}
