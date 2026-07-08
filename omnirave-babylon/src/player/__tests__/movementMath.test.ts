import { describe, expect, it } from 'vitest';

import { resolveMoveVector, resolveVerticalDirection } from '../movementMath';

describe('resolveMoveVector', () => {
  it('normalizes diagonal keyboard movement', () => {
    const move = resolveMoveVector({
      forward: true,
      backward: false,
      left: true,
      right: false,
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
      up: false,
      down: false,
    });

    expect(move).toEqual({ x: 0, z: 0, magnitude: 0 });
  });
});

describe('resolveVerticalDirection', () => {
  it('returns +1 when rising, -1 when descending, 0 when both or neither', () => {
    const base = { forward: false, backward: false, left: false, right: false, up: false, down: false };
    expect(resolveVerticalDirection({ ...base, up: true, down: false })).toBe(1);
    expect(resolveVerticalDirection({ ...base, up: false, down: true })).toBe(-1);
    expect(resolveVerticalDirection({ ...base, up: true, down: true })).toBe(0);
    expect(resolveVerticalDirection({ ...base, up: false, down: false })).toBe(0);
  });
});
