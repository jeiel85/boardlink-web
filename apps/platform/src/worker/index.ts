import { PROTOCOL_VERSION, BUILD_ID } from '@boardlink/protocol';
import { BoardLinkError } from '@boardlink/domain';
import { addSecurityHeaders } from './middleware/security.js';
import {
  handleChallenge,
  handleVerify,
  authenticateSession,
  handleFriendCodeIssue,
  handleFriendCodeRotate,
  handleFriendCodeRevoke,
  handleFriendCodeLookup,
} from './auth.js';
import { listGameIds } from './room/gameRegistry.js';

// Export Durable Objects for Cloudflare runtime binding discovery
export { RoomDO } from './durable-objects/RoomDO.js';
export { UserSessionDO } from './durable-objects/UserSessionDO.js';
export { NetworkPresenceDO } from './durable-objects/NetworkPresenceDO.js';

export interface Env {
  ROOMS: DurableObjectNamespace<import('./durable-objects/RoomDO.js').RoomDO>;
  USER_SESSIONS: DurableObjectNamespace<import('./durable-objects/UserSessionDO.js').UserSessionDO>;
  NETWORK_PRESENCE: DurableObjectNamespace<
    import('./durable-objects/NetworkPresenceDO.js').NetworkPresenceDO
  >;
  DIRECTORY_DB: D1Database;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  JWT_SECRET?: string;
  // When set to the string 'true', exposes the /api/test-* diagnostic routes
  // that instantiate Durable Objects / run a D1 query. Bound ONLY in local dev
  // (.dev.vars) and the workers test pool — never in the production wrangler
  // config — so these routes are unreachable on the public deployment and
  // cannot be used to burn the Cloudflare free-tier budget.
  ENABLE_TEST_ENDPOINTS?: string;
}

