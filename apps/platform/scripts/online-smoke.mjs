// Headless end-to-end smoke test for online multiplayer against a live worker.
// Two real WebSocket clients run through the full flow, plus a reconnect check.
//
// Scenario 1: identity (ECDSA challenge/verify) → create room → both join →
//   owner starts a Gomoku match → players alternate until one wins → COMPLETED.
// Scenario 2: start a match, play a couple of moves, drop one client, reconnect
//   it, and assert it restores the in-progress match (gameId + non-empty state).
//
// Usage: node scripts/online-smoke.mjs [baseUrl]   (default: live workers.dev)
// Requires Node 22+ (global WebSocket with a `headers` option for Origin).

const BASE = (process.argv[2] || 'https://boardlink.jeiel85.workers.dev').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const ORIGIN = BASE; // allowed: ends with .workers.dev

const enc = new TextEncoder();
const hex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function authenticate(displayName) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const { challenge, serverToken } = await (
    await fetch(`${BASE}/api/auth/challenge`, { method: 'POST' })
  ).json();
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    enc.encode(challenge),
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const vRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverToken, signature: hex(sig), publicKeyJwk, displayName }),
  });
  if (!vRes.ok) throw new Error(`verify failed ${vRes.status}: ${await vRes.text()}`);
  const { sessionToken } = await vRes.json();
  return { sessionToken, publicId: sessionToken.split(':')[0], displayName };
}

async function createRoom(sessionToken, gameId) {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ gameId }),
  });
  if (!res.ok) throw new Error(`create room failed ${res.status}: ${await res.text()}`);
  return (await res.json()).roomCode;
}

let seq = 0;
function send(ws, messageType, payload) {
  seq++;
  ws.send(
    JSON.stringify({
      protocolVersion: 1,
      messageId: `${Date.now()}-${seq}-${Math.random().toString(36).slice(2)}`,
      messageType,
      clientSequence: seq,
      sentAtClientMs: Date.now(),
      payload,
    }),
  );
}

function connect(roomCode, user, onMsg) {
  const msgs = [];
  const ws = new WebSocket(`${WS_BASE}/room/${roomCode}/ws`, { headers: { Origin: ORIGIN } });
  ws.addEventListener('open', () =>
    send(ws, 'CLIENT_HELLO', {
      sessionToken: user.sessionToken,
      appVersion: '0.1.0',
      buildId: 'smoke',
      protocolVersion: '1.0.0',
      gameModuleVersions: {},
      capabilityFlags: [],
    }),
  );
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.messageType === 'SESSION_ACCEPTED') send(ws, 'ROOM_JOIN', { roomCode });
    msgs.push(m);
    if (onMsg) onMsg(m);
  });
  return { ws, msgs, user };
}

async function waitFor(client, type, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = client.msgs.find((x) => x.messageType === type);
    if (m) return m;
    await wait(50);
  }
  throw new Error(`timeout waiting for ${type} (${client.user.displayName})`);
}

// ---------- scenario 1: full match to a win ----------

