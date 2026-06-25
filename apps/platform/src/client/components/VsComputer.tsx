import { useReducer, useState } from 'react';
import { LocalGame } from '../realtime/LocalGame.js';
import { BingoLocalGame } from '../realtime/BingoLocalGame.js';
import type { Difficulty } from '../../games/_shared/ai.js';
import type { StrategyGameId } from './vsBoard.js';
import { GameBoard, type BoardViewLike } from './GameBoard.js';
import { BubbleSiegeArena } from './BubbleSiegeArena.js';
import { useI18n } from '../i18n/i18n.js';

// Same-device "play vs computer" UI. Strategy games (Gomoku/Chess/Janggi) use the
// generic LocalGame + shared GameBoard renderer; Bingo uses its own driver/panel.
// The (already-tested) drivers run the AI reply. No server / WebSocket involved.

type GameId = StrategyGameId | 'bingo' | 'bubble-siege';

const GAMES: { id: GameId; name: string; sub: string }[] = [
  { id: 'gomoku', name: 'Gomoku', sub: '오목' },
  { id: 'chess', name: 'Chess', sub: '체스' },
  { id: 'janggi', name: 'Janggi', sub: '장기' },
  { id: 'bingo', name: 'Bingo', sub: '빙고' },
  { id: 'bubble-siege', name: 'Bubble', sub: '버블시즈' },
];

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

interface GomokuView {
  board: number[];
  size: number;
  mySeat: number | null;
  lastMove: { x: number; y: number } | null;
}
interface ChessView {
  board: string[];
  myColor: 'w' | 'b' | null;
  lastMove: { from: number; to: number } | null;
}
interface JanggiView {
  board: string[];
  mySeat: number | null;
  lastMove: { from: number; to: number } | null;
}

type Active =
  | { kind: 'strategy'; game: LocalGame; gameId: StrategyGameId }
  | { kind: 'bingo'; game: BingoLocalGame }
  | { kind: 'bubble' }
  | null;

export function VsComputer() {
  const { t } = useI18n();
  const [gameId, setGameId] = useState<GameId>('gomoku');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [active, setActive] = useState<Active>(null);

  const start = () => {
    const seed = Math.random().toString(36).slice(2);
    if (gameId === 'bingo') {
      setActive({ kind: 'bingo', game: new BingoLocalGame({ seed }) });
    } else if (gameId === 'bubble-siege') {
      setActive({ kind: 'bubble' });
    } else {
      setActive({ kind: 'strategy', game: new LocalGame({ gameId, difficulty, seed }), gameId });
    }
  };

  const reset = () => setActive(null);

  if (!active) {
    return (
      <section style={styles.card} id="vs-computer-setup">
        <h2 style={styles.header}>{t('vs.title')}</h2>
        <p style={styles.desc}>{t('vs.desc')}</p>

        <div style={styles.label}>{t('vs.game')}</div>
        <div style={styles.optionRow}>
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGameId(g.id)}
              style={gameId === g.id ? styles.optActive : styles.opt}
              id={`vs-game-${g.id}`}
            >
              {g.name}
              <span style={styles.optSub}>{g.sub}</span>
            </button>
          ))}
        </div>

        {gameId !== 'bingo' ? (
          <>
            <div style={styles.label}>{t('vs.difficulty')}</div>
            <div style={styles.optionRow}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  style={difficulty === d.id ? styles.optActive : styles.opt}
                  id={`vs-diff-${d.id}`}
                >
                  {t(`vs.${d.id}`)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p style={styles.desc}>{t('vs.bingoNoDiff')}</p>
        )}

        <button onClick={start} style={styles.primary} id="vs-start-btn">
          {t('vs.start')}
        </button>
      </section>
    );
  }

  if (active.kind === 'bingo') {
    return <BingoPanel game={active.game} onNew={start} onExit={reset} />;
  }

  if (active.kind === 'bubble') {
    return <BubbleSiegeArena difficulty={difficulty} onExit={reset} />;
  }

  return (
    <StrategyPanel
      game={active.game}
      gameId={active.gameId}
      difficulty={difficulty}
      onNew={start}
      onExit={reset}
    />
  );
}

// ---------- strategy games ----------

