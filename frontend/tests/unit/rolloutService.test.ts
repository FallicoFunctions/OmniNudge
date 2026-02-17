import { describe, expect, it, vi } from 'vitest';

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

vi.mock('../../src/services/analyticsService', () => ({
  analyticsService: {
    track: trackMock,
  },
}));

import { rolloutService } from '../../src/services/rolloutService';

describe('rolloutService', () => {
  it('is deterministic for the same user and feature', () => {
    const bucketA = rolloutService.getUserBucket(42, 'new_messaging_ui');
    const bucketB = rolloutService.getUserBucket(42, 'new_messaging_ui');
    expect(bucketA).toBe(bucketB);
  });

  it('respects explicit enable/disable lists before percentage', () => {
    const enabled = rolloutService.isEnabledForUser(123, 'voice_calls', 1, [123], []);
    const disabled = rolloutService.isEnabledForUser(123, 'voice_calls', 100, [], [123]);
    expect(enabled).toBe(true);
    expect(disabled).toBe(false);
  });

  it('returns the next rollout stage correctly', () => {
    expect(rolloutService.getNextRolloutStage(1)).toBe(5);
    expect(rolloutService.getNextRolloutStage(50)).toBe(100);
    expect(rolloutService.getNextRolloutStage(100)).toBeNull();
  });

  it('estimates affected users based on percentage', () => {
    expect(rolloutService.estimateAffectedUsers(1000, 25)).toBe(250);
    expect(rolloutService.estimateAffectedUsers(237, 10)).toBe(23);
  });
});
