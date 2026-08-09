import { describe, expect, it } from 'vitest';

import {
  createStaminaState,
  resolveCameraRelativeMoveVector,
  resolveMoveVector,
  resolvePlayerSpeed,
  resolveVerticalDirection,
  STAMINA_MAX,
  STAMINA_RESUME_THRESHOLD,
  stepStamina,
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

  it('reduces movement speed while crouched', () => {
    expect(resolvePlayerSpeed(4.5, false, true)).toBeCloseTo(2.25);
  });

  it('lets crouch override sprint instead of combining with it', () => {
    expect(resolvePlayerSpeed(4.5, true, true)).toBeCloseTo(2.25);
  });
});

describe('stepStamina', () => {
  it('depletes while sprinting and recovers once not sprinting', () => {
    const state = createStaminaState();
    expect(state.stamina).toBe(STAMINA_MAX);

    const sprintAllowed = stepStamina(state, true, 1);
    expect(sprintAllowed).toBe(true);
    expect(state.stamina).toBeCloseTo(0.8333);
    expect(state.depleted).toBe(false);

    const recovering = stepStamina(state, false, 1);
    expect(recovering).toBe(false);
    expect(state.stamina).toBeCloseTo(0.9833);
  });

  it('forces walk speed once stamina empties and holds it through the hysteresis band', () => {
    const state = createStaminaState();

    // 6s of continuous sprint drains a full 1.0 budget at 0.1667/s.
    for (let i = 0; i < 6; i += 1) {
      stepStamina(state, true, 1);
    }
    expect(state.stamina).toBe(0);
    expect(state.depleted).toBe(true);

    // Still holding sprint while empty must not re-allow it.
    expect(stepStamina(state, true, 0.01)).toBe(false);

    // Recovering, but not yet past the resume threshold: still disallowed
    // even though sprint is held again - this is the anti-flicker hysteresis.
    for (let i = 0; i < 5; i += 1) {
      stepStamina(state, false, 0.1);
    }
    expect(state.stamina).toBeLessThan(STAMINA_RESUME_THRESHOLD);
    expect(stepStamina(state, true, 0.001)).toBe(false);

    // Recover well past the threshold: sprint is allowed again.
    for (let i = 0; i < 20; i += 1) {
      stepStamina(state, false, 0.1);
    }
    expect(state.stamina).toBeGreaterThanOrEqual(STAMINA_RESUME_THRESHOLD);
    expect(stepStamina(state, true, 0.001)).toBe(true);
  });

  it('never leaves the 0..1 range', () => {
    const state = createStaminaState();
    for (let i = 0; i < 100; i += 1) {
      stepStamina(state, true, 1);
    }
    expect(state.stamina).toBe(0);

    for (let i = 0; i < 100; i += 1) {
      stepStamina(state, false, 1);
    }
    expect(state.stamina).toBe(STAMINA_MAX);
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
