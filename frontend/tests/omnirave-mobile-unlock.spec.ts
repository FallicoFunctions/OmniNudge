import { expect, test } from '@playwright/test';

test.skip(({ isMobile }) => !isMobile, 'Mobile unlock flow only applies to mobile projects');

test('requires explicit mobile unlock before touch controls and stage audio path are active', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });

  await page.goto('/games/omnirave');
  await expect(page.getByRole('heading', { name: 'OmniRave' })).toBeVisible();

  await page.getByRole('button', { name: 'Play' }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/omnirave/);
  await expect(page.getByLabel('OmniRave room view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter OmniRave' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Main Stage' })).toBeVisible();

  await page.getByRole('button', { name: 'Enter OmniRave' }).click();

  await expect(page.getByTestId('touch-controls')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Main Stage' })).toBeVisible();

  await page.getByRole('button', { name: 'Touch Jump to P.L.U.R.R. Partay' }).click();
  await expect(page.getByRole('heading', { name: 'P.L.U.R.R. Partay' })).toBeVisible();
});
