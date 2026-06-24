import { useState, useEffect, useCallback, useRef } from 'react';
import { RoomConnection } from './RoomConnection.js';
import type { ConnectionState } from './RoomConnection.js';
import type { S2CMessage, RoomMember, RoomPhase } from '@boardlink/protocol';

export interface RoomState {
  connectionState: ConnectionState;
  phase: RoomPhase;
  roomCode: string;
  ownerId: string;
  members: RoomMember[];
  matchId: string | null;
  serverSequence: number;
  gameEvents: unknown[];
  matchState: unknown;
  ping: number | null;
  error: string | null;
}

const INITIAL_STATE: RoomState = {
  connectionState: 'DISCONNECTED',
  phase: 'LOBBY',
  roomCode: '',
  ownerId: '',
  members: [],
  matchId: null,
  serverSequence: 0,
  gameEvents: [],
  matchState: null,
  ping: null,
  error: null,
};

interface UseRoomOptions {
  roomCode: string;
  sessionToken: string | null;
  enabled?: boolean;
}

interface UseRoomResult extends RoomState {
  sendCommand: (matchId: string, gamePayload: unknown) => void;
  setReady: (ready: boolean) => void;
  requestMatchStart: (gameId: string) => void;
  leaveRoom: () => void;
}

export function useRoom({ roomCode, sessionToken, enabled = true }: UseRoomOptions): UseRoomResult {
  const [state, setState] = useState<RoomState>(INITIAL_STATE);
  const connRef = useRef<RoomConnection | null>(null);
  const pingStartRef = useRef<number | null>(null);

  const handleMessage = useCallback((msg: S2CMessage) => {
    setState((prev) => {
      switch (msg.messageType) {
        case 'SESSION_ACCEPTED':
          return { ...prev, error: null };

        case 'ROOM_JOINED':
          return {
            ...prev,
            phase: msg.payload.phase,
            roomCode: msg.payload.roomCode,
            ownerId: msg.payload.ownerId,
            members: msg.payload.members,
            matchId: msg.payload.matchId ?? null,
            serverSequence: msg.payload.serverSequence,
            error: null,
          };

        case 'ROOM_MEMBER_JOINED': {
          const incoming = msg.payload.member;
          const next = prev.members.filter((m) => m.userId !== incoming.userId);
          return { ...prev, members: [...next, incoming] };
        }

        case 'ROOM_MEMBER_LEFT':
          return {
            ...prev,
            members: prev.members.map((m) =>
              m.userId === msg.payload.userId ? { ...m, status: 'DISCONNECTED' as const } : m,
            ),
          };

        case 'ROOM_SNAPSHOT':
          return {
            ...prev,
            phase: msg.payload.phase,
            ownerId: msg.payload.ownerId,
            members: msg.payload.members,
            serverSequence: msg.payload.serverSequence,
          };

        case 'MATCH_STARTED':
          return {
            ...prev,
            phase: 'IN_MATCH',
            matchId: msg.payload.matchId,
            matchState: msg.payload.initialState,
            serverSequence: msg.payload.serverSequence,
            gameEvents: [],
          };

        case 'GAME_EVENT':
          return {
            ...prev,
            gameEvents: [...prev.gameEvents, msg.payload.gamePayload],
          };

        case 'STATE_SNAPSHOT':
          return {
            ...prev,
            matchState: msg.payload.state,
            serverSequence: msg.payload.serverSequence,
          };

        case 'MATCH_COMPLETED':
          return { ...prev, phase: 'COMPLETED' };

        case 'MATCH_ABORTED':
          return { ...prev, phase: 'LOBBY', matchId: null, matchState: null, gameEvents: [] };

        case 'ERROR':
          return { ...prev, error: msg.payload.message };

        case 'PONG':
          if (pingStartRef.current !== null) {
            const latency = Date.now() - pingStartRef.current;
            pingStartRef.current = null;
            return { ...prev, ping: latency };
          }
          return prev;

        default:
          return prev;
      }
    });
  }, []);

  const handleStateChange = useCallback((connectionState: ConnectionState) => {
    setState((prev) => ({ ...prev, connectionState }));
    if (connectionState === 'DISCONNECTED' || connectionState === 'CLOSED') {
      setState((prev) => ({
        ...prev,
        connectionState,
        members: prev.members.map((m) => ({ ...m, status: 'DISCONNECTED' as const })),
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled || !sessionToken || !roomCode) return;

    const conn = new RoomConnection({
      roomCode,
      sessionToken,
      onMessage: handleMessage,
      onStateChange: handleStateChange,
      onError: (err) => setState((prev) => ({ ...prev, error: err.message })),
    });
    connRef.current = conn;
    conn.connect();

    return () => {
      conn.disconnect();
      connRef.current = null;
      setState(INITIAL_STATE);
    };
  }, [enabled, sessionToken, roomCode, handleMessage, handleStateChange]);

  const sendCommand = useCallback((matchId: string, gamePayload: unknown) => {
    connRef.current?.sendCommand(matchId, gamePayload);
  }, []);

  const setReady = useCallback((ready: boolean) => {
    connRef.current?.setReady(ready);
  }, []);

  const requestMatchStart = useCallback((gameId: string) => {
    connRef.current?.requestMatchStart(gameId);
  }, []);

  const leaveRoom = useCallback(() => {
    connRef.current?.leaveRoom();
  }, []);

  return { ...state, sendCommand, setReady, requestMatchStart, leaveRoom };
}
