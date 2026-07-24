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
      expect(
        names.filter((name) => name.startsWith(`vip-skydeck-rail-${tag}-`)).length,
      ).toBeGreaterThan(10);
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

    const landing = boundsOf(scene, (name) => name === 'vip-skydeck-landing-r');
    expect(landing.minX).toBeCloseTo(SKYDECK_LANDING_X_MIN, 5);
    expect(landing.maxX).toBeCloseTo(SKYDECK_LANDING_X_MAX, 5);
    expect(landing.minZ).toBeCloseTo(SKYDECK_LANDING_Z_MIN, 5);
    // North edge of the landing IS the south edge of the deck.
    expect(landing.maxZ).toBeCloseTo(SKYDECK_Z_MIN, 5);
    expect(landing.maxY).toBeCloseTo(SKYDECK_DECK_Y, 5);

    // Shallow enough for the capsule: the run never exceeds 30 degrees.
    expect(skydeck.rampSlopeDegrees).toBeGreaterThan(20);
    expect(skydeck.rampSlopeDegrees).toBeLessThan(30);
  });

  it('marks only the deck, landing and ramp as walkable floor', () => {
    const skydeck = createVipSkydeck(scene);

    expect(skydeck.walkableMeshes.length).toBe(6);
    const walkableNames = skydeck.walkableMeshes.map((mesh) => mesh.name).sort();
    expect(walkableNames).toEqual([
      'vip-skydeck-deck-l',
      'vip-skydeck-deck-r',
      'vip-skydeck-landing-l',
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

  it('blocks the deck railing line at deck height without walling the ground below', () => {
    const blockers = createMainStageCollisionBlockers(scene, []);
    const skydeckRows = blockers.filter((mesh) => mesh.name.startsWith('main-stage-blocker-skydeck-'));
    expect(skydeckRows.length).toBe(26);

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
    // The landing mouth in the south rail stays open.
    expect(blockedAt(43, SKYDECK_Z_MIN, SKYDECK_DECK_Y, SKYDECK_DECK_Y + 1.65)).toBe(false);

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
