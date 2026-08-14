import { describe, expect, it } from 'vitest';

import i18n, { buildLocaleLoadPath, i18nReady } from './config';

describe('buildLocaleLoadPath', () => {
  it('appends the build version query parameter to locale requests', () => {
    expect(buildLocaleLoadPath('en')).toMatch(/^\/locales\/en\.json\?v=.+$/);
  });

  it('exposes a readiness promise so the app does not render before translations load', async () => {
    await expect(i18nReady).resolves.toBe(i18n);
    expect(i18n.isInitialized).toBe(true);
  });
});