async function fullMatch() {
  log('\n— scenario 1: full online match —');
  const alice = await authenticate('앨리스');
  const bob = await authenticate('밥');
  const roomCode = await createRoom(alice.sessionToken, 'gomoku');
  log(`  room ${roomCode}`);

  const st = {
    started: false,
    over: false,
    turn: 0,
    winnerSeat: -1,
    wc: 0,
    lc: 0,
    seats: [],
    matchId: null,
    aliceEv: false,
    bobEv: false,
    completed: null,
  };
  const sockets = {};
  const seatOf = (uid) => st.seats.indexOf(uid);

  const step = () => {
    if (st.over || !st.started) return;
    const mover = st.turn === seatOf(alice.publicId) ? 'alice' : 'bob';
    const [x, y] = st.turn === st.winnerSeat ? [st.wc++, 0] : [st.lc++, 5];
    send(sockets[mover].ws, 'GAME_COMMAND', {
      matchId: st.matchId,
      gamePayload: { type: 'PLACE_STONE', x, y },
    });
  };

  const onMsg = (who) => (m) => {
    if (m.messageType === 'ROOM_JOINED') {
      st[`joined_${who}`] = true;
      if (st.joined_alice && st.joined_bob && !st.started) {
        send(sockets.alice.ws, 'MATCH_START_REQUEST', { gameId: 'gomoku' });
      }
    } else if (m.messageType === 'MATCH_STARTED' && !st.started) {
      st.started = true;
      st.matchId = m.payload.matchId;
      st.seats = m.payload.initialState.seats;
      st.turn = m.payload.initialState.turnSeat;
      st.winnerSeat = st.turn;
      step();
    } else if (m.messageType === 'GAME_EVENT') {
      if (who === 'alice') st.aliceEv = true;
      if (who === 'bob') st.bobEv = true;
      const ev = m.payload.gamePayload;
      if (ev.type === 'GAME_WON') st.over = true;
      if (ev.type === 'STONE_PLACED' && who === 'alice' && !st.over) {
        st.turn = st.turn === 0 ? 1 : 0;
        step();
      }
    } else if (m.messageType === 'MATCH_COMPLETED') {
      st.over = true;
      st.completed = m.payload.result;
    }
  };

  sockets.alice = connect(roomCode, alice, onMsg('alice'));
  await wait(400);
  sockets.bob = connect(roomCode, bob, onMsg('bob'));

  const end = Date.now() + 20000;
  while (!st.completed && Date.now() < end) await wait(150);
  for (const s of Object.values(sockets)) s.ws.close();

  const problems = [];
  if (!st.started) problems.push('match never started');
  if (!st.completed) problems.push('match never completed (timeout)');
  if (!st.aliceEv || !st.bobEv) problems.push('cross-client GAME_EVENT broadcast failed');
  if (st.completed && ![alice.publicId, bob.publicId].includes(st.completed.winnerId))
    problems.push(`unexpected winnerId ${st.completed?.winnerId}`);
  if (problems.length) throw new Error('scenario 1 failed: ' + problems.join('; '));
  log(`  ✓ match completed, winner ${st.completed.winnerId === alice.publicId ? 'Alice' : 'Bob'}`);
}

// ---------- scenario 2: reconnect mid-match restores state ----------

async function reconnect() {
  log('\n— scenario 2: reconnect mid-match —');
  const alice = await authenticate('앨리스');
  const bob = await authenticate('밥');
  const roomCode = await createRoom(alice.sessionToken, 'gomoku');
  log(`  room ${roomCode}`);

  const a = connect(roomCode, alice);
  await wait(300);
  let b = connect(roomCode, bob);
  await waitFor(a, 'ROOM_JOINED');
  await waitFor(b, 'ROOM_JOINED');
  send(a.ws, 'MATCH_START_REQUEST', { gameId: 'gomoku' });
  const started = await waitFor(a, 'MATCH_STARTED');
  const seats = started.payload.initialState.seats;
  const matchId = started.payload.matchId;
  const turn = started.payload.initialState.turnSeat;

  // play one move by whoever is to move
  const firstMover = turn === seats.indexOf(alice.publicId) ? a : b;
  send(firstMover.ws, 'GAME_COMMAND', {
    matchId,
    gamePayload: { type: 'PLACE_STONE', x: 3, y: 3 },
  });
  await waitFor(a, 'GAME_EVENT');
  log('  one move played; dropping Bob…');

  // drop Bob and reconnect with a fresh connection
  b.ws.close();
  await wait(500);
  b = connect(roomCode, bob);

  const rejoined = await waitFor(b, 'ROOM_JOINED');
  // Mirror RoomConnection's auto-resync: pull the authoritative state.
  send(b.ws, 'RESYNC_REQUEST', {
    matchId: rejoined.payload.matchId,
    lastAppliedServerSequence: 0,
    lastStateHash: '',
  });
  const snapshot = await waitFor(b, 'STATE_SNAPSHOT');
  b.ws.close();
  a.ws.close();

  const problems = [];
  if (rejoined.payload.phase !== 'IN_MATCH')
    problems.push(`rejoin phase ${rejoined.payload.phase} (want IN_MATCH)`);
  if (rejoined.payload.gameId !== 'gomoku')
    problems.push(`rejoin gameId ${rejoined.payload.gameId} (want gomoku)`);
  if (!rejoined.payload.matchId) problems.push('rejoin missing matchId');
  const moveCount = snapshot.payload.state?.moveCount;
  if (!(moveCount >= 1)) problems.push(`snapshot moveCount ${moveCount} (want ≥1)`);
  if (problems.length) throw new Error('scenario 2 failed: ' + problems.join('; '));
  log(
    `  ✓ reconnect restored match (gameId=${rejoined.payload.gameId}, snapshot moveCount=${moveCount})`,
  );
}

async function main() {
  log(`▶ online smoke test against ${BASE}`);
  await fullMatch();
  await reconnect();
  log('\n✓ ALL PASS');
  process.exit(0);
}

main().catch((e) => {
  log('\n✗ FAIL', e.message ?? e);
  process.exit(1);
});
