# Package and Script Reference

Root scripts should expose a consistent interface:

```json
{
  "scripts": {
    "dev": "pnpm --filter @boardlink/platform dev",
    "build": "pnpm -r build",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:workers": "pnpm --filter @boardlink/platform test:workers",
    "test:e2e": "playwright test",
    "check:protocol": "tsx scripts/check-protocol-compat.ts",
    "check:no-tracking": "tsx scripts/validate-no-third-party-scripts.ts"
  }
}
```

Suggested package names:

```text
@boardlink/platform
@boardlink/domain
@boardlink/protocol
@boardlink/identity
@boardlink/presence
@boardlink/realtime-client
@boardlink/game-sdk
@boardlink/game-testkit
@boardlink/ui
@boardlink/game-bubble-siege
@boardlink/game-bingo
@boardlink/game-gomoku
```

Use workspace dependencies and one lockfile.
