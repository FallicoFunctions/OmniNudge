import { FreeCamera, Frustum, MeshBuilder, NullEngine, PBRMaterial, Scene, TransformNode, Vector3 } from '@babylonjs/core';
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

  it('never merges meshes whose vertex attribute sets differ', () => {
    // Regression: a same-material group mixing UV+tangent meshes with
    // position/normal-only meshes made MergeMeshes throw and black-screened
    // the venue. Mismatched meshes must subgroup, not crash.
    engine = new NullEngine();
    const scene = new Scene(engine);
    const shared = new PBRMaterial('shared', scene);
    for (let i = 0; i < 2; i++) {
      const withUv = MeshBuilder.CreateBox(`V33_WithUv_${i}`, { size: 1 }, scene);
      withUv.material = shared;
    }
    for (let i = 0; i < 2; i++) {
      const bare = MeshBuilder.CreateBox(`V150_Bare_${i}`, { size: 1 }, scene);
      bare.material = shared;
      bare.removeVerticesData('uv');
    }

    const summary = mergeStaticMeshGroups(scene, { dynamicMeshes: [] });

    // two compatible pairs merge separately; nothing throws
    expect(summary.groupsMerged).toBe(2);
    expect(summary.meshesRemoved).toBe(2);
    const mergedNames = scene.meshes.filter((m) => m.name.startsWith('merged:')).map((m) => m.name);
    expect(mergedNames).toHaveLength(2);
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

  it('culls distant batches independently without removing geometry or parent transforms', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const shared = new PBRMaterial('shared', scene);
    const camera = new FreeCamera('camera', Vector3.Zero(), scene);
    camera.setTarget(new Vector3(0, 0, 1));
    for (const z of [50, -50]) {
      const parent = new TransformNode(`parent-${z}`, scene);
      parent.position.z = z;
      for (const x of [1, 3]) {
        const box = MeshBuilder.CreateBox(`box-${z}-${x}`, { size: 1 }, scene);
        box.parent = parent;
        box.position.x = x;
        box.material = shared;
      }
    }
    const indices = scene.meshes.reduce((total, mesh) => total + mesh.getTotalIndices(), 0);
    const summary = mergeStaticMeshGroups(scene, { dynamicMeshes: [], spatialCellSize: 32 });
    const meshes = scene.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    const frustum = Frustum.GetPlanes(camera.getTransformationMatrix());

    expect(summary.groupsMerged).toBe(2);
    expect(meshes.reduce((total, mesh) => total + mesh.getTotalIndices(), 0)).toBe(indices);
    expect(meshes.filter((mesh) => mesh.isInFrustum(frustum))).toHaveLength(1);
    expect(meshes.map((mesh) => mesh.getBoundingInfo().boundingBox.centerWorld.z).sort((a, b) => a - b))
      .toEqual([-50, 50]);
  });
});
