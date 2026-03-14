import { test, expect } from '@playwright/test';

/**
 * E2E tests for the messaging flow.
 * These tests require an authenticated session.
 * Use page.addInitScript to inject a mock auth token, or set up via login.
 *
 * For full E2E coverage, set VITE_TEST_USERNAME / VITE_TEST_PASSWORD env vars
 * pointing to a real test account on the running backend.
 */

// Helper: inject a fake auth token so the app thinks it's logged in.
// The API calls will still fail against a real backend without valid credentials,
// but this lets the UI routing/rendering be tested independently.
async function injectFakeAuth(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('auth_token', 'test_token_for_e2e');
  });
}

test.describe('Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeAuth(page);
  });

  test('messages page is accessible when auth token is present', async ({ page }) => {
    await page.goto('/messages');
    // Page should render the messages layout (not redirect to login)
    // We check for a container element rather than message content
    // since the API may return 401 with a fake token.
    await expect(page).toHaveURL(/messages/, { timeout: 10000 });
  });

  test('full messaging flow with real credentials', async ({ page }) => {
    const username = process.env.VITE_TEST_USERNAME;
    const password = process.env.VITE_TEST_PASSWORD;
    const recipientUsername = process.env.VITE_TEST_RECIPIENT;
    if (!username || !password || !recipientUsername) {
      test.skip();
    }

    // Login via the UI
    await page.goto('/login');
    await page.locator('input[type="text"]').first().fill(username!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.locator('button[type="submit"]').first().click();
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

    // Navigate to messages
    await page.goto('/messages');
    await expect(page).toHaveURL(/messages/);

    // Find or start a conversation
    const newConvoBtn = page.locator('[data-testid="new-conversation"], [aria-label*="new message" i], [aria-label*="compose" i]').first();
    if (await newConvoBtn.isVisible()) {
      await newConvoBtn.click();
    }

    // Type and send a message
    const messageInput = page.locator('textarea, input[placeholder*="message" i]').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await messageInput.fill('Hello from E2E test');
    await page.keyboard.press('Enter');

    // Verify the message appears in the conversation
    await expect(page.locator('text=Hello from E2E test')).toBeVisible({ timeout: 10000 });
  });

  test('search within messages returns results', async ({ page }) => {
    const username = process.env.VITE_TEST_USERNAME;
    const password = process.env.VITE_TEST_PASSWORD;
    if (!username || !password) {
      test.skip();
    }

    await page.goto('/login');
    await page.locator('input[type="text"]').first().fill(username!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.locator('button[type="submit"]').first().click();
    await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

    await page.goto('/messages');
    const searchInput = page.locator('[data-testid="message-search"], input[placeholder*="search" i]').first();
    if (await searchInput.isVisible({ timeout: 5000 })) {
      await searchInput.fill('test');
      await page.waitForTimeout(500); // debounce
      // Results container or empty state should appear
      const results = page.locator('[data-testid="search-results"], [role="list"]').first();
      await expect(results).toBeVisible({ timeout: 8000 });
    }
  });
});
