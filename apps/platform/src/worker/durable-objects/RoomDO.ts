import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../index.js';
import { parseC2SMessage } from '@boardlink/protocol';
import type { RoomPhase } from '@boardlink/protocol';
import { verifySessionToken } from '../auth.js';
import { getGame } from '../room/gameRegistry.js';
import { memberRowToDto } from '../room/roomState.js';
import type { MemberRow } from '../room/roomState.js';

// ---------- constants ----------

const ROOM_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_MEMBERS = 8;
const MSG_RATE_LIMIT = 30;
const MSG_RATE_WINDOW_MS = 1_000;
const MAX_MSG_BYTES = 16 * 1024;
const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_SWEEP_INTERVAL = 200; // sweep after this many new messages

// ---------- WS attachment ----------

interface WsAttachment {
  userId: string;
  displayName: string;
  authenticated: boolean;
  msgTimestamps: number[];
  msgCount: number;
}

// ---------- RoomDO ----------

export class RoomDO extends DurableObject<Env> {
  private dedupSweepCounter = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() => Promise.resolve(this.initSchema()));
  }

  private initSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CONNECTED',
        is_owner INTEGER NOT NULL DEFAULT 0,
        seat_index INTEGER,
        ready INTEGER NOT NULL DEFAULT 0,
        resume_token TEXT,
        joined_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seen_message_ids (
        message_id TEXT PRIMARY KEY,
        seen_at INTEGER NOT NULL
      );
    `);
  }

  // -------- HTTP fetch --------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        type: 'RoomDO',
        id: this.ctx.id.toString(),
        phase: this.getMeta('phase') ?? 'UNINITIALIZED',
      });
    }

    if (url.pathname === '/create' && request.method === 'POST') {
      return this.handleCreate(request);
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade();
    }

    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Route not found' } },
      { status: 404 },
    );
  }

  // -------- SQLite helpers --------

  private getMeta(key: string): string | null {
    const rows = [
      ...this.ctx.storage.sql.exec<{ value: string }>(
        'SELECT value FROM room_meta WHERE key = ?',
        key,
      ),
    ];
    return rows[0]?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO room_meta (key, value) VALUES (?, ?)',
      key,
      value,
    );
  }

  private getPhase(): RoomPhase {
    return (this.getMeta('phase') ?? 'LOBBY') as RoomPhase;
  }

  private getAllMembers(): MemberRow[] {
    return [
      ...this.ctx.storage.sql.exec<MemberRow>(
        'SELECT user_id, display_name, status, is_owner, seat_index, ready, resume_token, joined_ms FROM members ORDER BY joined_ms ASC',
      ),
    ];
  }

  private getMemberRow(userId: string): MemberRow | null {
    const rows = [
      ...this.ctx.storage.sql.exec<MemberRow>(
        'SELECT user_id, display_name, status, is_owner, seat_index, ready, resume_token, joined_ms FROM members WHERE user_id = ?',
        userId,
      ),
    ];
    return rows[0] ?? null;
  }

  private upsertMember(m: MemberRow): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO members (user_id, display_name, status, is_owner, seat_index, ready, resume_token, joined_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         status = excluded.status,
         is_owner = excluded.is_owner,
         seat_index = excluded.seat_index,
         ready = excluded.ready,
         resume_token = excluded.resume_token`,
      m.user_id,
      m.display_name,
      m.status,
      m.is_owner,
      m.seat_index ?? null,
      m.ready,
      m.resume_token ?? null,
      m.joined_ms,
    );
  }

  private updateMemberStatus(userId: string, status: string): void {
    this.ctx.storage.sql.exec('UPDATE members SET status = ? WHERE user_id = ?', status, userId);
  }

  private isSeenMessageId(messageId: string): boolean {
    const rows = [
      ...this.ctx.storage.sql.exec<{ message_id: string }>(
        'SELECT message_id FROM seen_message_ids WHERE message_id = ?',
        messageId,
      ),
    ];
    return rows.length > 0;
  }

  private markMessageSeen(messageId: string): void {
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO seen_message_ids (message_id, seen_at) VALUES (?, ?)',
      messageId,
      Date.now(),
    );
    this.dedupSweepCounter++;
    if (this.dedupSweepCounter >= DEDUP_SWEEP_INTERVAL) {
      this.dedupSweepCounter = 0;
      this.ctx.storage.sql.exec(
        'DELETE FROM seen_message_ids WHERE seen_at < ?',
        Date.now() - DEDUP_TTL_MS,
      );
    }
  }

  private nextServerSequence(): number {
    const seq = parseInt(this.getMeta('server_sequence') ?? '0', 10) + 1;
    this.setMeta('server_sequence', String(seq));
    return seq;
  }

  private generateToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // -------- HTTP handlers --------

  private async handleCreate(request: Request): Promise<Response> {
    if (this.getMeta('phase')) {
      return Response.json({ status: 'exists', phase: this.getMeta('phase') });
    }
    const body = (await request.json()) as {
      roomCode: string;
      ownerId: string;
      ownerName: string;
      gameId?: string;
    };
    const { roomCode, ownerId, ownerName, gameId } = body;

    this.setMeta('room_code', roomCode);
    this.setMeta('owner_id', ownerId);
    this.setMeta('owner_name', ownerName);
    this.setMeta('phase', 'LOBBY');
    this.setMeta('created_ms', String(Date.now()));
    this.setMeta('expires_ms', String(Date.now() + ROOM_TTL_MS));
    this.setMeta('server_sequence', '0');
    if (gameId) this.setMeta('game_id', gameId);

    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);

    return Response.json({ status: 'created', roomCode });
  }

  private handleUpgrade(): Response {
    const phase = this.getMeta('phase');
    if (!phase || phase === 'CLOSED') {
      return Response.json(
        { error: { code: 'ROOM_CLOSED', message: 'Room not found or closed' } },
        { status: 404 },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    this.ctx.acceptWebSocket(server);
    const attachment: WsAttachment = {
      userId: '',
      displayName: '',
      authenticated: false,
      msgTimestamps: [],
      msgCount: 0,
    };
    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // -------- WebSocket hibernation handlers --------

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const msgSize =
      typeof rawMessage === 'string' ? rawMessage.length : (rawMessage as ArrayBuffer).byteLength;
    if (msgSize > MAX_MSG_BYTES) {
      this.sendError(ws, 'MESSAGE_TOO_LARGE', 'Message exceeds 16 KiB limit');
      return;
    }

    const raw =
      typeof rawMessage === 'string'
        ? rawMessage
        : new TextDecoder().decode(rawMessage as ArrayBuffer);

    const att = ws.deserializeAttachment() as WsAttachment;

    // Rate limiting
    const now = Date.now();
    const recent = att.msgTimestamps.filter((t) => now - t < MSG_RATE_WINDOW_MS);
    if (recent.length >= MSG_RATE_LIMIT) {
      this.sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Too many messages per second');
      return;
    }
    recent.push(now);
    att.msgTimestamps = recent;
    att.msgCount++;
    ws.serializeAttachment(att);

    const result = parseC2SMessage(raw);
    if (!result.ok) {
      this.sendError(ws, 'PARSE_ERROR', result.error);
      return;
    }

    const msg = result.message;

    // Deduplication
    if (msg.messageId && this.isSeenMessageId(msg.messageId)) {
      return;
    }
    if (msg.messageId) {
      this.markMessageSeen(msg.messageId);
    }

    // Auth gate
    if (!att.authenticated) {
      if (msg.messageType !== 'CLIENT_HELLO') {
        this.sendError(ws, 'AUTHENTICATION_REQUIRED', 'Send CLIENT_HELLO first');
        ws.close(4001, 'Unauthenticated');
        return;
      }
      await this.handleClientHello(ws, att, msg.payload as { sessionToken: string });
      return;
    }

    switch (msg.messageType) {
      case 'PING':
        this.handlePing(ws, msg.payload as { clientMs: number });
        break;
      case 'ROOM_JOIN':
        await this.handleRoomJoin(
          ws,
          att,
          msg.payload as { roomCode: string; resumeToken?: string },
        );
        break;
      case 'ROOM_LEAVE':
        await this.handleRoomLeave(ws, att);
        break;
      case 'ROOM_READY_SET':
        await this.handleRoomReadySet(ws, att, msg.payload as { ready: boolean });
        break;
      case 'MATCH_START_REQUEST':
        await this.handleMatchStartRequest(ws, att, msg.payload as { gameId: string });
        break;
      case 'GAME_COMMAND':
        await this.handleGameCommand(
          ws,
          att,
          msg.payload as { matchId: string; gamePayload: unknown },
        );
        break;
      case 'RESYNC_REQUEST':
        await this.handleResyncRequest(ws, att);
        break;
      case 'CLIENT_HELLO':
        // Re-hello on already-auth'd connection: no-op
        break;
      default:
        this.sendError(ws, 'UNKNOWN_MESSAGE_TYPE', `Unrecognised: ${msg.messageType}`);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const att = ws.deserializeAttachment() as WsAttachment | null;
    if (att?.authenticated && att.userId) {
      this.updateMemberStatus(att.userId, 'DISCONNECTED');
      this.broadcastExcept(ws, {
        messageType: 'ROOM_MEMBER_LEFT',
        payload: { userId: att.userId, serverMs: Date.now() },
      });
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const att = ws.deserializeAttachment() as WsAttachment | null;
    if (att?.authenticated && att.userId) {
      this.updateMemberStatus(att.userId, 'DISCONNECTED');
    }
  }

  async alarm(): Promise<void> {
    const matchAlarmMs = this.getMeta('match_alarm_ms');
    if (matchAlarmMs) {
      const alarmMs = parseInt(matchAlarmMs, 10);
      const now = Date.now();
      if (now >= alarmMs) {
        await this.handleMatchTick(now);
        return;
      }
    }
    // Room TTL expiry
    this.setMeta('phase', 'CLOSED');
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4002, 'Room expired');
      } catch {
        /* already closed */
      }
    }
  }

  // -------- Message handlers --------

  private async handleClientHello(
    ws: WebSocket,
    att: WsAttachment,
    payload: { sessionToken: string },
  ): Promise<void> {
    const user = await verifySessionToken(payload.sessionToken, this.env);
    if (!user) {
      this.send(ws, {
        messageType: 'SESSION_REJECTED',
        payload: {
          reason: 'AUTHENTICATION_REQUIRED',
          message: 'Invalid or expired session token',
        },
      });
      ws.close(4001, 'Auth failed');
      return;
    }

    att.userId = user.publicId;
    att.displayName = user.displayName;
    att.authenticated = true;
    ws.serializeAttachment(att);

    this.send(ws, {
      messageType: 'SESSION_ACCEPTED',
      payload: { userId: user.publicId, displayName: user.displayName, serverMs: Date.now() },
    });
  }

  private handlePing(ws: WebSocket, payload: { clientMs: number }): void {
    this.send(ws, {
      messageType: 'PONG',
      payload: { clientMs: payload.clientMs, serverMs: Date.now() },
    });
  }

  private async handleRoomJoin(
    ws: WebSocket,
    att: WsAttachment,
    payload: { roomCode: string; resumeToken?: string },
  ): Promise<void> {
    const phase = this.getPhase();
    if (phase === 'CLOSED') {
      this.sendError(ws, 'ROOM_CLOSED', 'Room is closed');
      return;
    }

    const existing = this.getMemberRow(att.userId);
    const allMembers = this.getAllMembers();

    if (!existing) {
      if (allMembers.length >= MAX_MEMBERS) {
        this.sendError(ws, 'ROOM_FULL', 'Room is at maximum capacity');
        return;
      }
      const isOwner = this.getMeta('owner_id') === att.userId;
      const newRow: MemberRow = {
        user_id: att.userId,
        display_name: att.displayName,
        status: 'CONNECTED',
        is_owner: isOwner ? 1 : 0,
        seat_index: allMembers.length,
        ready: 0,
        resume_token: this.generateToken(),
        joined_ms: Date.now(),
      };
      this.upsertMember(newRow);

      this.broadcastExcept(ws, {
        messageType: 'ROOM_MEMBER_JOINED',
        payload: { member: memberRowToDto(newRow), serverMs: Date.now() },
      });
    } else {
      // Reconnect: validate resume token if provided
      const tokenOk = payload.resumeToken && existing.resume_token === payload.resumeToken;
      if (!tokenOk) {
        // Still allow, just refresh token
        const refreshed: MemberRow = {
          ...existing,
          status: 'CONNECTED',
          resume_token: this.generateToken(),
        };
        this.upsertMember(refreshed);
      } else {
        this.updateMemberStatus(att.userId, 'CONNECTED');
      }
    }

    const updatedMembers = this.getAllMembers();
    const myRow = this.getMemberRow(att.userId);

    this.send(ws, {
      messageType: 'ROOM_JOINED',
      payload: {
        roomId: this.ctx.id.toString(),
        roomCode: this.getMeta('room_code') ?? payload.roomCode,
        phase,
        ownerId: this.getMeta('owner_id') ?? '',
        members: updatedMembers.map(memberRowToDto),
        config: JSON.parse(this.getMeta('game_config') ?? '{}') as Record<string, unknown>,
        matchId: this.getMeta('match_id') ?? undefined,
        resumeToken: myRow?.resume_token ?? '',
        serverSequence: parseInt(this.getMeta('server_sequence') ?? '0', 10),
        serverMs: Date.now(),
      },
    });
  }

  private async handleRoomLeave(ws: WebSocket, att: WsAttachment): Promise<void> {
    this.updateMemberStatus(att.userId, 'LEFT');
    this.broadcastExcept(ws, {
      messageType: 'ROOM_MEMBER_LEFT',
      payload: { userId: att.userId, serverMs: Date.now() },
    });
    ws.close(1000, 'Left room');
  }

  private async handleRoomReadySet(
    ws: WebSocket,
    att: WsAttachment,
    payload: { ready: boolean },
  ): Promise<void> {
    const member = this.getMemberRow(att.userId);
    if (!member) {
      this.sendError(ws, 'NOT_IN_ROOM', 'Join the room first');
      return;
    }

    this.ctx.storage.sql.exec(
      'UPDATE members SET ready = ? WHERE user_id = ?',
      payload.ready ? 1 : 0,
      att.userId,
    );

    const updated: MemberRow = { ...member, ready: payload.ready ? 1 : 0 };
    this.broadcast({
      messageType: 'ROOM_MEMBER_JOINED',
      payload: { member: memberRowToDto(updated), serverMs: Date.now() },
    });
  }

  private async handleMatchStartRequest(
    ws: WebSocket,
    att: WsAttachment,
    payload: { gameId: string },
  ): Promise<void> {
    const ownerId = this.getMeta('owner_id');
    if (att.userId !== ownerId) {
      this.sendError(ws, 'NOT_OWNER', 'Only the room owner can start the match');
      return;
    }

    const phase = this.getPhase();
    if (phase === 'IN_MATCH') {
      this.sendError(ws, 'MATCH_ALREADY_STARTED', 'A match is already in progress');
      return;
    }

    const gameId = payload.gameId || this.getMeta('game_id') || 'counter';
    const game = getGame(gameId);
    if (!game) {
      this.sendError(ws, 'UNKNOWN_GAME', `Game '${gameId}' is not registered`);
      return;
    }

    const members = this.getAllMembers().filter((m) => m.status !== 'LEFT');
    if (members.length < game.metadata.minPlayers) {
      this.sendError(ws, 'NOT_ENOUGH_PLAYERS', `Need at least ${game.metadata.minPlayers} players`);
      return;
    }

    const players = members.map((m, i) => ({
      userId: m.user_id,
      displayName: m.display_name,
      seatIndex: i,
    }));

    const matchId = this.generateToken();
    const now = Date.now();
    const config = game.validateConfig(JSON.parse(this.getMeta('game_config') ?? '{}'));
    const initialState = game.createInitialState({
      config,
      players,
      seed: matchId,
      startsAtServerMs: now,
    });

    const stateJson = JSON.stringify(game.serializeState(initialState));
    const stateHash = await game.canonicalHash(initialState);
    const serverSeq = this.nextServerSequence();

    this.setMeta('match_id', matchId);
    this.setMeta('game_id', gameId);
    this.setMeta('match_state', stateJson);
    this.setMeta('phase', 'IN_MATCH');

    // Schedule alarm if game needs it
    if (game.getNextAlarmMs) {
      const alarmMs = game.getNextAlarmMs(initialState, now);
      if (alarmMs !== null) {
        this.setMeta('match_alarm_ms', String(alarmMs));
        await this.ctx.storage.setAlarm(alarmMs);
      }
    }

    this.broadcast({
      messageType: 'MATCH_STARTED',
      payload: {
        matchId,
        gameId,
        startAtServerMs: now,
        randomSeed: 0,
        initialState: game.serializeState(initialState),
        stateHash,
        serverSequence: serverSeq,
      },
    });
  }

  private async handleGameCommand(
    ws: WebSocket,
    att: WsAttachment,
    payload: { matchId: string; gamePayload: unknown },
  ): Promise<void> {
    const phase = this.getPhase();
    if (phase !== 'IN_MATCH') {
      this.sendError(ws, 'INVALID_PHASE', 'No active match');
      return;
    }

    const matchId = this.getMeta('match_id');
    if (matchId !== payload.matchId) {
      this.sendError(ws, 'WRONG_MATCH', 'Match ID mismatch');
      return;
    }

    const gameId = this.getMeta('game_id');
    if (!gameId) {
      this.sendError(ws, 'NO_GAME', 'No game configured');
      return;
    }

    const game = getGame(gameId);
    if (!game) {
      this.sendError(ws, 'UNKNOWN_GAME', `Game '${gameId}' not found`);
      return;
    }

    const stateJson = this.getMeta('match_state');
    if (!stateJson) {
      this.sendError(ws, 'NO_STATE', 'Match state missing');
      return;
    }

    const state = game.deserializeState(JSON.parse(stateJson));
    const member = this.getMemberRow(att.userId);
    if (!member) {
      this.sendError(ws, 'NOT_IN_ROOM', 'Not a room member');
      return;
    }

    const actor = { userId: att.userId, seatIndex: member.seat_index ?? 0 };
    const command = payload.gamePayload;
    const serverReceivedAtMs = Date.now();

    const validation = game.validateCommand({ state, actor, command, serverReceivedAtMs });
    if (!validation.valid) {
      this.sendError(ws, 'INVALID_COMMAND', validation.reason);
      return;
    }

    const events = game.decide({ state, actor, command, serverReceivedAtMs });
    let newState = state;
    for (const event of events) {
      newState = game.evolve(newState, event);
    }

    this.setMeta('match_state', JSON.stringify(game.serializeState(newState)));

    const serverSeq = this.nextServerSequence();

    for (const event of events) {
      const evObj = event as Record<string, unknown>;
      this.broadcast({
        messageType: 'GAME_EVENT',
        payload: {
          eventId: this.generateToken().slice(0, 16),
          matchId,
          eventType: String(evObj['type'] ?? 'UNKNOWN'),
          gamePayload: event,
          serverMs: serverReceivedAtMs,
        },
      });
    }

    const result = game.evaluateResult(newState);
    if (result) {
      const finalHash = await game.canonicalHash(newState);
      this.setMeta('phase', 'COMPLETED');
      this.broadcast({
        messageType: 'MATCH_COMPLETED',
        payload: {
          matchId,
          result,
          finalStateHash: finalHash,
          serverMs: Date.now(),
        },
      });
    } else if (game.getNextAlarmMs) {
      // Update alarm if needed
      const nextAlarm = game.getNextAlarmMs(newState, serverReceivedAtMs);
      if (nextAlarm !== null) {
        const prevAlarmMs = this.getMeta('match_alarm_ms');
        if (!prevAlarmMs || nextAlarm !== parseInt(prevAlarmMs, 10)) {
          this.setMeta('match_alarm_ms', String(nextAlarm));
          await this.ctx.storage.setAlarm(nextAlarm);
        }
      }
    }

    // Emit state hash every 10 events for client-side integrity checks
    if (serverSeq % 10 === 0) {
      const hash = await game.canonicalHash(newState);
      this.broadcast({
        messageType: 'STATE_HASH',
        payload: { matchId, serverSequence: serverSeq, hash },
      });
    }
  }

  private async handleResyncRequest(ws: WebSocket, _att: WsAttachment): Promise<void> {
    const matchId = this.getMeta('match_id');
    const stateJson = this.getMeta('match_state');
    if (!matchId || !stateJson) {
      this.sendError(ws, 'NO_ACTIVE_MATCH', 'No active match to resync');
      return;
    }

    const gameId = this.getMeta('game_id');
    if (!gameId) return;
    const game = getGame(gameId);
    if (!game) return;

    const state = game.deserializeState(JSON.parse(stateJson));
    const hash = await game.canonicalHash(state);
    const seq = parseInt(this.getMeta('server_sequence') ?? '0', 10);

    this.send(ws, {
      messageType: 'STATE_SNAPSHOT',
      payload: {
        matchId,
        serverSequence: seq,
        state: game.serializeState(state),
        stateHash: hash,
        serverMs: Date.now(),
      },
    });
  }

  // -------- Match tick (alarm-driven) --------

  private async handleMatchTick(nowMs: number): Promise<void> {
    this.setMeta('match_alarm_ms', '');

    const gameId = this.getMeta('game_id');
    const stateJson = this.getMeta('match_state');
    const matchId = this.getMeta('match_id');
    if (!gameId || !stateJson || !matchId) return;

    const game = getGame(gameId);
    if (!game || !game.onTick) return;

    const state = game.deserializeState(JSON.parse(stateJson));
    const events = game.onTick({ state, serverMs: nowMs });
    if (events.length === 0) return;

    let newState = state;
    for (const event of events) {
      newState = game.evolve(newState, event);
    }

    this.setMeta('match_state', JSON.stringify(game.serializeState(newState)));

    for (const event of events) {
      const evObj = event as Record<string, unknown>;
      this.broadcast({
        messageType: 'GAME_EVENT',
        payload: {
          eventId: this.generateToken().slice(0, 16),
          matchId,
          eventType: String(evObj['type'] ?? 'TICK'),
          gamePayload: event,
          serverMs: nowMs,
        },
      });
    }

    const result = game.evaluateResult(newState);
    if (result) {
      const finalHash = await game.canonicalHash(newState);
      this.setMeta('phase', 'COMPLETED');
      this.broadcast({
        messageType: 'MATCH_COMPLETED',
        payload: {
          matchId,
          result,
          finalStateHash: finalHash,
          serverMs: nowMs,
        },
      });
      return;
    }

    // Schedule next alarm
    if (game.getNextAlarmMs) {
      const nextAlarm = game.getNextAlarmMs(newState, nowMs);
      if (nextAlarm !== null) {
        this.setMeta('match_alarm_ms', String(nextAlarm));
        await this.ctx.storage.setAlarm(nextAlarm);
      }
    }
  }

  // -------- Messaging helpers --------

  private send(ws: WebSocket, msg: { messageType: string; payload: unknown }): void {
    const envelope = {
      protocolVersion: 1,
      messageId: this.generateToken().slice(0, 16),
      messageType: msg.messageType,
      sentAtServerMs: Date.now(),
      payload: msg.payload,
    };
    try {
      ws.send(JSON.stringify(envelope));
    } catch {
      // WebSocket may already be closed
    }
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, { messageType: 'ERROR', payload: { code, message } });
  }

  private broadcast(msg: { messageType: string; payload: unknown }): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (att?.authenticated) {
        this.send(ws, msg);
      }
    }
  }

  private broadcastExcept(
    exclude: WebSocket,
    msg: { messageType: string; payload: unknown },
  ): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (att?.authenticated) {
        this.send(ws, msg);
      }
    }
  }
}
