import { useEffect, useMemo, useReducer, useState } from 'react';
import { BubbleSiegeLocalGame } from '../realtime/BubbleSiegeLocalGame.js';
import type { Difficulty } from '../../games/_shared/ai.js';
import { useI18n } from '../i18n/i18n.js';

// Real-time arena for Bubble Siege vs the computer. Self-manages the driver's
// timers (created in a memo, started/stopped via effect). A light UI ticker
// re-renders so the countdown/round clock animates between game events.

const ARENA = 1000;
const SIZE = 320; // px
const SCALE = SIZE / ARENA;

interface Ball {
  id: string;
  x: number;
  y: number;
  radius: number;
}
interface View {
  phase: 'COUNTDOWN' | 'ACTIVE' | 'GAME_OVER';
  currentRound: number;
  myRole: 'ATTACKER' | 'DEFENDER' | 'SPECTATOR';
  balls: Ball[];
  activeBallCount: number;
  countdownEndMs: number;
  roundEndMs: number;
  scoreA: number | null;
  scoreB: number | null;
}

export function BubbleSiegeArena({
  difficulty,
  onExit,
}: {
  difficulty: Difficulty;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const [gen, setGen] = useState(0);
  const game = useMemo(
    () => new BubbleSiegeLocalGame({ difficulty, seed: `${gen}-${Date.now()}` }),
    [gen, difficulty],
  );
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    game.start(() => bump());
    const ui = setInterval(() => bump(), 200); // animate the clock
    return () => {
      game.destroy();
      clearInterval(ui);
    };
  }, [game]);

  const v = game.view() as View;
  const outcome = game.outcome();
  const now = Date.now();
  const secsLeft =
    v.phase === 'COUNTDOWN'
      ? Math.max(0, Math.ceil((v.countdownEndMs - now) / 1000))
      : v.phase === 'ACTIVE'
        ? Math.max(0, Math.ceil((v.roundEndMs - now) / 1000))
        : 0;

  const isAttacker = v.myRole === 'ATTACKER';

  const onArenaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (outcome || v.phase !== 'ACTIVE' || !isAttacker) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * ARENA;
    const y = ((e.clientY - rect.top) / rect.height) * ARENA;
    game.spawn(x, y);
  };

  const onBallClick = (e: React.MouseEvent<HTMLButtonElement>, b: Ball) => {
    e.stopPropagation();
    if (outcome || v.phase !== 'ACTIVE' || isAttacker) return;
    game.pop(b.id, b.x, b.y);
  };

  const status = outcome
    ? outcome === 'win'
      ? t('vs.youWin')
      : outcome === 'lose'
        ? t('vs.youLose')
        : t('vs.draw')
    : v.phase === 'COUNTDOWN'
      ? t('bubble.starting', { n: v.currentRound, s: secsLeft })
      : v.phase === 'ACTIVE'
        ? isAttacker
          ? t('bubble.attackHint', { s: secsLeft })
          : t('bubble.defendHint', { s: secsLeft })
        : t('bubble.roundOver');

  return (
    <section style={styles.card} id="vs-computer-game">
      <h2 style={styles.header}>
        Bubble Siege {t('vs.vsLabel')} ({t(`vs.${difficulty}`)})
      </h2>

      <div style={styles.scoreRow}>
        <span>
          {t('bubble.round')} <strong>{v.currentRound}</strong>/2
        </span>
        <span style={isAttacker ? styles.attackBadge : styles.defendBadge}>
          {v.myRole === 'ATTACKER'
            ? t('bubble.attacker')
            : v.myRole === 'DEFENDER'
              ? t('bubble.defender')
              : v.myRole}
        </span>
        <span>
          You <strong>{v.scoreA ?? '–'}</strong> · CPU <strong>{v.scoreB ?? '–'}</strong>
        </span>
      </div>

      <div style={outcome ? styles.statusDone : styles.status} id="vs-status">
        {status}
      </div>

      <div style={styles.arenaWrap}>
        <div
          onClick={onArenaClick}
          style={{
            ...styles.arena,
            width: SIZE,
            height: SIZE,
            cursor: !outcome && v.phase === 'ACTIVE' && isAttacker ? 'crosshair' : 'default',
          }}
        >
          {v.balls.map((b) => (
            <button
              key={b.id}
              onClick={(e) => onBallClick(e, b)}
              style={{
                ...styles.ball,
                left: b.x * SCALE - b.radius * SCALE,
                top: b.y * SCALE - b.radius * SCALE,
                width: b.radius * 2 * SCALE,
                height: b.radius * 2 * SCALE,
                cursor: !outcome && v.phase === 'ACTIVE' && !isAttacker ? 'pointer' : 'default',
                pointerEvents: !outcome && v.phase === 'ACTIVE' && !isAttacker ? 'auto' : 'none',
              }}
              aria-label="ball"
            />
          ))}
          {v.phase === 'COUNTDOWN' && <div style={styles.countdown}>{secsLeft}</div>}
        </div>
      </div>

      <div style={styles.controls}>
        <button onClick={() => setGen((g) => g + 1)} style={styles.primary} id="vs-newgame-btn">
          {t('vs.newGame')}
        </button>
        <button onClick={onExit} style={styles.secondary} id="vs-change-btn">
          {t('vs.changeGame')}
        </button>
      </div>
    </section>
  );
}

const styles = {
  card: {
    background: 'rgba(30, 41, 59, 0.4)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '2rem',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  header: { fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#f8fafc' },
  scoreRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.85rem',
    color: '#cbd5e1',
  },
  attackBadge: {
    fontSize: '0.7rem',
    fontWeight: 800,
    color: '#fca5a5',
    background: 'rgba(239,68,68,0.12)',
    padding: '0.2rem 0.6rem',
    borderRadius: '1rem',
  },
  defendBadge: {
    fontSize: '0.7rem',
    fontWeight: 800,
    color: '#93c5fd',
    background: 'rgba(59,130,246,0.12)',
    padding: '0.2rem 0.6rem',
    borderRadius: '1rem',
  },
  status: { textAlign: 'center' as const, fontSize: '0.9rem', fontWeight: 600, color: '#a5b4fc' },
  statusDone: {
    textAlign: 'center' as const,
    fontSize: '1.1rem',
    fontWeight: 800,
    color: '#10b981',
  },
  arenaWrap: { display: 'flex', justifyContent: 'center' },
  arena: {
    position: 'relative' as const,
    background: 'radial-gradient(circle at 50% 40%, #1e293b, #0f172a)',
    border: '2px solid rgba(99,102,241,0.4)',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    touchAction: 'none' as const,
  },
  ball: {
    position: 'absolute' as const,
    borderRadius: '50%',
    border: 'none',
    background: 'radial-gradient(circle at 35% 30%, #a5b4fc, #6366f1)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
    padding: 0,
  },
  countdown: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '4rem',
    fontWeight: 800,
    color: 'rgba(255,255,255,0.85)',
  },
  controls: { display: 'flex', gap: '0.75rem' },
  primary: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  secondary: {
    background: 'transparent',
    color: '#f8fafc',
    border: '1px solid rgba(255,255,255,0.2)',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
};
