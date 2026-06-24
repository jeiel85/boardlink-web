import { describe, it, expect } from 'vitest';
import { canonicalJson, computeStateHash } from '../src/state-hash.js';

describe('canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
  });

  it('omits undefined values', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('sorts nested object keys', () => {
    const result = canonicalJson({ b: { z: 1, a: 2 }, a: { y: 1, x: 2 } });
    expect(result).toBe('{"a":{"x":2,"y":1},"b":{"a":2,"z":1}}');
  });

  it('preserves array order (not sorted)', () => {
    expect(canonicalJson({ arr: [3, 1, 2] })).toBe('{"arr":[3,1,2]}');
  });

  it('handles null', () => {
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it('handles primitives', () => {
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('computeStateHash', () => {
  it('returns a base64url string', async () => {
    const hash = await computeStateHash({ count: 0 });
    expect(hash).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(hash.length).toBeGreaterThan(0);
  });

  it('is deterministic regardless of key order', async () => {
    const h1 = await computeStateHash({ count: 42, players: ['a', 'b'] });
    const h2 = await computeStateHash({ players: ['a', 'b'], count: 42 });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different states', async () => {
    const h1 = await computeStateHash({ count: 0 });
    const h2 = await computeStateHash({ count: 1 });
    expect(h1).not.toBe(h2);
  });

  it('SHA-256 output is 43 chars in base64url (256 bits)', async () => {
    const hash = await computeStateHash({});
    expect(hash.length).toBe(43);
  });
});
