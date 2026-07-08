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
    expect(rig.hemi.intensity).toBeLessThanOrEqual(0.6);
    expect(rig.rim.intensity).toBeGreaterThanOrEqual(0.9);
    expect(rig.fill.intensity).toBeGreaterThanOrEqual(0.55);
    expect(rig.fill.intensity).toBeLessThanOrEqual(0.9);
    expect(rig.fill.diffuse.b).toBeGreaterThan(rig.fill.diffuse.r);
    expect(rig.rim.diffuse.b).toBeGreaterThan(rig.rim.diffuse.r);
  });

  it('casts key-light shadows from the loaded stage meshes once, skipping blended and invisible meshes', async () => {
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

    expect(rig.shadowGenerator).not.toBeNull();
    if (!rig.shadowGenerator) throw new Error('unreachable');
    expect(rig.shadowGenerator.bias).toBeGreaterThan(0);
    const casters = rig.shadowGenerator.getShadowMap()?.renderList ?? [];
    const casterNames = casters.map((mesh) => mesh.name);
    expect(casterNames).toContain('V01_SolidMass');
    expect(casterNames).not.toContain('V02_GlassLens');
    expect(casterNames).not.toContain('CollisionProxy');
    expect(solid.receiveShadows).toBe(true);
    await scene.whenReadyAsync();
    expect(rig.shadowGenerator.getShadowMap()?.refreshRate).toBe(
      RenderTargetTexture.REFRESHRATE_RENDER_ONCE,
    );
  });

  it('drops a warm scoped pool light on each discrete practical core so lamps light their surroundings', () => {
    engine = new NullEngine();
    scene = new Scene(engine);

    const core = MeshBuilder.CreateBox('V33_BasinLanternCore_L', { size: 0.4 }, scene);
    core.position.set(16, 2.5, -15);
    core.computeWorldMatrix(true);

    const nearGround = MeshBuilder.CreateBox('V90_NearPaving', { size: 2 }, scene);
    nearGround.position.set(14, 0, -14);
    nearGround.computeWorldMatrix(true);

    const farTower = MeshBuilder.CreateBox('V24_FarTower', { size: 2 }, scene);
    farTower.position.set(0, 30, 120);
    farTower.computeWorldMatrix(true);

    const solidMaterial = new PBRMaterial('pool-test-mat', scene);
    nearGround.material = solidMaterial;

    const rig = createLightingRig(scene);

    expect(rig.practicalPools.length).toBe(1);
    const pool = rig.practicalPools[0];
    expect(pool.diffuse.r).toBeGreaterThan(pool.diffuse.b);
    expect(pool.intensity).toBeGreaterThanOrEqual(100);
    expect(pool.range).toBeGreaterThanOrEqual(12);
    const included = pool.includedOnlyMeshes.map((mesh) => mesh.name);
    expect(included).toContain('V90_NearPaving');
    expect(included).not.toContain('V24_FarTower');
    expect(solidMaterial.maxSimultaneousLights).toBeGreaterThanOrEqual(6);
  });
});
