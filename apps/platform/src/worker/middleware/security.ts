export function addSecurityHeaders(response: Response): Response {
  // Clone response so we can modify its headers
  const newResponse = new Response(response.body, response);

  // NOTE: script-src still allows 'unsafe-inline'. Tightening to 'self' only is
  // desirable (docs/11 targets a no-third-party-script CSP) but must be verified
  // in a real browser first — the SSR/unit path does not exercise the CSP, so a
  // premature change could silently break the app. Tracked for a follow-up.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  newResponse.headers.set('Content-Security-Policy', csp);
  newResponse.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newResponse.headers.set('X-XSS-Protection', '1; mode=block');
  newResponse.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

  return newResponse;
}
