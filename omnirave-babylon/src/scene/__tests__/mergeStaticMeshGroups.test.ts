import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { mergeStaticMeshGroups } from '../mergeStaticMeshGroups';

describe('mergeStaticMeshGroups', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('merges same-material static groups into single draw calls', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const shared = new PBRMaterial('shared', scene);
    for (let i = 0; i < 4; i++) {
      const box = MeshBuilder.CreateBox(`V90_Coping_${i}`, { size: 1 }, scene);
      box.position.x = i * 3;
      box.material = shared;
    }
    const other = MeshBuilder.CreateBox('V91_Solo', { size: 1 }, scene);
    other.material = new PBRMaterial('solo', scene);

    const summary = mergeStaticMeshGroups(scene, { dynamicMeshes: [] });

    const drawable = scene.meshes.filter((m) => m.getTotalVertices() > 0);
    expect(drawable.length).toBe(2);
    expect(summary.groupsMerged).toBe(1);
    expect(summary.meshesRemoved).toBe(3);
    const merged = drawable.find((m) => m.name.startsWith('merged:'));
    expect(merged).toBeDefined();
    expect(merged?.material).toBe(shared);
  });

  it('leaves alpha-blended and dynamic meshes untouched', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const glass = new PBRMaterial('glass', scene);
    glass.alpha = 0.5;
    glass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    const a = MeshBuilder.CreateBox('V20_GlassA', { size: 1 }, scene);
    const b = MeshBuilder.CreateBox('V20_GlassB', { size: 1 }, scene);
    a.material = glass;
    b.material = glass;

    const solid = new PBRMaterial('solid', scene);
    const dyn1 = MeshBuilder.CreateBox('avatar-arm', { size: 1 }, scene);
    const dyn2 = MeshBuilder.CreateBox('avatar-leg', { size: 1 }, scene);
    dyn1.material = solid;
    dyn2.material = solid;

    const summary = mergeStaticMeshGroups(scene, { dynamicMeshes: [dyn1, dyn2] });

    expect(summary.groupsMerged).toBe(0);
    expect(scene.getMeshByName('V20_GlassA')).not.toBeNull();
    expect(scene.getMeshByName('avatar-arm')).not.toBeNull();
  });

  it('keeps per-group world positions intact after merging', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const shared = new PBRMaterial('shared', scene);
    const near = MeshBuilder.CreateBox('V10_Near', { size: 1 }, scene);
    near.material = shared;
    const far = MeshBuilder.CreateBox('V10_Far', { size: 1 }, scene);
    far.position.set(50, 0, 0);
    far.material = shared;

    mergeStaticMeshGroups(scene, { dynamicMeshes: [] });

    const merged = scene.meshes.find((m) => m.name.startsWith('merged:'));
    const bounds = merged?.getBoundingInfo().boundingBox;
    expect(bounds && bounds.maximumWorld.x).toBeGreaterThan(49);
    expect(bounds && bounds.minimumWorld.x).toBeLessThan(1);
  });
});
