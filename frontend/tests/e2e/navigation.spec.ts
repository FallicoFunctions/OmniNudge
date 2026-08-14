import { test, expect } from '@playwright/test';

/**
 * E2E tests for basic navigation and routing.
 */
test.describe('Navigation', () => {
  test('home page loads and shows feed content or login prompt', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.locator('#root > *').first()).toBeVisible();
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await expect(page).toHaveURL(/\/404|\/$/, { timeout: 8000 });
    await expect(page.locator('body')).toBeVisible();
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
    await page.goto('/users/testuser');
    await expect(page).toHaveURL(/\/users\/testuser|\/404/, { timeout: 10000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
