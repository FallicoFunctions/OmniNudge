import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadModuleWithMockedSceneLoader() {
  vi.resetModules();

  const importMeshAsync = vi.fn(async (_meshNames, _rootUrl, sceneFilename: string, scene: Scene) => {
    const isCollision = sceneFilename.includes('collision');
    const mesh = MeshBuilder.CreateBox(isCollision ? 'collision-shell' : 'main-screen', { size: 1 }, scene);
    mesh.material = new PBRMaterial(
      isCollision ? 'CollisionOnlyMaterial' : 'V14_CosmicScreenEmission',
      scene,
    );

    return {
      animationGroups: [],
      geometries: [],
      lights: [],
      meshes: [mesh],
      particleSystems: [],
      skeletons: [],
      transformNodes: [],
    };
  });

  vi.doMock('@babylonjs/core/Loading/sceneLoader.js', () => ({
    SceneLoader: {
      ImportMeshAsync: importMeshAsync,
    },
  }));

  const module = await import('../loadMainStageAssets');

  return {
    importMeshAsync,
    loadMainStageAssets: module.loadMainStageAssets,
  };
}

describe('loadMainStageAssets', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
    scene = undefined;
    engine = undefined;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('applies Main Stage runtime material polish to imported visible meshes only', async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const { importMeshAsync, loadMainStageAssets } = await loadModuleWithMockedSceneLoader();

    const result = await loadMainStageAssets(scene);
    const mainMaterial = result.mainMeshes[0].material as PBRMaterial;
    const collisionMaterial = result.collisionMeshes[0].material as PBRMaterial;

    expect(importMeshAsync).toHaveBeenCalledTimes(2);
    expect(mainMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(mainMaterial.emissiveIntensity).toBeGreaterThan(1.5);
    expect(collisionMaterial.metadata?.mainStageMaterialPolish).toBeUndefined();
    expect(result.collisionMeshes[0].isVisible).toBe(false);
    expect(result.collisionMeshes[0].checkCollisions).toBe(true);
  });
});
