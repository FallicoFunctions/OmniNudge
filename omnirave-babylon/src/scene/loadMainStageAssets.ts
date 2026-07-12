// Register only the loader and extensions used by this asset. Importing the
// glTF barrel pulls every optional extension (FlowGraph, OpenPBR, audio, ...)
// into the initial game chunk.
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_draco_mesh_compression.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_emissive_strength.js';

import { DracoCompression } from '@babylonjs/core/Meshes/Compression/dracoCompression.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';

// Decode Draco-compressed venue geometry with the locally vendored decoder;
// the default configuration fetches from the Babylon CDN at runtime, which
// must never be a production dependency.
DracoCompression.Configuration = {
  decoder: {
    wasmUrl: '/libs/draco/draco_wasm_wrapper_gltf.js',
    wasmBinaryUrl: '/libs/draco/draco_decoder_gltf.wasm',
    fallbackUrl: '/libs/draco/draco_decoder_gltf.js',
  },
};
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAIN_STAGE_MANIFEST } from './mainStageManifest';
import { polishMainStageMaterials } from './mainStageMaterialPolish';

// Clearcoat adds a second specular lobe evaluated per fragment. The polish
// pass had it enabled on ~350 materials, which dominated the pixel-shader cost
// and roughly halved the frame rate. Keep it only where the gloss is visually
// strong (wet stone, glass lenses, water); the faint remainder costs the same
// per pixel while contributing almost nothing. This nearly doubles frame rate
// with no visible change.
const CLEARCOAT_KEEP_THRESHOLD = 0.25;

function trimSubtleClearcoat(scene: Scene) {
  for (const material of scene.materials) {
    if (
      material instanceof PBRMaterial &&
      material.clearCoat.isEnabled &&
      material.clearCoat.intensity < CLEARCOAT_KEEP_THRESHOLD
    ) {
      material.clearCoat.isEnabled = false;
    }
  }
}

export interface MainStageAssetLoadResult {
  collisionMeshes: AbstractMesh[];
  mainMeshes: AbstractMesh[];
}

export async function loadMainStageAssets(scene: Scene): Promise<MainStageAssetLoadResult> {
  const main = await SceneLoader.ImportMeshAsync('', '', MAIN_STAGE_MANIFEST.sceneGlb, scene);
  polishMainStageMaterials(main.meshes);
  trimSubtleClearcoat(scene);

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