// Allowed WebSocket origins: localhost dev, workers.dev, and (when set) custom domain
function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  if (!env.JWT_SECRET) return true; // dev/test: skip origin check
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.hostname.endsWith('.workers.dev')) return true;
    if (u.hostname.endsWith('.boardlink.io')) return true;
  } catch {
    return false;
  }
  return false;
}

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket room connection: /room/:code/ws
    const wsMatch = url.pathname.match(/^\/room\/([A-Z0-9]{4,12})\/ws$/i);
    if (wsMatch && request.headers.get('Upgrade') === 'websocket') {
      const roomCode = wsMatch[1].toUpperCase();
      const origin = request.headers.get('Origin');
      if (!isAllowedOrigin(origin, env)) {
        return addSecurityHeaders(
          new Response(
            JSON.stringify({
              error: new BoardLinkError('FORBIDDEN', 'Origin not allowed').toJSON(),
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      const id = env.ROOMS.idFromName(roomCode);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    // 1. Route API requests
    if (url.pathname.startsWith('/api/')) {
      const apiResponse = await handleApiRequest(request, url, env);
      return addSecurityHeaders(apiResponse);
    }

    // 2. Route static assets (Vite build outputs / SPA)
    try {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const assetResponse = await env.ASSETS.fetch(request.clone() as unknown as Request);
        if (assetResponse.status !== 404) {
          return addSecurityHeaders(assetResponse);
        }
      }
    } catch {
      // Log error or ignore if env.ASSETS is missing (e.g. unit testing env)
    }

    // 3. SPA Fallback (non-API routes return index.html)
    try {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const spaRequest = new Request(new URL('/index.html', request.url), request);
        const spaResponse = await env.ASSETS.fetch(spaRequest);
        if (spaResponse.ok) {
          return addSecurityHeaders(spaResponse);
        }
      }
    } catch {
      // Fallback below
    }

    // If assets are unavailable (e.g. testing), return simple static text or 404
    return addSecurityHeaders(
      new Response('Static Asset Loader Unavailable', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
  },
};

async function handleApiRequest(request: Request, url: URL, env: Env): Promise<Response> {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // Health check endpoint
  if (url.pathname === '/api/health') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        buildId: BUILD_ID,
        protocolVersion: PROTOCOL_VERSION,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  // 1. Auth challenge endpoint
  if (url.pathname === '/api/auth/challenge') {
    return await handleChallenge(request, env);
  }

  // 2. Auth verify endpoint
  if (url.pathname === '/api/auth/verify') {
    return await handleVerify(request, env);
  }

  // List available games
  if (url.pathname === '/api/games' && request.method === 'GET') {
    return new Response(JSON.stringify({ games: listGameIds() }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  // Create a room
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    const user = await authenticateSession(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('UNAUTHORIZED', 'Authentication required').toJSON(),
        }),
        { status: 401, headers: jsonHeaders },
      );
    }
    try {
      const body = (await request.json().catch(() => ({}))) as { gameId?: string };
      const roomCode = generateRoomCode();
      const id = env.ROOMS.idFromName(roomCode);
      const stub = env.ROOMS.get(id);
      const initRes = await stub.fetch(
        new Request('https://internal/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            ownerId: user.publicId,
            ownerName: user.displayName,
            gameId: body.gameId ?? null,
          }),
        }),
      );
      if (!initRes.ok) throw new Error('Failed to initialize room');
      return new Response(JSON.stringify({ roomCode, gameId: body.gameId ?? null }), {
        status: 201,
        headers: jsonHeaders,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(
        JSON.stringify({ error: new BoardLinkError('ROOM_CREATE_FAILED', msg).toJSON() }),
        { status: 500, headers: jsonHeaders },
      );
    }
  }

  // 3. Friend Code Lookup endpoint (unprotected, rate-limited)
  if (url.pathname.startsWith('/api/friend-code/lookup/')) {
    const code = decodeURIComponent(url.pathname.substring(24));
    return await handleFriendCodeLookup(request, code, env);
  }

  // Protected routes below
  if (url.pathname.startsWith('/api/friend-code/')) {
    const user = await authenticateSession(request, env);
    if (!user) {
      return new Response(
        JSON.stringify({
          error: new BoardLinkError('UNAUTHORIZED', 'Invalid or expired session').toJSON(),
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

    if (url.pathname === '/api/friend-code/issue') {
      return await handleFriendCodeIssue(request, user, env);
    }
    if (url.pathname === '/api/friend-code/rotate') {
      return await handleFriendCodeRotate(request, user, env);
    }
    if (url.pathname === '/api/friend-code/revoke') {
      return await handleFriendCodeRevoke(request, user, env);
    }
  }

  // Diagnostic binding-verification routes (instantiate Durable Objects /
  // run a D1 query). Gated behind ENABLE_TEST_ENDPOINTS so they are only
  // reachable in local dev and the workers test pool. In production the flag
  // is unset, so these fall through to the 404 below — preventing anyone from
  // spinning up Durable Objects / D1 queries on the public deployment and
  // exhausting the Cloudflare free-tier budget.
  if (env.ENABLE_TEST_ENDPOINTS === 'true') {
    // Durable Object room test route
    if (url.pathname === '/api/test-do/rooms') {
      try {
        const id = env.ROOMS.idFromName('test-room');
        const stub = env.ROOMS.get(id);
        // Forward the request to DO /health
        return await stub.fetch(new Request(new URL('/health', request.url)));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new BoardLinkError('DO_ROOM_FAILED', msg || 'RoomDO fetch failed');
        return new Response(JSON.stringify({ error: err.toJSON() }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }

    // Durable Object user session test route
    if (url.pathname === '/api/test-do/sessions') {
      try {
        const id = env.USER_SESSIONS.idFromName('test-session');
        const stub = env.USER_SESSIONS.get(id);
        return await stub.fetch(new Request(new URL('/health', request.url)));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new BoardLinkError('DO_SESSION_FAILED', msg || 'UserSessionDO fetch failed');
        return new Response(JSON.stringify({ error: err.toJSON() }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }

    // Durable Object presence test route
    if (url.pathname === '/api/test-do/presence') {
      try {
        const id = env.NETWORK_PRESENCE.idFromName('test-presence');
        const stub = env.NETWORK_PRESENCE.get(id);
        return await stub.fetch(new Request(new URL('/health', request.url)));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new BoardLinkError(
          'DO_PRESENCE_FAILED',
          msg || 'NetworkPresenceDO fetch failed',
        );
        return new Response(JSON.stringify({ error: err.toJSON() }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }

    // D1 database test route
    if (url.pathname === '/api/test-d1') {
      try {
        if (!env.DIRECTORY_DB) {
          throw new Error('DIRECTORY_DB binding not found');
        }
        // D1 query test
        const result = await env.DIRECTORY_DB.prepare('SELECT 1 as connected').first<{
          connected: number;
        }>();
        if (result && result.connected === 1) {
          return new Response(JSON.stringify({ status: 'ok', db: 'connected' }), {
            status: 200,
            headers: jsonHeaders,
          });
        }
        throw new Error('D1 returned invalid response');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new BoardLinkError('D1_FAILED', msg || 'D1 query failed');
        return new Response(JSON.stringify({ error: err.toJSON() }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }
  }

  // Fallback for unknown API endpoints
  const err = new BoardLinkError('NOT_FOUND', `API endpoint not found: ${url.pathname}`);
  return new Response(JSON.stringify({ error: err.toJSON() }), {
    status: 404,
    headers: jsonHeaders,
  });
}
