// Reactive bot for Bubble Siege (real-time, so no minimax). It proposes one
// command for the bot's current role; the driver validates it against the rules
// (cooldown, ball cap, min-distance) and silently drops invalid proposals.
//   - as attacker: spawn a ball at a random in-bounds point.
//   - as defender: pop the oldest live ball.

import type { BubbleSiegeState, BubbleSiegeCommand, Side } from './index.js';

const ARENA = 1000;

function attackerSideForRound(state: BubbleSiegeState): Side {
  if (state.currentRound === 1) return state.firstAttacker;
  return state.firstAttacker === 'A' ? 'B' : 'A';
}

export function bubbleSiegeBotCommand(
  state: BubbleSiegeState,
  botSeat: number,
  rng: () => number,
  idNum: number,
): BubbleSiegeCommand | null {
  if (state.phase !== 'ACTIVE') return null;
  const botSide: Side = botSeat === 0 ? 'A' : 'B';
  const isAttacker = attackerSideForRound(state) === botSide;
  const commandId = `bot${idNum}`;

  if (isAttacker) {
    const min = state.ballRadius + state.edgeMargin;
    const max = ARENA - state.ballRadius - state.edgeMargin;
    const span = max - min;
    const x = min + Math.floor(rng() * (span + 1));
    const y = min + Math.floor(rng() * (span + 1));
    return { type: 'SPAWN_BALL', commandId, x, y };
  }

  // defender: pop the oldest live ball
  const balls = Object.values(state.balls);
  if (balls.length === 0) return null;
  balls.sort((a, b) => a.spawnedAtServerMs - b.spawnedAtServerMs);
  const ball = balls[0];
  return { type: 'POP_BALL', commandId, ballId: ball.id, x: ball.x, y: ball.y };
}
