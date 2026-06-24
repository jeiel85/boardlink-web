export function addSecurityHeaders(response: Response): Response {
  // Clone response so we can modify its headers
  const newResponse = new Response(response.body, response);

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
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
