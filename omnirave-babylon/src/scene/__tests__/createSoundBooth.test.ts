import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMainStageCollisionBlockers } from '../createMainStageCollisionBlockers';
import { createSoundBooth } from '../createSoundBooth';
import {
  FOH_BOOTH_DECK_DEPTH,
  FOH_BOOTH_DECK_WIDTH,
  FOH_BOOTH_X,
  FOH_BOOTH_Z,
} from '../mainStageVenueBounds';

interface Bounds {
  maxX: number;
  maxY: number;
  maxZ: number;
  minX: number;
  minY: number;
  minZ: number;
}

// Bounds of the named meshes, in world space. Primitives only - never hand a
// Babylon object to expect().
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

describe('createSoundBooth', () => {
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
    new FreeCamera('sound-booth-test-camera', new Vector3(0, 3, -40), scene);
    expect(() => {
      const booth = createSoundBooth(scene);
      expect(booth.meshes.length).toBeGreaterThan(20);
    }).not.toThrow();
    expect(() => scene.render()).not.toThrow();
  });

  it('produces the deck, railing, console and canopy parts', () => {
    createSoundBooth(scene);

    expect(scene.getMeshByName('sound-booth-deck') !== null).toBe(true);
    expect(scene.getMeshByName('sound-booth-console') !== null).toBe(true);
    expect(scene.getMeshByName('sound-booth-console-faceplate') !== null).toBe(true);
    expect(scene.getMeshByName('sound-booth-canopy') !== null).toBe(true);

    const names = scene.meshes.map((mesh) => mesh.name);
    expect(names.filter((name) => name.startsWith('sound-booth-rail-')).length).toBeGreaterThan(4);
    expect(names.filter((name) => name.startsWith('sound-booth-truss-')).length).toBeGreaterThan(4);
    expect(names.filter((name) => name.startsWith('sound-booth-canopy-post-')).length).toBe(4);
    expect(names.filter((name) => name.startsWith('sound-booth-cable-loom-')).length).toBeGreaterThan(1);
    expect(names.filter((name) => name.startsWith('sound-booth-flight-case-')).length).toBe(2);
  });

  it('keeps every part unpickable', () => {
    createSoundBooth(scene);
    const pickable = scene.meshes.filter(
      (mesh) => mesh.name.startsWith('sound-booth-') && mesh.isPickable,
    ).length;
    expect(pickable).toBe(0);
  });

  it('sits on the deck footprint at the FOH spot and leaves the promenade walkable', () => {
    createSoundBooth(scene);

    const deck = boundsOf(scene, (name) => name === 'sound-booth-deck');
    expect(deck.minX).toBeCloseTo(FOH_BOOTH_X - FOH_BOOTH_DECK_WIDTH / 2, 3);
    expect(deck.maxX).toBeCloseTo(FOH_BOOTH_X + FOH_BOOTH_DECK_WIDTH / 2, 3);
    expect(deck.minZ).toBeCloseTo(FOH_BOOTH_Z - FOH_BOOTH_DECK_DEPTH / 2, 3);
    expect(deck.maxZ).toBeCloseTo(FOH_BOOTH_Z + FOH_BOOTH_DECK_DEPTH / 2, 3);
    // Raised deck, roughly half a metre off the ground.
    expect(deck.maxY).toBeGreaterThan(0.4);
    expect(deck.maxY).toBeLessThan(0.6);

    // Nothing in the whole booth reaches past |x| 5, so the crowd (which
    // runs to |x| 14) keeps ~9m of clear walkway either side.
    const whole = boundsOf(scene, (name) => name.startsWith('sound-booth-'));
    expect(whole.minX).toBeGreaterThan(-5);
    expect(whole.maxX).toBeLessThan(5);

    // The structure (everything except the ground cable looms running to
    // the stage) stays inside the ~7 x 5 footprint, plus canopy overhang.
    const structure = boundsOf(
      scene,
      (name) => name.startsWith('sound-booth-') && !name.startsWith('sound-booth-cable-loom-'),
    );
    expect(structure.minZ).toBeGreaterThan(FOH_BOOTH_Z - FOH_BOOTH_DECK_DEPTH / 2 - 0.5);
    expect(structure.maxZ).toBeLessThan(FOH_BOOTH_Z + FOH_BOOTH_DECK_DEPTH / 2 + 0.5);
    // Canopy overhead, not a wall.
    expect(structure.maxY).toBeGreaterThan(3);
    expect(structure.maxY).toBeLessThan(4);
  });

  it('faces the stage: the mixing desk sits on the +z half of the deck', () => {
    createSoundBooth(scene);
    const desk = boundsOf(scene, (name) => name === 'sound-booth-console');
    expect((desk.minZ + desk.maxZ) / 2).toBeGreaterThan(FOH_BOOTH_Z);
  });

  it('blocks the booth footprint but leaves x +/-10 at that z open', () => {
    const blockers = createMainStageCollisionBlockers(scene, []);
    const booth = blockers.filter((mesh) => mesh.name === 'main-stage-blocker-foh-sound-booth');
    expect(booth.length).toBe(1);

    const blocked = (x: number, z: number) =>
      blockers.some((mesh) => {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        return (
          x >= box.minimumWorld.x &&
          x <= box.maximumWorld.x &&
          z >= box.minimumWorld.z &&
          z <= box.maximumWorld.z
        );
      });

    expect(blocked(FOH_BOOTH_X, FOH_BOOTH_Z)).toBe(true);
    expect(blocked(FOH_BOOTH_X - 3, FOH_BOOTH_Z)).toBe(true);
    expect(blocked(FOH_BOOTH_X + 3, FOH_BOOTH_Z)).toBe(true);
    // The promenade either side of the booth stays walkable.
    expect(blocked(-10, FOH_BOOTH_Z)).toBe(false);
    expect(blocked(10, FOH_BOOTH_Z)).toBe(false);
    // No phantom wall in front of the booth where the canopy overhangs and
    // the cable looms run toward the stage.
    expect(blocked(FOH_BOOTH_X, FOH_BOOTH_Z + 4)).toBe(false);
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const booth = createSoundBooth(scene);
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    booth.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    // Idempotent.
    expect(() => booth.dispose()).not.toThrow();
    expect(scene.meshes.length).toBe(meshBaseline);
  });
});
