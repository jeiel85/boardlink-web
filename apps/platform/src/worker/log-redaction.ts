/**
 * Pure log-redaction helpers.
 *
 * Kept free of Cloudflare/runtime imports so they can be unit-tested in the
 * standard node test gate (not only the workers pool).
 *
 * AGENTS rule: logs must never contain private keys, recovery payloads,
 * complete invitation/session tokens, raw IPs, or complete friend codes. This
 * is defense-in-depth: call sites must already avoid passing secrets to logs,
 * but any that slip through interpolation are scrubbed here too.
 */

// Friend codes are emitted as 4-4 groups (e.g. ABCD-2345). Match any 4-4
// uppercase alphanumeric token so interpolated bare codes are caught even
// though the generator excludes ambiguous glyphs. Public IDs are 64-char
// lowercase hex and never match this pattern.
const FRIEND_CODE_PATTERN = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g;

/** Redact secrets from a single log string. */
export function redactLogString(input: string): string {
  let s = input;

  // Authorization / bearer + bare session tokens (publicId:displayName:exp:sig)
  s = s.replace(/Bearer\s+[A-Za-z0-9._:-]+/g, 'Bearer [REDACTED]');

  // JSON token/secret fields
  s = s.replace(/"(sessionToken|serverToken|challenge)"\s*:\s*"[^"]*"/g, '"$1":"[REDACTED]"');
  s = s.replace(/"friendCode"\s*:\s*"[^"]*"/g, '"friendCode":"[REDACTED]"');

  // JWK private exponent
  s = s.replace(/"d"\s*:\s*"[A-Za-z0-9_-]+"/g, '"d":"[REDACTED]"');

  // Signature hex blobs
  s = s.replace(/"signature"\s*:\s*"[a-fA-F0-9]{64,150}"/g, '"signature":"[REDACTED]"');

  // Bare friend codes anywhere (interpolated into free-form messages)
  s = s.replace(FRIEND_CODE_PATTERN, '[REDACTED-CODE]');

  return s;
}

/** Redact secrets from an arbitrary log argument (string or structured). */
export function redactLogArg(arg: unknown): unknown {
  if (typeof arg === 'string') {
    return redactLogString(arg);
  }
  try {
    return JSON.parse(redactLogString(JSON.stringify(arg)));
  } catch {
    return arg;
  }
}
