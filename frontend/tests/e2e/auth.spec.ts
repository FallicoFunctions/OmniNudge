import { test, expect } from '@playwright/test';

/**
 * E2E tests for authentication flows.
 * Requires the dev server running at http://localhost:5173.
 */
test.describe('Authentication', () => {
  test('shows login form at /login or via auth modal trigger', async ({ page }) => {
    await page.goto('/login');
    // The app may redirect to home with a modal, or have a /login route.
    // Either way we expect to see username + password fields.
    const usernameField = page.locator('input[type="text"], input[placeholder*="user" i], [data-testid="username-input"]').first();
    const passwordField = page.locator('input[type="password"]').first();
    await expect(usernameField).toBeVisible({ timeout: 10000 });
    await expect(passwordField).toBeVisible({ timeout: 10000 });
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/login');
    const usernameField = page.locator('input[type="text"], [data-testid="username-input"]').first();
    const passwordField = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await usernameField.fill('nonexistent_user');
    await passwordField.fill('wrongpassword');
    await submitButton.click();

    // Error message should appear (401 response from API)
    const errorLocator = page.locator('[role="alert"], [data-testid="error-message"], .text-red-500, .text-error').first();
    await expect(errorLocator).toBeVisible({ timeout: 10000 });
  });

  test('requires authentication for protected routes — redirects to login', async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
    });

    await page.goto('/messages');
    // App should redirect to home or show a login prompt
    await expect(page).toHaveURL(/messages|login|auth|\/$/, { timeout: 10000 });

    // If it stayed on /messages without auth, a login modal or redirect should appear
    const loginPrompt = page.locator('input[type="password"], [data-testid="login-submit"]').first();
    const isRedirected = !page.url().includes('/messages');
    if (!isRedirected) {
      await expect(loginPrompt).toBeVisible({ timeout: 5000 });
    }
  });

  test('successful login redirects user away from login page', async ({ page }) => {
    // This test is skipped in CI when no test account credentials are available.
    // Set VITE_TEST_USERNAME and VITE_TEST_PASSWORD env vars to enable it.
    const username = process.env.VITE_TEST_USERNAME;
    const password = process.env.VITE_TEST_PASSWORD;
    if (!username || !password) {
      test.skip();
    }

    await page.goto('/login');
    await page.locator('input[type="text"]').first().fill(username!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.locator('button[type="submit"]').first().click();

    // After successful login, user should land on home / feed
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });
  });
});
