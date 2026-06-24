import { test, expect } from '@playwright/test';

interface BoardLinkE2E {
  navigate: (path: string) => void;
  forceMockContext: (newContext: string) => void;
  simulateMockUpdate: () => void;
  triggerUpdate: () => void;
  claimTakeover: () => void;
  isLeader: () => boolean;
  getTabId: () => string;
  isUpdateAvailable: () => boolean;
  isUpdateDeferred: () => boolean;
  matchActivityLock: () => boolean;
}

declare global {
  interface Window {
    __BOARDLINK_E2E__: BoardLinkE2E;
  }
}

interface MockBeforeInstallPromptEvent extends Event {
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

test.describe('BoardLink PWA and Browser Context E2E Tests', () => {
  // Test 1: Installed mode hides banner
  test('installed mode hides banner', async ({ page }) => {
    await page.goto('/');

    // Set context to installed-pwa
    await page.evaluate(() => {
      window.__BOARDLINK_E2E__.forceMockContext('installed-pwa');
    });

    // Fire mock beforeinstallprompt (simulate PWA trigger)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as unknown as MockBeforeInstallPromptEvent;
      event.preventDefault = () => {};
      event.prompt = async () => {};
      Object.defineProperty(event, 'userChoice', {
        value: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    // Verify banner is hidden
    const banner = page.locator('#pwa-install-banner');
    await expect(banner).toBeHidden();
  });

  // Test 2: Dismissal hides banner for configured period (7 days)
  test('dismissal hides banner for configured period', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      window.__BOARDLINK_E2E__.forceMockContext('supported-browser');
    });

    // Fire install prompt
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as unknown as MockBeforeInstallPromptEvent;
      event.preventDefault = () => {};
      event.prompt = async () => {};
      Object.defineProperty(event, 'userChoice', {
        value: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    // Verify banner is visible
    const banner = page.locator('#pwa-install-banner');
    await expect(banner).toBeVisible();

    // Click dismiss
    await page.click('#dismiss-banner-button');
    await expect(banner).toBeHidden();

    // Reload the page
    await page.reload();

    // Re-mock and fire event
    await page.evaluate(() => {
      window.__BOARDLINK_E2E__.forceMockContext('supported-browser');
    });
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as unknown as MockBeforeInstallPromptEvent;
      event.preventDefault = () => {};
      event.prompt = async () => {};
      Object.defineProperty(event, 'userChoice', {
        value: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    // Banner should remain hidden due to the dismissal timestamp in localStorage
    await expect(banner).toBeHidden();
  });

  // Test 3: Chromium install event stored and triggered only on click
  test('Chromium install event stored and triggered only on click', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      window.__BOARDLINK_E2E__.forceMockContext('supported-browser');
    });

    // Fire install prompt
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as unknown as MockBeforeInstallPromptEvent;
      event.preventDefault = () => {};
      event.prompt = async () => {};
      Object.defineProperty(event, 'userChoice', {
        value: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    const banner = page.locator('#pwa-install-banner');
    await expect(banner).toBeVisible();

    // Click install button
    await page.click('#install-action-button');
    await expect(banner).toBeHidden();
  });

  // Test 4: iOS guide displays instead of fake install prompt (iOS Safari Emulation)
  test.describe('iOS Safari tests', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    });

    test('iOS guide displays instead of fake install prompt', async ({ page }) => {
      await page.goto('/');

      // Check if banner is visible automatically (iOS Safari auto-triggers)
      const banner = page.locator('#pwa-install-banner');
      await expect(banner).toBeVisible();

      // Check that the iOS-specific manual guide shows
      const guide = page.locator('#ios-install-guide');
      await expect(guide).toBeVisible();

      // Install button must NOT show on iOS
      const installBtn = page.locator('#install-action-button');
      await expect(installBtn).toBeHidden();
    });
  });

  // Test 5: In-app route gate preserves invitation token and gates rooms
  test('in-app route gate preserves invitation token and gates rooms', async ({ page }) => {
    // 1. Landing and join page should load normally inside in-app webview
    await page.goto('/join/token-preview-123');
    await page.evaluate(() => {
      window.__BOARDLINK_E2E__.forceMockContext('suspected-in-app-browser');
    });

    // Join page should render
    const joinPage = page.locator('#join-page');
    await expect(joinPage).toBeVisible();

    const tokenVal = page.locator('#invitation-token');
    await expect(tokenVal).toHaveText('token-preview-123');

    const inAppGate = page.locator('#in-app-gate');
    await expect(inAppGate).toBeHidden();

    // 2. Real-time room route must be gated in-app
    await page.goto('/room/game-match-456');
    await page.evaluate(() => {
      window.__BOARDLINK_E2E__.forceMockContext('suspected-in-app-browser');
    });

    // In-app gate must block the view
    await expect(inAppGate).toBeVisible();

    const deepLinkValue = page.locator('#deep-link-value');
    await expect(deepLinkValue).toHaveText('/room/game-match-456');
  });

  // Test 6: Android fallback works when intent fails
  test.describe('Android tests', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.119 Mobile Safari/537.36 KAKAOTALK',
    });

