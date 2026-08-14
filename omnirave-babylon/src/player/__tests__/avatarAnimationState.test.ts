import { describe, expect, it } from 'vitest';

import { resolveAvatarAnimationState } from '../avatarAnimationState';

describe('resolveAvatarAnimationState', () => {
  it('maps speed to idle, walk, and run states', () => {
    expect(resolveAvatarAnimationState(0)).toBe('idle');
    expect(resolveAvatarAnimationState(1.2)).toBe('walk');
    expect(resolveAvatarAnimationState(4.4)).toBe('run');
  });
});
