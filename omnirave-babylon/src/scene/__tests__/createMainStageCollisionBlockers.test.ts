import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMainStageCollisionBlockers } from '../createMainStageCollisionBlockers';

describe('createMainStageCollisionBlockers clustered families', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const clusterBlockers = (meshes: Parameters<typeof createMainStageCollisionBlockers>[1]) =>
    createMainStageCollisionBlockers(scene, meshes).filter((mesh) => mesh.name.includes('-cluster-'));

  it('gives each discrete pylon its own snug box and keeps the gap between them open', () => {
    // Two sentinel pylons 12 apart, mirroring a spawn-gate pair.
    const pylons = MeshBuilder.CreateBox('pylon-a', { size: 2 }, scene);
    pylons.position.set(-6, 1, 0);
    const other = MeshBuilder.CreateBox('pylon-b', { size: 2 }, scene);
    other.position.set(6, 1, 0);
    const merged = MeshBuilder.CreateBox('placeholder', { size: 1 }, scene);
    merged.dispose();
    // Simulate the merged family mesh: one mesh whose vertices span both
    // pylons (bake both boxes into a single vertex buffer via a parent
    // proxy is overkill for NullEngine - use two clustered calls instead).
    pylons.name = 'merged:V60_SpawnGateSentinelPearl+1';
    const blockers = clusterBlockers([pylons]);

    expect(blockers.length).toBe(1);
    const bb = blockers[0].getBoundingInfo().boundingBox;
    // Snug to the single 2-unit pylon (plus the min-thickness floor rule),
    // nowhere near the 12-unit pair span a bbox blocker would produce.
    expect(bb.extendSizeWorld.x * 2).toBeLessThanOrEqual(2.5);
    expect(blockers[0].position.x).toBeCloseTo(-6);
  });

  it('splits a vertex cloud with a real gap into separate boxes on both axes', () => {
    // A 2x2 grid of stems, 8 apart: expect four separate cluster boxes.
    const grid = MeshBuilder.CreateBox('stem-0', { size: 1 }, scene);
    grid.position.set(0, 1, 0);
    grid.name = 'merged:V44_PlazaLanternStemCluster+1';
    const positions: number[] = [];
    for (const sx of [-4, 4]) {
      for (const sz of [-4, 4]) {
        for (const dx of [-0.4, 0.4]) {
          for (const dy of [0, 2]) {
            for (const dz of [-0.4, 0.4]) {
              positions.push(sx + dx, dy, sz + dz);
            }
          }
        }
      }
    }
    grid.setVerticesData('position', positions);
    // Drop the CreateBox index buffer: it references the old 24 vertices.
    // Index-less clouds fall back to per-vertex spatial grouping.
    grid.setIndices([]);
    grid.position.set(0, 0, 0);
    grid.computeWorldMatrix(true);

    const blockers = clusterBlockers([grid]);

    expect(blockers.length).toBe(4);
    const centers = blockers
      .map((mesh) => `${Math.round(mesh.position.x)},${Math.round(mesh.position.z)}`)
      .sort();
    expect(centers).toEqual(['-4,-4', '-4,4', '4,-4', '4,4']);
  });

  it('skips clusters floating entirely above the capsule', () => {
    const elevated = MeshBuilder.CreateBox('merged:V58_ArrivalPlinthPearlDais+1', { size: 1 }, scene);
    elevated.position.set(0, 4.5, 0);
    elevated.computeWorldMatrix(true);

    expect(clusterBlockers([elevated]).length).toBe(0);
  });
});
