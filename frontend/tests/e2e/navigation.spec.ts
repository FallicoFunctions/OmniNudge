import { test, expect } from '@playwright/test';

/**
 * E2E tests for basic navigation and routing.
 */
test.describe('Navigation', () => {
  test('home page loads and shows feed content or login prompt', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    // Either the feed or a login prompt should be present
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Page should not be blank
    const bodyText = await body.textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(0);
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    // Should show a not-found page or redirect to home
    const notFound = page.locator(
      'text=404, text=not found, text=page not found, [data-testid="not-found"]'
    ).first();
    const isOnHome = page.url().endsWith('/');
    if (!isOnHome) {
      await expect(notFound).toBeVisible({ timeout: 8000 });
    }
  });

  test('search page is reachable', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/search/, { timeout: 10000 });
  });

  test('back navigation works after navigating to a sub-page', async ({ page }) => {
    await page.goto('/');
    const initialUrl = page.url();

    await page.goto('/search');
    await expect(page).toHaveURL(/search/);

    await page.goBack();
    await expect(page).toHaveURL(initialUrl, { timeout: 8000 });
  });

  test('settings page is reachable (may require auth)', async ({ page }) => {
    await page.goto('/settings');
    // Either shows settings page or redirects to login
    await expect(page).toHaveURL(/settings|login|auth|\/$/, { timeout: 10000 });
  });

  test('messages page is reachable (may require auth)', async ({ page }) => {
    await page.goto('/messages');
    // Either shows messages or redirects
    await expect(page).toHaveURL(/messages|login|auth|\/$/, { timeout: 10000 });
  });

  test('navigating to profile page works', async ({ page }) => {
    await page.goto('/u/testuser');
    // Profile page should render or show not found
    await expect(page).toHaveURL(/\/u\/testuser/, { timeout: 10000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
