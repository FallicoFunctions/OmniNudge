import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createPlayerRig } from '../createPlayerRig';

describe('createPlayerRig', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('creates a hidden collision capsule attached to the spawn root', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const spawn = new Vector3(2, 0, -4);
    const rig = createPlayerRig(scene, spawn);

    expect(rig.root.position.equals(spawn)).toBe(true);
    expect(rig.capsule.parent).toBe(rig.root);
    expect(rig.avatarAnchor.parent).toBe(rig.root);
    expect(rig.avatarAnchor.position.y).toBeCloseTo(-rig.eyeHeightMeters);
    expect(rig.capsule.isVisible).toBe(false);
    expect(rig.capsule.checkCollisions).toBe(true);
    expect(rig.capsule.position.y).toBeCloseTo(-0.75);
    expect(rig.radiusMeters).toBe(0.35);
    expect(rig.speedMetersPerSecond).toBe(4.5);
  });

  it('shrinks eye height and capsule height while crouched without moving the feet or touching radius', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const spawn = new Vector3(0, 1.65, 0);
    const rig = createPlayerRig(scene, spawn);

    const standingEyeHeight = rig.eyeHeightMeters;
    const standingRadius = rig.radiusMeters;
    const footY = rig.root.position.y - standingEyeHeight;

    rig.setCrouched(true);

    expect(rig.crouched).toBe(true);
    expect(rig.eyeHeightMeters).toBeLessThan(standingEyeHeight);
    expect(rig.radiusMeters).toBe(standingRadius);
    expect(rig.capsule.scaling.y).toBeLessThan(1);
    expect(rig.capsule.scaling.x).toBeCloseTo(1);
    // Foot position (root.y - eyeHeight) must stay put across the crouch.
    expect(rig.root.position.y - rig.eyeHeightMeters).toBeCloseTo(footY);

    rig.setCrouched(false);

    expect(rig.crouched).toBe(false);
    expect(rig.eyeHeightMeters).toBeCloseTo(standingEyeHeight);
    expect(rig.root.position.y - rig.eyeHeightMeters).toBeCloseTo(footY);
  });

  it('composes crouch with a non-default body height instead of fighting it', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = createPlayerRig(scene, new Vector3(0, 0, 0));

    const scale = rig.setHeightInches(78); // taller than the 71in reference
    const tallStandingEyeHeight = rig.eyeHeightMeters;

    rig.setCrouched(true);

    // Crouch scales relative to the CURRENT (tall) body height, not the
    // reference height.
    expect(rig.eyeHeightMeters).toBeCloseTo(tallStandingEyeHeight * 0.62, 3);
    expect(scale).toBeGreaterThan(1);
  });

  it('setCrouched is a no-op when already in that state', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));

    rig.setCrouched(false); // already standing
    expect(rig.crouched).toBe(false);
    expect(rig.eyeHeightMeters).toBeCloseTo(1.65);
  });
});
