import { NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createLightingRig } from '../createLightingRig';

describe('createLightingRig', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
    scene = undefined;
    engine = undefined;
  });

  it('adds a warm key, a cool silhouette rim, and a restrained front fill so the Main Stage mass stays legible at night', () => {
    engine = new NullEngine();
    scene = new Scene(engine);

    const rig = createLightingRig(scene);

    expect(rig.hemi.name).toBe('main-stage-hemi-light');
    expect(rig.key.name).toBe('main-stage-key-light');
    expect(rig.rim.name).toBe('main-stage-rim-light');
    expect(rig.fill.name).toBe('main-stage-front-fill-light');
    expect(rig.key.intensity).toBeGreaterThan(2);
    expect(rig.rim.intensity).toBeGreaterThanOrEqual(1.1);
    expect(rig.fill.intensity).toBeGreaterThanOrEqual(0.7);
    expect(rig.fill.intensity).toBeLessThanOrEqual(1.2);
    expect(rig.fill.diffuse.b).toBeGreaterThan(rig.fill.diffuse.r);
    expect(rig.rim.diffuse.b).toBeGreaterThan(rig.rim.diffuse.r);
  });
});
