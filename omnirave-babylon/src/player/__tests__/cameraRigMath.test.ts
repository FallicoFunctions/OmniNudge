import { describe, expect, it } from 'vitest';

import {
  resolveTravelCameraOffsets,
  TRAVEL_CAMERA_DISTANCE,
  TRAVEL_CAMERA_FOCUS_Y,
  TRAVEL_CAMERA_HEIGHT,
} from '../cameraRigMath';

describe('resolveTravelCameraOffsets', () => {
  it('centers the avatar and faces the authored look direction', () => {
    // authored view looks due -x (focus is -x of the camera position)
    const offsets = resolveTravelCameraOffsets({
      focusOffset: { x: -26, y: 5, z: -4 },
      positionOffset: { x: 6, y: 8, z: -4 },
    });

    expect(offsets.focusOffset).toEqual({ x: 0, y: TRAVEL_CAMERA_FOCUS_Y, z: 0 });
    // camera sits opposite the look direction: +x of the avatar
    expect(offsets.positionOffset.x).toBeCloseTo(TRAVEL_CAMERA_DISTANCE);
    expect(offsets.positionOffset.y).toBe(TRAVEL_CAMERA_HEIGHT);
    expect(offsets.positionOffset.z).toBeCloseTo(0);
  });

  it('falls back to a north-facing frame when the view has no offsets', () => {
    const offsets = resolveTravelCameraOffsets(undefined);

    expect(offsets.positionOffset.x).toBeCloseTo(0);
    expect(offsets.positionOffset.z).toBeCloseTo(-TRAVEL_CAMERA_DISTANCE);
  });

  it('falls back when the authored look direction is degenerate', () => {
    const offsets = resolveTravelCameraOffsets({
      focusOffset: { x: 3, y: 5, z: 7 },
      positionOffset: { x: 3, y: 12, z: 7 }, // straight down: no horizontal direction
    });

    expect(offsets.positionOffset.x).toBeCloseTo(0);
    expect(offsets.positionOffset.z).toBeCloseTo(-TRAVEL_CAMERA_DISTANCE);
  });
});

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
