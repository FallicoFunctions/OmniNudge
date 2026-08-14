import { describe, expect, it } from 'vitest';

import { resolveMediaUrl } from '../mediaUrl';

describe('resolveMediaUrl', () => {
  it('keeps public OmniChat assets on the frontend origin', () => {
    expect(resolveMediaUrl('/omnichat/avatars/malachar-warlock-dm.png', 'v1')).toBe(
      '/omnichat/avatars/malachar-warlock-dm.png?v=v1'
    );
  });

  it('keeps uploaded media same-origin', () => {
    expect(resolveMediaUrl('/uploads/avatar.png', 'v2')).toBe('/uploads/avatar.png?v=v2');
  });

  it('does not render active or protocol-relative media metadata', () => {
    expect(resolveMediaUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeUndefined();
    expect(resolveMediaUrl('//attacker.example/pixel.png')).toBeUndefined();
  });
});
