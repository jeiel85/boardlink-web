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
  forceMockIdentityBlock: (block: boolean) => void;
  getFriendCode: () => string | null;
}

declare global {
  interface Window {
    __BOARDLINK_E2E__: BoardLinkE2E;
  }
}

// Friend-code lookup is rate-limited per client bucket. Locally every request
// shares the same IP, so under fullyParallel separate tests would contend on one
// bucket and flake. Give each page/context a unique X-RL-Test-Bucket header so
// each test exercises the limiter in isolation. The worker only honours this
// header when CF-Connecting-IP is absent (i.e. local/dev), never in production.
const uniqueBucket = (label: string): string => `${label}-${crypto.randomUUID()}`;

test.describe('BoardLink Cryptographic Device Identity and Friend Codes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-RL-Test-Bucket': uniqueBucket('default') });
  });

  // Test 1: Verify public ID stability (survives reloads)
  test('identity survives reload and remains stable', async ({ page }) => {
    await page.goto('/');

    const idLabel = page.locator('#profile-public-id');
    await expect(idLabel).toBeVisible();

    const originalId = await idLabel.textContent();
    expect(originalId).not.toBeNull();
    expect(originalId!.length).toBeGreaterThan(0);

    // Reload
    await page.reload();
    await expect(idLabel).toBeVisible();

    const reloadedId = await idLabel.textContent();
    expect(reloadedId).toBe(originalId);
  });

  // Test 2: Reset produces new identity
  test('reset produces a new unique identity', async ({ page }) => {
    await page.goto('/');

    const idLabel = page.locator('#profile-public-id');
    await expect(idLabel).toBeVisible();
    const originalId = await idLabel.textContent();

    // Click Reset
    await page.click('#reset-identity-btn');

    // Page reloads automatically, wait for the ID
    await expect(idLabel).toBeVisible();
    const newId = await idLabel.textContent();

    expect(newId).not.toBeNull();
    expect(newId).not.toBe(originalId);
  });

  // Test 3: Friend code uniqueness, lookup, rotation, and revocation
  test('friend code issue, lookup, rotate, and revoke flow', async ({ page, browser }) => {
    // 1. Issue friend code on Page 1
    await page.goto('/');
    const p1NameLabel = page.locator('#profile-display-name');
    const p1IdLabel = page.locator('#profile-public-id');
    await expect(p1NameLabel).toBeVisible();

    const p1Name = await p1NameLabel.textContent();
    const p1Id = await p1IdLabel.textContent();

    // Click issue button
    const issueBtn = page.locator('#issue-friend-code-btn');
    await issueBtn.click();

    const codeLabel = page.locator('#friend-code-value');
    await expect(codeLabel).toBeVisible();
    const code = await codeLabel.textContent();
    expect(code).not.toBeNull();
    expect(code!.length).toBeGreaterThan(0);

    // 2. Open Page 2 (separate context to represent a different client).
    // Page 2 performs all the lookups, so give it its own rate-limit bucket.
    const context2 = await browser.newContext({
      extraHTTPHeaders: { 'X-RL-Test-Bucket': uniqueBucket('flow-p2') },
    });
    const page2 = await context2.newPage();
    await page2.goto('/');

    const p2CodeBtn = page2.locator('#issue-friend-code-btn');
    await p2CodeBtn.click();

    const p2CodeLabel = page2.locator('#friend-code-value');
    await expect(p2CodeLabel).toBeVisible();
    const p2Code = await p2CodeLabel.textContent();
    expect(p2Code).not.toBe(code); // codes must be unique

    // 3. Lookup Page 1's code on Page 2
    await page2.fill('#lookup-input', code!);
    await page2.click('#lookup-btn');

    // Verify lookup result
    const resultSuccess = page2.locator('#lookup-result-success');
    await expect(resultSuccess).toBeVisible();
    await expect(resultSuccess).toContainText(p1Name!);
    await expect(resultSuccess).toContainText(p1Id!);

    // 4. Rotate code on Page 1 (wait for the displayed code to actually change
    // — the rotate POST is async, so polling avoids reading the stale value).
    await page.click('#rotate-friend-code-btn');
    await expect(codeLabel).not.toHaveText(code!);
    const newCode = await codeLabel.textContent();
    expect(newCode).not.toBe(code);

    // 5. Lookup old code on Page 2 (should fail)
    await page2.fill('#lookup-input', code!);
    await page2.click('#lookup-btn');

    const resultNotFound = page2.locator('#lookup-result-notfound');
    await expect(resultNotFound).toBeVisible();

    // 6. Lookup new code on Page 2 (should succeed)
    await page2.fill('#lookup-input', newCode!);
    await page2.click('#lookup-btn');
    await expect(resultSuccess).toBeVisible();
    await expect(resultSuccess).toContainText(p1Name!);

    // 7. Revoke code on Page 1
    await page.click('#revoke-friend-code-btn');
    await expect(codeLabel).toBeHidden();

    // 8. Lookup new code on Page 2 again (should fail)
    await page2.fill('#lookup-input', newCode!);
    await page2.click('#lookup-btn');
    await expect(resultNotFound).toBeVisible();
  });

  // Test 4: Lookup rate limit
  test('lookup endpoint enforces sliding rate limit of 5 requests per minute', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('#lookup-input');
    const button = page.locator('#lookup-btn');
    const rateLimitLabel = page.locator('#lookup-result-ratelimit');

    await expect(input).toBeVisible();

    // Rapidly query 6 times. 5 should succeed or return notfound; the 6th must return 429 rate limit.
    for (let i = 0; i < 6; i++) {
      await input.fill(`MOCK-CODE-${i}`);
      await button.click();
      // Wait a tiny bit for response processing
      await page.waitForTimeout(100);
    }

    await expect(rateLimitLabel).toBeVisible();
  });

  // Test 5: Actionable IndexedDB support warning banner
  test('IndexedDB blocked state displays actionable warning banner', async ({ page }) => {
    await page.goto('/');

    const banner = page.locator('#indexeddb-error-banner');
    await expect(banner).toBeHidden();

    // Block IndexedDB using mock controls
    await page.click('#toggle-mock-indexeddb-btn');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('IndexedDB Blocked or Unsupported');

    // Allow IndexedDB back
    await page.click('#toggle-mock-indexeddb-btn');
    await expect(banner).toBeHidden();
  });
});
