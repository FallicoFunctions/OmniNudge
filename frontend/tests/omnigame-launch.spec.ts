import { expect, test } from '@playwright/test';

test('launches OmniRave from OmniGame discovery into the dedicated runtime', async ({ page }) => {
  let requestBody: unknown = null;

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

  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 42,
        username: 'signed-in-raver',
        role: 'user',
        created_at: '2026-08-09T00:00:00Z',
      }),
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
    window.localStorage.setItem('auth_token', 'signed-in-test-token');
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });

  await page.goto('/games/omnirave');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('auth_token'))).toBe('signed-in-test-token');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(page).toHaveURL(/\/omnirave-runtime-stub\?mode=account$/);
  expect(requestBody).toEqual({ mode: 'account' });
});
