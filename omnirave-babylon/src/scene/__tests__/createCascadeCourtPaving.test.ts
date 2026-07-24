import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PLAZA_X_MAX,
  PLAZA_X_MIN,
  PLAZA_Z_MAX,
  PLAZA_Z_MIN,
  createCascadeCourtPaving,
  planCascadeCourtPaving,
} from '../createCascadeCourtPaving';
import {
  FOUNTAIN_ELLIPSE,
  VENUE_ENVELOPE_BLOCKER_THICKNESS,
  VENUE_WALKABLE_X_MAX,
} from '../mainStageVenueBounds';

const TILE_HALF = 0.9;

// The fountain's octagon convex fit. A tile centre inside this ellipse is the
// only thing the keep-out removes; everything outside (including the octagon's
// corners) must stay paved.
function insideFountainEllipse(x: number, z: number, margin = 0): boolean {
  const { cx, cz, sx, sz } = FOUNTAIN_ELLIPSE;
  const dx = (x - cx) / (sx + margin);
  const dz = (z - cz) / (sz + margin);
  return dx * dx + dz * dz <= 1;
}

// Primitives only - never hand a Babylon object to expect().
function thinInstanceCountOf(scene: Scene, name: string): number {
  const mesh = scene.getMeshByName(name) as Mesh | null;
  return mesh ? mesh.thinInstanceCount : -1;
}

describe('createCascadeCourtPaving', () => {
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

  it('builds without throwing and renders under NullEngine', () => {
    new FreeCamera('cascade-paving-test-camera', new Vector3(40, 3, -30), scene);
    expect(() => createCascadeCourtPaving(scene)).not.toThrow();
    expect(() => scene.render()).not.toThrow();
  });

  it('produces the root plus tile and seam thin instances on both flanks', () => {
    const paving = createCascadeCourtPaving(scene);

    expect(paving.root.name).toBe('cascade-court-paving');
    expect(paving.tiles).toBeGreaterThan(100);
    expect(paving.seams).toBeGreaterThan(30);
    // Mirrored: an even count on both.
    expect(paving.tiles % 2).toBe(0);
    expect(paving.seams % 2).toBe(0);

    const toneCounts = [0, 1, 2].map((index) =>
      thinInstanceCountOf(scene, `cascade-court-paving-tile-${index}`),
    );
    expect(toneCounts.reduce((total, count) => total + count, 0)).toBe(paving.tiles);
    // Every tone batch is actually used, so the field is not one flat tone.
    expect(toneCounts.filter((count) => count > 0).length).toBe(3);
    expect(thinInstanceCountOf(scene, 'cascade-court-paving-seam')).toBe(paving.seams);
  });

  it('keeps every piece unpickable and adds no collision', () => {
    createCascadeCourtPaving(scene);
    const pieces = scene.meshes.filter((mesh) => mesh.name.startsWith('cascade-court-paving-'));
    expect(pieces.length).toBe(4);
    expect(pieces.filter((mesh) => mesh.isPickable).length).toBe(0);
    expect(pieces.filter((mesh) => mesh.checkCollisions).length).toBe(0);
  });

  it('stays inside the flank plaza ring and never onto the cascade fountain', () => {
    // The plaza's outer edge stops at the envelope blocker's walkable face.
    expect(PLAZA_X_MAX).toBe(VENUE_WALKABLE_X_MAX - VENUE_ENVELOPE_BLOCKER_THICKNESS / 2);

    const plan = planCascadeCourtPaving();
    expect(plan.tiles.length).toBeGreaterThan(50);

    for (const tile of plan.tiles) {
      expect(tile.x - TILE_HALF).toBeGreaterThanOrEqual(PLAZA_X_MIN);
      expect(tile.x + TILE_HALF).toBeLessThanOrEqual(PLAZA_X_MAX);
      expect(tile.z - TILE_HALF).toBeGreaterThanOrEqual(PLAZA_Z_MIN);
      expect(tile.z + TILE_HALF).toBeLessThanOrEqual(PLAZA_Z_MAX);

      // No tile centre falls inside the fountain ellipse keep-out.
      expect(insideFountainEllipse(tile.x, tile.z)).toBe(false);
    }
  });

  it('fills the octagon corners the old rectangle walled off', () => {
    const plan = planCascadeCourtPaving();
    // A corner cell the old axis-aligned rectangle (x 52..66, z -42..-15)
    // excluded is now paved: a tile centre near (54, -40) - outside the
    // ellipse - is present.
    const corner = plan.tiles.filter(
      (tile) => tile.x > 53 && tile.x < 56 && tile.z > -42 && tile.z < -39,
    );
    expect(corner.length).toBeGreaterThan(0);
    // But a tile centre inside the ellipse (e.g. near (60, -28)) is still absent.
    const underFountain = plan.tiles.filter(
      (tile) => tile.x > 58 && tile.x < 62 && tile.z > -30 && tile.z < -26,
    );
    expect(underFountain.length).toBe(0);
  });

  it('paves the whole ring: an inner strip plus both end bands', () => {
    const { cx, cz, sx, sz } = FOUNTAIN_ELLIPSE;
    const plan = planCascadeCourtPaving();
    // Strip between the promenade edge and the fountain's inner tip.
    expect(plan.tiles.filter((tile) => tile.x < cx - sx).length).toBeGreaterThan(10);
    // South band, behind the fountain.
    expect(plan.tiles.filter((tile) => tile.z < cz - sz).length).toBeGreaterThan(10);
    // North band, in front of the fountain.
    expect(plan.tiles.filter((tile) => tile.z > cz + sz).length).toBeGreaterThan(10);
  });

  it('lays the paving flat just above the ground', () => {
    createCascadeCourtPaving(scene);
    const tile = scene.getMeshByName('cascade-court-paving-tile-0');
    tile?.computeWorldMatrix(true);
    const box = tile?.getBoundingInfo().boundingBox;
    expect(box === undefined ? -1 : box.minimumWorld.y).toBeGreaterThan(0);
    expect(box === undefined ? -1 : box.maximumWorld.y).toBeLessThan(0.2);
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const paving = createCascadeCourtPaving(scene);
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    paving.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    // Idempotent.
    expect(() => paving.dispose()).not.toThrow();
    expect(scene.meshes.length).toBe(meshBaseline);
  });

  it('reuses the venue plate family when it is in the scene', () => {
    new PBRMaterial('V20_LayeredPearlShell', scene);
    new PBRMaterial('V20_ChasedGoldFiligree', scene);

    const paving = createCascadeCourtPaving(scene);
    expect(paving.pearlSourceMaterial).toBe('V20_LayeredPearlShell');
    expect(paving.goldSourceMaterial).toBe('V20_ChasedGoldFiligree');
  });
});
