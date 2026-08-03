import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMainStageCollisionBlockers } from '../createMainStageCollisionBlockers';
import { createVipSkydeck } from '../createVipSkydeck';
import {
  SKYDECK_DECK_Y,
  SKYDECK_LANDING_X_MAX,
  SKYDECK_LANDING_X_MIN,
  SKYDECK_LANDING_Z_MIN,
  SKYDECK_RAMP_FOOT_X,
  SKYDECK_RAMP_HEAD_X,
  SKYDECK_RAMP_Z_MAX,
  SKYDECK_RAMP_Z_MIN,
  SKYDECK_SLAB_THICKNESS,
  SKYDECK_X_MAX,
  SKYDECK_X_MIN,
  SKYDECK_Z_MAX,
  SKYDECK_Z_MIN,
} from '../mainStageVenueBounds';

interface Bounds {
  maxX: number;
  maxY: number;
  maxZ: number;
  minX: number;
  minY: number;
  minZ: number;
}

// World bounds of the named meshes. Primitives only - never hand a Babylon
// object to expect().
function boundsOf(scene: Scene, match: (name: string) => boolean): Bounds {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  for (const mesh of scene.meshes) {
    if (!match(mesh.name)) continue;
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    bounds.minX = Math.min(bounds.minX, box.minimumWorld.x);
    bounds.maxX = Math.max(bounds.maxX, box.maximumWorld.x);
    bounds.minY = Math.min(bounds.minY, box.minimumWorld.y);
    bounds.maxY = Math.max(bounds.maxY, box.maximumWorld.y);
    bounds.minZ = Math.min(bounds.minZ, box.minimumWorld.z);
    bounds.maxZ = Math.max(bounds.maxZ, box.maximumWorld.z);
  }
  return bounds;
}

