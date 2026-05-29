import { describe, expect, it } from 'vitest';

import { buildLocaleLoadPath } from './config';

describe('buildLocaleLoadPath', () => {
  it('appends the build version query parameter to locale requests', () => {
    expect(buildLocaleLoadPath('en')).toMatch(/^\/locales\/en\.json\?v=.+$/);
  });
});
