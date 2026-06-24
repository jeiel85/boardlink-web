import { describe, it, expect } from 'vitest';
import { redactLogString, redactLogArg } from '../src/worker/log-redaction.js';

describe('log redaction', () => {
  it('redacts a bare friend code interpolated into a message', () => {
    const out = redactLogString('Rotated friend code ABCD-2345 for user');
    expect(out).not.toContain('ABCD-2345');
    expect(out).toContain('[REDACTED-CODE]');
  });

  it('redacts a friendCode JSON field', () => {
    const out = redactLogString('{"friendCode":"WXYZ-7788"}');
    expect(out).not.toContain('WXYZ-7788');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts bearer / session tokens', () => {
    const out = redactLogString('Authorization: Bearer abc123.def-456:ghi');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('abc123.def-456:ghi');
  });

  it('redacts session/server token and challenge JSON fields', () => {
    const out = redactLogString(
      '{"sessionToken":"pid:name:999:sig","serverToken":"c:1:s","challenge":"deadbeef"}',
    );
    expect(out).not.toContain('pid:name:999:sig');
    expect(out).not.toContain('deadbeef');
    expect(out).not.toContain('c:1:s');
  });

  it('redacts JWK private exponent', () => {
    const out = redactLogString('{"d":"private-key-material_ABC-123"}');
    expect(out).not.toContain('private-key-material_ABC-123');
    expect(out).toContain('"d":"[REDACTED]"');
  });

  it('redacts long signature hex blobs', () => {
    const sig = 'a'.repeat(96);
    const out = redactLogString(`{"signature":"${sig}"}`);
    expect(out).not.toContain(sig);
  });

  it('leaves a 64-char lowercase hex public ID intact', () => {
    const publicId = 'b'.repeat(64);
    const out = redactLogString(`Resolved to user ${publicId}`);
    expect(out).toContain(publicId);
  });

  it('redactLogArg scrubs nested secrets in structured args', () => {
    const arg = { friendCode: 'QRST-4455', note: 'lookup ABCD-9999' };
    const result = redactLogArg(arg) as { friendCode: string; note: string };
    expect(result.friendCode).not.toContain('QRST-4455');
    expect(result.note).not.toContain('ABCD-9999');
  });

  it('redactLogArg passes through non-string primitives unchanged', () => {
    expect(redactLogArg(42)).toBe(42);
    expect(redactLogArg(true)).toBe(true);
  });
});
