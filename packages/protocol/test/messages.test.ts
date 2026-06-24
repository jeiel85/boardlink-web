import { describe, it, expect } from 'vitest';
import { parseC2SMessage, parseS2CMessage } from '../src/messages.js';

const envelope = (messageType: string, payload: unknown, extra?: Record<string, unknown>) =>
  JSON.stringify({ protocolVersion: 1, messageId: 'test-id', messageType, payload, ...extra });

describe('parseC2SMessage', () => {
  it('parses valid CLIENT_HELLO', () => {
    const raw = envelope('CLIENT_HELLO', {
      sessionToken: 'tok123',
      appVersion: '0.1.0',
      buildId: 'build-abc',
      protocolVersion: '1.0.0',
      gameModuleVersions: {},
      capabilityFlags: [],
    });
    const result = parseC2SMessage(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.messageType).toBe('CLIENT_HELLO');
    expect(result.message.payload.sessionToken).toBe('tok123');
  });

  it('rejects invalid JSON', () => {
    expect(parseC2SMessage('not json').ok).toBe(false);
  });

  it('rejects wrong protocol version', () => {
    const raw = envelope('PING', { clientMs: 0 });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    parsed['protocolVersion'] = 2;
    expect(parseC2SMessage(JSON.stringify(parsed)).ok).toBe(false);
  });

  it('rejects unknown messageType', () => {
    expect(parseC2SMessage(envelope('UNKNOWN_TYPE', {})).ok).toBe(false);
  });

  it('rejects CLIENT_HELLO with missing field', () => {
    const result = parseC2SMessage(envelope('CLIENT_HELLO', { sessionToken: 'tok' }));
    expect(result.ok).toBe(false);
  });

  it('parses ROOM_JOIN with resume token', () => {
    const result = parseC2SMessage(
      envelope('ROOM_JOIN', {
        roomCode: 'K7M2QA',
        resumeToken: 'opaque-tok',
        lastAppliedServerSequence: 42,
        lastStateHash: 'abc123',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.messageType).toBe('ROOM_JOIN');
    expect(result.message.payload.resumeToken).toBe('opaque-tok');
  });

  it('parses ROOM_JOIN without optional fields', () => {
    const result = parseC2SMessage(envelope('ROOM_JOIN', { roomCode: 'ABCDEF' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.payload.resumeToken).toBeUndefined();
  });

  it('parses PING with envelope fields', () => {
    const result = parseC2SMessage(
      envelope('PING', { clientMs: 1000000 }, { clientSequence: 5, sentAtClientMs: 1000000 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.messageType).toBe('PING');
    expect(result.message.payload.clientMs).toBe(1000000);
    expect(result.message.clientSequence).toBe(5);
  });

  it('parses GAME_COMMAND with opaque gamePayload', () => {
    const result = parseC2SMessage(
      envelope('GAME_COMMAND', { matchId: 'match-1', gamePayload: { type: 'INCREMENT' } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.payload.matchId).toBe('match-1');
  });

  it('parses RESYNC_REQUEST', () => {
    const result = parseC2SMessage(
      envelope('RESYNC_REQUEST', {
        matchId: 'match-1',
        lastAppliedServerSequence: 7,
        lastStateHash: 'hash-xyz',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.payload.lastAppliedServerSequence).toBe(7);
  });
});

describe('parseS2CMessage', () => {
  it('parses SESSION_ACCEPTED', () => {
    const result = parseS2CMessage(
      envelope('SESSION_ACCEPTED', { userId: 'u-1', displayName: 'Swift Fox', serverMs: 1000 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.messageType).toBe('SESSION_ACCEPTED');
    expect(result.message.payload.displayName).toBe('Swift Fox');
  });

  it('parses SESSION_REJECTED', () => {
    const result = parseS2CMessage(
      envelope('SESSION_REJECTED', { reason: 'AUTHENTICATION_REQUIRED', message: 'Token expired' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.payload.reason).toBe('AUTHENTICATION_REQUIRED');
  });

  it('parses ERROR message', () => {
    const result = parseS2CMessage(
      envelope('ERROR', { code: 'ROOM_FULL', message: 'Room is full' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.messageType).toBe('ERROR');
    expect(result.message.payload.code).toBe('ROOM_FULL');
  });

  it('parses PONG', () => {
    const result = parseS2CMessage(envelope('PONG', { clientMs: 1000, serverMs: 1050 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.payload.serverMs).toBe(1050);
  });

  it('rejects unknown S2C messageType', () => {
    expect(parseS2CMessage(envelope('SERVER_MYSTERY', {})).ok).toBe(false);
  });
});
