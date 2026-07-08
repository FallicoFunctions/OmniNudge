import { MeshBuilder, NullEngine, PBRMaterial, Scene, TransformNode } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { freezeStaticScene } from '../freezeStaticScene';

describe('freezeStaticScene', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('freezes world matrices and materials for static venue meshes but leaves dynamic rig meshes alone', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const venue = MeshBuilder.CreateBox('V24_CrownMass', { size: 1 }, scene);
    venue.material = new PBRMaterial('venue-mat', scene);

    const playerRoot = new TransformNode('player-root', scene);
    const capsule = MeshBuilder.CreateBox('player-capsule', { size: 1 }, scene);
    capsule.parent = playerRoot;
    capsule.material = new PBRMaterial('player-mat', scene);

    const avatarMesh = MeshBuilder.CreateBox('review-avatar-body', { size: 1 }, scene);
    avatarMesh.material = new PBRMaterial('avatar-mat', scene);

    const summary = freezeStaticScene(scene, {
      dynamicNamePatterns: [/^player-/],
      dynamicMeshes: [avatarMesh],
    });

    expect(venue.isWorldMatrixFrozen).toBe(true);
    expect((venue.material as PBRMaterial).isFrozen).toBe(true);
    expect(capsule.isWorldMatrixFrozen).toBe(false);
    expect((capsule.material as PBRMaterial).isFrozen).toBe(false);
    expect(avatarMesh.isWorldMatrixFrozen).toBe(false);
    expect((avatarMesh.material as PBRMaterial).isFrozen).toBe(false);
    expect(summary.frozenMeshes).toBeGreaterThanOrEqual(1);
    expect(summary.frozenMaterials).toBeGreaterThanOrEqual(1);
  });

  it('never freezes materials shared by a dynamic mesh', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const shared = new PBRMaterial('shared-mat', scene);
    const venue = MeshBuilder.CreateBox('V30_WingMass', { size: 1 }, scene);
    venue.material = shared;
    const avatar = MeshBuilder.CreateBox('review-avatar-arm', { size: 1 }, scene);
    avatar.material = shared;

    freezeStaticScene(scene, { dynamicNamePatterns: [], dynamicMeshes: [avatar] });

    expect(shared.isFrozen).toBe(false);
    expect(venue.isWorldMatrixFrozen).toBe(true);
  });
});
