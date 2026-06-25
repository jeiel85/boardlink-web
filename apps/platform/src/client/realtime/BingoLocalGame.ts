// Same-device "vs computer" driver for Bingo. Bingo doesn't fit the generic
// alternating-turn LocalGame: DRAW is turn-gated, but MARK and CLAIM_BINGO happen
// any time. The human draws on their turn, marks called numbers on their card,
// and claims a win; the computer marks its own card, draws on its turn, and
// claims when it has a line. Uses the same tested Bingo rules — no server.

import { bingoGame } from '../../games/bingo/index.js';
import type { BingoState, BingoCommand } from '../../games/bingo/index.js';

const HUMAN_ID = 'human';
const CPU_ID = 'cpu';

export interface BingoActionResult {
  ok: boolean;
  reason?: string;
}

export class BingoLocalGame {
  readonly humanSeat = 0;
  readonly aiSeat = 1;
  private state: BingoState;

  constructor(opts: { seed?: string; config?: unknown } = {}) {
    const players = [
      { userId: HUMAN_ID, displayName: 'You', seatIndex: 0 },
      { userId: CPU_ID, displayName: 'Computer', seatIndex: 1 },
    ];
    this.state = bingoGame.createInitialState({
      config: bingoGame.validateConfig(opts.config ?? { size: 5, winningLines: 1 }),
      players,
      seed: opts.seed ?? 'bingo-local',
      startsAtServerMs: 0,
    });
    this.runAi();
  }

  view(): unknown {
    return bingoGame.projectForPlayer({
      state: this.state,
      viewer: { userId: HUMAN_ID, seatIndex: this.humanSeat },
    });
  }

  isOver(): boolean {
    return bingoGame.evaluateResult(this.state) !== null;
  }

  outcome(): 'win' | 'lose' | 'draw' | null {
    const r = bingoGame.evaluateResult(this.state);
    if (!r) return null;
    if (r.winnerId == null) return 'draw';
    return r.winnerId === HUMAN_ID ? 'win' : 'lose';
  }

  canDraw(): boolean {
    return !this.isOver() && this.legal(this.humanSeat).some((c) => c.type === 'DRAW');
  }

  canClaim(): boolean {
    return !this.isOver() && this.legal(this.humanSeat).some((c) => c.type === 'CLAIM_BINGO');
  }

  draw(): BingoActionResult {
    return this.act({ type: 'DRAW' });
  }

  mark(number: number): BingoActionResult {
    return this.act({ type: 'MARK', number });
  }

  claim(): BingoActionResult {
    return this.act({ type: 'CLAIM_BINGO' });
  }

  // ---------- internals ----------

  private actor(seat: number) {
    return { userId: seat === 0 ? HUMAN_ID : CPU_ID, seatIndex: seat };
  }

  private legal(seat: number): readonly BingoCommand[] {
    return bingoGame.enumerateCommands?.({ state: this.state, actor: this.actor(seat) }) ?? [];
  }

  private act(cmd: BingoCommand): BingoActionResult {
    if (this.isOver()) return { ok: false, reason: 'Game is over' };
    const v = bingoGame.validateCommand({
      state: this.state,
      actor: this.actor(this.humanSeat),
      command: cmd,
      serverReceivedAtMs: 0,
    });
    if (!v.valid) return { ok: false, reason: v.reason };
    this.apply(cmd, this.humanSeat);
    this.runAi();
    return { ok: true };
  }

  private apply(cmd: BingoCommand, seat: number): void {
    const events = bingoGame.decide({
      state: this.state,
      actor: this.actor(seat),
      command: cmd,
      serverReceivedAtMs: 0,
    });
    for (const e of events) this.state = bingoGame.evolve(this.state, e);
  }

  // Computer marks any called numbers on its card.
  private aiMarkAll(): void {
    let guard = 0;
    let cmd: BingoCommand | undefined;
    while (
      !this.isOver() &&
      (cmd = this.legal(this.aiSeat).find((c) => c.type === 'MARK')) &&
      guard++ < 300
    ) {
      this.apply(cmd, this.aiSeat);
    }
  }

  // The computer marks, then on its own turn claims (if winning) or draws — never
  // acting on the human's turn beyond marking.
  private runAi(): void {
    this.aiMarkAll();
    let guard = 0;
    while (!this.isOver() && this.state.turnSeat === this.aiSeat && guard++ < 300) {
      const claim = this.legal(this.aiSeat).find((c) => c.type === 'CLAIM_BINGO');
      if (claim) {
        this.apply(claim, this.aiSeat);
        break;
      }
      const drawCmd = this.legal(this.aiSeat).find((c) => c.type === 'DRAW');
      if (!drawCmd) break;
      this.apply(drawCmd, this.aiSeat);
      this.aiMarkAll();
    }
  }
}
