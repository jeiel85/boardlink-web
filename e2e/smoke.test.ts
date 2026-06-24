import { test, expect } from '@playwright/test';

test.describe('BoardLink E2E Smoke Tests', () => {
  test('should load the React SPA landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/BoardLink/);

    const heading = page.locator('h1');
    await expect(heading).toHaveText('BoardLink');

    const protocolVersion = page.locator('#protocol-version');
    await expect(protocolVersion).toHaveText('1.0.0');

    const serviceStatus = page.locator('#service-status');
    await expect(serviceStatus).toHaveText('ONLINE');
  });

  test('should return 404 for unknown api endpoint', async ({ request }) => {
    const res = await request.get('/api/unknown-testing-endpoint');
    expect(res.status()).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe('NOT_FOUND');
  });

  test('should fallback to index.html for unknown SPA routes', async ({ page }) => {
    await page.goto('/rooms/abc');
    const heading = page.locator('h1');
    await expect(heading).toHaveText('BoardLink');
  });
});
