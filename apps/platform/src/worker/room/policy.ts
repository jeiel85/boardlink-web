// Pure policy helpers for the room runtime (goal-09 hardening).
// Extracted from RoomDO so the security/operations logic is unit-testable in the
// node pool — the Durable Object itself only runs in the workers pool (skipped on
// Windows). RoomDO wires these in; the decisions live here.

// ---------- protocol version compatibility (docs/05 §Version compatibility) ----------

// Parse the leading major number of a semver-ish string ("1.2.3" → 1).
export function protocolMajor(version: string): number | null {
  const m = /^\s*(\d+)/.exec(version);
  return m ? parseInt(m[1], 10) : null;
}

// "Same protocol major required." Returns false on missing/unparseable input.
export function isProtocolCompatible(clientVersion: string, serverVersion: string): boolean {
  const c = protocolMajor(clientVersion);
  const s = protocolMajor(serverVersion);
  if (c === null || s === null) return false;
  return c === s;
}

// ---------- alarm scheduling (shared TTL + match alarm) ----------

// A Durable Object has a single alarm slot. The room must fire it for whichever
// comes first: the next match tick or the room-expiry/cleanup time. Returns the
// soonest finite candidate, or null if there is nothing to schedule.
export function earliestAlarm(candidates: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) {
      if (best === null || c < best) best = c;
    }
  }
  return best;
}

// ---------- invalid-schema disconnect threshold (docs/11 rate limits) ----------

// "Invalid WebSocket schema → Disconnect after 3."
export const MAX_INVALID_MESSAGES = 3;

export function shouldDisconnectForInvalid(invalidCount: number): boolean {
  return invalidCount >= MAX_INVALID_MESSAGES;
}
