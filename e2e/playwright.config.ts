import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox and WebKit run the cross-browser smoke suite only. The PWA and
    // identity suites rely on Chromium-only APIs (beforeinstallprompt, etc.).
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /smoke\.test\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /smoke\.test\.ts/,
    },
  ],
  webServer: {
    command: 'npx pnpm --filter @boardlink/platform dev',
    url: 'http://localhost:8787/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
