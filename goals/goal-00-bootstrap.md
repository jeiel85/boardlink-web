# Goal 00 — Production Repository Bootstrap

## Mission

Create a production-oriented monorepo for BoardLink using React, TypeScript, Vite, the Cloudflare Vite plugin, Workers, Durable Objects, D1, Vitest, and Playwright.

Do not implement game rules yet.

## Required outcomes

- pnpm workspace
- strict TypeScript
- React SPA
- Cloudflare Worker serving SPA and API
- Durable Object bindings for Room, UserSession, NetworkPresence
- D1 binding
- local persistence configuration
- environment-safe configuration
- lint, format, typecheck, unit tests, Workers tests, E2E smoke test
- GitHub Actions
- generated build ID and protocol version
- health endpoint
- structured error model
- no third-party analytics

## Implementation constraints

- Follow `AGENTS.md`.
- Use current stable compatible package versions and commit the lockfile.
- Use a current Cloudflare compatibility date.
- Do not hard-code account IDs or secrets.
- Do not add Next.js.
- Do not add a database ORM unless D1 complexity requires it later.
- Do not add WebRTC.
- Do not add user accounts.

## Tasks

1. Create workspace structure from `docs/03-repository-structure.md`.
2. Configure Cloudflare Vite plugin.
3. Configure Worker static assets and SPA fallback.
4. Add Durable Object classes with health-only placeholder behavior.
5. Add SQLite-class migrations for Durable Objects.
6. Add D1 migration folder.
7. Add common ID, error, and result types.
8. Add protocol version constant and build metadata.
9. Add CSP/security headers middleware.
10. Configure Vitest for pure packages.
11. Configure `@cloudflare/vitest-pool-workers`.
12. Configure Playwright Chromium/Firefox/WebKit smoke tests.
13. Add GitHub Actions from reference file, corrected to actual project paths.
14. Add dependency audit script.
15. Add README commands.

## Required tests

- SPA route fallback
- `/api/health`
- production security headers
- unknown API returns typed 404
- each Durable Object binding resolves
- D1 test binding resolves
- build ID is non-empty
- no production bundle includes forbidden analytics domains

## Completion criteria

- All quality commands pass.
- Local Worker serves the SPA.
- Worker tests run in the Workers runtime.
- Preview deployment instructions are documented.
- No game-specific code exists.
