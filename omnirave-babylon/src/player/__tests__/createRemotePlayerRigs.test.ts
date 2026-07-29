import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRemotePlayerRigs } from '../createRemotePlayerRigs';
import { sanitizePlayerName } from '../createNameplate';
import { LABEL_MAX_DISTANCE_METERS } from '../labelDistanceMath';
import type { WorldSnapshot } from '../../network/worldSocket';

const snapshot = (currentPlayerId: string, players: Array<{ id: string; x: number; z: number }>): WorldSnapshot => ({
  players: players.map(({ id, x, z }) => ({
    id,
    playerName: `name-${id}`,
    mode: 'guest' as const,
    position: { x, y: 0, z },
    zone: 'main_stage',
    loadout: {},
  })),
  zoneMedia: [],
  zoneEvents: [],
  currentPlayerId,
  activeZone: 'main_stage',
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const snapshotWithColorway = (
  currentPlayerId: string,
  players: Array<{ id: string; x: number; z: number; colorway?: string }>,
): WorldSnapshot => ({
  players: players.map(({ id, x, z, colorway }) => ({
    id,
    playerName: `name-${id}`,
    mode: 'guest' as const,
    position: { x, y: 0, z },
    zone: 'main_stage',
    loadout: (colorway ? { colorway } : {}) as Record<string, string>,
  })),
  zoneMedia: [],
  zoneEvents: [],
  currentPlayerId,
  activeZone: 'main_stage',
});

describe('createRemotePlayerRigs', () => {
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

  it('spawns a ghost for every player except the local one', async () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [
      { id: 'me', x: 0, z: 0 },
      { id: 'other-1', x: 4, z: -10 },
      { id: 'other-2', x: -6, z: 2 },
    ]));
    await settle();
    expect(rigs.count()).toBe(2);
    const ghost = scene.getTransformNodeByName('remote-player-other-1');
    expect(ghost !== null).toBe(true);
    expect(ghost!.position.x).toBeCloseTo(4);
    expect(ghost!.position.z).toBeCloseTo(-10);
  });

  it('lerps ghosts toward updated positions and snaps across teleports', async () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 0, z: 0 }]));
    await settle();

    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 2, z: 0 }]));
    rigs.update(0.05);
    const ghost = scene.getTransformNodeByName('remote-player-p')!;
    expect(ghost.position.x).toBeGreaterThan(0.2);
    expect(ghost.position.x).toBeLessThan(2);

    // Far jump (respawn/teleport) snaps instead of gliding.
    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 40, z: -30 }]));
    rigs.update(0.016);
    expect(ghost.position.x).toBeCloseTo(40);
    expect(ghost.position.z).toBeCloseTo(-30);
  });

  it('disposes ghosts for players that left', async () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [
      { id: 'a', x: 1, z: 1 },
      { id: 'b', x: 2, z: 2 },
    ]));
    await settle();
    expect(rigs.count()).toBe(2);

    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));
    expect(rigs.count()).toBe(1);
    expect(scene.getTransformNodeByName('remote-player-b') === null).toBe(true);
  });

  it('dispose tears everything down even mid-avatar-build', async () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'x', x: 0, z: 0 }]));
    rigs.dispose(); // before the async avatar resolves
    await settle();
    expect(rigs.count()).toBe(0);
    expect(scene.getTransformNodeByName('remote-player-x') === null).toBe(true);
    // No stray avatar meshes left behind.
    const stray = scene.meshes.filter((m) => m.name.startsWith('review-avatar')).length;
    expect(stray).toBe(0);
  });

  it('disposes materials and textures - including cached colorway clones - on despawn, leaving no leak', async () => {
    const rigs = createRemotePlayerRigs(scene);
    const baselineMaterialCount = scene.materials.length;

    // Spawn, then switch colorways twice: applyAvatarColorway clones+caches
    // a material per colorway on mesh.metadata.avatarColorwayMaterials, so
    // this leaves behind the original base material plus two cached clones
    // per mesh, only one of which is ever the mesh's live material.
    rigs.applySnapshot(snapshotWithColorway('me', [{ id: 'p', x: 0, z: 0, colorway: 'aurora' }]));
    await settle();
    rigs.applySnapshot(snapshotWithColorway('me', [{ id: 'p', x: 0, z: 0, colorway: 'signal' }]));
    rigs.applySnapshot(snapshotWithColorway('me', [{ id: 'p', x: 0, z: 0, colorway: 'pulse' }]));

    expect(scene.materials.length).toBeGreaterThan(baselineMaterialCount);

    // Despawn (player leaves the world).
    rigs.applySnapshot(snapshotWithColorway('me', []));

    expect(scene.materials.length).toBe(baselineMaterialCount);
  });

  it('gives every ghost a nameplate mesh, parented to the ghost root', async () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 0, z: 0 }]));
    await settle();
    const plate = scene.getMeshByName('nameplate-p');
    expect(plate !== null).toBe(true);
    expect(plate!.parent).toBe(scene.getTransformNodeByName('remote-player-p'));
  });

  it('shows the nameplate immediately, before the async avatar resolves', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 0, z: 0 }]));
    // No `await settle()` here - the avatar promise hasn't resolved yet.
    const plate = scene.getMeshByName('nameplate-p');
    expect(plate !== null).toBe(true);
  });

  it('leaves no stray nameplate meshes or materials behind on despawn', async () => {
    const rigs = createRemotePlayerRigs(scene);
    const baselineMaterialCount = scene.materials.length;

    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 0, z: 0 }]));
    await settle();
    expect(scene.materials.length).toBeGreaterThan(baselineMaterialCount);

    rigs.applySnapshot(snapshot('me', []));

    expect(scene.materials.length).toBe(baselineMaterialCount);
    expect(scene.getMeshByName('nameplate-p') === null).toBe(true);
  });

  it('nameplate texture creation degrades gracefully with no 2D context (NullEngine) and disposes without throwing', () => {
    // NullEngine's canvas has no getContext('2d'), matching this suite's
    // environment: paintNameTexture must fall back to null instead of
    // throwing, and the nameplate must still be disposable cleanly.
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 0, z: 0 }]));
    const plate = scene.getMeshByName('nameplate-p');
    expect(plate !== null).toBe(true);
    // No 2D context under NullEngine, so paintNameTexture's fallback leaves
    // the plate materialless-of-texture rather than throwing.
    expect(plate!.material?.getActiveTextures().length ?? 0).toBe(0);
    expect(() => rigs.dispose()).not.toThrow();
  });

  it('disposes the nameplate too when torn down mid-avatar-build', async () => {
    const rigs = createRemotePlayerRigs(scene);
    const baselineMaterialCount = scene.materials.length;
    rigs.applySnapshot(snapshot('me', [{ id: 'x', x: 0, z: 0 }]));
    rigs.dispose(); // before the async avatar resolves
    await settle();
    expect(scene.getMeshByName('nameplate-x') === null).toBe(true);
    expect(scene.materials.length).toBe(baselineMaterialCount);
  });

  it('hides and restores nameplates for the Display Names setting', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 0, z: 0 }]));

    expect(rigs.nameplatesVisible()).toBe(true);
    expect(scene.getMeshByName('nameplate-a')?.isEnabled()).toBe(true);

    rigs.setNameplatesVisible(false);
    expect(rigs.nameplatesVisible()).toBe(false);
    expect(scene.getMeshByName('nameplate-a')?.isEnabled()).toBe(false);

    // A player who joins while names are off must not pop a plate.
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 2, z: 2 }]));
    expect(scene.getMeshByName('nameplate-b')?.isEnabled()).toBe(false);

    rigs.setNameplatesVisible(true);
    expect(scene.getMeshByName('nameplate-a')?.isEnabled()).toBe(true);
    expect(scene.getMeshByName('nameplate-b')?.isEnabled()).toBe(true);

    rigs.dispose();
  });

  // ---- Sec 10.1 name-plate distance rules -------------------------------

  // Places an active camera at the origin so update() has a real distance to
  // work with (without one it treats distance as unknown and skips the rules).
  const placeCamera = () => {
    const camera = new FreeCamera('test-camera', new Vector3(0, 0, 0), scene);
    scene.activeCamera = camera;
    camera.getViewMatrix();
    return camera;
  };

  it('hard-vanishes name plates past the 40ft bound and restores them inside it', () => {
    placeCamera();
    const rigs = createRemotePlayerRigs(scene);
    const far = Math.ceil(LABEL_MAX_DISTANCE_METERS) + 10;

    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: far, z: 0 }]));
    // Snap the ghost onto its far target, then evaluate the distance rules.
    rigs.update(0.016);
    rigs.update(0.016);
    expect(scene.getMeshByName('nameplate-p')?.isEnabled()).toBe(false);

    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 3, z: 0 }]));
    rigs.update(0.016);
    rigs.update(0.016);
    expect(scene.getMeshByName('nameplate-p')?.isEnabled()).toBe(true);

    rigs.dispose();
  });

  it('holds a readable plate size close up and stops compensating past 15ft', () => {
    placeCamera();
    const rigs = createRemotePlayerRigs(scene);

    // Two ghosts spawned at their exact positions, so no lerp is in flight.
    rigs.applySnapshot(snapshot('me', [
      { id: 'far', x: 10, z: 0 },
      { id: 'near', x: 2.5, z: 0 },
    ]));
    rigs.update(0.016);
    const farScale = scene.getMeshByName('nameplate-far')!.scaling.x;
    const nearScale = scene.getMeshByName('nameplate-near')!.scaling.x;

    expect(farScale).toBeCloseTo(1, 6);
    expect(nearScale).toBeLessThan(farScale);

    rigs.dispose();
  });

  it('keeps distance culling from overriding a Display Names opt-out', () => {
    placeCamera();
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'p', x: 1, z: 0 }]));
    rigs.setNameplatesVisible(false);

    rigs.update(0.016);
    rigs.update(0.016);
    expect(scene.getMeshByName('nameplate-p')?.isEnabled()).toBe(false);

    rigs.dispose();
  });

  // ---- Sec 10.5 above-head chat bubbles ---------------------------------

  const bubbleMeshCount = (id: string) =>
    scene.meshes.filter((mesh) => mesh.name.startsWith(`chat-bubble-${id}-`)).length;

  it('raises a bubble above the sender, and only the sender', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [
      { id: 'a', x: 1, z: 1 },
      { id: 'b', x: 2, z: 2 },
    ]));

    rigs.showChatBubble('a', 'hello venue');

    expect(bubbleMeshCount('a')).toBe(1);
    expect(bubbleMeshCount('b')).toBe(0);
    // Bubbles hang off the sender's root, so they follow the ghost.
    expect(scene.getTransformNodeByName('chat-bubbles-a')?.parent?.name).toBe('remote-player-a');

    rigs.dispose();
  });

  it('ignores a bubble for an unknown player (the local player, or one who left)', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));

    expect(() => rigs.showChatBubble('me', 'my own message')).not.toThrow();
    expect(() => rigs.showChatBubble('ghost-who-left', 'hi')).not.toThrow();
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('chat-bubble-')).length).toBe(0);

    rigs.dispose();
  });

  it('shows bubbles even when Display Names is off - a bubble carries no username', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));
    rigs.setNameplatesVisible(false);

    rigs.showChatBubble('a', 'still audible');
    rigs.update(0.016);

    expect(bubbleMeshCount('a')).toBe(1);
    expect(scene.getTransformNodeByName('chat-bubbles-a')?.isEnabled()).toBe(true);
    expect(scene.getMeshByName('nameplate-a')?.isEnabled()).toBe(false);

    rigs.dispose();
  });

  it('expires a bubble through the render-loop update after the spec 5 seconds', () => {
    const rigs = createRemotePlayerRigs(scene);
    const baselineMaterialCount = scene.materials.length;
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));

    rigs.showChatBubble('a', 'fleeting');
    expect(bubbleMeshCount('a')).toBe(1);
    const withBubbleMaterialCount = scene.materials.length;
    expect(withBubbleMaterialCount).toBeGreaterThan(baselineMaterialCount);

    // Simulated time via the same update(dt) the render loop calls.
    for (let step = 0; step < 60; step += 1) {
      rigs.update(0.1);
    }

    expect(bubbleMeshCount('a')).toBe(0);
    expect(scene.materials.length).toBe(withBubbleMaterialCount - 1);

    rigs.dispose();
  });

  it('caps a rapid burst at 3 bubbles per player', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));

    for (const body of ['one', 'two', 'three', 'four', 'five']) {
      rigs.showChatBubble('a', body);
    }

    expect(bubbleMeshCount('a')).toBe(3);

    rigs.dispose();
  });

  it('leaves no bubble meshes or materials behind on despawn or dispose', async () => {
    const rigs = createRemotePlayerRigs(scene);
    const baselineMeshCount = scene.meshes.length;
    const baselineMaterialCount = scene.materials.length;
    const baselineNodeCount = scene.transformNodes.length;

    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));
    await settle();
    rigs.showChatBubble('a', 'one');
    rigs.showChatBubble('a', 'two');
    expect(scene.materials.length).toBeGreaterThan(baselineMaterialCount);

    // Player leaves mid-bubble.
    rigs.applySnapshot(snapshot('me', []));

    expect(scene.materials.length).toBe(baselineMaterialCount);
    expect(scene.meshes.length).toBe(baselineMeshCount);
    expect(scene.transformNodes.length).toBe(baselineNodeCount);
    expect(scene.getTransformNodeByName('chat-bubbles-a') === null).toBe(true);

    // And again through dispose rather than despawn.
    rigs.applySnapshot(snapshot('me', [{ id: 'b', x: 1, z: 1 }]));
    await settle();
    rigs.showChatBubble('b', 'three');
    rigs.dispose();

    expect(scene.materials.length).toBe(baselineMaterialCount);
    expect(scene.meshes.length).toBe(baselineMeshCount);
    // dispose() also tears down the rigs' own shared parent node.
    expect(scene.transformNodes.length).toBe(baselineNodeCount - 1);
  });

  it('bubble texture creation degrades gracefully with no 2D context (NullEngine)', () => {
    const rigs = createRemotePlayerRigs(scene);
    rigs.applySnapshot(snapshot('me', [{ id: 'a', x: 1, z: 1 }]));

    expect(() => rigs.showChatBubble('a', 'no canvas here')).not.toThrow();
    const bubble = scene.meshes.find((mesh) => mesh.name.startsWith('chat-bubble-a-'))!;
    expect(bubble.material?.getActiveTextures().length ?? 0).toBe(0);
    expect(() => rigs.dispose()).not.toThrow();
  });
});

describe('sanitizePlayerName', () => {
  it('strips control characters', () => {
    expect(sanitizePlayerName('abc def')).toBe('abcdef');
  });

  it('caps overlong names with an ellipsis', () => {
    const long = 'x'.repeat(40);
    const result = sanitizePlayerName(long);
    expect(result.length).toBe(24);
    expect(result.endsWith('…')).toBe(true);
  });

  it('trims surrounding whitespace and leaves ordinary names untouched', () => {
    expect(sanitizePlayerName('  Nick  ')).toBe('Nick');
  });
});
