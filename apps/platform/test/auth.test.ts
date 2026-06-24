import { describe, it, expect, vi } from 'vitest';
import {
  handleChallenge,
  handleVerify,
  authenticateSession,
  safeLog,
  type AuthenticatedUser,
} from '../src/worker/auth.js';
import type { Env } from '../src/worker/index.js';

// Minimal env: no DIRECTORY_DB so the optional D1 reads (revoked check, friend
// code lookup) are skipped. A real JWT_SECRET is supplied so the rate-limit
// test-bucket bypass stays disabled and tokens are HMAC-signed deterministically.
const env = { JWT_SECRET: 'unit-test-secret-value' } as unknown as Env;

function challengeReq(): Request {
  return new Request('http://localhost/api/auth/challenge', { method: 'POST' });
}

function verifyReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
}

async function signString(privateKey: CryptoKey, data: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(data),
  );
  return toHex(sig);
}

/** Run the full challenge → sign → verify handshake for a given key pair. */
async function authenticate(
  keyPair: CryptoKeyPair,
  displayName: string,
): Promise<{ status: number; sessionToken?: string; friendCode?: string | null }> {
  const ch = (await (await handleChallenge(challengeReq(), env)).json()) as {
    challenge: string;
    serverToken: string;
  };
  const signature = await signString(keyPair.privateKey, ch.challenge);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const res = await handleVerify(
    verifyReq({ serverToken: ch.serverToken, signature, publicKeyJwk, displayName }),
    env,
  );
  if (res.status !== 200) return { status: res.status };
  const body = (await res.json()) as { sessionToken: string; friendCode: string | null };
  return { status: 200, ...body };
}

describe('identity challenge / verify', () => {
  it('challenge endpoint returns a challenge and signed server token', async () => {
    const data = (await (await handleChallenge(challengeReq(), env)).json()) as {
      challenge: string;
      serverToken: string;
      expiresAt: number;
    };
    expect(data.challenge).toMatch(/^[0-9a-f]{32}$/);
    expect(data.serverToken.split(':')).toHaveLength(3);
    expect(data.expiresAt).toBeGreaterThan(0);
  });

  it('accepts a valid key-ownership signature and issues a usable session', async () => {
    const keyPair = await generateKeyPair();
    const result = await authenticate(keyPair, 'Tester One');
    expect(result.status).toBe(200);
    expect(result.sessionToken).toBeTruthy();
    expect(result.friendCode).toBeNull();

    const user = (await authenticateSession(
      new Request('http://localhost/api/friend-code/issue', {
        headers: { Authorization: `Bearer ${result.sessionToken}` },
      }),
      env,
    )) as AuthenticatedUser | null;
    expect(user).not.toBeNull();
    expect(user?.displayName).toBe('Tester One');
  });

  it('derives a stable public ID for the same key and distinct IDs for different keys', async () => {
    const keyA = await generateKeyPair();
    const keyB = await generateKeyPair();

    const a1 = await authenticate(keyA, 'A');
    const a2 = await authenticate(keyA, 'A');
    const b1 = await authenticate(keyB, 'B');

    const publicId = (token?: string) => token!.split(':')[0];
    expect(publicId(a1.sessionToken)).toBe(publicId(a2.sessionToken));
    expect(publicId(a1.sessionToken)).not.toBe(publicId(b1.sessionToken));
  });

  it('rejects a signature that does not match the challenge', async () => {
    const keyPair = await generateKeyPair();
    const ch = (await (await handleChallenge(challengeReq(), env)).json()) as {
      challenge: string;
      serverToken: string;
    };
    // Sign the wrong data so verification fails.
    const signature = await signString(keyPair.privateKey, `${ch.challenge}-tampered`);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const res = await handleVerify(
      verifyReq({ serverToken: ch.serverToken, signature, publicKeyJwk, displayName: 'Mallory' }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a malformed server token', async () => {
    const keyPair = await generateKeyPair();
    const signature = await signString(keyPair.privateKey, 'whatever');
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const res = await handleVerify(
      verifyReq({ serverToken: 'not:a:valid:token', signature, publicKeyJwk, displayName: 'X' }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects verify requests missing required parameters', async () => {
    const res = await handleVerify(verifyReq({ serverToken: 'a:b:c' }), env);
    expect(res.status).toBe(400);
  });
});

describe('session authentication', () => {
  it('returns null without a bearer token', async () => {
    const user = await authenticateSession(
      new Request('http://localhost/api/friend-code/issue'),
      env,
    );
    expect(user).toBeNull();
  });

  it('rejects a tampered session token', async () => {
    const keyPair = await generateKeyPair();
    const { sessionToken } = await authenticate(keyPair, 'Tester');
    // Flip the final signature segment.
    const parts = sessionToken!.split(':');
    parts[3] = parts[3] === '0'.repeat(parts[3].length) ? 'a' : '0'.repeat(parts[3].length);
    const tampered = parts.join(':');
    const user = await authenticateSession(
      new Request('http://localhost', { headers: { Authorization: `Bearer ${tampered}` } }),
      env,
    );
    expect(user).toBeNull();
  });
});

describe('safeLog', () => {
  it('scrubs friend codes before writing to the console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      safeLog('Rotated friend code for user with code ABCD-2345');
      const logged = String(spy.mock.calls[0]?.[0]);
      expect(logged).not.toContain('ABCD-2345');
      expect(logged).toContain('[REDACTED-CODE]');
    } finally {
      spy.mockRestore();
    }
  });
});
