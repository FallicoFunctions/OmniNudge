import { expect, test, type Page } from '@playwright/test';
import { LOGIN_KEY_ACCOUNT_BACKUP, seedDeviceMessageKey } from './helpers/deviceKeys';

// Usernames may be up to 50 characters, so this is a real name, not an extreme.
const LONG_NAME = 'a_fifty_character_username_is_allowed_by_the_serve';

async function openMessages(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  const publicKey = await seedDeviceMessageKey(page);
  const now = new Date().toISOString();
  const conversation = (id: number, username: string) => ({
    id,
    conversation_type: 'dm',
    created_at: now,
    last_message_at: now,
    unread_count: 0,
    is_archived: false,
    archived_at: null,
    other_user: { id: id + 100, username },
  });
  await page.route('http://localhost:8080/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const origin = route.request().headers()['origin'] ?? '*';
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization, X-CSRF-Token',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (path === '/auth/me') {
      await json({
        id: 42,
        username: 'layout',
        role: 'user',
        created_at: now,
        public_key: publicKey,
      });
    } else if (path === '/auth/key-backup') {
      await json(LOGIN_KEY_ACCOUNT_BACKUP);
    } else if (path === '/conversations') {
      await json({ conversations: [conversation(7, 'TestUser'), conversation(9, LONG_NAME)] });
    } else {
      // A 404 opens nothing. A real server would answer 401 for an account it
      // does not know, and the API client opens the sign-in dialog on a 401.
      await json({ error: 'Not found', message: 'Not answered by this test' }, 404);
    }
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('omninudge_about_modal_dismissed', 'true');
  });
  await page.goto('/messages');
  await expect(page.getByText('TestUser').first()).toBeVisible();
}

// The list panel was 20rem at every width, so on a phone it filled half the
// screen and left the rest empty.
for (const width of [360, 390]) {
  test(`the conversation list fills a ${width} px phone screen`, async ({ page }) => {
    await openMessages(page, width);
    const search = await page.getByPlaceholder('Search conversations...').boundingBox();
    expect(search!.width).toBeGreaterThan(width - 80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('the conversation list keeps its column width on a desktop', async ({ page }) => {
  await openMessages(page, 1280);
  const search = await page.getByPlaceholder('Search conversations...').boundingBox();
  expect(search!.width).toBeLessThan(320);
});

// A name the server allows ran under the row's menu button instead of ending in
// an ellipsis.
test('a long name stops before the row menu on a phone', async ({ page }) => {
  await openMessages(page, 360);
  const name = page.getByText(LONG_NAME);
  const nameBox = await name.boundingBox();
  const menuBox = await page
    .getByRole('button', { name: `Options for ${LONG_NAME}` })
    .boundingBox();
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(menuBox!.x);
});
