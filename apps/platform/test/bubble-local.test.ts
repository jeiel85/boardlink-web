import { describe, it, expect, vi } from 'vitest';
import { BubbleSiegeLocalGame } from '../src/client/realtime/BubbleSiegeLocalGame.js';
import { bubbleSiegeBotCommand } from '../src/games/bubble-siege/ai.js';
import { bubbleSiegeGame, type BubbleSiegeState } from '../src/games/bubble-siege/index.js';

const PLAYERS = [
  { userId: 'human', displayName: 'You', seatIndex: 0 },
  { userId: 'cpu', displayName: 'Computer', seatIndex: 1 },
];

describe('bubble-siege bot', () => {
  function activeState(overrides: Partial<BubbleSiegeState>): BubbleSiegeState {
    const base = bubbleSiegeGame.createInitialState({
      config: bubbleSiegeGame.validateConfig({}),
      players: PLAYERS,
      seed: 's',
      startsAtServerMs: 0,
    });
    return { ...base, phase: 'ACTIVE', ...overrides };
  }

  it('spawns when it is the attacking side', () => {
    // round 1, firstAttacker B → bot (seat 1 = side B) attacks
    const s = activeState({ firstAttacker: 'B', currentRound: 1 });
    const cmd = bubbleSiegeBotCommand(s, 1, () => 0.5, 1);
    expect(cmd?.type).toBe('SPAWN_BALL');
    if (cmd?.type === 'SPAWN_BALL') {
      expect(cmd.x).toBeGreaterThanOrEqual(65);
      expect(cmd.x).toBeLessThanOrEqual(935);
    }
  });

  it('pops the oldest ball when defending', () => {
    // round 1, firstAttacker A → bot (side B) defends
    const s = activeState({
      firstAttacker: 'A',
      currentRound: 1,
      balls: {
        old: { id: 'old', x: 500, y: 500, radius: 45, spawnedAtServerMs: 10 },
        young: { id: 'young', x: 200, y: 200, radius: 45, spawnedAtServerMs: 99 },
      },
    });
    const cmd = bubbleSiegeBotCommand(s, 1, () => 0.5, 2);
    expect(cmd).toEqual({ type: 'POP_BALL', commandId: 'bot2', ballId: 'old', x: 500, y: 500 });
  });

  it('returns null outside an active round', () => {
    expect(bubbleSiegeBotCommand(activeState({ phase: 'COUNTDOWN' }), 1, () => 0.5, 3)).toBeNull();
  });
});

describe('BubbleSiegeLocalGame driver', () => {
  it('advances through countdown + both rounds to a decisive result', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const g = new BubbleSiegeLocalGame({ difficulty: 'hard', seed: 'drive' });
      g.start(() => {});

      // COUNTDOWN(3s) → ACTIVE(10s) → ROUND_END → COUNTDOWN(3s) → ACTIVE(10s) → GAME_OVER
      // advance comfortably past 2 full rounds.
      vi.advanceTimersByTime(30_000);

      expect(g.isOver()).toBe(true);
      expect(['win', 'lose', 'draw']).toContain(g.outcome());
      g.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the human spawn while attacking during an active round', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const g = new BubbleSiegeLocalGame({ difficulty: 'easy', seed: 'spawn-seed' });
      g.start(() => {});
      vi.advanceTimersByTime(3_100); // into ACTIVE round 1
      const v1 = g.view() as { phase: string; myRole: string; balls: unknown[] };
      expect(v1.phase).toBe('ACTIVE');
      if (v1.myRole === 'ATTACKER') {
        const before = v1.balls.length;
        g.spawn(500, 500);
        const v2 = g.view() as { balls: unknown[] };
        expect(v2.balls.length).toBe(before + 1);
      }
      g.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
