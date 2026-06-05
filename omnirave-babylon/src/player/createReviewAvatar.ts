import '@babylonjs/loaders/glTF';

import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAIN_STAGE_MANIFEST } from '../scene/mainStageManifest';

export async function createReviewAvatar(scene: Scene): Promise<AbstractMesh> {
  const result = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.reviewAvatarGlb, scene);
  return result.meshes[0];
}
