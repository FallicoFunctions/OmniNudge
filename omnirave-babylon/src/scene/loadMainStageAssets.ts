import '@babylonjs/loaders/glTF';

import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAIN_STAGE_MANIFEST } from './mainStageManifest';

export interface MainStageAssetLoadResult {
  collisionMeshes: AbstractMesh[];
  mainMeshes: AbstractMesh[];
}

export async function loadMainStageAssets(scene: Scene): Promise<MainStageAssetLoadResult> {
  const main = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.sceneGlb, scene);
  const collision = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.collisionGlb, scene);

  collision.meshes.forEach((mesh) => {
    mesh.isVisible = false;
    mesh.checkCollisions = true;
  });

  return {
    mainMeshes: main.meshes,
    collisionMeshes: collision.meshes,
  };
}
