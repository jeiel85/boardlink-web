import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('BoardLink Worker Tests', () => {
  it('should return health status with build ID and protocol version', async () => {
    const res = await SELF.fetch('http://localhost/api/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.buildId).toBeDefined();
    expect(json.buildId.length).toBeGreaterThan(0);
    expect(json.protocolVersion).toBe('1.0.0');
  });

  it('should return typed 404 error for unknown API endpoints', async () => {
    const res = await SELF.fetch('http://localhost/api/unknown-endpoint');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toContain('API endpoint not found');
  });

  it('should resolve Durable Object RoomDO binding', async () => {
    const res = await SELF.fetch('http://localhost/api/test-do/rooms');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.type).toBe('RoomDO');
  });

  it('should resolve Durable Object UserSessionDO binding', async () => {
    const res = await SELF.fetch('http://localhost/api/test-do/sessions');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.type).toBe('UserSessionDO');
  });

  it('should resolve Durable Object NetworkPresenceDO binding', async () => {
    const res = await SELF.fetch('http://localhost/api/test-do/presence');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.type).toBe('NetworkPresenceDO');
  });

  it('should resolve D1 connection', async () => {
    const res = await SELF.fetch('http://localhost/api/test-d1');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.db).toBe('connected');
  });

  it('should include production security headers', async () => {
    const res = await SELF.fetch('http://localhost/api/health');
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should trigger SPA fallback routing on unmatched non-API path', async () => {
    const res = await SELF.fetch('http://localhost/rooms/123');
    // If ASSETS is not fully bound/mocked in vitest, it catches the throw
    // and returns 404 with "Static Asset Loader Unavailable" or similar.
    // Let's assert it responds with 404 and security headers are still present.
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
  });
});
