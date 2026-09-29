import { describe, expect, it } from 'vitest';

import {
  resolveReviewCharacter,
  resolveReviewCheckpoint,
  REVIEW_VIEW_IDS,
} from '../reviewCheckpoints';

describe('isolated review checkpoints', () => {
  it('frames every view as a full-body shot with feet in frame', () => {
    for (const view of REVIEW_VIEW_IDS) {
      const { id, checkpoint } = resolveReviewCheckpoint(view);
      expect(id).toBe(view);
      expect(checkpoint.radius).toBe(3.0);
      expect(checkpoint.targetY).toBe(0.9);
    }
  });

  it('faces front by default and on unknown views', () => {
    expect(resolveReviewCheckpoint(null).id).toBe('front');
    expect(resolveReviewCheckpoint('dance').id).toBe('front');
  });

  it('separates front, back, and profiles by quarter turns', () => {
    const front = resolveReviewCheckpoint('front').checkpoint.alpha;
    const back = resolveReviewCheckpoint('back').checkpoint.alpha;
    const left = resolveReviewCheckpoint('left-profile').checkpoint.alpha;
    const right = resolveReviewCheckpoint('right-profile').checkpoint.alpha;
    expect(Math.abs(front - back)).toBeCloseTo(Math.PI, 9);
    expect(Math.abs(left - right)).toBeCloseTo(Math.PI, 9);
  });

  it('defaults to the male character', () => {
    expect(resolveReviewCharacter(null)).toBe('male');
    expect(resolveReviewCharacter('female')).toBe('female');
    expect(resolveReviewCharacter('other')).toBe('male');
  });
});
