import { describe, expect, it } from 'vitest';

import { normalizeUploadedMediaUrl } from '../uploadedMediaUrl';

describe('normalizeUploadedMediaUrl', () => {
  it('preserves absolute storage URLs from remote storage backends', () => {
    expect(
      normalizeUploadedMediaUrl(
        'https://cdn.omninudge.test/uploads/7/1780282847474460000_test.jpg',
        'uploads/1780282847474460000_test.jpg'
      )
    ).toBe('https://cdn.omninudge.test/uploads/7/1780282847474460000_test.jpg');
  });

  it('preserves relative upload URLs from local storage', () => {
    expect(normalizeUploadedMediaUrl('/uploads/test.jpg', 'uploads/test.jpg')).toBe('/uploads/test.jpg');
  });

  it('falls back to storage path when storage URL is absent', () => {
    expect(normalizeUploadedMediaUrl(undefined, 'uploads/test.jpg')).toBe('/uploads/test.jpg');
  });
});
