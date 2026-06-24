import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // The /api/test-* diagnostic routes are gated behind this flag in the
      // worker. It is intentionally absent from the production wrangler config,
      // so we bind it here to keep the binding-verification tests exercising
      // those routes. Mirrors the local-dev .dev.vars value.
      miniflare: { bindings: { ENABLE_TEST_ENDPOINTS: 'true' } },
    }),
  ],
  ssr: {
    noExternal: [/@cloudflare\/vitest-pool-workers/],
  },
  test: {
    // Only the SELF-based integration test needs the workers pool. Pure-logic
    // tests (auth, log-redaction) run in the node `test` gate instead.
    include: ['test/worker.test.ts'],
    server: {
      deps: {
        inline: [/@cloudflare\/vitest-pool-workers/],
      },
    },
  },
});
