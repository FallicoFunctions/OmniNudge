import { ArcRotateCamera, MeshBuilder, NullEngine, TransformNode } from '@babylonjs/core';
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

  vi.doMock('../../player/createReviewAvatar', async () => {
    const { MeshBuilder, TransformNode } = await import('@babylonjs/core');

    return {
      createReviewAvatar: vi.fn(async (scene) => {
        const root = new TransformNode('review-avatar-root', scene);
        const body = MeshBuilder.CreateBox('review-avatar-body', { size: 1 }, scene);
        body.parent = root;

        return {
          meshes: [body],
          root,
        };
      }),
    };
  });

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
    expect(scene.metadata?.reviewRuntime?.lightingRig).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.atmosphereRig).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.presentationRig).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.presentationRig.pipeline.name).toBe(
      'main-stage-presentation-pipeline',
    );
    expect(scene.metadata?.reviewRuntime?.productionSurfaces).toBeDefined();
    expect(scene.getMeshByName('main-stage-center-celestial-screen')).not.toBeNull();
    expect(scene.environmentTexture?.name).toBe('main-stage-night-reflection-env');
    expect(scene.metadata?.reviewRuntime?.reviewAvatar).toBeDefined();
    expect(scene.getTransformNodeByName('review-avatar-root')?.parent?.name).toBe('player-avatar-anchor');
    expect(scene.lights.map((light) => light.name)).toEqual(
      expect.arrayContaining(['main-stage-hemi-light', 'main-stage-key-light']),
    );
    expect(scene.effectLayers.map((layer) => layer.name)).toContain('main-stage-emissive-glow');
  });

  it('keeps zoom state synced even while the player is idle', async () => {
    engine = new NullEngine();
    const { createMainStageScene } = await loadCreateMainStageScene();

    const scene = await createMainStageScene(engine);
    const camera = scene.activeCamera as ArcRotateCamera | null;

    expect(camera).not.toBeNull();
    expect(camera!.radius).toBe(72);
    expect(camera!.alpha).toBeCloseTo(-Math.PI / 2);

    camera!.radius = 20;
    scene.render();

    expect(camera!.radius).toBe(20);
  });

  it('hides the embodied avatar when zoomed into first-person', async () => {
    engine = new NullEngine();
    const { createMainStageScene } = await loadCreateMainStageScene();

    const scene = await createMainStageScene(engine);
    const camera = scene.activeCamera as ArcRotateCamera | null;
    const avatarBody = scene.getMeshByName('review-avatar-body');

    expect(camera).not.toBeNull();
    expect(avatarBody).not.toBeNull();

    camera!.radius = 0.1;
    scene.render();

    expect(avatarBody!.visibility).toBe(0);
  });
});