function StrategyPanel({
  game,
  gameId,
  difficulty,
  onNew,
  onExit,
}: {
  game: LocalGame;
  gameId: StrategyGameId;
  difficulty: Difficulty;
  onNew: () => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const [sel, setSel] = useState<number | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const outcome = game.outcome();
  const status = outcome
    ? outcome === 'win'
      ? t('vs.youWin')
      : outcome === 'lose'
        ? t('vs.youLose')
        : t('vs.draw')
    : game.isHumanTurn()
      ? t('vs.yourTurn')
      : t('vs.thinking');

  const onCellClick = (boardIdx: number) => {
    if (outcome || !game.isHumanTurn()) return;
    if (gameId === 'gomoku') {
      const v = game.view() as GomokuView;
      game.submit({ type: 'PLACE_STONE', x: boardIdx % v.size, y: Math.floor(boardIdx / v.size) });
      setSel(null);
      bump();
      return;
    }
    const ownPiece = isOwnPiece(game, gameId, boardIdx);
    if (sel === null) {
      if (ownPiece) setSel(boardIdx);
      return;
    }
    if (boardIdx === sel) {
      setSel(null);
      return;
    }
    if (ownPiece) {
      setSel(boardIdx);
      return;
    }
    const cmd =
      gameId === 'chess'
        ? { type: 'MOVE', from: sel, to: boardIdx, promotion: 'Q' }
        : { type: 'MOVE', from: sel, to: boardIdx };
    game.submit(cmd);
    setSel(null);
    bump();
  };

  return (
    <section style={styles.card} id="vs-computer-game">
      <h2 style={styles.header}>
        {GAMES.find((g) => g.id === gameId)!.name} {t('vs.vsLabel')} ({t(`vs.${difficulty}`)})
      </h2>
      <div style={outcome ? styles.statusDone : styles.status} id="vs-status">
        {status}
      </div>

      <div style={styles.boardWrap}>
        <GameBoard
          gameId={gameId}
          view={game.view() as BoardViewLike}
          sel={sel}
          targets={legalTargets(game, sel)}
          onCell={onCellClick}
        />
      </div>

      <div style={styles.controls}>
        <button onClick={onNew} style={styles.primary} id="vs-newgame-btn">
          {t('vs.newGame')}
        </button>
        <button onClick={onExit} style={styles.secondary} id="vs-change-btn">
          {t('vs.changeGame')}
        </button>
      </div>
    </section>
  );
}

function isOwnPiece(game: LocalGame, gameId: StrategyGameId, boardIdx: number): boolean {
  if (gameId === 'chess') {
    const v = game.view() as ChessView;
    const code = v.board[boardIdx];
    if (code === '') return false;
    const color = code === code.toUpperCase() ? 'w' : 'b';
    return color === v.myColor;
  }
  const v = game.view() as JanggiView;
  const code = v.board[boardIdx];
  if (code === '') return false;
  return code[0] === String(v.mySeat);
}

function legalTargets(game: LocalGame, sel: number | null): Set<number> {
  if (sel === null) return new Set();
  const cmds = game.legalCommands() as { from?: number; to?: number }[];
  const out = new Set<number>();
  for (const c of cmds) if (c.from === sel && typeof c.to === 'number') out.add(c.to);
  return out;
}

// ---------- bingo ----------

interface BingoView {
  size: number;
  winningLines: number;
  myCard: number[];
  myMarks: number[];
  myCompletedLines: number;
  called: number[];
  remaining: number;
  isMyTurn: boolean;
}

function BingoPanel({
  game,
  onNew,
  onExit,
}: {
  game: BingoLocalGame;
  onNew: () => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const v = game.view() as BingoView;
  const outcome = game.outcome();
  const called = new Set(v.called);
  const marked = new Set(v.myMarks);

  const status = outcome
    ? outcome === 'win'
      ? t('bingo.win')
      : outcome === 'lose'
        ? t('bingo.lose')
        : t('bingo.drawResult')
    : v.isMyTurn
      ? t('bingo.yourTurn')
      : t('bingo.cpuTurn');

  const onMark = (value: number) => {
    if (outcome || !called.has(value) || marked.has(value)) return;
    game.mark(value);
    bump();
  };

  const cells = v.myCard.map((value, i) => {
    const isMarked = marked.has(value);
    const isCalled = called.has(value);
    return (
      <button
        key={i}
        onClick={() => onMark(value)}
        style={{
          ...styles.gridCell,
          aspectRatio: '1 / 1',
          fontSize: '1rem',
          fontWeight: 700,
          color: isMarked ? '#fff' : '#0f172a',
          background: isMarked ? '#10b981' : isCalled ? '#fde68a' : '#e2e8f0',
          border: '1px solid #94a3b8',
        }}
      >
        {value}
      </button>
    );
  });

  return (
    <section style={styles.card} id="vs-computer-game">
      <h2 style={styles.header}>Bingo {t('vs.vsLabel')}</h2>
      <div style={outcome ? styles.statusDone : styles.status} id="vs-status">
        {status}
      </div>

      <div style={styles.boardWrap}>
        <div
          style={{ ...styles.grid, gridTemplateColumns: `repeat(${v.size}, 1fr)`, maxWidth: 320 }}
        >
          {cells}
        </div>
      </div>

      <div style={styles.bingoActions}>
        <button
          onClick={() => {
            game.draw();
            bump();
          }}
          disabled={!game.canDraw()}
          style={game.canDraw() ? styles.primary : styles.disabled}
          id="bingo-draw-btn"
        >
          {t('bingo.drawBtn')} ({v.remaining})
        </button>
        <button
          onClick={() => {
            game.claim();
            bump();
          }}
          disabled={!game.canClaim()}
          style={game.canClaim() ? styles.claim : styles.disabled}
          id="bingo-claim-btn"
        >
          {t('bingo.bingo')}
        </button>
      </div>

      <div style={styles.calledStrip}>
        {t('bingo.called')} {v.called.length ? v.called.slice(-12).join(' · ') : '—'}
      </div>

      <div style={styles.controls}>
        <button onClick={onNew} style={styles.primary} id="vs-newgame-btn">
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
  desc: { fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 },
  label: { fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.25rem' },
  optionRow: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const },
  opt: {
    flex: 1,
    minWidth: 70,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.75rem',
    color: '#cbd5e1',
    padding: '0.6rem 0.5rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.15rem',
  },
  optActive: {
    flex: 1,
    minWidth: 70,
    background: '#6366f1',
    border: '1px solid #6366f1',
    borderRadius: '0.75rem',
    color: '#fff',
    padding: '0.6rem 0.5rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.15rem',
    boxShadow: '0 0 12px rgba(99,102,241,0.3)',
  },
  optSub: { fontSize: '0.65rem', opacity: 0.7, fontWeight: 400 },
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
  claim: {
    background: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 700,
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  disabled: {
    background: 'rgba(255,255,255,0.05)',
    color: '#64748b',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.75rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'not-allowed',
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
  status: {
    textAlign: 'center' as const,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#a5b4fc',
    padding: '0.4rem',
  },
  statusDone: {
    textAlign: 'center' as const,
    fontSize: '1.1rem',
    fontWeight: 800,
    color: '#10b981',
    padding: '0.4rem',
  },
  boardWrap: { display: 'flex', justifyContent: 'center' },
  grid: {
    display: 'grid',
    width: '100%',
    gap: 0,
    borderRadius: '0.5rem',
    overflow: 'hidden',
  },
  gridCell: {
    aspectRatio: '1 / 1',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  stone: {
    width: '78%',
    height: '78%',
    borderRadius: '50%',
    display: 'block',
    boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
  },
  piece: { fontSize: 'min(6vw, 28px)', lineHeight: 1, userSelect: 'none' as const },
  janggiPiece: {
    fontSize: 'min(5vw, 22px)',
    fontWeight: 800,
    lineHeight: 1,
    userSelect: 'none' as const,
  },
  bingoActions: { display: 'flex', gap: '0.75rem', justifyContent: 'center' },
  calledStrip: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    textAlign: 'center' as const,
    fontFamily: 'monospace',
    wordBreak: 'break-word' as const,
  },
  controls: { display: 'flex', gap: '0.75rem' },
};
