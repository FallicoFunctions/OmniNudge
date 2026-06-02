import { expect, test } from '@playwright/test';

test('launches OmniRave from OmniGame discovery into the dedicated runtime', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });

  await page.goto('/games');
  await expect(page.getByRole('heading', { name: 'OmniGame' })).toBeVisible();
  await expect(page.getByText('OmniRave')).toBeVisible();

  await page.goto('/games/omnirave');
  await expect(page.getByRole('heading', { name: 'OmniRave' })).toBeVisible();

  await page.getByRole('button', { name: 'Launch as Guest' }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/omnirave/);
  await expect(page.getByText(/World socket ready:/)).toBeVisible();
  await expect(page.getByText(/Active stage: main_stage/)).toBeVisible();

  await page.getByRole('button', { name: 'Go to Techno Room' }).click();
  await expect(page.getByText(/Active stage: techno_room/)).toBeVisible();
  await expect(page.getByText(/Video: techno-room-youtube/)).toBeVisible();
});
