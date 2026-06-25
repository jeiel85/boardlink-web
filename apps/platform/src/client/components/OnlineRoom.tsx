import { useMemo, useState } from 'react';
import { useRoom } from '../realtime/useRoom.js';
import { getGame } from '../../worker/room/gameRegistry.js';
import { GameBoard, type BoardViewLike } from './GameBoard.js';
import type { StrategyGameId } from './vsBoard.js';

// Online multiplayer UI: create/join a room, lobby (ready + owner start), and an
// in-match board. Reuses the same pure game modules as the server to fold
// authoritative GAME_EVENTs into a live state and render the shared GameBoard.
//
// Renderers exist for the turn-based strategy games; other games show a status
// fallback. Requires the worker (wrangler dev / deployed) for the WebSocket.

const ONLINE_GAMES: { id: StrategyGameId; name: string }[] = [
  { id: 'gomoku', name: 'Gomoku 오목' },
  { id: 'chess', name: 'Chess 체스' },
  { id: 'janggi', name: 'Janggi 장기' },
];

const STRATEGY = new Set<string>(['gomoku', 'chess', 'janggi']);

// ---------- home (create / join) ----------

export function OnlineHome({
  sessionToken,
  navigate,
}: {
  sessionToken: string | null;
  navigate: (path: string) => void;
}) {
  const [gameId, setGameId] = useState<StrategyGameId>('gomoku');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!sessionToken) {
      setError('Identity not ready yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ gameId }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const data = (await res.json()) as { roomCode: string };
      navigate(`/room/${data.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={s.card} id="online-home">
      <h2 style={s.header}>🌐 Play Online</h2>
      <p style={s.desc}>Create a room and share the code, or join a friend&apos;s room.</p>

      <div style={s.label}>Game</div>
      <div style={s.row}>
        {ONLINE_GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setGameId(g.id)}
            style={gameId === g.id ? s.optActive : s.opt}
            id={`online-game-${g.id}`}
          >
            {g.name}
          </button>
        ))}
      </div>
      <button
        onClick={create}
        disabled={busy || !sessionToken}
        style={s.primary}
        id="online-create-btn"
      >
        {busy ? 'Creating…' : 'Create Room'}
      </button>

      <div style={s.divider} />

      <div style={s.label}>Join with a code</div>
      <div style={s.row}>
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7M2QA"
          style={s.input}
          id="online-join-input"
        />
        <button
          onClick={() => joinCode.trim() && navigate(`/room/${joinCode.trim()}`)}
          style={s.primary}
          id="online-join-btn"
        >
          Join
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}
      {!sessionToken && <div style={s.muted}>Preparing your identity…</div>}
    </section>
  );
}

// ---------- room (lobby + match) ----------

export function OnlineRoom({
  roomCode,
  sessionToken,
  myId,
  onExit,
}: {
  roomCode: string;
  sessionToken: string | null;
  myId: string | null;
  onExit: () => void;
}) {
  const room = useRoom({ roomCode, sessionToken });

  const conn = room.connectionState;
  const connLabel =
    conn === 'IN_ROOM'
      ? 'Connected'
      : conn === 'CONNECTING' || conn === 'AUTHENTICATING' || conn === 'AUTHENTICATED'
        ? 'Connecting…'
        : conn === 'CLOSED'
          ? 'Disconnected'
          : conn;

  const inMatch = room.phase === 'IN_MATCH' || room.phase === 'COMPLETED';

  return (
    <section style={s.card} id="room-page">
      <div style={s.roomHead}>
        <h2 style={s.header}>🎮 Room {room.roomCode || roomCode}</h2>
        <span style={s.connBadge}>{connLabel}</span>
      </div>

      {room.error && <div style={s.error}>{room.error}</div>}

      {!sessionToken ? (
        <p style={s.muted}>Preparing your identity…</p>
      ) : inMatch && room.gameId ? (
        <OnlineMatch room={room} myId={myId} />
      ) : (
        <OnlineLobby room={room} myId={myId} />
      )}

      <button onClick={onExit} style={s.secondary} id="leave-room-button">
        Leave Room
      </button>
    </section>
  );
}

type RoomApi = ReturnType<typeof useRoom>;

function OnlineLobby({ room, myId }: { room: RoomApi; myId: string | null }) {
  const [gameId, setGameId] = useState<StrategyGameId>('gomoku');
  const isOwner = !!myId && room.ownerId === myId;
  const me = room.members.find((m) => m.userId === myId);
  const activeMembers = room.members.filter((m) => m.status !== 'LEFT');

  return (
    <div style={s.col}>
      <div style={s.shareRow}>
        <span style={s.label}>Share this code</span>
        <span style={s.codeBig} id="room-share-code">
          {room.roomCode}
        </span>
      </div>

      <div style={s.label}>Players ({activeMembers.length})</div>
      <div style={s.col}>
        {activeMembers.map((m) => (
          <div key={m.userId} style={s.memberRow}>
            <span style={s.memberName}>
              {m.displayName}
              {m.userId === room.ownerId && ' 👑'}
              {m.userId === myId && ' (you)'}
            </span>
            <span style={m.ready ? s.readyOn : s.readyOff}>{m.ready ? 'Ready' : 'Not ready'}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => room.setReady(!me?.ready)}
        style={me?.ready ? s.secondary : s.primary}
        id="ready-toggle-btn"
        disabled={room.connectionState !== 'IN_ROOM'}
      >
        {me?.ready ? 'Cancel Ready' : "I'm Ready"}
      </button>

      {isOwner && (
        <>
          <div style={s.divider} />
          <div style={s.label}>Start a match (owner)</div>
          <div style={s.row}>
            {ONLINE_GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setGameId(g.id)}
                style={gameId === g.id ? s.optActive : s.opt}
              >
                {g.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => room.requestMatchStart(gameId)}
            style={s.primary}
            id="start-match-btn"
            disabled={activeMembers.length < 2 || room.connectionState !== 'IN_ROOM'}
          >
            Start Match
          </button>
          {activeMembers.length < 2 && <div style={s.muted}>Waiting for another player…</div>}
        </>
      )}
    </div>
  );
}

function OnlineMatch({ room, myId }: { room: RoomApi; myId: string | null }) {
  const [sel, setSel] = useState<number | null>(null);
  const gameId = room.gameId!;
  const mod = getGame(gameId);

  const live = useMemo(() => {
    if (!mod || room.matchState == null) return null;
    let st = mod.deserializeState(room.matchState);
    for (const e of room.gameEvents) st = mod.evolve(st, e);
    return st;
  }, [mod, room.matchState, room.gameEvents]);

  if (!mod || live == null) return <p style={s.muted}>Loading match…</p>;

  const seats = (live as { seats?: string[] }).seats ?? [];
  const mySeat = myId ? seats.indexOf(myId) : -1;
  const view = mod.projectForPlayer({
    state: live,
    viewer: { userId: myId ?? '', seatIndex: mySeat < 0 ? null : mySeat },
  }) as BoardViewLike & { isMyTurn?: boolean };

  if (!STRATEGY.has(gameId)) {
    return <p style={s.muted}>Match in progress ({gameId}). No board renderer yet.</p>;
  }

  const result = room.matchResult as { winnerId?: string | null } | null;
  const done = room.phase === 'COMPLETED';
  const status = done
    ? result && result.winnerId === myId
      ? '🎉 You win!'
      : result && result.winnerId == null
        ? '🤝 Draw'
        : '💻 You lose'
    : view.isMyTurn
      ? 'Your turn'
      : "Opponent's turn";

  const targets = (() => {
    if (sel === null) return new Set<number>();
    const cmds = (mod.enumerateCommands?.({
      state: live,
      actor: { userId: myId ?? '', seatIndex: mySeat },
    }) ?? []) as { from?: number; to?: number }[];
    const out = new Set<number>();
    for (const c of cmds) if (c.from === sel && typeof c.to === 'number') out.add(c.to);
    return out;
  })();

  const send = (cmd: unknown) => {
    if (room.matchId) room.sendCommand(room.matchId, cmd);
  };

  const onCell = (idx: number) => {
    if (done || !view.isMyTurn) return;
    if (gameId === 'gomoku') {
      const size = (view.size as number) ?? 15;
      send({ type: 'PLACE_STONE', x: idx % size, y: Math.floor(idx / size) });
      setSel(null);
      return;
    }
    const code = view.board[idx] as string;
    const mine =
      code !== '' &&
      (gameId === 'chess'
        ? (code === code.toUpperCase() ? 'w' : 'b') === view.myColor
        : code[0] === String(mySeat));
    if (sel === null) {
      if (mine) setSel(idx);
      return;
    }
    if (idx === sel) {
      setSel(null);
      return;
    }
    if (mine) {
      setSel(idx);
      return;
    }
    send(
      gameId === 'chess'
        ? { type: 'MOVE', from: sel, to: idx, promotion: 'Q' }
        : { type: 'MOVE', from: sel, to: idx },
    );
    setSel(null);
  };

  return (
    <div style={s.col}>
      <div style={done ? s.statusDone : s.status} id="match-status">
        {status}
      </div>
      <GameBoard
        gameId={gameId as StrategyGameId}
        view={view}
        sel={sel}
        targets={targets}
        onCell={onCell}
      />
      {room.ping != null && <div style={s.muted}>ping {room.ping}ms</div>}
    </div>
  );
}

const s = {
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
  muted: { fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' as const },
  label: { fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 },
  col: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  row: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const },
  opt: {
    flex: 1,
    minWidth: 90,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.75rem',
    color: '#cbd5e1',
    padding: '0.6rem 0.5rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  optActive: {
    flex: 1,
    minWidth: 90,
    background: '#6366f1',
    border: '1px solid #6366f1',
    borderRadius: '0.75rem',
    color: '#fff',
    padding: '0.6rem 0.5rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
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
  input: {
    flex: 1,
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem',
    color: '#f8fafc',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
  },
  divider: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '0.25rem 0' },
  error: {
    fontSize: '0.85rem',
    color: '#fca5a5',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.2)',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
  },
  roomHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  connBadge: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#a5b4fc',
    background: 'rgba(99,102,241,0.12)',
    padding: '0.2rem 0.6rem',
    borderRadius: '1rem',
  },
  shareRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.25rem',
    background: 'rgba(99,102,241,0.06)',
    padding: '0.75rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(99,102,241,0.15)',
  },
  codeBig: {
    fontSize: '1.8rem',
    fontWeight: 800,
    letterSpacing: '0.25em',
    color: '#818cf8',
    fontFamily: 'monospace',
  },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '0.5rem',
  },
  memberName: { fontSize: '0.9rem', color: '#f1f5f9', fontWeight: 600 },
  readyOn: { fontSize: '0.75rem', fontWeight: 700, color: '#10b981' },
  readyOff: { fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' },
  status: { textAlign: 'center' as const, fontSize: '0.95rem', fontWeight: 600, color: '#a5b4fc' },
  statusDone: {
    textAlign: 'center' as const,
    fontSize: '1.1rem',
    fontWeight: 800,
    color: '#10b981',
  },
};
