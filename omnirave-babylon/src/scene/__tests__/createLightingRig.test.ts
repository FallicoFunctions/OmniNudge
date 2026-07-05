import { MeshBuilder, NullEngine, PBRMaterial, RenderTargetTexture, Scene } from '@babylonjs/core';
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

  it('casts key-light shadows from the loaded stage meshes once, skipping blended and invisible meshes', () => {
    engine = new NullEngine();
    scene = new Scene(engine);

    const solid = MeshBuilder.CreateBox('V01_SolidMass', { size: 1 }, scene);
    solid.material = new PBRMaterial('solid-mat', scene);

    const blended = MeshBuilder.CreateBox('V02_GlassLens', { size: 1 }, scene);
    const blendedMaterial = new PBRMaterial('glass-mat', scene);
    blendedMaterial.alpha = 0.5;
    blendedMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    blended.material = blendedMaterial;

    const hidden = MeshBuilder.CreateBox('CollisionProxy', { size: 1 }, scene);
    hidden.isVisible = false;

    const rig = createLightingRig(scene);

    expect(rig.shadowGenerator.bias).toBeGreaterThan(0);
    const casters = rig.shadowGenerator.getShadowMap()?.renderList ?? [];
    const casterNames = casters.map((mesh) => mesh.name);
    expect(casterNames).toContain('V01_SolidMass');
    expect(casterNames).not.toContain('V02_GlassLens');
    expect(casterNames).not.toContain('CollisionProxy');
    expect(solid.receiveShadows).toBe(true);
    expect(rig.shadowGenerator.getShadowMap()?.refreshRate).toBe(
      RenderTargetTexture.REFRESHRATE_RENDER_ONCE,
    );
  });
});
