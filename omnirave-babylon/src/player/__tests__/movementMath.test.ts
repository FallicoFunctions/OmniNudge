import { describe, expect, it } from 'vitest';

import { resolveMoveVector } from '../movementMath';

describe('resolveMoveVector', () => {
  it('normalizes diagonal keyboard movement', () => {
    const move = resolveMoveVector({
      forward: true,
      backward: false,
      left: true,
      right: false,
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
    });

    expect(move).toEqual({ x: 0, z: 1, magnitude: 1 });
  });

  it('cancels opposing keys into a stationary vector', () => {
    const move = resolveMoveVector({
      forward: true,
      backward: true,
      left: false,
      right: false,
    });

    expect(move).toEqual({ x: 0, z: 0, magnitude: 0 });
  });
});
