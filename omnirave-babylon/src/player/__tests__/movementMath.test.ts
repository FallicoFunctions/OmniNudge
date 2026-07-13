import { describe, expect, it } from 'vitest';

import {
  resolveCameraRelativeMoveVector,
  resolveMoveVector,
  resolvePlayerSpeed,
  resolveVerticalDirection,
} from '../movementMath';

describe('resolveMoveVector', () => {
  it('normalizes diagonal keyboard movement', () => {
    const move = resolveMoveVector({
      forward: true,
      backward: false,
      left: true,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
    });

    expect(move.x).toBeCloseTo(-0.7071, 3);
    expect(move.z).toBeCloseTo(0.7071, 3);
    expect(move.magnitude).toBeCloseTo(1, 5);
  });

  it('keeps cardinal movement at full strength', () => {
    const move = resolveMoveVector({
      forward: true,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
    });

    expect(move).toEqual({ x: 0, z: 1, magnitude: 1 });
  });

  it('cancels opposing keys into a stationary vector', () => {
    const move = resolveMoveVector({
      forward: true,
      backward: true,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
    });

    expect(move).toEqual({ x: 0, z: 0, magnitude: 0 });
  });
});

describe('resolveCameraRelativeMoveVector', () => {
  it('projects local movement onto the camera forward and right axes', () => {
    const move = resolveCameraRelativeMoveVector(
      {
        forward: true,
        backward: false,
        left: false,
        right: false,
        jump: false,
        sprint: false,
        up: false,
        down: false,
      },
      { x: 1, z: 0 },
    );

    expect(move.x).toBeCloseTo(1);
    expect(move.z).toBeCloseTo(0);
  });

  it('keeps sprint as a speed modifier instead of changing direction magnitude', () => {
    const move = resolveCameraRelativeMoveVector(
      {
        forward: true,
        backward: false,
        left: false,
        right: true,
        jump: false,
        sprint: true,
        up: false,
        down: false,
      },
      { x: 0, z: 1 },
    );

    expect(move.magnitude).toBe(1);
    expect(Math.hypot(move.x, move.z)).toBeCloseTo(1);
  });
});

describe('resolvePlayerSpeed', () => {
  it('raises movement speed while sprinting', () => {
    expect(resolvePlayerSpeed(4.5, false)).toBe(4.5);
    expect(resolvePlayerSpeed(4.5, true)).toBeCloseTo(6.975);
  });
});

describe('resolveVerticalDirection', () => {
  it('returns +1 when rising, -1 when descending, 0 when both or neither', () => {
    const base = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
    };
    expect(resolveVerticalDirection({ ...base, up: true, down: false })).toBe(1);
    expect(resolveVerticalDirection({ ...base, up: false, down: true })).toBe(-1);
    expect(resolveVerticalDirection({ ...base, up: true, down: true })).toBe(0);
    expect(resolveVerticalDirection({ ...base, up: false, down: false })).toBe(0);
  });
});
