import { expect, test } from '@playwright/test';

test.skip(({ isMobile }) => !isMobile, 'Mobile unlock flow only applies to mobile projects');

test('requires explicit mobile unlock before touch controls and stage audio path are active', async ({ page }) => {
  let requestBody: unknown = null;

  await page.route('http://localhost:8091/api/v1/omnigame/launch/omnirave', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        launch_url: 'http://127.0.0.1:5176/omnirave-runtime-stub?mode=guest&mobile=1',
      }),
    });
  });

  await page.route('**/omnirave-runtime-stub?mode=guest&mobile=1', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <h1>OmniRave Runtime Stub</h1>
              <p>Guest mobile launch handoff received.</p>
            </main>
          </body>
        </html>
      `,
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });

  await page.goto('/games/omnirave');
  await expect(page.getByRole('heading', { name: 'OmniRave' })).toBeVisible();

  await page.getByRole('button', { name: 'Play as Guest' }).click();

  await expect(page).toHaveURL(/\/omnirave-runtime-stub\?mode=guest&mobile=1$/);
  await expect(page.getByRole('heading', { name: 'OmniRave Runtime Stub' })).toBeVisible();
  await expect(page.getByText('Guest mobile launch handoff received.')).toBeVisible();
  expect(requestBody).toEqual({ mode: 'guest' });
});
