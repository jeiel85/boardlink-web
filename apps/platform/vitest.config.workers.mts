import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
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
