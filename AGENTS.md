# Coding Agent Rules

These instructions apply to every coding agent working on BoardLink.

## Working method

1. Read the current goal file completely before editing.
2. Inspect existing code and tests before creating new abstractions.
3. Implement only the current goal.
4. Keep the application runnable after every meaningful change.
5. Add or update tests in the same change as production code.
6. Run formatting, linting, type checking, unit tests, Worker tests, and relevant E2E tests.
7. Update architecture documentation when a design decision changes.
8. Record non-trivial decisions in `docs/15-decisions-and-risks.md`.
9. Never silently weaken acceptance criteria.
10. Do not mark a goal complete while any listed completion check is unverified.

## Architecture rules

- The browser UI, domain model, protocol, and Cloudflare runtime must remain separately testable.
- `packages/domain` and game reducers must not import React, Cloudflare runtime APIs, browser globals, or storage libraries.
- The server is authoritative for room membership, role assignment, timers, commands, events, and final scores.
- A client may render optimistic feedback but must reconcile to server events.
- All state transitions occur through explicit commands and events.
- Do not mutate authoritative state outside reducers/state machines.
- Do not use wall-clock time inside deterministic game reducers.
- Do not use ambient randomness. Pass a seed or explicit random values.
- Do not add WebRTC before the WebSocket transport and fallback path are stable.
- Do not add a global mutable singleton for room or game state.
- Avoid a single global Durable Object. Partition by room, public identity, or network bucket.

## TypeScript rules

- Strict mode is mandatory.
- Do not use `any` unless isolated behind a documented compatibility boundary.
- Parse all external input with runtime schemas.
- Use branded types for IDs where practical.
- Use exhaustive switches for protocol message types and game phases.
- Never trust a client-provided timestamp, score, role, player ID, or permission.
- Prefer pure functions and readonly data.
- Keep transport DTOs separate from domain entities.

## Security and privacy rules

- No third-party scripts without an explicit architecture decision and privacy review.
- No analytics SDK, advertising SDK, fingerprinting, or hidden telemetry.
- Never persist raw IP addresses in application databases or logs.
- Do not expose network bucket values to clients.
- Validate WebSocket `Origin`.
- Require an identity challenge before issuing an authenticated session.
- Apply command-specific and connection-specific rate limits.
- Limit WebSocket message size.
- Use allowlists for message and event types.
- Escape or avoid all user-controlled display text.
- Generated display names come from curated word lists in the initial release.
- Secrets belong in Cloudflare secret bindings, never source code.
- Logs must not contain private keys, recovery payloads, complete invitation tokens, raw IPs, or complete friend codes.

## PWA rules

- The service worker must use an explicit update flow.
- Never call `skipWaiting()` automatically while a match is active.
- Cache static assets, not active room state or mutable API responses.
- Never serve stale invitation validation responses from a cache.
- Preserve deep links during browser handoff.
- Installed mode, normal browser mode, and suspected in-app browser mode must be tested independently.

## UX rules

- The landing page remains viewable in an in-app browser.
- Real-time routes require a supported browser.
- Android external-browser intents must have a fallback.
- iOS must provide manual browser-opening instructions and copy-link fallback.
- Nearby discovery is opt-in and automatically expires.
- The UI says “nearby” or “same Internet connection estimated”; it does not claim exact physical proximity.
- Connection quality and reconnection state must be visible.
- Do not use color as the only state indicator.
- Respect reduced-motion preferences.
- Touch targets must remain usable on small screens.

## Quality gates

Every goal must pass:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

A goal may narrow E2E scope during development, but the final goal must run the full matrix.

## Forbidden shortcuts

- Client-calculated final scores
- `setInterval` as the authoritative match clock
- Storing friend relationships only in component state
- Relying only on User-Agent detection
- Treating same public IP as proof of the same router
- Public chat before moderation and abuse controls exist
- Permanent room records without a documented retention need
- Updating a running game by forcibly reloading the PWA
- Shipping with default Cloudflare placeholder secrets
- Disabling tests to make CI pass