describe('createVipSkydeck', () => {
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

  it('builds both sides without throwing and renders under NullEngine', () => {
    new FreeCamera('vip-skydeck-test-camera', new Vector3(40, 10, -20), scene);
    expect(() => {
      const skydeck = createVipSkydeck(scene);
      expect(skydeck.meshes.length).toBeGreaterThan(40);
    }).not.toThrow();
    expect(() => scene.render()).not.toThrow();
  });

  it('produces the deck, landing, ramp, railing, post and pier parts on both sides', () => {
    createVipSkydeck(scene);
    const names = scene.meshes.map((mesh) => mesh.name);

    for (const tag of ['r', 'l']) {
      expect(names.includes(`vip-skydeck-deck-${tag}`)).toBe(true);
      expect(names.includes(`vip-skydeck-landing-${tag}`)).toBe(true);
      expect(names.includes(`vip-skydeck-ramp-${tag}`)).toBe(true);
      expect(names.filter((name) => name.startsWith(`vip-skydeck-trim-${tag}-`)).length).toBe(4);
      expect(names.filter((name) => name.startsWith(`vip-skydeck-post-${tag}-`)).length).toBe(6);
      expect(names.filter((name) => name.startsWith(`vip-skydeck-pier-${tag}-`)).length).toBe(4);
      // 5 perimeter runs (down from 9 - the L-shaped notch's rails are gone
      // now that the landing matches the deck's own x span) x 2 (top/mid
      // rail per run) = 10 exactly.
      expect(
        names.filter((name) => name.startsWith(`vip-skydeck-rail-${tag}-`)).length,
      ).toBe(10);
      expect(
        names.filter((name) => name.startsWith(`vip-skydeck-ramp-rail-${tag}-`)).length,
      ).toBe(4);
    }
  });

  it('keeps every part unpickable', () => {
    createVipSkydeck(scene);
    const pickable = scene.meshes.filter(
      (mesh) => mesh.name.startsWith('vip-skydeck-') && mesh.isPickable,
    ).length;
    expect(pickable).toBe(0);
  });

  it('puts the deck on the probed 16 x 8.8m footprint at the wing-terrace height', () => {
    createVipSkydeck(scene);

    const right = boundsOf(scene, (name) => name === 'vip-skydeck-deck-r');
    expect(right.minX).toBeCloseTo(SKYDECK_X_MIN, 5);
    expect(right.maxX).toBeCloseTo(SKYDECK_X_MAX, 5);
    expect(right.minZ).toBeCloseTo(SKYDECK_Z_MIN, 5);
    expect(right.maxZ).toBeCloseTo(SKYDECK_Z_MAX, 5);
    expect(right.maxX - right.minX).toBeCloseTo(16, 5);
    expect(right.maxZ - right.minZ).toBeCloseTo(8.8, 5);
    // Walking surface at 8.6: above the wing terrace roof (7.12) and its gold
    // handrail (7.67), below the arc anchor overhead (12.5).
    expect(right.maxY).toBeCloseTo(SKYDECK_DECK_Y, 5);
    expect(right.minY).toBeCloseTo(SKYDECK_DECK_Y - SKYDECK_SLAB_THICKNESS, 5);
    expect(right.maxY).toBeGreaterThan(7.67);
    expect(right.maxY).toBeLessThan(12.5);

    // Mirrored.
    const left = boundsOf(scene, (name) => name === 'vip-skydeck-deck-l');
    expect(left.minX).toBeCloseTo(-SKYDECK_X_MAX, 5);
    expect(left.maxX).toBeCloseTo(-SKYDECK_X_MIN, 5);
    expect(left.maxY).toBeCloseTo(SKYDECK_DECK_Y, 5);
  });

  it('lands the ramp on the ground at one end and on the landing at the other', () => {
    const skydeck = createVipSkydeck(scene);

    const ramp = boundsOf(scene, (name) => name === 'vip-skydeck-ramp-r');
    // Foot at the flank ground: the walking surface reaches y 0 at x 61.
    expect(ramp.maxX).toBeCloseTo(SKYDECK_RAMP_FOOT_X, 4);
    expect(ramp.minY).toBeLessThan(0);
    // Head at deck height, so ramp and landing meet with no step.
    expect(ramp.maxY).toBeCloseTo(SKYDECK_DECK_Y, 4);

    // Landing is now two boxes (see createVipSkydeck.ts's LANDING_MAIN/
    // LANDING_MOUTH comment): a full-width MAIN block where the ramp never
    // passes underneath, and a narrower MOUTH block clipped to the ramp's
    // own head x - a single full-width slab across the whole depth
    // overhung the ramp's sloped surface at its shallow end.
    const landingMain = boundsOf(scene, (name) => name === 'vip-skydeck-landing-r');
    expect(landingMain.minX).toBeCloseTo(SKYDECK_LANDING_X_MIN, 5);
    expect(landingMain.maxX).toBeCloseTo(SKYDECK_LANDING_X_MAX, 5);
    expect(landingMain.minZ).toBeCloseTo(SKYDECK_RAMP_Z_MAX, 5);
    // North edge of the landing IS the south edge of the deck.
    expect(landingMain.maxZ).toBeCloseTo(SKYDECK_Z_MIN, 5);
    expect(landingMain.maxY).toBeCloseTo(SKYDECK_DECK_Y, 5);

    const landingMouth = boundsOf(scene, (name) => name === 'vip-skydeck-landing-mouth-r');
    expect(landingMouth.minX).toBeCloseTo(SKYDECK_LANDING_X_MIN, 5);
    // Clipped to the ramp's own head x, not the widened deck edge - this is
    // exactly the fix: no slab reaches over the ramp's own footprint.
    expect(landingMouth.maxX).toBeCloseTo(SKYDECK_RAMP_HEAD_X, 5);
    expect(landingMouth.minZ).toBeCloseTo(SKYDECK_LANDING_Z_MIN, 5);
    expect(landingMouth.maxZ).toBeCloseTo(SKYDECK_RAMP_Z_MAX, 5);
    expect(landingMouth.maxY).toBeCloseTo(SKYDECK_DECK_Y, 5);

    // Shallow enough for the capsule: the run never exceeds 30 degrees.
    expect(skydeck.rampSlopeDegrees).toBeGreaterThan(20);
    expect(skydeck.rampSlopeDegrees).toBeLessThan(30);
  });

  it('marks only the deck, landing (both boxes) and ramp as walkable floor', () => {
    const skydeck = createVipSkydeck(scene);

    expect(skydeck.walkableMeshes.length).toBe(8);
    const walkableNames = skydeck.walkableMeshes.map((mesh) => mesh.name).sort();
    expect(walkableNames).toEqual([
      'vip-skydeck-deck-l',
      'vip-skydeck-deck-r',
      'vip-skydeck-landing-l',
      'vip-skydeck-landing-mouth-l',
      'vip-skydeck-landing-mouth-r',
      'vip-skydeck-landing-r',
      'vip-skydeck-ramp-l',
      'vip-skydeck-ramp-r',
    ]);
    expect(skydeck.walkableMeshes.every((mesh) => mesh.checkCollisions)).toBe(true);

    // Railings and trim are pictures; the authored blocker rows stop the
    // player, so these must not become collision surfaces of their own.
    const railsWithCollision = scene.meshes.filter(
      (mesh) => mesh.name.startsWith('vip-skydeck-rail-') && mesh.checkCollisions,
    ).length;
    expect(railsWithCollision).toBe(0);
  });

  it('blocks the deck+landing perimeter at deck height without walling the ground below', () => {
    const blockers = createMainStageCollisionBlockers(scene, []);
    const skydeckRows = blockers.filter((mesh) => mesh.name.startsWith('main-stage-blocker-skydeck-'));
    // 5 perimeter runs x 2 sides (down from 9 runs / 26 rows - the L-shaped
    // notch's rails are gone now that the landing matches the deck's own x
    // span) + 4 piers x 2 sides = 18, + the ramp's own balustrade collision
    // (16 segments x 2 edges x 2 sides = 64, added 2026-07-31 so the
    // previously walk-through rail actually stops you) = 82.
    expect(skydeckRows.length).toBe(82);

    const blockedAt = (x: number, z: number, feetY: number, headY: number) =>
      blockers.some((mesh) => {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        return (
          x >= box.minimumWorld.x &&
          x <= box.maximumWorld.x &&
          z >= box.minimumWorld.z &&
          z <= box.maximumWorld.z &&
          headY >= box.minimumWorld.y &&
          feetY <= box.maximumWorld.y
        );
      });

    // On the deck: the north rail stops you.
    expect(blockedAt(39, SKYDECK_Z_MAX, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(true);
    // The bridge mouth in the inboard rail stays open.
    expect(blockedAt(SKYDECK_X_MIN, 0, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(false);
    // Deck and landing now abut with no seam rail across their ENTIRE
    // shared width (not just the old narrow landing's x 41..45) - walking
    // from one to the other is never blocked anywhere along z SKYDECK_Z_MIN.
    expect(blockedAt(43, SKYDECK_Z_MIN, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(false);
    // Regression guard: x 33 sat under the OLD 'deck-south-west' notch rail
    // (it fenced x 31..41 at this z) before the landing widened to remove
    // the notch entirely - it must be open now too.
    expect(blockedAt(33, SKYDECK_Z_MIN, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(false);
    // The new south perimeter rail (at the widened landing's own south edge,
    // not the old narrow strip's) stops you at a point that is only part of
    // the platform's footprint NOW that it is a full-width rectangle.
    expect(blockedAt(33, SKYDECK_LANDING_Z_MIN, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(true);
    // Regression guard (in-engine playtest, 2026-07-31): the south run used
    // to span the FULL x 31..47, putting a flat deck-height rail directly
    // across the ramp's own head (x 45..47, where the ramp's climbing
    // surface arrives at ~deck height) - physically blocking the climb. The
    // south run now stops at SKYDECK_RAMP_HEAD_X, so the ramp mouth must be
    // open at deck height along its whole x 45..47 span. Tested at the
    // ramp's own CENTER z, not its edge z (SKYDECK_LANDING_Z_MIN) - the edge
    // is now correctly blocked by the ramp's own side-rail collision added
    // just below, a separate, later fix for a separate bug.
    const rampCenterZForMouthCheck = (SKYDECK_RAMP_Z_MIN + SKYDECK_RAMP_Z_MAX) / 2;
    expect(blockedAt(46, rampCenterZForMouthCheck, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(false);
    expect(blockedAt(SKYDECK_RAMP_HEAD_X + 0.1, rampCenterZForMouthCheck, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(
      false,
    );
    // Regression guard (in-engine playtest, 2026-07-31): the pier at x 55
    // (near the ramp's shallow/foot end) used to get a FLAT 3m collision
    // blocker regardless of position, while the ramp's real walking surface
    // right above it sits at only ~3.2m there - the blocker rose ABOVE the
    // floor and walled the climb outright (a player's feet at ~3.2m
    // overlapped the blocker's 0..3m band). The blocker is now capped at a
    // capsule-height clearance well below that, so a player standing on the
    // ramp's actual surface there must be clear.
    const rampSurfaceYAtPier1 = ((SKYDECK_RAMP_FOOT_X - 55) / (SKYDECK_RAMP_FOOT_X - SKYDECK_RAMP_HEAD_X)) * SKYDECK_DECK_Y;
    expect(blockedAt(55, -9, rampSurfaceYAtPier1, rampSurfaceYAtPier1 + 1.65)).toBe(false);
    // Regression guard (in-engine playtest, 2026-07-31, second find on the
    // SAME climb): the ramp's rotated slab reaches all the way to x 47 (its
    // AABB spans x 44.81..61), and right there its real walking height is
    // close enough to deck height to graze the 'east' perimeter rail - which
    // used to span the FULL z LANDING_Z_MIN..Z_MAX, covering the ramp's own
    // z -11..-7 band. The east run now stops short at SKYDECK_RAMP_Z_MAX,
    // so a player nearing the top of the climb at x 47 must be clear too.
    expect(blockedAt(SKYDECK_X_MAX, -9, 8.5, 10.15)).toBe(false);

    // Player-flagged (2026-07-31): the ramp's own balustrade had NO
    // collision at all - clicking on the visible rail picked straight
    // through it to an unrelated venue mesh behind it, and a player could
    // walk clean off either edge mid-climb. rampRailBlockers() now steps
    // segmented collision along both edges; at x 53 (mid-climb) the real
    // walking surface is at ((61-53)/16)*8.6 = 4.3m, so a player standing at
    // that height right at the south/north edge must now be stopped...
    const rampSurfaceYAt53 = ((SKYDECK_RAMP_FOOT_X - 53) / (SKYDECK_RAMP_FOOT_X - SKYDECK_RAMP_HEAD_X)) * SKYDECK_DECK_Y;
    expect(blockedAt(53, SKYDECK_RAMP_Z_MIN + 0.05, rampSurfaceYAt53, rampSurfaceYAt53 + 1.5)).toBe(true);
    expect(blockedAt(53, SKYDECK_RAMP_Z_MAX - 0.05, rampSurfaceYAt53, rampSurfaceYAt53 + 1.5)).toBe(true);
    // ...while the ramp's own CENTER (where every real climb happens) must
    // stay completely open at that same height.
    const rampCenterZ = (SKYDECK_RAMP_Z_MIN + SKYDECK_RAMP_Z_MAX) / 2;
    expect(blockedAt(53, rampCenterZ, rampSurfaceYAt53, rampSurfaceYAt53 + 1.5)).toBe(false);

    // Ground level under the whole structure stays walkable - including the
    // vip_terrace route objective at (32, 2) and the ramp corridor.
    for (const [x, z] of [
      [32, 2],
      [-32, 2],
      [39, 0],
      [39, 4.8],
      [53, -9],
      [60, -9],
      [43, -7.5],
    ] as const) {
      expect(blockedAt(x, z, 0, 1.65)).toBe(false);
    }
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const skydeck = createVipSkydeck(scene);
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    skydeck.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    expect(() => skydeck.dispose()).not.toThrow();
    expect(scene.meshes.length).toBe(meshBaseline);
  });
});
