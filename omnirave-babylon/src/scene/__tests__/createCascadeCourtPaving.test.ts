import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BAY_PLAZA_X_MAX,
  BAY_PLAZA_Z_MAX,
  BAY_PLAZA_Z_MIN,
  PLAZA_X_MAX,
  PLAZA_X_MIN,
  PLAZA_Z_MAX,
  PLAZA_Z_MIN,
  createCascadeCourtPaving,
  planCascadeCourtPaving,
} from '../createCascadeCourtPaving';
import {
  CASCADE_BAY_WALKABLE_X_MAX,
  FOUNTAIN_ELLIPSE,
  VENUE_ENVELOPE_BLOCKER_THICKNESS,
  VENUE_WALKABLE_X_MAX,
} from '../mainStageVenueBounds';

const TILE_HALF = 0.9;

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

  it('stays inside the flank plaza ring and the bay, never past a wall', () => {
    // Each region's outer edge stops at a blocker's walkable face - paving
    // past one is behind the boundary fence and unreachable.
    expect(PLAZA_X_MAX).toBe(VENUE_WALKABLE_X_MAX - VENUE_ENVELOPE_BLOCKER_THICKNESS / 2);
    expect(BAY_PLAZA_X_MAX).toBe(CASCADE_BAY_WALKABLE_X_MAX);

    const plan = planCascadeCourtPaving();
    expect(plan.tiles.length).toBeGreaterThan(50);

    for (const tile of plan.tiles) {
      // Inboard edge and the two outer walls bound every tile in the court.
      expect(tile.x - TILE_HALF).toBeGreaterThanOrEqual(PLAZA_X_MIN);
      expect(tile.x + TILE_HALF).toBeLessThanOrEqual(BAY_PLAZA_X_MAX);

      // Which region a tile belongs to decides its z bounds. The shared edge
      // at PLAZA_X_MAX is an interior joint, so the column straddling it is
      // laid from the bay's side and is measured by the bay's z walls.
      const inBay = tile.x + TILE_HALF > PLAZA_X_MAX;
      const zMin = inBay ? BAY_PLAZA_Z_MIN : PLAZA_Z_MIN;
      const zMax = inBay ? BAY_PLAZA_Z_MAX : PLAZA_Z_MAX;
      expect(tile.z - TILE_HALF).toBeGreaterThanOrEqual(zMin);
      expect(tile.z + TILE_HALF).toBeLessThanOrEqual(zMax);
    }
  });

  // Owner request (2026-08-04): the ground the boundary now encloses around
  // the fountain and the ramp entrance is real walkable court, so it gets the
  // same LED tiles as the rest of it ("fill the space with the LED tiles").
  // The light floor lays one emissive quad per tile from this same plan, so
  // paving the bay lights it too.
  it('paves the bay outboard of the old fence line, on the same lattice', () => {
    const plan = planCascadeCourtPaving();
    const bay = plan.tiles.filter((tile) => tile.x > PLAZA_X_MAX);
    expect(bay.length).toBeGreaterThan(100);
    // It reaches past the fountain stone (x 82 at its widest) to the new wall.
    expect(Math.max(...bay.map((tile) => tile.x))).toBeGreaterThan(82);
    // And it runs from south of the fountain up to the ramp entrance.
    expect(Math.min(...bay.map((tile) => tile.z))).toBeLessThan(-41);
    expect(Math.max(...bay.map((tile) => tile.z))).toBeGreaterThan(-9);

    // No bare strip along the joint: the two fields meet within one seam.
    const plazaEdge = Math.max(
      ...plan.tiles.filter((tile) => tile.x < PLAZA_X_MAX - TILE_HALF).map((tile) => tile.x + TILE_HALF),
    );
    const bayEdge = Math.min(...bay.map((tile) => tile.x - TILE_HALF));
    expect(bayEdge - plazaEdge).toBeLessThan(0.3);

    // One lattice, not two grids butted together: every tile centre sits on
    // the same pitch as the plaza's.
    const pitch = 1.8 + 0.14;
    const reference = plan.tiles[0].x;
    for (const tile of bay) {
      const offset = Math.abs(((tile.x - reference) / pitch) % 1);
      expect(Math.min(offset, 1 - offset)).toBeLessThan(1e-6);
    }
  });

  it('paves the whole plaza uniformly, including under the fountain', () => {
    // Player-flagged (2026-07-31): every prior pass here tried to CUT the
    // paving around the fountain's footprint (rectangle, then ellipse, then
    // the real octagon radius) and each attempt left some bare-ground gap
    // somewhere at the boundary. The actual intent is simpler: the tile
    // floor is laid first, uniformly, and the fountain sits on top of it -
    // so there is no keep-out at all anymore. Collision (still shape-aware,
    // in createMainStageCollisionBlockers.ts) is what stops a player from
    // walking through the stone; the paving layer no longer needs to know
    // the fountain's shape.
    const plan = planCascadeCourtPaving();

    // A corner cell the old axis-aligned rectangle keep-out used to exclude.
    const corner = plan.tiles.filter(
      (tile) => tile.x > 53 && tile.x < 56 && tile.z > -42 && tile.z < -39,
    );
    expect(corner.length).toBeGreaterThan(0);
    // A tile centre ON the stone itself (e.g. near (60, -28)) is now present
    // too - previously excluded by every keep-out variant tried.
    const underFountain = plan.tiles.filter(
      (tile) => tile.x > 58 && tile.x < 62 && tile.z > -30 && tile.z < -26,
    );
    expect(underFountain.length).toBeGreaterThan(0);
    // Regression guard: tiles near x 54.7, z -31..-25 sat inside every
    // keep-out variant tried (rectangle, ellipse, real-octagon-plus-margin)
    // despite the fountain barely reaching that far - real bare ground with
    // missing floor at the flat edge. Paved now, same as everywhere else.
    const previouslyMissing = plan.tiles.filter(
      (tile) => tile.x > 53.5 && tile.x < 56 && tile.z > -31 && tile.z < -25,
    );
    expect(previouslyMissing.length).toBeGreaterThan(0);
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

  // Player-flagged (2026-08-03): this used to assert minimumWorld.y > 0, which
  // PINNED the bug - a slab whose underside floats above grade is exactly the
  // "tiles hovering a couple inches off the ground" the owner screenshotted,
  // and whose top face then stood at the avatar's ankles. The real invariant
  // is the opposite one: the stone is BEDDED (underside at or below grade, so
  // nothing floats) and its top face is only a hair proud of the ground the
  // feet actually rest on, so the avatar walks ON the tiles.
  it('beds the paving into the ground, with the tile face flush underfoot', () => {
    createCascadeCourtPaving(scene);
    const tile = scene.getMeshByName('cascade-court-paving-tile-0');
    tile?.computeWorldMatrix(true);
    const box = tile?.getBoundingInfo().boundingBox;
    // No floating: the underside never sits above grade.
    expect(box === undefined ? 1 : box.minimumWorld.y).toBeLessThanOrEqual(0);
    // Proud enough not to z-fight the ground plane...
    expect(box === undefined ? -1 : box.maximumWorld.y).toBeGreaterThan(0);
    // ...but far below the ~0.08m ankle height that made the avatar wade
    // through the paving instead of standing on it.
    expect(box === undefined ? 1 : box.maximumWorld.y).toBeLessThan(0.02);
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
