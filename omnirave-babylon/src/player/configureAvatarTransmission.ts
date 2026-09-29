import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { createTransmissionRegions } from './createTransmissionRegions';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { reuseAvatarTransmissionBackground } from './reuseAvatarTransmissionBackground';

/** The glTF jacket samples a camera-space background; unrelated pixels cannot contribute. */
export function configureAvatarTransmission(scene: Scene, avatarMeshes: readonly AbstractMesh[] = []): void {
  const target = scene.textures.find(texture => texture.name === 'opaqueSceneTexture');
  if (!(target instanceof RenderTargetTexture)) return;
  reuseAvatarTransmissionBackground(scene, target, avatarMeshes);
  // The glTF helper accepts only PBRMaterial, so it overlooks our opaque
  // MultiMaterial batches. Register them once in its existing array; its
  // mesh-removal observer retains responsibility for removing disposed copies.
  if (target.renderList) for (const mesh of avatarMeshes) {
    if (mesh.material instanceof MultiMaterial && mesh.metadata?.avatarBatchedParts
      && mesh.material.subMaterials.length && mesh.material.subMaterials.every(material =>
        material instanceof PBRMaterial && !material.subSurface.isRefractionEnabled)
      && !target.renderList.includes(mesh)) target.renderList.push(mesh);
  }
  if (scene.metadata?.venuePerformanceBaseline || target.getCustomRenderList) return;
  const visible: AbstractMesh[] = [];
  const regions = createTransmissionRegions(scene, target);
  target.getCustomRenderList = (_face, meshes, length) => {
    visible.length = 0;
    const camera = scene.activeCamera;
    if (!camera || !meshes) return null;
    const useRegions = !scene.metadata?.transmissionRegionBaseline;
    if (useRegions) regions.update();
    for (let i = 0; i < length; i++) {
      const mesh = meshes[i];
      if (!mesh || mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0
        || (mesh.layerMask & camera.layerMask) === 0) continue;
      mesh.computeWorldMatrix();
      if (useRegions && !regions.canContribute(mesh)) continue;
      if (mesh.alwaysSelectAsActiveMesh || mesh.infiniteDistance || camera.isInFrustum(mesh)) visible.push(mesh);
    }
    return visible;
  };
}
