import { describe, it, expect } from 'vitest';
import {
  RoomId,
  UserId,
  SessionId,
  BoardLinkError,
  ok,
  fail,
  generateDisplayName,
} from '../src/index.js';

describe('Domain Package Tests', () => {
  it('should properly brand and cast IDs', () => {
    const rId = RoomId('r-1');
    const uId = UserId('u-1');
    const sId = SessionId('s-1');

    expect(rId).toBe('r-1');
    expect(uId).toBe('u-1');
    expect(sId).toBe('s-1');
  });

  it('should construct and serialize BoardLinkError', () => {
    const err = new BoardLinkError('TEST_CODE', 'test message', { meta: 'data' });
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.toJSON()).toEqual({
      code: 'TEST_CODE',
      message: 'test message',
      details: { meta: 'data' },
    });
  });

  it('should work with Result ok/fail monads', () => {
    const resOk = ok('success');
    expect(resOk.ok).toBe(true);
    if (resOk.ok) {
      expect(resOk.value).toBe('success');
    }

    const resFail = fail({ code: 'ERROR', message: 'failed' });
    expect(resFail.ok).toBe(false);
    if (!resFail.ok) {
      expect(resFail.error.code).toBe('ERROR');
    }
  });

  it('should generate localized display names', () => {
    const nameEn = generateDisplayName('en', 1);
    expect(nameEn).toBeDefined();
    // Deterministic seed 1 gives index 1 of adjectives ("Clever") and index 31 % 10 = 1 of nouns ("Fox")
    expect(nameEn).toBe('Clever Fox');

    const nameKo = generateDisplayName('ko-KR', 1);
    expect(nameKo).toBeDefined();
    // Seed 1 gives index 1 of adjectives ("똑똑한") and index 1 of nouns ("여우")
    expect(nameKo).toBe('똑똑한 여우');

    const nameRandom = generateDisplayName('en');
    expect(nameRandom.length).toBeGreaterThan(0);
  });
});
