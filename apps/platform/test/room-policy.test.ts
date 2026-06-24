import { describe, it, expect } from 'vitest';
import {
  protocolMajor,
  isProtocolCompatible,
  earliestAlarm,
  shouldDisconnectForInvalid,
  MAX_INVALID_MESSAGES,
} from '../src/worker/room/policy.js';

describe('policy: protocol compatibility', () => {
  it('extracts the major version', () => {
    expect(protocolMajor('1.0.0')).toBe(1);
    expect(protocolMajor('2.4.1')).toBe(2);
    expect(protocolMajor('  3.0')).toBe(3);
    expect(protocolMajor('x')).toBeNull();
    expect(protocolMajor('')).toBeNull();
  });

  it('requires the same major and rejects unparseable input', () => {
    expect(isProtocolCompatible('1.0.0', '1.4.2')).toBe(true);
    expect(isProtocolCompatible('1.9.9', '1.0.0')).toBe(true);
    expect(isProtocolCompatible('2.0.0', '1.0.0')).toBe(false);
    expect(isProtocolCompatible('', '1.0.0')).toBe(false);
    expect(isProtocolCompatible('1.0.0', 'nope')).toBe(false);
  });
});

describe('policy: alarm scheduling', () => {
  it('returns the soonest finite candidate', () => {
    expect(earliestAlarm([1000, 500, 2000])).toBe(500);
    expect(earliestAlarm([null, 800, undefined])).toBe(800);
    expect(earliestAlarm([null, undefined])).toBeNull();
    expect(earliestAlarm([])).toBeNull();
    expect(earliestAlarm([Infinity, 300])).toBe(300);
  });

  it('handles a single match-alarm-only or expiry-only case', () => {
    expect(earliestAlarm([1234, null])).toBe(1234);
    expect(earliestAlarm([null, 5678])).toBe(5678);
  });
});

describe('policy: invalid-schema disconnect', () => {
  it('disconnects only at or beyond the threshold of 3', () => {
    expect(MAX_INVALID_MESSAGES).toBe(3);
    expect(shouldDisconnectForInvalid(1)).toBe(false);
    expect(shouldDisconnectForInvalid(2)).toBe(false);
    expect(shouldDisconnectForInvalid(3)).toBe(true);
    expect(shouldDisconnectForInvalid(4)).toBe(true);
  });
});
