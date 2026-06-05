import { describe, expect, it } from 'vitest';

import { resolveZoomState } from '../cameraRigMath';

describe('resolveZoomState', () => {
  it('switches from third-person to first-person as distance approaches zero', () => {
    expect(resolveZoomState(6).mode).toBe('third_person');
    expect(resolveZoomState(2.5).mode).toBe('over_shoulder');
    expect(resolveZoomState(0.1).mode).toBe('first_person');
  });

  it('clamps distance into the supported zoom range', () => {
    expect(resolveZoomState(-10).distance).toBe(0.1);
    expect(resolveZoomState(500).distance).toBe(140);
  });

  it('fades the shoulder framing as the camera reaches first-person', () => {
    expect(resolveZoomState(6).shoulderOpacity).toBe(1);
    expect(resolveZoomState(2.5).shoulderOpacity).toBeCloseTo(0.45, 5);
    expect(resolveZoomState(0.1).shoulderOpacity).toBe(0);
  });
});
