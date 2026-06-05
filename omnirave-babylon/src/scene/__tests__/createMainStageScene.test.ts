import { ArcRotateCamera, NullEngine } from '@babylonjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadCreateMainStageScene() {
  vi.resetModules();
  const stageAssets = {
    collisionMeshes: [],
    mainMeshes: [],
  };

  vi.doMock('../loadMainStageAssets', () => ({
    loadMainStageAssets: vi.fn(async () => stageAssets),
  }));

  const module = await import('../createMainStageScene');
  return {
    createMainStageScene: module.createMainStageScene,
    stageAssets,
  };
}

describe('createMainStageScene', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('wires a player rig and follow camera foundation into the scene', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene();

    const scene = await createMainStageScene(engine);

    expect(scene.collisionsEnabled).toBe(true);
    expect(scene.activeCamera?.name).toBe('review-camera');
    expect(scene.getTransformNodeByName('player-root')).not.toBeNull();
    expect(scene.getMeshByName('player-capsule')).not.toBeNull();
    expect(scene.metadata?.reviewRuntime?.stageAssets).toBe(stageAssets);
  });

  it('keeps zoom state synced even while the player is idle', async () => {
    engine = new NullEngine();
    const { createMainStageScene } = await loadCreateMainStageScene();

    const scene = await createMainStageScene(engine);
    const camera = scene.activeCamera as ArcRotateCamera | null;

    expect(camera).not.toBeNull();

    camera!.radius = 20;
    scene.render();

    expect(camera!.radius).toBe(8);
  });
});
