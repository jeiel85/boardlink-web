import type { Env } from './index.js';
import { BoardLinkError } from '@boardlink/domain';
import { redactLogString, redactLogArg } from './log-redaction.js';

const FALLBACK_SECRET = 'boardlink-local-development-secret-only-12345';

// Friend-code lookup rate limit: sliding window per client bucket.
const LOOKUP_RATE_LIMIT = 5;
const LOOKUP_RATE_WINDOW_MS = 60_000;
// Sweep idle buckets once the map grows past this many keys to bound memory.
const RATE_LIMIT_SWEEP_THRESHOLD = 1_000;
const lookupRateLimitMap = new Map<string, number[]>();

// HMAC Utilities using Web Crypto
async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signHmac(secret: string, data: string): Promise<string> {
  const key = await getHmacKey(secret);
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyHmac(secret: string, data: string, signature: string): Promise<boolean> {
  const expectedSig = await signHmac(secret, data);
  return expectedSig === signature;
}

// Log Redactor: scrub secrets before they reach the console. Defense-in-depth;
// call sites must already avoid logging tokens, raw IPs, or complete codes.
export function safeLog(message: string, ...args: unknown[]) {
  const formattedMsg = typeof message === 'string' ? redactLogString(message) : message;
  console.log(formattedMsg, ...args.map(redactLogArg));
}

// 1. Auth Challenge Endpoint
export async function handleChallenge(_request: Request, env: Env): Promise<Response> {
  const secret = env.JWT_SECRET || FALLBACK_SECRET;

  // Generate random challenge
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const challenge = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const expiresAt = Date.now() + 60000; // 60 seconds expiry
  const signature = await signHmac(secret, `${challenge}:${expiresAt}`);
  const serverToken = `${challenge}:${expiresAt}:${signature}`;

  safeLog('Auth challenge generated for client.');

  return new Response(
    JSON.stringify({
      challenge,
      serverToken,
      expiresAt,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

// 2. Auth Verify Signature Endpoint
export async function handleVerify(request: Request, env: Env): Promise<Response> {
  const secret = env.JWT_SECRET || FALLBACK_SECRET;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  try {
    const { serverToken, signature, publicKeyJwk, displayName } = (await request.json()) as {
      serverToken: string;
      signature: string;
      publicKeyJwk: JsonWebKey;
      displayName: string;
    };

    if (!serverToken || !signature || !publicKeyJwk || !displayName) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('INVALID_INPUT', 'Missing parameters').toJSON(),
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Parse serverToken: challenge:expiresAt:hmacSig
    const parts = serverToken.split(':');
    if (parts.length !== 3) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('INVALID_TOKEN', 'Malformed server token').toJSON(),
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const [challenge, expiresAtStr, hmacSig] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);

    // Verify token expiration
    if (Date.now() > expiresAt) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('TOKEN_EXPIRED', 'Challenge token expired').toJSON(),
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    // Verify server HMAC signature
    const isValidToken = await verifyHmac(secret, `${challenge}:${expiresAt}`, hmacSig);
    if (!isValidToken) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('INVALID_TOKEN', 'Challenge token signature mismatch').toJSON(),
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    // Import client public key
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );

    // Verify ECDSA signature of the challenge
    const encoder = new TextEncoder();
    const challengeData = encoder.encode(challenge);
    const signatureBytes = new Uint8Array(
      signature.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );

    const isValidSignature = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBytes,
      challengeData,
    );

    if (!isValidSignature) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('AUTH_FAILED', 'Signature verification failed').toJSON(),
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    // Derive UserId canonically (hash spki representation of public key)
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', spki);
    const publicId = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Check if publicId is revoked
    if (env.DIRECTORY_DB) {
      const revoked = await env.DIRECTORY_DB.prepare(
        'SELECT public_id FROM revoked_public_ids WHERE public_id = ?',
      )
        .bind(publicId)
        .first();
      if (revoked) {
        return new Response(
          JSON.stringify({ error: new BoardLinkError('REVOKED', 'Identity is revoked').toJSON() }),
          { status: 401, headers: jsonHeaders },
        );
      }
    }

    // Check if there is an existing friend code
    let friendCode: string | null = null;
    if (env.DIRECTORY_DB) {
      const row = await env.DIRECTORY_DB.prepare(
        'SELECT friend_code, display_name FROM friend_code_directory WHERE public_id = ?',
      )
        .bind(publicId)
        .first<{ friend_code: string; display_name: string }>();

      if (row) {
        friendCode = row.friend_code;
        // Update display name if it changed
        if (row.display_name !== displayName) {
          await env.DIRECTORY_DB.prepare(
            'UPDATE friend_code_directory SET display_name = ? WHERE public_id = ?',
          )
            .bind(displayName, publicId)
            .run();
        }
      }
    }

    // Generate short-lived session token (valid for 15 minutes)
    const sessionExpiresAt = Date.now() + 900000;
    const payload = `${publicId}:${displayName}:${sessionExpiresAt}`;
    const tokenSig = await signHmac(secret, payload);
    const sessionToken = `${payload}:${tokenSig}`;

    safeLog(`Auth verify successful for profile: ${displayName} (${publicId})`);

    return new Response(
      JSON.stringify({
        sessionToken,
        friendCode,
      }),
      {
        status: 200,
        headers: jsonHeaders,
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: new BoardLinkError('AUTH_FAILED', msg).toJSON() }),
      { status: 500, headers: jsonHeaders },
    );
  }
}

// 3. Session Authenticator Middleware / Guard helper
export interface AuthenticatedUser {
  publicId: string;
  displayName: string;
}

// Verify a raw session token string (used by RoomDO for WS CLIENT_HELLO auth).
export async function verifySessionToken(
  token: string,
  env: Pick<Env, 'JWT_SECRET'>,
): Promise<AuthenticatedUser | null> {
  const secret = env.JWT_SECRET || FALLBACK_SECRET;
  const parts = token.split(':');
  if (parts.length !== 4) return null;

  const [publicId, displayName, expiresAtStr, sig] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

  const payload = `${publicId}:${displayName}:${expiresAt}`;
  const isValid = await verifyHmac(secret, payload, sig);
  if (!isValid) return null;

  return { publicId, displayName };
}

export async function authenticateSession(
  request: Request,
  env: Env,
): Promise<AuthenticatedUser | null> {
  const secret = env.JWT_SECRET || FALLBACK_SECRET;
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const sessionToken = authHeader.substring(7);
  const parts = sessionToken.split(':');
  if (parts.length !== 4) return null;

  const [publicId, displayName, expiresAtStr, sig] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  if (Date.now() > expiresAt) return null;

  const payload = `${publicId}:${displayName}:${expiresAt}`;
  const isValid = await verifyHmac(secret, payload, sig);
  if (!isValid) return null;

  return { publicId, displayName };
}

// Helper to generate a short, unique, readable friend code
function generateReadableCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Redacted O, 0, I, 1 for legibility
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 4. Friend Code Issue Endpoint
export async function handleFriendCodeIssue(
  _request: Request,
  user: AuthenticatedUser,
  env: Env,
): Promise<Response> {
  const jsonHeaders = { 'Content-Type': 'application/json' };
  if (!env.DIRECTORY_DB) {
    return new Response(
      JSON.stringify({
        error: new BoardLinkError('DB_UNAVAILABLE', 'Database connection missing').toJSON(),
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    // 1. Check if user already has a code
    const existing = await env.DIRECTORY_DB.prepare(
      'SELECT friend_code FROM friend_code_directory WHERE public_id = ?',
    )
      .bind(user.publicId)
      .first<{ friend_code: string }>();

    if (existing) {
      return new Response(JSON.stringify({ friendCode: existing.friend_code }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // 2. Generate and loop until unique
    let friendCode = '';
    let inserted = false;
    for (let attempts = 0; attempts < 5; attempts++) {
      friendCode = generateReadableCode();
      try {
        await env.DIRECTORY_DB.prepare(
          'INSERT INTO friend_code_directory (public_id, friend_code, display_name, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(user.publicId, friendCode, user.displayName, Date.now())
          .run();
        inserted = true;
        break;
      } catch (e: unknown) {
        // Unique constraint violation (friend_code already exists) - loop again
        if (String(e).includes('UNIQUE')) {
          continue;
        }
        throw e;
      }
    }

    if (!inserted) {
      throw new Error('Failed to generate unique friend code after maximum attempts');
    }

    safeLog(`Issued friend code for User ${user.publicId}`);

    return new Response(JSON.stringify({ friendCode }), { status: 200, headers: jsonHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: new BoardLinkError('ISSUE_FAILED', msg).toJSON() }),
      { status: 500, headers: jsonHeaders },
    );
  }
}

// 5. Friend Code Rotate Endpoint
export async function handleFriendCodeRotate(
  _request: Request,
  user: AuthenticatedUser,
  env: Env,
): Promise<Response> {
  const jsonHeaders = { 'Content-Type': 'application/json' };
  if (!env.DIRECTORY_DB) {
    return new Response(
      JSON.stringify({
        error: new BoardLinkError('DB_UNAVAILABLE', 'Database connection missing').toJSON(),
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    // Check current code
    const current = await env.DIRECTORY_DB.prepare(
      'SELECT friend_code FROM friend_code_directory WHERE public_id = ?',
    )
      .bind(user.publicId)
      .first<{ friend_code: string }>();

    if (!current) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('NOT_FOUND', 'No active friend code found to rotate').toJSON(),
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Delete current from active directory
    await env.DIRECTORY_DB.prepare('DELETE FROM friend_code_directory WHERE public_id = ?')
      .bind(user.publicId)
      .run();

    // Insert into history
    await env.DIRECTORY_DB.prepare(
      'INSERT INTO friend_code_history (public_id, friend_code, created_at) VALUES (?, ?, ?)',
    )
      .bind(user.publicId, current.friend_code, Date.now())
      .run();

    // Generate new code
    let friendCode = '';
    let inserted = false;
    for (let attempts = 0; attempts < 5; attempts++) {
      friendCode = generateReadableCode();
      try {
        await env.DIRECTORY_DB.prepare(
          'INSERT INTO friend_code_directory (public_id, friend_code, display_name, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(user.publicId, friendCode, user.displayName, Date.now())
          .run();
        inserted = true;
        break;
      } catch (e: unknown) {
        if (String(e).includes('UNIQUE')) {
          continue;
        }
        throw e;
      }
    }

    if (!inserted) {
      throw new Error('Failed to generate unique friend code during rotation');
    }

    safeLog(`Rotated friend code for user ${user.publicId}`);

    return new Response(JSON.stringify({ friendCode }), { status: 200, headers: jsonHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: new BoardLinkError('ROTATE_FAILED', msg).toJSON() }),
      { status: 500, headers: jsonHeaders },
    );
  }
}

// 6. Friend Code Revoke Endpoint
export async function handleFriendCodeRevoke(
  _request: Request,
  user: AuthenticatedUser,
  env: Env,
): Promise<Response> {
  const jsonHeaders = { 'Content-Type': 'application/json' };
  if (!env.DIRECTORY_DB) {
    return new Response(
      JSON.stringify({
        error: new BoardLinkError('DB_UNAVAILABLE', 'Database connection missing').toJSON(),
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    const current = await env.DIRECTORY_DB.prepare(
      'SELECT friend_code FROM friend_code_directory WHERE public_id = ?',
    )
      .bind(user.publicId)
      .first<{ friend_code: string }>();

    if (!current) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('NOT_FOUND', 'No active friend code found to revoke').toJSON(),
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Delete active
    await env.DIRECTORY_DB.prepare('DELETE FROM friend_code_directory WHERE public_id = ?')
      .bind(user.publicId)
      .run();

    // Insert history
    await env.DIRECTORY_DB.prepare(
      'INSERT INTO friend_code_history (public_id, friend_code, created_at) VALUES (?, ?, ?)',
    )
      .bind(user.publicId, current.friend_code, Date.now())
      .run();

    safeLog(`Revoked friend code for user ${user.publicId}`);

    return new Response(JSON.stringify({ status: 'revoked' }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: new BoardLinkError('REVOKE_FAILED', msg).toJSON() }),
      { status: 500, headers: jsonHeaders },
    );
  }
}

/**
 * Derive the rate-limit bucket key for a request.
 *
 * Production: keyed on `CF-Connecting-IP`, which Cloudflare always sets and
 * overrides from any client-supplied value, so it cannot be spoofed to bypass
 * the limit.
 *
 * Local dev / CI E2E: `wrangler dev` also sets `CF-Connecting-IP` (to the
 * loopback), so every request would share one bucket and parallel tests would
 * contend. When no real `JWT_SECRET` is bound — which only happens outside
 * production, since production must bind a real secret — honour an explicit
 * `X-RL-Test-Bucket` header so each test isolates its own bucket. This header is
 * never consulted once a real secret is configured, so it cannot evade limits
 * in production.
 */
function getRateLimitKey(request: Request, env: Env): string {
  if (!env.JWT_SECRET) {
    const testBucket = request.headers.get('X-RL-Test-Bucket');
    if (testBucket) return `test:${testBucket}`;
  }
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;
  return '127.0.0.1';
}

/** Drop buckets with no recent activity to bound the in-memory map's growth. */
function sweepRateLimitMap(windowStart: number): void {
  if (lookupRateLimitMap.size < RATE_LIMIT_SWEEP_THRESHOLD) return;
  for (const [key, timestamps] of lookupRateLimitMap) {
    if (timestamps.every((t) => t <= windowStart)) {
      lookupRateLimitMap.delete(key);
    }
  }
}

// 7. Friend Code Lookup Endpoint (with rate limiting)
export async function handleFriendCodeLookup(
  request: Request,
  code: string,
  env: Env,
): Promise<Response> {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // Per-client sliding-window rate limiting (do not log the raw key — it is a
  // client IP in production, which AGENTS rules forbid persisting to logs).
  const bucketKey = getRateLimitKey(request, env);
  const now = Date.now();
  const windowStart = now - LOOKUP_RATE_WINDOW_MS;

  const activeTimestamps = (lookupRateLimitMap.get(bucketKey) ?? []).filter((t) => t > windowStart);

  if (activeTimestamps.length >= LOOKUP_RATE_LIMIT) {
    safeLog('Rate limit exceeded for friend code lookup.');
    return new Response(
      JSON.stringify({
        error: new BoardLinkError(
          'RATE_LIMIT_EXCEEDED',
          'Too many friend code lookups. Please wait a minute.',
        ).toJSON(),
      }),
      { status: 429, headers: jsonHeaders },
    );
  }

  activeTimestamps.push(now);
  lookupRateLimitMap.set(bucketKey, activeTimestamps);
  sweepRateLimitMap(windowStart);

  if (!env.DIRECTORY_DB) {
    return new Response(
      JSON.stringify({
        error: new BoardLinkError('DB_UNAVAILABLE', 'Database connection missing').toJSON(),
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    const row = await env.DIRECTORY_DB.prepare(
      'SELECT public_id, display_name FROM friend_code_directory WHERE friend_code = ?',
    )
      .bind(code)
      .first<{ public_id: string; display_name: string }>();

    if (!row) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('NOT_FOUND', 'Friend code not found').toJSON(),
        }),
        { status: 404, headers: jsonHeaders },
      );
    }

    safeLog(`Friend code lookup resolved to user ${row.public_id}`);

    return new Response(
      JSON.stringify({
        publicId: row.public_id,
        displayName: row.display_name,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: new BoardLinkError('LOOKUP_FAILED', msg).toJSON() }),
      { status: 500, headers: jsonHeaders },
    );
  }
}
