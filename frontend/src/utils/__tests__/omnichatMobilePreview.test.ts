import { describe, expect, it } from 'vitest';
import {
  getPreviewEligibleIds,
  getNextPreviewState,
  getResumePreviewState,
  getRotationPreviewState,
} from '../omnichatMobilePreview';

describe('omnichatMobilePreview', () => {
  it('keeps only personas with preview videos eligible for autoplay', () => {
    expect(
      getPreviewEligibleIds([
        { id: 1, preview_video_url: '/uploads/one.mp4' },
        { id: 2 },
        { id: 3, preview_video_url: '/uploads/three.mp4' },
      ])
    ).toEqual([1, 3]);
  });

  it('selects the first visible eligible tile when none is active', () => {
    expect(getNextPreviewState([4, 7], null)).toEqual({ id: 4, version: 1 });
  });

  it('preserves the current tile when it remains visible', () => {
    expect(getNextPreviewState([4, 7], { id: 7, version: 3 })).toEqual({ id: 7, version: 3 });
  });

  it('falls back to the first visible eligible tile when the active one disappears', () => {
    expect(getNextPreviewState([4, 7], { id: 9, version: 3 })).toEqual({ id: 4, version: 4 });
  });

  it('rotates to the next visible eligible tile and increments the version', () => {
    expect(getRotationPreviewState([4, 7, 9], 7, { id: 7, version: 3 })).toEqual({
      id: 9,
      version: 4,
    });
  });

  it('wraps to the first visible eligible tile when the active one is last', () => {
    expect(getRotationPreviewState([4, 7, 9], 9, { id: 9, version: 3 })).toEqual({
      id: 4,
      version: 4,
    });
  });

  it('restarts the same tile in loop mode after the description hold finishes', () => {
    expect(getResumePreviewState([4, 7, 9], 7, { id: 7, version: 3 }, 'loop')).toEqual({
      id: 7,
      version: 4,
    });
  });

  it('advances to the next visible tile in sequential mode after the description hold finishes', () => {
    expect(getResumePreviewState([4, 7, 9], 7, { id: 7, version: 3 }, 'sequential')).toEqual({
      id: 9,
      version: 4,
    });
  });
});
