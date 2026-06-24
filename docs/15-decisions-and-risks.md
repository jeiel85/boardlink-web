# Architecture Decisions and Risks

## ADR-001: Browser-first PWA

**Decision:** Ship as a responsive web app with optional PWA installation.

**Why:** Lowest access barrier across phones, tablets, and computers.

**Trade-off:** Browser APIs cannot provide reliable native-style LAN peer discovery or Bluetooth browser-to-browser communication.

## ADR-002: WebSocket first

**Decision:** Use WebSocket through Durable Objects as the initial multiplayer transport.

**Why:** Stable cross-browser path, simpler authority, reconnection, and testing.

**Trade-off:** Same-network games still traverse the server and may have more latency than direct P2P.

## ADR-003: Server-authoritative rooms

**Decision:** A Room Durable Object validates commands and emits events.

**Why:** Prevents divergent state and resolves concurrent commands.

**Trade-off:** Service operation and cost are required for network multiplayer.

## ADR-004: Accountless cryptographic device identity

**Decision:** Use a browser-generated key pair and rotatable friend code.

**Why:** No email/password while still proving control of an identity.

**Trade-off:** Browser data loss can lose identity; recovery must be explicit.

## ADR-005: Approximate nearby discovery

**Decision:** Group opt-in users by a privacy-minimized server-side network bucket.

**Why:** Pure PWAs cannot scan other browsers on the local network.

**Trade-off:** False positives and false negatives are unavoidable.

## ADR-006: No public chat or random matchmaking

**Decision:** Initial release is invitation-oriented.

**Why:** Reduces moderation, child-safety, privacy, and abuse risks.

**Trade-off:** Lower spontaneous discovery.

## ADR-007: Casual real-time competition

**Decision:** Bubble Siege is friendly-match only.

**Why:** Browser latency and modified clients prevent strong fairness guarantees.

**Trade-off:** No leaderboard or prizes.

## ADR-008: PWA update deferral

**Decision:** A new service worker cannot force-reload an active match.

**Why:** Protocol and state safety.

**Trade-off:** Some users remain on an old build until match completion.

## ADR-009: Friend-code lookup rate limiting and test isolation

**Decision:** Rate-limit the public friend-code lookup with a per-client sliding window keyed on `CF-Connecting-IP`. When no real `JWT_SECRET` is bound (non-production only), an explicit `X-RL-Test-Bucket` header may override the key so parallel E2E tests isolate their own bucket. The in-memory map is swept once it exceeds a size threshold.

**Why:** The lookup is unauthenticated and enumerable, so it needs abuse protection. `wrangler dev` sets a loopback `CF-Connecting-IP`, so without an isolation seam every local/CI test shares one bucket and contends under parallelism. Gating the seam on the absence of a real secret keeps it impossible to use in production, where a secret is always bound.

**Trade-off:** The in-memory limiter is per-isolate, not globally consistent; a future move to the configured `API_RATE_LIMITER` binding or a Durable Object would tighten enforcement.

## ADR-010: Log redaction as defense-in-depth

**Decision:** Keep secrets (tokens, raw IPs, complete friend codes) out of log call sites, and additionally pass everything through a pure `redactLogString`/`redactLogArg` pass that scrubs bearer/session tokens, JWK private material, signatures, and bare friend-code patterns.

**Why:** Regex-on-JSON redaction alone missed values interpolated into free-form messages. Extracting the redactor into a Cloudflare-free module also makes it unit-testable in the node gate.

**Trade-off:** Redaction patterns are heuristic; call sites must still avoid logging secrets rather than relying solely on the scrubber.

## Risk register

| Risk                      | Impact                      | Mitigation                                                    |
| ------------------------- | --------------------------- | ------------------------------------------------------------- |
| Nearby false positive     | Wrong person shown          | Opt-in, expiry, confirmation code                             |
| Browser data loss         | Identity/friends lost       | Persistent storage request, transfer/export                   |
| In-app browser limitation | Failed join                 | Full-route handoff, copy-link fallback                        |
| PWA stale version         | Protocol mismatch           | Version handshake and update gate                             |
| WebSocket abuse           | Cost/outage                 | Rate limits, size limits, Origin checks                       |
| DO placement latency      | Bubble fairness             | Casual mode, warning, future WebRTC                           |
| Multi-tab duplication     | Duplicate presence          | Web Locks/BroadcastChannel ownership                          |
| Modified clients          | Cheating                    | Server rules, no ranked rewards                               |
| Child usage               | Privacy/moderation          | No chat/uploads, legal review, minimum data                   |
| Dependency issue          | Security/build failure      | Lockfile, audits, scheduled updates                           |
| Room leak                 | Cost/data retention         | Alarms and TTL                                                |
| Secret exposure           | Network grouping compromise | Cloudflare secrets, rotation playbook                         |
| Stale `wrangler dev` dist | E2E runs old worker code    | Build before `test:e2e` (CI does); rebuild after worker edits |
| Friend-code enumeration   | Directory scraping          | Unauthenticated lookup rate limit, rotatable codes            |
