// Client-side WebSocket wrapper for the room protocol.
import { parseS2CMessage } from '@boardlink/protocol';
import type { S2CMessage } from '@boardlink/protocol';

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'IN_ROOM'
  | 'CLOSED';

interface RoomConnectionOptions {
  roomCode: string;
  sessionToken: string;
  onMessage: (msg: S2CMessage) => void;
  onStateChange: (state: ConnectionState) => void;
  onError: (error: Error) => void;
}

export class RoomConnection {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = 'DISCONNECTED';
  private clientSequence = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(private readonly options: RoomConnectionOptions) {}

  connect(): void {
    if (this._state !== 'DISCONNECTED') return;
    this.setState('CONNECTING');

    const proto =
      typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
    const wsUrl = `${proto}//${host}/room/${this.options.roomCode}/ws`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.setState('AUTHENTICATING');
      this.sendRaw('CLIENT_HELLO', {
        sessionToken: this.options.sessionToken,
        appVersion: '0.1.0',
        buildId: 'dev',
        protocolVersion: '1.0.0',
        gameModuleVersions: {},
        capabilityFlags: [],
      });
    };

    ws.onmessage = (ev) => {
      this.handleRaw(ev.data as string);
    };

    ws.onclose = (ev) => {
      this.clearTimers();
      if (this.closed || ev.code === 4001 || ev.code === 4002) {
        this.setState('CLOSED');
      } else {
        this.setState('DISCONNECTED');
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      this.options.onError(new Error('WebSocket connection error'));
    };
  }

  disconnect(): void {
    this.closed = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, 'User disconnected');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.setState('CLOSED');
  }

  sendCommand(matchId: string, gamePayload: unknown): void {
    this.sendRaw('GAME_COMMAND', { matchId, gamePayload });
  }

  setReady(ready: boolean): void {
    this.sendRaw('ROOM_READY_SET', { ready });
  }

  requestMatchStart(gameId: string): void {
    this.sendRaw('MATCH_START_REQUEST', { gameId });
  }

  requestResync(matchId: string, lastSeq: number, lastHash: string): void {
    this.sendRaw('RESYNC_REQUEST', {
      matchId,
      lastAppliedServerSequence: lastSeq,
      lastStateHash: lastHash,
    });
  }

  leaveRoom(): void {
    this.sendRaw('ROOM_LEAVE', {});
  }

  getState(): ConnectionState {
    return this._state;
  }

  private handleRaw(raw: string): void {
    const result = parseS2CMessage(raw);
    if (!result.ok) {
      console.warn('[RoomConnection] Parse error:', result.error);
      return;
    }
    const msg = result.message;

    if (msg.messageType === 'SESSION_ACCEPTED') {
      this.setState('AUTHENTICATED');
      this.sendRaw('ROOM_JOIN', { roomCode: this.options.roomCode });
      this.startPing();
    } else if (msg.messageType === 'ROOM_JOINED') {
      this.setState('IN_ROOM');
    } else if (msg.messageType === 'SESSION_REJECTED') {
      this.closed = true;
      this.setState('CLOSED');
    }

    this.options.onMessage(msg);
  }

  private sendRaw(messageType: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.clientSequence++;
    const envelope = {
      protocolVersion: 1,
      messageId: `${Date.now()}-${this.clientSequence}`,
      messageType,
      clientSequence: this.clientSequence,
      sentAtClientMs: Date.now(),
      payload,
    };
    try {
      this.ws.send(JSON.stringify(envelope));
    } catch {
      /* ignore */
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.sendRaw('PING', { clientMs: Date.now() });
    }, 15_000);
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) {
        this._state = 'DISCONNECTED';
        this.connect();
      }
    }, 3_000);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setState(s: ConnectionState): void {
    this._state = s;
    this.options.onStateChange(s);
  }
}
