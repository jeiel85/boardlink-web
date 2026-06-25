# BoardLink Web Design Bundle

Production-ready design bundle for a free, accountless, browser-first multiplayer game platform.

> **Working name:** BoardLink  
> The product name is provisional. Perform domain, app-name, and trademark checks before public branding.

## ▶ Play it now

**Live:** https://boardlink.jeiel85.workers.dev

BoardLink is deployed and playable today:

- **Play vs computer** (same-device, no network) — Gomoku, Chess, and Janggi with
  Easy / Medium / Hard difficulty, Bingo against an auto-opponent, and the
  real-time Bubble Siege arena against a reactive bot.
- **Play online** — create a room, share the 6-character code, and play Gomoku,
  Chess, or Janggi in real time over WebSockets. Reconnecting mid-match restores
  the board.
- **Anonymous** — a device identity is generated on first visit; no account,
  email, or login. Installable as a PWA.

## Product statement

BoardLink lets people open a link on a phone, tablet, or computer and immediately play short multiplayer games.

Core entry paths:

1. **Play nearby** — discover users who appear to share the same Internet connection.
2. **Online friends** — find an anonymous device profile by friend code.
3. **Quick join** — enter a room code, scan a QR code, or open an invitation link.
4. **Same-device play** — play locally without a network.
5. **Install as PWA** — optional app-like installation.

No account, email address, phone number, advertising SDK, analytics SDK, social login, or public chat is required for the initial release.

## Games

All five launch games are implemented as deterministic modules on a shared,
server-authoritative game SDK (every match is replayable from its event log).

| Game            | vs Computer          | Online | Notes                                          |
| --------------- | -------------------- | ------ | ---------------------------------------------- |
| Gomoku (오목)   | ✅ (3 levels)        | ✅     | 15×15, five-in-a-row                           |
| Chess (체스)    | ✅ (3 levels)        | ✅     | full rules: castling, en passant, promotion    |
| Janggi (장기)   | ✅ (3 levels)        | ✅     | Korean chess — palace moves, cannons, checkmate |
| Bingo           | ✅ (auto-opponent)   | —      | turn-based draw / mark / claim                 |
| Bubble Siege    | ✅ (3 levels)        | —      | original asymmetric real-time arena; online play is next |

The computer opponent is a generic alpha-beta engine with per-game heuristics
(difficulty = search depth); Bingo uses a greedy auto-player.

Later: team and party modes, WebRTC direct transport, spectators, tournaments,
and experimental offline QR pairing.

## Recommended stack

- React 19
- TypeScript
- Vite 8
- React Router
- Cloudflare Vite plugin
- Cloudflare Workers
- Cloudflare Durable Objects with WebSocket Hibernation
- D1 for the anonymous public friend-code directory
- IndexedDB for local profile, friends, settings, and local history
- Zod for runtime schemas
- Vitest and `@cloudflare/vitest-pool-workers`
- Playwright for end-to-end browser testing
- `vite-plugin-pwa` or a directly managed Workbox service worker

Do not pin patch versions in design documents. Generate and commit a lockfile during Goal 00, then review dependency advisories before each release.

## Start here

1. Read `AGENTS.md`.
2. Read `docs/00-product-brief.md`.
3. Read `docs/02-system-architecture.md`.
4. Execute `goals/goal-00-bootstrap.md`.
5. Complete goals in numeric order.
6. Do not start a later game before the shared room runtime and game SDK are complete.

## Non-negotiable constraints

- Production-oriented design, not a throwaway MVP.
- Server-authoritative multiplayer state.
- No client is trusted for rules, scores, timers, identity ownership, or room permissions.
- Nearby discovery is approximate and must never be described as exact physical proximity.
- Real-time play is blocked in unsupported in-app browsers.
- PWA updates never activate in the middle of a match.
- Every protocol message is versioned and schema-validated.
- All game reducers are deterministic.
- All public identifiers are replaceable; internal identifiers are never exposed directly.
- Raw visitor IP addresses are not persisted by application code.
- No public free-text chat in the initial release.
- No ranked mode or prizes in the initial release.
- No third-party analytics, advertising, or tracking scripts.

## Bundle map

| Path         | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| `AGENTS.md`  | Global coding-agent rules                                     |
| `docs/`      | Product, architecture, protocol, security, UX, and operations |
| `goals/`     | Sequential vibe-coding execution prompts                      |
| `contracts/` | Initial API and protocol schemas                              |
| `reference/` | Configuration and CI reference files                          |

## Definition of launch-ready

A release candidate is launch-ready only when:

- Two real devices can discover, invite, join, play, disconnect, and reconnect.
- Android Chrome, Samsung Internet, iOS Safari, installed iOS PWA, Windows Chrome/Edge, macOS Safari/Chrome pass the supported matrix.
- KakaoTalk and other tested in-app browsers show a safe external-browser handoff.
- Bubble Siege passes deterministic timing and result tests.
- Room restoration, stale-client rejection, multi-tab locking, PWA update deferral, and rate limits are tested.
- Privacy notice, service terms, deletion/reset controls, and contact channel are published.
- Operational dashboards and rollback procedures are documented.

## Development and Deployment

### Local Development

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Start local development server (runs Vite client build + Wrangler dev):
   ```bash
   pnpm dev
   ```

### Quality and Testing

Run all quality checks before committing:

```bash
# Code formatting check
pnpm format:check
pnpm format  # To write formatting fixes

# Code linting
pnpm lint

# TypeScript compilation check
pnpm typecheck

# Package unit tests
pnpm test

# Workers runtime integration tests
pnpm test:workers

# End-to-End smoke tests (via Playwright)
pnpm test:e2e
```

### Production Build

Build the shared packages and the platform client assets/worker server:

```bash
pnpm build
```

### Preview Deployment

To deploy a preview release to Cloudflare:

1. Log in to your Cloudflare account using Wrangler CLI:
   ```bash
   pnpm exec wrangler login
   ```
2. Deploy the platform application:
   ```bash
   pnpm --filter @boardlink/platform deploy
   ```
