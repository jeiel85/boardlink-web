# Repository Structure

```text
boardlink/
├─ apps/
│  └─ platform/
│     ├─ src/
│     │  ├─ client/
│     │  │  ├─ app/
│     │  │  ├─ routes/
│     │  │  ├─ components/
│     │  │  ├─ features/
│     │  │  ├─ pwa/
│     │  │  ├─ browser-context/
│     │  │  ├─ realtime/
│     │  │  ├─ storage/
│     │  │  └─ main.tsx
│     │  └─ worker/
│     │     ├─ api/
│     │     ├─ durable-objects/
│     │     ├─ middleware/
│     │     ├─ security/
│     │     ├─ storage/
│     │     └─ index.ts
│     ├─ public/
│     ├─ test/
│     ├─ vite.config.ts
│     ├─ vitest.config.ts
│     ├─ wrangler.jsonc
│     └─ package.json
│
├─ packages/
│  ├─ domain/
│  ├─ protocol/
│  ├─ identity/
│  ├─ presence/
│  ├─ realtime-client/
│  ├─ game-sdk/
│  ├─ game-testkit/
│  ├─ ui/
│  ├─ games-bubble-siege/
│  ├─ games-bingo/
│  ├─ games-gomoku/
│  ├─ games-chess/
│  └─ games-janggi/
│
├─ e2e/
│  ├─ fixtures/
│  ├─ browser-context/
│  ├─ invitations/
│  ├─ pwa/
│  ├─ realtime/
│  └─ games/
│
├─ scripts/
│  ├─ check-protocol-compat.ts
│  ├─ generate-build-info.ts
│  ├─ generate-pwa-assets.ts
│  └─ validate-no-third-party-scripts.ts
│
├─ docs/
├─ .github/workflows/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.js
└─ README.md
```

## Package responsibilities

### `domain`

- Branded IDs
- Room and player concepts
- Generic command/event types
- State-machine utilities
- Errors and result types

### `protocol`

- Protocol envelope
- Runtime schemas
- Version negotiation
- JSON canonicalization
- Message encoding/decoding
- Compatibility fixtures

### `identity`

- Browser key generation
- Public ID derivation
- Challenge signing
- Friend-code model
- Recovery export/import format

The browser-dependent implementation may live behind adapters. Keep cryptographic data types shared.

### `presence`

- Presence DTOs
- Expiry rules
- Network-bucket policy types
- Invite confirmation-code logic

### `realtime-client`

- WebSocket connection state machine
- Reconnect and resume
- Sequence gap detection
- Snapshot reconciliation
- Ping and latency estimation

### `game-sdk`

- Game definition interface
- Deterministic reducer contract
- Player projection contract
- Configuration validation
- Result calculation

### `game-testkit`

- Determinism tests
- Event replay
- Fuzzed command streams
- State hashing
- Golden protocol fixtures

### `ui`

- Shared buttons, dialogs, banners, cards, connection indicators
- Accessible game-shell layout
- PWA install banner
- External-browser gate

### `games-*`

Each game contains:

```text
src/
├─ domain/
├─ commands/
├─ events/
├─ rules/
├─ reducer/
├─ renderer-model/
├─ serialization/
└─ index.ts

test/
├─ rules.test.ts
├─ determinism.test.ts
├─ replay.test.ts
└─ fixtures/
```

## Dependency direction

```text
games → game-sdk → domain
protocol → domain
worker → protocol + game-sdk + games
client → protocol + game-sdk + games + ui
```

Forbidden:

- `domain` importing a game
- game packages importing React
- game packages importing Cloudflare APIs
- Worker code importing client UI
- client code directly importing Durable Object classes
