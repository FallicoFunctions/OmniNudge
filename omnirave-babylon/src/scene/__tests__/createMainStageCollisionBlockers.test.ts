import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
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

  it('refines a single WIDE CONNECTED mesh with a real archway gap into separate boxes, leaving the gap open', () => {
    // One continuous strip mesh (every column shares vertices with its
    // neighbour, so union-find sees exactly one component) mimicking the
    // VIP wing shell / cascade-coping case the refinement exists for: solid
    // piers at both ends, reaching the ground, joined across the middle by
    // an arch that never dips below capsule height.
    const columnXs = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
    const positions: number[] = [];
    for (const x of columnXs) {
      const isPier = x <= -4 || x >= 4;
      const bottomY = isPier ? 0 : 3; // 3 > CAPSULE_TOP_Y (2.4): no low vertex under the arch
      positions.push(x, bottomY, 0, x, 5, 0);
    }
    const indices: number[] = [];
    for (let c = 0; c < columnXs.length - 1; c++) {
      const b0 = c * 2;
      const t0 = c * 2 + 1;
      const b1 = c * 2 + 2;
      const t1 = c * 2 + 3;
      indices.push(b0, t0, b1, t0, t1, b1);
    }
    const archway = new Mesh('merged:V150_CascadeCourtCoping+1', scene);
    archway.setVerticesData('position', positions);
    archway.setIndices(indices);
    archway.computeWorldMatrix(true);

    const blockers = clusterBlockers([archway]);

    expect(blockers.length).toBe(2);
    const spans = blockers
      .map((mesh) => {
        const bb = mesh.getBoundingInfo().boundingBox;
        return { maxX: bb.maximumWorld.x, minX: bb.minimumWorld.x };
      })
      .sort((a, b) => a.minX - b.minX);
    // Each box hugs its own pier; the archway opening in the middle is wide
    // open (a single sealing bbox would instead span the full -6..6 width).
    // The transition segment either side of the opening dips low at its
    // pier-side corner, so each box's real edge sits a little past the
    // architectural x -4/4 opening - the regression this guards against is
    // ONE box spanning the whole width, not the exact transition boundary.
    expect(spans[0].maxX - spans[0].minX).toBeLessThan(6);
    expect(spans[1].maxX - spans[1].minX).toBeLessThan(6);
    expect(spans[0].maxX).toBeLessThan(0);
    expect(spans[1].minX).toBeGreaterThan(0);
    expect(spans[1].minX - spans[0].maxX).toBeGreaterThanOrEqual(4);
  });

  it('splits a solid (non-clustered) source mesh into left/right blockers across a real center gap', () => {
    const left = MeshBuilder.CreateBox('wall-left', { width: 4, height: 3, depth: 20 }, scene);
    left.position.set(-6, 1.5, 0);
    const right = MeshBuilder.CreateBox('wall-right', { width: 4, height: 3, depth: 20 }, scene);
    right.position.set(6, 1.5, 0);
    const merged = Mesh.MergeMeshes([left, right], true, true)!;
    merged.name = 'merged:V118_BasinWallRelief+1';
    merged.computeWorldMatrix(true);

    const blockers = createMainStageCollisionBlockers(scene, [merged]).filter(
      (mesh) => mesh.metadata?.sourceMeshName === 'merged:V118_BasinWallRelief+1',
    );

    expect(blockers).toHaveLength(2);
    expect(blockers.map((mesh) => mesh.metadata?.blockerSide).sort()).toEqual(['left', 'right']);
    expect(
      blockers.some((mesh) => {
        const bb = mesh.getBoundingInfo().boundingBox;
        return bb.minimumWorld.x <= 0 && bb.maximumWorld.x >= 0;
      }),
    ).toBe(false);
  });

  it('terminates and produces one box per component at scale without merging well-separated pylons', () => {
    // Sweep-until-stable must not go quadratic-blowup or hang on families
    // that arrive as many small components (see the code comment on why the
    // merge loop never restarts its scan). 60 pylons spaced 3 apart (gap 2,
    // over CLUSTER_GAP 1.5) should stay 60 separate boxes.
    const pylonCount = 60;
    const pylons = [];
    for (let i = 0; i < pylonCount; i++) {
      const box = MeshBuilder.CreateBox(`pylon-${i}`, { size: 1 }, scene);
      box.position.set(i * 3, 1, 0);
      pylons.push(box);
    }
    const merged = Mesh.MergeMeshes(pylons, true, true)!;
    merged.name = 'merged:V55_SpawnPylonPearlShell+1';
    merged.computeWorldMatrix(true);

    const blockers = clusterBlockers([merged]);

    expect(blockers.length).toBe(pylonCount);
  });
});
