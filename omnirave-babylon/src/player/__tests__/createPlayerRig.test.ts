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
    expect(rig.capsule.isVisible).toBe(false);
    expect(rig.capsule.checkCollisions).toBe(true);
    expect(rig.speedMetersPerSecond).toBe(4.5);
  });
});
