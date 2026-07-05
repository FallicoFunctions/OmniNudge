import { ArcRotateCamera, NullEngine, PBRMaterial, Scene, ShaderStore, Vector3 } from '@babylonjs/core';
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
    expect(scene.environmentIntensity).toBeLessThanOrEqual(0.9);
    expect(rig.environmentTexture.level).toBeLessThanOrEqual(0.9);
    expect(rig.backdropRoot.name).toBe('main-stage-presentation-backdrop');
    expect(scene.getMeshByName('main-stage-celestial-vault')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-horizon-shroud')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-arrival-void-veil')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-crown-halo')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-horizon-aura')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-side-aura-left')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-side-aura-right')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMeshByName('main-stage-arrival-mist-band')?.parent?.name).toBe(
      'main-stage-presentation-backdrop',
    );
    expect(scene.getMaterialByName('main-stage-celestial-vault-material')?.getClassName()).toBe(
      'PBRMaterial',
    );
    expect(scene.getMaterialByName('main-stage-arrival-void-veil-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-crown-halo-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-horizon-aura-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-side-aura-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-arrival-mist-band-material')).not.toBeNull();
    expect(rig.pipeline.name).toBe('main-stage-presentation-pipeline');
    expect(rig.pipeline.bloomEnabled).toBe(true);
    expect(rig.pipeline.fxaaEnabled).toBe(true);
    expect(rig.pipeline.bloomThreshold).toBeGreaterThanOrEqual(0.4);
    expect(rig.pipeline.bloomThreshold).toBeLessThanOrEqual(0.7);
    expect(rig.pipeline.bloomWeight).toBeGreaterThanOrEqual(0.35);
    expect(rig.pipeline.bloomWeight).toBeLessThanOrEqual(0.7);
    expect(rig.pipeline.imageProcessing.vignetteEnabled).toBe(true);
    expect(rig.pipeline.imageProcessing.vignetteWeight).toBeGreaterThanOrEqual(1);
    expect(rig.pipeline.grainEnabled).toBe(true);
    expect(rig.pipeline.grain.animated).toBe(true);
    expect(rig.pipeline.grain.intensity).toBeLessThanOrEqual(14);
    expect(rig.pipeline.bloomKernel).toBeGreaterThanOrEqual(48);

    const screens = rig.heroScreenPanels;
    expect(screens.length).toBe(2);
    for (const panel of screens) {
      expect(Math.abs(panel.position.x)).toBeCloseTo(6.8);
      expect(panel.position.y).toBeCloseTo(17.9);
      expect(panel.position.z).toBeCloseTo(-3.2);
      const material = panel.material as PBRMaterial;
      expect(material.unlit).toBe(true);
      expect(material.emissiveIntensity).toBeGreaterThanOrEqual(2.5);
      expect(material.emissiveTexture).not.toBeNull();
    }
    expect(rig.pipeline.bloomKernel).toBeLessThanOrEqual(96);
    expect(rig.pipeline.depthOfFieldEnabled).toBe(false);
    expect(rig.pipeline.chromaticAberrationEnabled).toBe(false);

    const sideAuraMaterial = scene.getMaterialByName('main-stage-side-aura-material');
    expect(sideAuraMaterial?.alpha).toBeGreaterThanOrEqual(0.16);

    const mistBandMaterial = scene.getMaterialByName('main-stage-arrival-mist-band-material');
    expect(mistBandMaterial?.alpha).toBeGreaterThanOrEqual(0.2);
  });

  it('registers the presentation pipeline shaders needed by the dev runtime', () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const camera = new ArcRotateCamera('review-camera', 0, 1, 12, Vector3.Zero(), scene);

    createMainStagePresentationRig(scene, camera);

    expect(ShaderStore.ShadersStore.imageProcessingPixelShader).toBeTypeOf('string');
    expect(ShaderStore.ShadersStore.extractHighlightsPixelShader).toBeTypeOf('string');
    expect(ShaderStore.ShadersStore.kernelBlurPixelShader).toBeTypeOf('string');
    expect(ShaderStore.ShadersStore.kernelBlurVertexShader).toBeTypeOf('string');
  });
});
