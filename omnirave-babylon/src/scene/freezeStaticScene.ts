import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';

export interface FreezeStaticSceneOptions {
  /** Meshes whose names match any pattern stay dynamic (player, avatar, ...). */
  dynamicNamePatterns: RegExp[];
  /** Explicit dynamic meshes (e.g. avatar meshes with arbitrary GLB names). */
  dynamicMeshes?: AbstractMesh[];
}

export interface FreezeStaticSceneSummary {
  frozenMeshes: number;
  frozenMaterials: number;
}

// The venue never moves: meshes keep recomputing world matrices and materials
// keep re-evaluating dirty state every frame for geometry that is fully
// static. Freeze both for everything except the dynamic rig allowlist.
export function freezeStaticScene(
  scene: Scene,
  options: FreezeStaticSceneOptions,
): FreezeStaticSceneSummary {
  const explicitDynamic = new Set(options.dynamicMeshes ?? []);
  const isDynamic = (mesh: AbstractMesh) =>
    explicitDynamic.has(mesh) ||
    mesh.billboardMode !== 0 ||
    mesh.infiniteDistance ||
    options.dynamicNamePatterns.some((pattern) => pattern.test(mesh.name));

  const materialsOfDynamicMeshes = new Set(
    scene.meshes.filter(isDynamic).map((mesh) => mesh.material).filter(Boolean),
  );

  let frozenMeshes = 0;
  for (const mesh of scene.meshes) {
    if (isDynamic(mesh)) {
      continue;
    }
    mesh.freezeWorldMatrix();
    frozenMeshes += 1;
  }

  let frozenMaterials = 0;
  for (const material of scene.materials) {
    // A material shared with any dynamic mesh must stay unfrozen: dynamic
    // meshes change visibility, which switches blending defines at runtime.
    if (materialsOfDynamicMeshes.has(material)) {
      continue;
    }
    material.freeze();
    frozenMaterials += 1;
  }

  return { frozenMeshes, frozenMaterials };
}
