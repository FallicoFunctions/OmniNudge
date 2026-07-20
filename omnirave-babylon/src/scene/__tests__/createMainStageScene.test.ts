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
  solidCollisionMeshes: AbstractMesh[];
}

async function loadCreateMainStageScene(
  populateStageAssets?: (scene: Scene, stageAssets: StageAssets) => void,
) {
  vi.resetModules();
  const stageAssets: StageAssets = {
    collisionMeshes: [],
    mainMeshes: [],
    solidCollisionMeshes: [],
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
          animate: vi.fn(),
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
    expect(stageAssets.solidCollisionMeshes.map((mesh) => mesh.name)).toEqual(
      expect.arrayContaining([
        'main-stage-blocker-left-envelope',
        'main-stage-blocker-right-envelope',
        'main-stage-blocker-back-envelope',
        'main-stage-blocker-front-stage',
      ]),
    );
    expect(stageAssets.solidCollisionMeshes.every((mesh) => !mesh.isVisible)).toBe(true);
    expect(stageAssets.solidCollisionMeshes.every((mesh) => mesh.checkCollisions)).toBe(true);
    expect(scene.metadata?.reviewRuntime?.lightingRig).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.atmosphereRig).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.presentationRig).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.presentationRig.pipeline.name).toBe(
      'main-stage-presentation-pipeline',
    );
    expect(scene.metadata?.reviewRuntime?.productionSurfaces).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.playerController).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.routeProgress).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.avatarColorways.length).toBeGreaterThanOrEqual(3);
    expect(scene.metadata?.reviewRuntime?.selectedAvatarColorway.id).toBe('aurora');
    expect(scene.getMeshByName('main-stage-center-celestial-screen')).not.toBeNull();
    expect(scene.getTransformNodeByName('main-stage-presentation-backdrop')).not.toBeNull();
    expect(scene.getMeshByName('main-stage-celestial-vault')).not.toBeNull();
    expect(scene.getMeshByName('main-stage-arrival-void-veil')).not.toBeNull();
    expect(scene.environmentTexture?.name).toBe('main-stage-night-reflection-env');
    expect(scene.metadata?.reviewRuntime?.reviewAvatar).toBeDefined();
    expect(scene.metadata?.reviewRuntime?.reviewAvatar.root.metadata?.avatarColorway).toBe('aurora');
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
    expect(camera!.position.y).toBeCloseTo(3.95);
    expect(camera!.position.z).toBeCloseTo(-55);
    expect(camera!.lockedTarget?.name).toBe('review-camera-target');
    expect((camera!.lockedTarget as TransformNode).position.y).toBeCloseTo(1.35);
    expect((camera!.lockedTarget as TransformNode).position.z).toBeCloseTo(-48);

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

  it('creates solid blockers from merged architectural mesh bounds', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        const vipFascia = MeshBuilder.CreateBox(
          'merged:V30_VipShellFascia+1',
          { width: 10, height: 3, depth: 0.2 },
          scene,
        );
        vipFascia.position.set(18, 3, -8);
        assets.mainMeshes.push(vipFascia);
      },
    );

    const scene = await createMainStageScene(engine);
    const sourceBlocker = stageAssets.solidCollisionMeshes.find(
      (mesh) => mesh.metadata?.sourceMeshName === 'merged:V30_VipShellFascia+1',
    );

    expect(sourceBlocker).toBeDefined();
    expect(sourceBlocker!.name).toBe('main-stage-blocker-source-merged:V30_VipShellFascia+1');
    expect(sourceBlocker!.isVisible).toBe(false);
    expect(sourceBlocker!.checkCollisions).toBe(true);
    expect(sourceBlocker!.position.x).toBeCloseTo(18);
    // floor (y0) through the fascia's real top (y 4.5): center 2.25
    expect(sourceBlocker!.position.y).toBeCloseTo(2.25);
    expect(sourceBlocker!.position.z).toBeCloseTo(-8);
    expect(sourceBlocker!.getBoundingInfo().boundingBox.extendSizeWorld.y).toBeCloseTo(2.25);
    expect(sourceBlocker!.getBoundingInfo().boundingBox.extendSizeWorld.z).toBeCloseTo(0.6);
    expect(scene.getMeshByName(sourceBlocker!.name)).toBe(sourceBlocker);
  });

  it('splits merged basin wall blockers so side walls stay solid without closing the center walkway', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        const basinWall = MeshBuilder.CreateBox(
          'merged:V118_BasinWallRelief+1',
          { width: 16, height: 6, depth: 62 },
          scene,
        );
        basinWall.position.set(0, 3, -8);
        assets.mainMeshes.push(basinWall);
      },
    );

    await createMainStageScene(engine);
    const sourceBlockers = stageAssets.solidCollisionMeshes.filter(
      (mesh) => mesh.metadata?.sourceMeshName === 'merged:V118_BasinWallRelief+1',
    );

    expect(sourceBlockers).toHaveLength(2);
    expect(sourceBlockers.map((mesh) => mesh.metadata?.blockerSide)).toEqual(
      expect.arrayContaining(['left', 'right']),
    );
    expect(
      sourceBlockers.some((mesh) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        return bounds.minimumWorld.x <= 0 && bounds.maximumWorld.x >= 0;
      }),
    ).toBe(false);
    expect(sourceBlockers.every((mesh) => mesh.getBoundingInfo().boundingBox.minimumWorld.z < -38)).toBe(true);
  });

  it('splits the merged basin retaining walls so the center promenade stays open', async () => {
    // Regression: the retaining walls hug the walkway closer (x +/-5.7..7.1)
    // than the parapets, so the parapet clearance never split them and the
    // merged-bounds blocker froze the avatar at z -37.9 on the way to the
    // first route objective.
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        const retainingWalls = MeshBuilder.CreateBox(
          'merged:V99_BasinRetainingWall+1',
          { width: 14.2, height: 2.3, depth: 57.3 },
          scene,
        );
        retainingWalls.position.set(0, 1.1, -9.25);
        assets.mainMeshes.push(retainingWalls);
      },
    );

    await createMainStageScene(engine);
    const sourceBlockers = stageAssets.solidCollisionMeshes.filter(
      (mesh) => mesh.metadata?.sourceMeshName === 'merged:V99_BasinRetainingWall+1',
    );

    expect(sourceBlockers).toHaveLength(2);
    expect(sourceBlockers.map((mesh) => mesh.metadata?.blockerSide)).toEqual(
      expect.arrayContaining(['left', 'right']),
    );
    expect(
      sourceBlockers.some((mesh) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        return bounds.minimumWorld.x <= 0 && bounds.maximumWorld.x >= 0;
      }),
    ).toBe(false);
  });

  it('leaves the foreground approach deck open between merged side-pair blockers', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        const vipFascia = MeshBuilder.CreateBox(
          'merged:V30_VipShellFascia+1',
          { width: 60, height: 4, depth: 44 },
          scene,
        );
        vipFascia.position.set(0, 3, 2);
        assets.mainMeshes.push(vipFascia);
      },
    );

    await createMainStageScene(engine);
    const sourceBlockers = stageAssets.solidCollisionMeshes.filter(
      (mesh) => mesh.metadata?.sourceMeshName === 'merged:V30_VipShellFascia+1',
    );
    const reportedPlayerPoint = { x: -0.6, z: -20.1 };

    expect(sourceBlockers).toHaveLength(2);
    expect(
      sourceBlockers.some((mesh) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        return (
          bounds.minimumWorld.x <= reportedPlayerPoint.x &&
          bounds.maximumWorld.x >= reportedPlayerPoint.x &&
          bounds.minimumWorld.z <= reportedPlayerPoint.z &&
          bounds.maximumWorld.z >= reportedPlayerPoint.z
        );
      }),
    ).toBe(false);
  });

  it('creates solid blockers for approach light cores', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        const lightCore = MeshBuilder.CreateBox(
          'V40_ApproachLightCore_L',
          { width: 0.5, height: 1.8, depth: 0.5 },
          scene,
        );
        lightCore.position.set(-12.2, 1.2, -26);
        assets.mainMeshes.push(lightCore);
      },
    );

    await createMainStageScene(engine);
    const sourceBlocker = stageAssets.solidCollisionMeshes.find(
      (mesh) => mesh.metadata?.sourceMeshName === 'V40_ApproachLightCore_L',
    );

    expect(sourceBlocker).toBeDefined();
    expect(sourceBlocker!.isVisible).toBe(false);
    expect(sourceBlocker!.checkCollisions).toBe(true);
    expect(sourceBlocker!.position.x).toBeCloseTo(-12.2);
    // floor (y0) through the core's real top (y 2.1): center 1.05
    expect(sourceBlocker!.position.y).toBeCloseTo(1.05);
    expect(sourceBlocker!.position.z).toBeCloseTo(-26);
    expect(sourceBlocker!.getBoundingInfo().boundingBox.extendSizeWorld.y).toBeCloseTo(1.05);
  });

  it('adds blockers for basin and crowd-control physical features without walling low surface or trim inlays', async () => {
    engine = new NullEngine();
    const { createMainStageScene, stageAssets } = await loadCreateMainStageScene(
      (scene, assets) => {
        for (const [name, width, height, depth, x, y, z] of [
          ['merged:V99_BasinParapetRelief+1', 20, 0.6, 58, 0, 2, -9],
          ['merged:V90_BasinStoneCopingArray+1', 50, 0.4, 62, 0, 0.8, -16],
          ['V123_CentralStairGoldNosingArray', 10, 1.2, 19, 0, 1.2, -3],
          ['merged:V121_BasinBridgeRelief_North+2', 9, 2.5, 38, 0, 1.6, -6],
          ['merged:V33_BasinFoliageUnderstory+1', 9, 0.8, 48, 13.6, 1.2, -15],
          ['V63_BasinWaterParterre', 12, 0.4, 8, 0, 0.2, -2],
          ['V64_PromenadeCyanThread', 7, 0.2, 6, 0, 0.2, -2],
          ['V124_CrowdControlRailArray_L', 0.2, 1.1, 40, -18, 1, 40],
          ['V125_CrowdBarrierRailArray_R', 0.4, 1.1, 66, 13.2, 1, 4],
        ] as const) {
          const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
          mesh.position.set(x, y, z);
          assets.mainMeshes.push(mesh);
        }
      },
    );

    await createMainStageScene(engine);
    const blockerSourceNames = stageAssets.solidCollisionMeshes.map((mesh) => mesh.metadata?.sourceMeshName);

    expect(blockerSourceNames).toEqual(
      expect.arrayContaining([
        'merged:V99_BasinParapetRelief+1',
        'merged:V33_BasinFoliageUnderstory+1',
        'V124_CrowdControlRailArray_L',
        'V125_CrowdBarrierRailArray_R',
      ]),
    );
    expect(blockerSourceNames).not.toContain('V63_BasinWaterParterre');
    expect(blockerSourceNames).not.toContain('V64_PromenadeCyanThread');
    expect(blockerSourceNames).not.toContain('V123_CentralStairGoldNosingArray');
    // bridge reliefs are knee-high causeway trim the avatar steps over; a
    // merged-bounds blocker here walled off the center promenade
    expect(blockerSourceNames).not.toContain('merged:V121_BasinBridgeRelief_North+2');
    // the coping is a walkable floor (COL_BasinCoping* collision slabs), not
    // a wall - its blocker sealed the flank and the cascade-court objective;
    // the foliage banks above hedge the sunken water strip instead
    expect(blockerSourceNames).not.toContain('merged:V90_BasinStoneCopingArray+1');
    expect(
      stageAssets.solidCollisionMeshes.filter(
        (mesh) => mesh.metadata?.sourceMeshName === 'merged:V99_BasinParapetRelief+1',
      ),
    ).toHaveLength(2);
    expect(
      stageAssets.solidCollisionMeshes.filter(
        (mesh) => mesh.metadata?.sourceMeshName === 'merged:V33_BasinFoliageUnderstory+1',
      ),
    ).toHaveLength(1);
    expect(
      stageAssets.solidCollisionMeshes.some((mesh) => {
        const bounds = mesh.getBoundingInfo().boundingBox;
        return (
          bounds.minimumWorld.x <= -0.5 &&
          bounds.maximumWorld.x >= -0.5 &&
          bounds.minimumWorld.z <= -38.3 &&
          bounds.maximumWorld.z >= -38.3
        );
      }),
    ).toBe(false);
  });

  it('moves the playable avatar through the controller and reuses one ground ray across render frames', async () => {
    engine = new NullEngine();
    vi.spyOn(engine, 'getDeltaTime').mockReturnValue(16.667);
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
    const runtime = scene.metadata?.reviewRuntime;
    expect(runtime).toBeDefined();
    runtime!.input.state.forward = true;
    scene.render();
    scene.render();

    expect(runtime!.playerRig.root.position.z).toBeGreaterThan(-48);
    expect(runtime!.playerController.currentSpeedMetersPerSecond).toBeGreaterThan(0);
    expect(runtime!.routeProgress.completedCount).toBeGreaterThanOrEqual(1);
    expect(runtime!.routeProgress.activeCheckpoint?.id).toBe('promenade_mid');
    expect(runtime!.reviewAvatar.root.metadata?.animationState).toBe('run');
    expect(intersectsMesh).toHaveBeenCalledTimes(4);
    expect(rayInstances.size).toBe(1);
  });
});