    test('Android fallback works when intent fails', async ({ page }) => {
      await page.goto('/room/room-789');

      await page.evaluate(() => {
        window.__BOARDLINK_E2E__.forceMockContext('suspected-in-app-browser');
      });

      // Check handoff button and intent URL structure
      const handoffBtn = page.locator('#android-handoff-button');
      await expect(handoffBtn).toBeVisible();

      const href = await handoffBtn.getAttribute('href');
      expect(href).not.toBeNull();
      expect(href).toContain('intent://');
      expect(href).toContain('S.browser_fallback_url=');
    });
  });

  // Test 7: Normal browser is not falsely blocked
  test('normal browser is not falsely blocked', async ({ page }) => {
    await page.goto('/room/room-abc');

    const roomPage = page.locator('#room-page');
    await expect(roomPage).toBeVisible();

    const inAppGate = page.locator('#in-app-gate');
    await expect(inAppGate).toBeHidden();
  });

  // Test 8: Multi-tab leader election and takeover takeover
  test('multi-tab leader election and takeover invalidates previous leader', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    // First tab is the leader
    const status1 = page.locator('#leader-status');
    await expect(status1).toHaveText('LEADER');

    // Open a second tab
    const page2 = await context.newPage();
    await page2.goto('/');

    // Second tab is inactive/follower
    const status2 = page2.locator('#leader-status');
    await expect(status2).toHaveText('INACTIVE');

    const activeGate2 = page2.locator('#tab-active-gate');
    await expect(activeGate2).toBeVisible();

    // Click Takeover on the second tab
    await page2.click('#takeover-button');

    // Second tab becomes leader
    await expect(status2).toHaveText('LEADER');
    await expect(activeGate2).toBeHidden();

    // First tab must be invalidated and become inactive
    await expect(status1).toHaveText('INACTIVE');
    const activeGate1 = page.locator('#tab-active-gate');
    await expect(activeGate1).toBeVisible();
  });

  // Test 10: Offline app shell loads from the service worker cache
  test('offline app shell loads from the service worker cache', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('BoardLink');

    // Wait for the service worker to activate, then reload so it controls the
    // page and the shell + JS bundle are cached.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 15000,
    });
    await page.waitForLoadState('networkidle');

    // Go offline and reload — the cached shell must still render.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1')).toHaveText('BoardLink', { timeout: 15000 });
    await context.setOffline(false);
  });

  // Test 11: API/invitation responses are never served from cache
  test('API responses are never served from the service worker cache', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('BoardLink');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 15000,
    });
    await page.waitForLoadState('networkidle');

    // Prime a successful API response while online.
    const onlineStatus = await page.evaluate(async () => {
      const res = await fetch('/api/health', { cache: 'no-store' });
      return res.status;
    });
    expect(onlineStatus).toBe(200);

    // Offline: the API must NOT be served from cache, so the request must fail
    // rather than return a stale (e.g. invitation validation) response.
    await context.setOffline(true);
    const offlineResult = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        return { ok: true, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      }
    });
    await context.setOffline(false);
    expect(offlineResult.ok).toBe(false);
  });

  // Test 12: Service-worker update waits during simulated match
  test('service-worker update waits during active match', async ({ page }) => {
    await page.goto('/room/room-test-update');

    const matchLock = page.locator('#match-lock-status');
    await expect(matchLock).toHaveText('ACTIVE');

    // Simulate SW Update
    await page.click('#mock-sw-update-btn');

    // Update status should be deferred
    const swStatus = page.locator('#sw-status-label');
    await expect(swStatus).toHaveText('Deferred (In Match)');

    // Exit match to release lock
    await page.click('#leave-room-button');

    // Status changes to Available
    await expect(swStatus).toHaveText('Available');
  });
});
