import { expect, test, type Page } from '@playwright/test';
import { LOGIN_KEY_ACCOUNT_BACKUP, seedDeviceMessageKey } from './e2e/helpers/deviceKeys';

// Every API call a test does not answer itself gets a 404. Left to reach a real
// server, a call such as /feature-flags answered 401, the API client opened the
// sign-in dialog over the page, and the dialog took the click meant for Play:
// whether it did depended on which finished first. Registered before a test's
// own routes, which Playwright tries first.
async function answerUnmockedApiCalls(page: Page) {
  await page.route('http://localhost:8080/api/v1/**', async (route) => {
    const origin = route.request().headers()['origin'] ?? '*';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization, X-CSRF-Token',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 404,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found', message: 'Not answered by this test' }),
    });
  });
}

test('launches OmniRave from OmniGame discovery into the dedicated runtime', async ({ page }) => {
  let requestBody: unknown = null;
  await answerUnmockedApiCalls(page);

  await page.route('http://localhost:8091/api/v1/omnigame/launch/omnirave', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        launch_url: 'http://127.0.0.1:5176/omnirave-runtime-stub?mode=guest',
      }),
    });
  });

  await page.route('**/omnirave-runtime-stub?mode=guest', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <h1>OmniRave Runtime Stub</h1>
              <p>Guest launch handoff received.</p>
            </main>
          </body>
        </html>
      `,
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });

  await page.goto('/games');
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OmniRave' })).toBeVisible();

  await page.goto('/games/omnirave');
  await expect(page.getByRole('heading', { name: 'OmniRave' })).toBeVisible();

  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(page).toHaveURL(/\/omnirave-runtime-stub\?mode=guest$/);
  await expect(page.getByRole('heading', { name: 'OmniRave Runtime Stub' })).toBeVisible();
  await expect(page.getByText('Guest launch handoff received.')).toBeVisible();
  expect(requestBody).toEqual({ mode: 'guest' });
});

test('uses the OmniNudge account automatically when the player is signed in', async ({ page }) => {
  let requestBody: unknown = null;
  await answerUnmockedApiCalls(page);
  const publicKey = await seedDeviceMessageKey(page);

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 42,
        username: 'signed-in-raver',
        role: 'user',
        created_at: '2026-08-09T00:00:00Z',
        public_key: publicKey,
      }),
    });
  });

  await page.route('**/api/v1/auth/key-backup', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(LOGIN_KEY_ACCOUNT_BACKUP),
    });
  });

  await page.route('http://localhost:8091/api/v1/omnigame/launch/omnirave', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        launch_url: 'http://127.0.0.1:5176/omnirave-runtime-stub?mode=account',
      }),
    });
  });

  await page.route('**/omnirave-runtime-stub?mode=account', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<main><h1>OmniRave Account Runtime Stub</h1></main>',
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });

  await page.goto('/games/omnirave');
  await expect(page.getByRole('button', { name: 'signed-in-raver' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(page).toHaveURL(/\/omnirave-runtime-stub\?mode=account$/);
  expect(requestBody).toEqual({ mode: 'account' });
});
