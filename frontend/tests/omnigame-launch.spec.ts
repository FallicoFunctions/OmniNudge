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

  await page.getByRole('button', { name: 'Play as Guest' }).click();

  await expect(page).toHaveURL(/\/omnirave-runtime-stub\?mode=guest$/);
  await expect(page.getByRole('heading', { name: 'OmniRave Runtime Stub' })).toBeVisible();
  await expect(page.getByText('Guest launch handoff received.')).toBeVisible();
  expect(requestBody).toEqual({ mode: 'guest' });
});
