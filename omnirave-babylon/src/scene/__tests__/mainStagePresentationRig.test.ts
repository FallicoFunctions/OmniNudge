import {
  ArcRotateCamera,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  Scene,
  ShaderStore,
  Vector3,
} from '@babylonjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMainStagePresentationRig } from '../createMainStagePresentationRig';

describe('createMainStagePresentationRig', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    vi.unstubAllGlobals();
    scene?.dispose();
    engine?.dispose();
    scene = undefined;
    engine = undefined;
  });

  it('spends the mobile pixel budget on clean scene detail while retaining bloom and edge antialiasing', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    engine = new NullEngine();
    const height = vi.spyOn(engine, 'getRenderHeight').mockReturnValue(2532);
    const scaling = vi.spyOn(engine, 'getHardwareScalingLevel').mockReturnValue(1 / 3);
    scene = new Scene(engine);
    const camera = new ArcRotateCamera('mobile-camera', 0, 1, 12, Vector3.Zero(), scene);
    const rig = createMainStagePresentationRig(scene, camera);
    expect(rig.pipeline.grainEnabled).toBe(false);
    expect(rig.pipeline.sharpenEnabled).toBe(false);
    expect(rig.pipeline.fxaaEnabled).toBe(true);
    expect(rig.pipeline.bloomEnabled).toBe(true);
    expect(rig.pipeline.bloomThreshold).toBe(0.5);
    expect(rig.pipeline.bloomWeight).toBe(0.7);
    expect(rig.pipeline.bloomScale).toBe(0.25);
    const bloom = () => (rig.pipeline as unknown as { bloom: { kernel: number; _merge: { _options: number } } }).bloom;
    expect(bloom()._merge._options).toBe(1);
    engine.onResizeObservable.notifyObservers(engine);
    const nativeKernel = rig.pipeline.bloomKernel;
    expect(nativeKernel).toBe(86); // 844 CSS pixels, density applied once by Babylon
    expect(bloom().kernel).toBeCloseTo(258);
    height.mockReturnValue(1688);
    scaling.mockReturnValue(0.5);
    engine.onResizeObservable.notifyObservers(engine);
    expect(rig.pipeline.bloomKernel).toBe(nativeKernel);
    expect(bloom().kernel / 1688).toBeCloseTo(258 / 2532, 6);
    // Scale changes rebuild the bloom effect: its sharp-scene merge stays full size.
    rig.pipeline.bloomScale = 0.4;
    expect(bloom()._merge._options).toBe(1);
    height.mockRestore();
    scaling.mockRestore();
  });

  it('adds venue-scoped environment reflections and bounded post-processing', () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const camera = new ArcRotateCamera('review-camera', 0, 1, 12, Vector3.Zero(), scene);
    const sideLedMaterial = new PBRMaterial('side-led', scene);
    for (const [side, x] of [
      ['L', -20],
      ['R', 20],
    ] as const) {
      const field = MeshBuilder.CreateBox(
        `V31_SideLedTileField_${side}`,
        { width: 8, height: 1, depth: 6 },
        scene,
      );
      field.position.set(x, 5, 0);
      field.material = sideLedMaterial;
      field.computeWorldMatrix(true);
    }

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
    expect(scene.getMeshByName('main-stage-crown-silhouette-aura')?.parent?.name).toBe(
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
    const celestialVaultMaterial = scene.getMaterialByName(
      'main-stage-celestial-vault-material',
    ) as PBRMaterial | null;
    expect(celestialVaultMaterial?.getClassName()).toBe('PBRMaterial');
    // NullEngine has no 2D canvas context, so the starfield texture build
    // is expected to fail gracefully; the material must still exist with
    // a safe fallback emissive colour rather than throwing.
    expect(celestialVaultMaterial?.unlit).toBe(true);
    expect(celestialVaultMaterial?.emissiveColor).toBeTruthy();

    const moon = scene.getMeshByName('main-stage-moon');
    expect(moon).not.toBeNull();
    expect(moon?.parent?.name).toBe('main-stage-presentation-backdrop');
    expect(moon?.isPickable).toBe(false);
    expect(scene.getMaterialByName('main-stage-arrival-void-veil-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-crown-halo-material')).not.toBeNull();
    const crownSilhouetteMaterial = scene.getMaterialByName(
      'main-stage-crown-silhouette-aura-material',
    ) as PBRMaterial | null;
    expect(crownSilhouetteMaterial).not.toBeNull();
    expect(crownSilhouetteMaterial?.unlit).toBe(true);
    expect(crownSilhouetteMaterial?.emissiveIntensity).toBeGreaterThanOrEqual(0.72);
    expect(crownSilhouetteMaterial?.alpha).toBeGreaterThanOrEqual(0.28);
    expect(crownSilhouetteMaterial?.emissiveTexture).toBeNull();
    expect(crownSilhouetteMaterial?.opacityTexture).toBeNull();
    expect(scene.getMaterialByName('main-stage-horizon-aura-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-side-aura-material')).not.toBeNull();
    expect(scene.getMaterialByName('main-stage-arrival-mist-band-material')).not.toBeNull();
    expect(rig.pipeline.name).toBe('main-stage-presentation-pipeline');
    expect(rig.pipeline.bloomEnabled).toBe(true);
    expect(rig.pipeline.fxaaEnabled).toBe(true);
    expect(rig.pipeline.bloomThreshold).toBeGreaterThanOrEqual(0.4);
    expect(rig.pipeline.bloomThreshold).toBeLessThanOrEqual(0.7);
    expect(rig.pipeline.bloomWeight).toBeGreaterThanOrEqual(0.68);
    expect(rig.pipeline.bloomWeight).toBeLessThanOrEqual(0.74);
    expect(rig.pipeline.imageProcessing.vignetteEnabled).toBe(true);
    expect(rig.pipeline.imageProcessing.vignetteWeight).toBeGreaterThanOrEqual(1);
    expect(rig.pipeline.imageProcessing.vignetteWeight).toBeLessThanOrEqual(1.12);
    expect(rig.pipeline.grainEnabled).toBe(true);
    // Static (non-animated), faint grain: animated grain read as TV static
    // across every surface once the scene rendered at full crisp density.
    expect(rig.pipeline.grain.animated).toBe(false);
    expect(rig.pipeline.grain.intensity).toBeLessThanOrEqual(3);
    expect(rig.pipeline.bloomKernel).toBeGreaterThanOrEqual(48);

    const spills = rig.emissiveSpillLights;
    expect(spills).toHaveLength(4);
    for (const spill of spills) {
      expect(spill.intensity).toBeGreaterThanOrEqual(40);
      expect(spill.range).toBeGreaterThanOrEqual(10);
      expect(spill.includedOnlyMeshes.length).toBeGreaterThanOrEqual(0);
      expect(spill.diffuse.b).toBeGreaterThan(spill.diffuse.g);
    }

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
