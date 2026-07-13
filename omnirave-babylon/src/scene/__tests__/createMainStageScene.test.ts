import {
  ArcRotateCamera,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  Ray,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface StageAssets {
  collisionMeshes: AbstractMesh[];
  mainMeshes: AbstractMesh[];
}

async function loadCreateMainStageScene(
  populateStageAssets?: (scene: Scene, stageAssets: StageAssets) => void,
) {
  vi.resetModules();
  const stageAssets: StageAssets = {
    collisionMeshes: [],
    mainMeshes: [],
  };

  vi.doMock('../loadMainStageAssets', () => ({
    loadMainStageAssets: vi.fn(async (scene: Scene) => {
      populateStageAssets?.(scene, stageAssets);
      return stageAssets;
    }),
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
    expect(scene.fogDensity).toBeGreaterThanOrEqual(0.007);
    expect(scene.fogDensity).toBeLessThanOrEqual(0.0105);
    expect(scene.fogColor.b).toBeGreaterThan(scene.fogColor.r);
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
    expect(scene.getTransformNodeByName('main-stage-presentation-backdrop')).not.toBeNull();
    expect(scene.getMeshByName('main-stage-celestial-vault')).not.toBeNull();
    expect(scene.getMeshByName('main-stage-arrival-void-veil')).not.toBeNull();
    expect(scene.environmentTexture?.name).toBe('main-stage-night-reflection-env');
    expect(scene.metadata?.reviewRuntime?.reviewAvatar).toBeDefined();
    expect(scene.getTransformNodeByName('review-avatar-root')?.parent?.name).toBe('player-avatar-anchor');
    expect(scene.getTransformNodeByName('review-camera-target')).not.toBeNull();
    expect(scene.lights.map((light) => light.name)).toEqual(
      expect.arrayContaining(['main-stage-hemi-light', 'main-stage-key-light']),
    );
    expect(scene.effectLayers).toHaveLength(0);
  });

  it('keeps zoom state synced even while the player is idle', async () => {
    engine = new NullEngine();
    const { createMainStageScene } = await loadCreateMainStageScene();

    const scene = await createMainStageScene(engine);
    const camera = scene.activeCamera as ArcRotateCamera | null;

    expect(camera).not.toBeNull();
    expect(camera!.position.y).toBeGreaterThan(20);
    expect(camera!.position.z).toBeLessThan(-90);
    expect(camera!.lockedTarget?.name).toBe('review-camera-target');
    expect((camera!.lockedTarget as TransformNode).position.y).toBeCloseTo(14);
    expect((camera!.lockedTarget as TransformNode).position.z).toBeCloseTo(12);

    camera!.radius = 20;
    scene.render();

    expect(camera!.radius).toBeCloseTo(20);
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

  it('preserves side LED fields through merging and refreshes the live stage mesh list', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        const ledMaterial = new PBRMaterial('side-led-material', scene);
        for (const [side, x] of [
          ['L', -20],
          ['R', 20],
        ] as const) {
          const field = MeshBuilder.CreateBox(
            `V31_SideLedTileField_${side}`,
            { width: 8, height: 1, depth: 6 },
            scene,
          );
          field.position.set(x, 5, 0);
          field.material = ledMaterial;
          assets.mainMeshes.push(field);
        }

        const mergeMaterial = new PBRMaterial('merge-material', scene);
        for (let i = 0; i < 2; i++) {
          const member = MeshBuilder.CreateBox(`V200_MergeMember_${i}`, { size: 1 }, scene);
          member.position.x = i * 3;
          member.material = mergeMaterial;
          assets.mainMeshes.push(member);
        }
      },
    );

    const scene = await createMainStageScene(engine);
    const runtime = scene.metadata?.reviewRuntime;

    expect(scene.getMeshByName('V31_SideLedTileField_L')).not.toBeNull();
    expect(scene.getMeshByName('V31_SideLedTileField_R')).not.toBeNull();
    expect(runtime.presentationRig.emissiveSpillLights).toHaveLength(4);
    expect(stageAssets.mainMeshes).toEqual(
      expect.arrayContaining([
        scene.getMeshByName('V31_SideLedTileField_L'),
        scene.getMeshByName('V31_SideLedTileField_R'),
      ]),
    );
    expect(stageAssets.mainMeshes.some((mesh) => mesh.name.startsWith('merged:'))).toBe(true);
    expect(stageAssets.mainMeshes.every((mesh) => scene.meshes.includes(mesh))).toBe(true);
    expect(stageAssets.mainMeshes.every((mesh) => !mesh.isDisposed())).toBe(true);
  });

  it('reuses one ground ray across render frames', async () => {
    engine = new NullEngine();
    const rayInstances = new Set<Ray>();
    const intersectsMesh = vi
      .spyOn(Ray.prototype, 'intersectsMesh')
      .mockImplementation(function (this: Ray) {
        rayInstances.add(this);
        return {
          distance: 128,
          hit: true,
          pickedPoint: Vector3.Zero(),
        } as ReturnType<Ray['intersectsMesh']>;
      });
    const { createMainStageScene } = await loadCreateMainStageScene((scene, assets) => {
      const collision = MeshBuilder.CreateGround('collision-ground', { width: 500, height: 500 }, scene);
      assets.collisionMeshes.push(collision);
    });

    const scene = await createMainStageScene(engine);
    scene.render();
    scene.render();

    expect(intersectsMesh).toHaveBeenCalledTimes(2);
    expect(rayInstances.size).toBe(1);
  });
});
