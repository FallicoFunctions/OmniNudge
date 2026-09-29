import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

/** Batch one static prop's decorative parts while retaining its floor meshes. */
export function batchStaticPropMeshes(meshes: Mesh[], root: TransformNode): number {
  const scene = root.getScene();
  const groups = new Map<string, Mesh[]>();
  for (const mesh of meshes) {
    const material = mesh.material;
    if (!material || mesh.checkCollisions || !mesh.isVisible || !mesh.isEnabled()
      || mesh.skeleton || mesh.morphTargetManager || mesh.hasThinInstances || mesh.instances.length
      || mesh.billboardMode || mesh.infiniteDistance || mesh.visibility !== 1
      || material.getClassName() === 'MultiMaterial' || material.needAlphaBlendingForMesh(mesh) || !mesh.getTotalVertices()) continue;
    const lights = scene.lights.filter(light => light.canAffectMesh(mesh)).map(light => light.uniqueId).join(',');
    const key = [material.uniqueId, mesh.renderingGroupId, mesh.receiveShadows, mesh.isPickable,
      mesh.layerMask, mesh.getVerticesDataKinds().slice().sort().join(','), lights].join('|');
    const group = groups.get(key) ?? [];
    group.push(mesh); groups.set(key, group);
  }
  let removed = 0;
  const replacements: Mesh[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    const lights = new Set(scene.lights.filter(light => light.canAffectMesh(first)));
    const restrictedLights = new Set(scene.lights.filter(light => light.includedOnlyMeshes.length > 0));
    const merged = Mesh.MergeMeshes(group, true, true, undefined, false, false);
    if (!merged) continue;
    merged.name = `${root.name}-batch-${replacements.length}`;
    merged.setParent(root);
    merged.isPickable = first.isPickable;
    merged.receiveShadows = first.receiveShadows;
    merged.renderingGroupId = first.renderingGroupId;
    merged.layerMask = first.layerMask;
    for (const light of scene.lights) {
      if (lights.has(light) && restrictedLights.has(light)) light.includedOnlyMeshes.push(merged);
      else if (!lights.has(light) && !light.includedOnlyMeshes.length) light.excludedMeshes.push(merged);
    }
    replacements.push(merged);
    removed += group.length - 1;
  }
  // Keep ownership and teardown in the prop that created the geometry.
  const remaining = meshes.filter(mesh => !mesh.isDisposed());
  meshes.splice(0, meshes.length, ...remaining, ...replacements);
  for (const mesh of meshes) mesh.freezeWorldMatrix();
  return removed;
}
