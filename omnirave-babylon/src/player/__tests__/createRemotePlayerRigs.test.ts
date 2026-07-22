import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRemotePlayerRigs } from '../createRemotePlayerRigs';
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
});
