import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js';
import { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import type { Node } from '@babylonjs/core/node.js';
import { applyCompleteAvatarMetadata } from './completeAvatarMetadata';

const supportedAttributes = new Set(['position', 'normal', 'tangent', 'uv', 'uv2', 'uv3', 'uv4', 'uv5', 'uv6',
  'color', 'matricesIndices', 'matricesWeights', 'matricesIndicesExtra', 'matricesWeightsExtra']);

/**
 * Join compatible skinned panels once, before making avatar copies.
 * Vertex attributes stay in their original bind space. Morph targets and
 * independently animated nodes retain their original meshes and draw order.
 */
export function batchCompleteAvatarMeshes(container: AssetContainer, options: { combineMaterials?: boolean } = {}): number {
  const animated = new Set(container.animationGroups.flatMap(group => group.targetedAnimations.map(item => item.target)));
  const groups = new Map<string, Mesh[]>();
  for (const candidate of container.meshes) {
    applyCompleteAvatarMetadata(candidate);
    if (!(candidate instanceof Mesh) || !candidate.geometry || !candidate.skeleton
      || candidate.skeleton.needInitialSkinMatrix || candidate.morphTargetManager
      || candidate.getChildren().length || candidate.animations.length || candidate.hasThinInstances
      || !candidate.computeBonesUsingShaders || !candidate.getPivotMatrix().isIdentity()
      || candidate.billboardMode || candidate.infiniteDistance
      || !(candidate.material instanceof PBRMaterial) || candidate.material.needAlphaBlendingForMesh(candidate)
      || candidate.material.subSurface.isRefractionEnabled
      || candidate.subMeshes?.length !== 1 || candidate.isUnIndexed
      || typeof candidate.metadata.avatarSlot !== 'string'
      || candidate.getVerticesDataKinds().some(kind => !supportedAttributes.has(kind))
      || !candidate.isVerticesDataPresent('matricesIndices') || !candidate.isVerticesDataPresent('matricesWeights')) continue;
    let independentlyAnimated = false;
    for (let node: Node | null = candidate; node; node = node.parent) {
      if (animated.has(node) || node.animations.length) { independentlyAnimated = true; break; }
    }
    if (independentlyAnimated) continue;
    const metadata = candidate.metadata;
    const key = JSON.stringify([
      options.combineMaterials ? null : candidate.material.uniqueId, candidate.skeleton.uniqueId, metadata.avatarSlot,
      metadata.avatarAttachmentSlot, metadata.avatarOptionId,
      candidate.computeWorldMatrix(true).asArray(), candidate.getPoseMatrix().asArray(),
      candidate.getVerticesDataKinds().sort(), candidate.numBoneInfluencers,
      candidate.sideOrientation, candidate.renderingGroupId, candidate.visibility,
      candidate.isVisible, candidate.isEnabled(false), candidate.receiveShadows,
      candidate.useVertexColors, candidate.hasVertexAlpha,
    ]);
    const group = groups.get(key) ?? [];
    group.push(candidate); groups.set(key, group);
  }

  let removed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Keep every material's original geometry in a contiguous submesh. The
    // renderer still submits one draw per material, with its own bounds.
    if (options.combineMaterials) group.sort((a, b) => a.material!.uniqueId - b.material!.uniqueId);
    const first = group[0];
    let data: VertexData;
    try {
      // Babylon expands RGB colors to RGBA with opaque alpha while extracting.
      data = VertexData.ExtractFromMesh(first, true, true);
      data.merge(group.slice(1).map(mesh => VertexData.ExtractFromMesh(mesh, true, true)), true, true);
    } catch { continue; } // Unsupported attribute layouts retain their original panels.
    const merged = new Mesh(`avatar-batch:${first.name}`, container.scene);
    let multi: MultiMaterial | undefined;
    try {
      data.applyToMesh(merged);
      merged.parent = first.parent;
      merged.position.copyFrom(first.position);
      merged.rotation.copyFrom(first.rotation);
      merged.rotationQuaternion = first.rotationQuaternion?.clone() ?? null;
      merged.scaling.copyFrom(first.scaling);
      merged.material = first.material;
      const materials = [...new Set(group.map(mesh => mesh.material!))];
      if (materials.length > 1) {
        multi = new MultiMaterial(`avatar-batch:${first.name}`, container.scene);
        multi.subMaterials = materials;
        merged.material = multi;
        merged.releaseSubMeshes();
        let vertexStart = 0, indexStart = 0;
        for (let materialIndex = 0; materialIndex < materials.length; materialIndex++) {
          const members = group.filter(mesh => mesh.material === materials[materialIndex]);
          const vertices = members.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
          const indices = members.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0);
          new SubMesh(materialIndex, vertexStart, vertices, indexStart, indices, merged);
          vertexStart += vertices; indexStart += indices;
        }
        container.scene.removeMultiMaterial(multi);
        container.multiMaterials.push(multi);
      }
      merged.skeleton = first.skeleton;
      merged.numBoneInfluencers = first.numBoneInfluencers;
      merged.sideOrientation = first.sideOrientation;
      merged.renderingGroupId = first.renderingGroupId;
      merged.receiveShadows = first.receiveShadows;
      merged.useVertexColors = first.useVertexColors;
      merged.hasVertexAlpha = first.hasVertexAlpha;
      merged.visibility = first.visibility;
      merged.isVisible = first.isVisible;
      merged.setEnabled(first.isEnabled(false));
      merged.metadata = { ...first.metadata, gltf: { ...first.metadata.gltf, extras: {
        ...first.metadata.gltf?.extras, avatarSlot: first.metadata.avatarSlot,
        avatarOptionId: first.metadata.avatarOptionId, avatarAttachmentSlot: first.metadata.avatarAttachmentSlot,
      } }, avatarBatchedParts: group.map(mesh => mesh.name) };
      // The template stays outside the scene, just like its original panels.
      container.scene.removeMesh(merged, true);
      container.scene.removeGeometry(merged.geometry!);
      container.meshes.push(merged);
      container.geometries.push(merged.geometry!);
      for (const mesh of group) {
        const index = container.meshes.indexOf(mesh);
        if (index !== -1) container.meshes.splice(index, 1);
        mesh.dispose(false, false);
      }
      container.geometries = container.geometries.filter(geometry => !geometry.isDisposed());
      removed += group.length - 1;
    } catch (error) { merged.dispose(false, false); multi?.dispose(); throw error; }
  }
  return removed;
}
