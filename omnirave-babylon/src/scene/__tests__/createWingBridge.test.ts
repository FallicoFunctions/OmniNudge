import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMainStageCollisionBlockers } from '../createMainStageCollisionBlockers';
import { createWingBridge } from '../createWingBridge';
import {
  SKYDECK_DECK_Y,
  SKYDECK_SLAB_THICKNESS,
  SKYDECK_X_MIN,
  WING_BRIDGE_DECK_Y,
  WING_BRIDGE_HALF_SPAN,
  WING_BRIDGE_HALF_WIDTH,
  WING_BRIDGE_PIER_XS,
  WING_BRIDGE_Z,
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

describe('createWingBridge', () => {
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
    new FreeCamera('wing-bridge-test-camera', new Vector3(0, 12, -30), scene);
    expect(() => {
      const bridge = createWingBridge(scene);
      expect(bridge.meshes.length).toBeGreaterThan(20);
    }).not.toThrow();
    expect(() => scene.render()).not.toThrow();
  });

  it('produces the deck, edge beams, railings and piers', () => {
    createWingBridge(scene);
    const names = scene.meshes.map((mesh) => mesh.name);

    expect(names.includes('wing-bridge-deck')).toBe(true);
    expect(names.includes('wing-bridge-beam-north')).toBe(true);
    expect(names.includes('wing-bridge-beam-south')).toBe(true);
    expect(names.filter((name) => name.startsWith('wing-bridge-rail-')).length).toBeGreaterThan(4);
    expect(names.filter((name) => /^wing-bridge-pier-[rl]\d+$/.test(name)).length).toBe(
      WING_BRIDGE_PIER_XS.length * 2,
    );
  });

  it('keeps every part unpickable', () => {
    createWingBridge(scene);
    const pickable = scene.meshes.filter(
      (mesh) => mesh.name.startsWith('wing-bridge-') && mesh.isPickable,
    ).length;
    expect(pickable).toBe(0);
  });

  it('spans flank to flank at the skydeck height on a slim 4.5m deck', () => {
    const bridge = createWingBridge(scene);

    const deck = boundsOf(scene, (name) => name === 'wing-bridge-deck');
    expect(deck.minX).toBeCloseTo(-WING_BRIDGE_HALF_SPAN, 5);
    expect(deck.maxX).toBeCloseTo(WING_BRIDGE_HALF_SPAN, 5);
    // Overlaps each skydeck's inboard edge, so there is no seam at the join.
    expect(deck.maxX).toBeGreaterThan(SKYDECK_X_MIN);
    expect(deck.minZ).toBeCloseTo(WING_BRIDGE_Z - WING_BRIDGE_HALF_WIDTH, 5);
    expect(deck.maxZ).toBeCloseTo(WING_BRIDGE_Z + WING_BRIDGE_HALF_WIDTH, 5);
    expect(deck.maxZ - deck.minZ).toBeCloseTo(4.5, 5);

    // Same walking height as the skydecks: one continuous level.
    expect(deck.maxY).toBeCloseTo(WING_BRIDGE_DECK_Y, 5);
    expect(deck.maxY).toBeCloseTo(SKYDECK_DECK_Y, 5);
    expect(deck.minY).toBeCloseTo(WING_BRIDGE_DECK_Y - SKYDECK_SLAB_THICKNESS, 5);

    expect(bridge.spanMeters).toBeCloseTo(WING_BRIDGE_HALF_SPAN * 2, 5);
    // High enough over the promenade below to clear the crowd by a wide margin.
    expect(deck.minY).toBeGreaterThan(6);
  });

  it('marks the deck as walkable floor and the railings as pictures', () => {
    const bridge = createWingBridge(scene);

    expect(bridge.walkableMeshes.length).toBe(1);
    expect(bridge.walkableMeshes[0].name).toBe('wing-bridge-deck');
    expect(bridge.walkableMeshes[0].checkCollisions).toBe(true);

    const railsWithCollision = scene.meshes.filter(
      (mesh) => mesh.name.startsWith('wing-bridge-rail-') && mesh.checkCollisions,
    ).length;
    expect(railsWithCollision).toBe(0);
  });

  it('rails the span at deck height and leaves the promenade beneath open', () => {
    const blockers = createMainStageCollisionBlockers(scene, []);
    const bridgeRows = blockers.filter((mesh) =>
      mesh.name.startsWith('main-stage-blocker-wing-bridge-'),
    );
    expect(bridgeRows.length).toBe(2);

    const blockedAt = (x: number, z: number, feetY: number, headY: number) =>
      bridgeRows.some((mesh) => {
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

    // Walking the bridge, both edges stop you.
    expect(blockedAt(0, WING_BRIDGE_HALF_WIDTH, WING_BRIDGE_DECK_Y, WING_BRIDGE_DECK_Y + 1.65)).toBe(true);
    expect(blockedAt(0, -WING_BRIDGE_HALF_WIDTH, WING_BRIDGE_DECK_Y, WING_BRIDGE_DECK_Y + 1.65)).toBe(true);
    // Nothing reaches the promenade underneath.
    expect(blockedAt(0, 0, 0, 1.65)).toBe(false);
    expect(blockedAt(0, WING_BRIDGE_HALF_WIDTH, 0, 1.65)).toBe(false);
    expect(blockedAt(20, -WING_BRIDGE_HALF_WIDTH, 0, 1.65)).toBe(false);
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const bridge = createWingBridge(scene);
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    bridge.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    expect(() => bridge.dispose()).not.toThrow();
    expect(scene.meshes.length).toBe(meshBaseline);
  });
});
