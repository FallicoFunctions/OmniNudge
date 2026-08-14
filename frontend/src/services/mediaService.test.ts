import { describe, expect, it } from 'vitest';
import { assertSafeMediaFile } from './mediaService';

describe('assertSafeMediaFile', () => {
  it('rejects active SVG uploads before they can be rendered from the upload origin', () => {
    const file = new File(['<svg onload="alert(1)" />'], 'avatar.svg', {
      type: 'image/svg+xml',
    });

    expect(() => assertSafeMediaFile(file)).toThrow('cannot be uploaded');
  });

  it('allows a normal bitmap image through to server-side validation', () => {
    const file = new File(['image-bytes'], 'avatar.png', { type: 'image/png' });

    expect(() => assertSafeMediaFile(file)).not.toThrow();
  });
});
