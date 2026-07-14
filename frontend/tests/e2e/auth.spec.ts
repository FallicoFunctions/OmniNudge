import { test, expect } from '@playwright/test';

/**
 * E2E tests for authentication flows.
 * Requires the dev server running at http://localhost:5173.
 */
test.describe('Authentication', () => {
  async function prepareLandingPage(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
      localStorage.setItem('omninudge_about_modal_dismissed', 'true');
    });
  }

  async function dismissAboutModalIfPresent(page: import('@playwright/test').Page) {
    const continueButton = page.getByRole('button', { name: 'Continue' });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }
  }

  async function openLoginModal(page: import('@playwright/test').Page) {
    await prepareLandingPage(page);
    await page.goto('/');
    await dismissAboutModalIfPresent(page);
    await expect(page.getByRole('link', { name: /omninudge/i }).first()).toBeVisible({
      timeout: 10000,
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
    });
  }

  test('shows login form via the auth modal trigger', async ({ page }) => {
    await openLoginModal(page);
    const usernameField = page.locator('#auth-username');
    const passwordField = page.locator('#auth-password');
    await expect(usernameField).toBeVisible({ timeout: 10000 });
    await expect(passwordField).toBeVisible({ timeout: 10000 });
  });

  test('shows error on wrong password', async ({ page }) => {
    await openLoginModal(page);
    const usernameField = page.locator('#auth-username');
    const passwordField = page.locator('#auth-password');
    const submitButton = page.getByRole('button', { name: /sign in/i });

    await usernameField.fill('nonexistent_user');
    await passwordField.fill('wrongpassword');
    await submitButton.click();

    // Error message should appear (401 response from API)
    const errorLocator = page.locator('[role="alert"], [data-testid="error-message"], .text-red-500, .text-error').first();
    await expect(errorLocator).toBeVisible({ timeout: 10000 });
  });

  test('requires authentication for protected routes — redirects to login', async ({ page }) => {
    // Clear any existing auth state
    await prepareLandingPage(page);
    await page.goto('/');
    await dismissAboutModalIfPresent(page);
    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
    });

    await page.goto('/messages');
    await dismissAboutModalIfPresent(page);

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
  });

  test('successful login redirects user away from login page', async ({ page }) => {
    // This test is skipped in CI when no test account credentials are available.
    // Set VITE_TEST_USERNAME and VITE_TEST_PASSWORD env vars to enable it.
    const username = process.env.VITE_TEST_USERNAME;
    const password = process.env.VITE_TEST_PASSWORD;
    if (!username || !password) {
      test.skip();
    }

    await openLoginModal(page);
    await page.locator('#auth-username').fill(username!);
    await page.locator('#auth-password').fill(password!);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('#auth-password')).not.toBeVisible({
      timeout: 15000,
    });
  });
});
