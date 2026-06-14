import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createMainStagePresentationRig } from '../createMainStagePresentationRig';

describe('createMainStagePresentationRig', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
    scene = undefined;
    engine = undefined;
  });

  it('adds venue-scoped environment reflections and bounded post-processing', () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const camera = new ArcRotateCamera('review-camera', 0, 1, 12, Vector3.Zero(), scene);

    const rig = createMainStagePresentationRig(scene, camera);

    expect(rig.environmentTexture.name).toBe('main-stage-night-reflection-env');
    expect(scene.environmentTexture).toBe(rig.environmentTexture);
    expect(scene.environmentIntensity).toBeGreaterThanOrEqual(0.75);
    expect(scene.environmentIntensity).toBeLessThanOrEqual(1.1);
    expect(rig.pipeline.name).toBe('main-stage-presentation-pipeline');
    expect(rig.pipeline.bloomEnabled).toBe(true);
    expect(rig.pipeline.fxaaEnabled).toBe(true);
    expect(rig.pipeline.bloomWeight).toBeGreaterThan(0.18);
    expect(rig.pipeline.bloomWeight).toBeLessThan(0.45);
    expect(rig.pipeline.bloomKernel).toBeLessThanOrEqual(80);
    expect(rig.pipeline.depthOfFieldEnabled).toBe(false);
    expect(rig.pipeline.chromaticAberrationEnabled).toBe(false);
  });
});
