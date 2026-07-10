import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';

export interface MergeStaticMeshGroupsOptions {
  /** Meshes that must never merge (player rig, avatar, animated props). */
  dynamicMeshes: AbstractMesh[];
  /** Names to keep as individual meshes (rig code locates them by name). */
  preserveNamePatterns?: RegExp[];
}

export interface MergeStaticMeshGroupsSummary {
  groupsMerged: number;
  meshesRemoved: number;
}

// Draw submission is the venue's frame-time floor: ~850 individual draw
// calls cost ~30ms before any shading (measured: disabling 700 meshes took
// the same frame from 28 to 61 fps at identical resolution). The venue is
// static, so same-material groups can render as single draws.
export function mergeStaticMeshGroups(
  scene: Scene,
  options: MergeStaticMeshGroupsOptions,
): MergeStaticMeshGroupsSummary {
  const dynamic = new Set(options.dynamicMeshes);
  const groups = new Map<string, Mesh[]>();

  for (const mesh of scene.meshes) {
    if (!(mesh instanceof Mesh)) continue;
    if (dynamic.has(mesh)) continue;
    if (options.preserveNamePatterns?.some((pattern) => pattern.test(mesh.name))) continue;
    if (!mesh.isVisible || !mesh.isEnabled()) continue;
    if (!mesh.material) continue;
    if (mesh.getTotalVertices() === 0) continue;
    if (mesh.skeleton || mesh.morphTargetManager) continue;
    const material = mesh.material;
    // Alpha-blended meshes need per-mesh depth sorting: never merge them.
    const blended =
      material.alpha < 1 || (material.transparencyMode !== null && material.transparencyMode !== 0);
    if (blended) continue;

    // MergeMeshes throws if members carry different vertex attribute sets
    // (e.g. one authored with UVs+tangents, another position/normal only),
    // which black-screens the whole venue. Subgroup by attribute kinds so
    // mismatched meshes merge among themselves instead of crashing.
    const attributeKinds = mesh.getVerticesDataKinds().slice().sort().join(',');
    const key = `${material.uniqueId}|${mesh.renderingGroupId}|${mesh.receiveShadows ? 1 : 0}|${attributeKinds}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(mesh);
  }

  let groupsMerged = 0;
  let meshesRemoved = 0;

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const material = members[0].material;
    const renderingGroupId = members[0].renderingGroupId;
    const receiveShadows = members[0].receiveShadows;
    const stem = members[0].name.replace(/_[LR]$|_\d+$/, '');

    const merged = Mesh.MergeMeshes(members, true, true, undefined, false, false);
    if (!merged) continue;

    merged.name = `merged:${stem}+${members.length - 1}`;
    merged.material = material;
    merged.renderingGroupId = renderingGroupId;
    merged.receiveShadows = receiveShadows;
    merged.isPickable = true;

    groupsMerged += 1;
    meshesRemoved += members.length - 1;
  }

  return { groupsMerged, meshesRemoved };
}
