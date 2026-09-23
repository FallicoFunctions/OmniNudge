import { describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../lib/api';
import { resolveMediaUrl } from '../mediaUrl';

describe('resolveMediaUrl', () => {
  it('keeps public OmniChat assets on the frontend origin', () => {
    expect(resolveMediaUrl('/omnichat/avatars/malachar-warlock-dm.png', 'v1')).toBe(
      '/omnichat/avatars/malachar-warlock-dm.png?v=v1'
    );
  });

  it('fetches uploads through the API path, where the session cookie is sent', () => {
    expect(resolveMediaUrl('/uploads/7/photo.png', 'v2')).toBe(
      `${API_BASE_URL}/uploads/7/photo.png?v=v2`
    );
    expect(new URL(resolveMediaUrl('/uploads/7/photo.png')!).pathname).toMatch(/^\/api\//);
  });

  it('does not render active or protocol-relative media metadata', () => {
    expect(resolveMediaUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeUndefined();
    expect(resolveMediaUrl('//attacker.example/pixel.png')).toBeUndefined();
  });
});
