import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_draco_mesh_compression.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js';

import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAIN_STAGE_MANIFEST } from '../scene/mainStageManifest';

export interface ReviewAvatar {
  meshes: AbstractMesh[];
  root: TransformNode;
}

export async function createReviewAvatar(scene: Scene): Promise<ReviewAvatar> {
  const result = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.reviewAvatarGlb, scene);
  const rootMesh = result.meshes.find((mesh) => mesh.name === '__root__') ?? result.meshes.find((mesh) => !mesh.parent);
  const root = rootMesh ?? new TransformNode('review-avatar-root', scene);
  root.name = 'review-avatar-root';

  const renderMeshes = result.meshes.filter((mesh) => mesh !== root);
  if (!(root instanceof AbstractMesh)) {
    renderMeshes
      .filter((mesh) => !mesh.parent)
      .forEach((mesh) => {
        mesh.parent = root;
      });
  }

  for (const mesh of renderMeshes) {
    mesh.checkCollisions = false;
    mesh.isPickable = false;
  }

  return {
    meshes: renderMeshes,
    root,
  };
}
