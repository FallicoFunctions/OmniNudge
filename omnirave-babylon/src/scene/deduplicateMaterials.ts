import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene';

export interface DeduplicateMaterialsSummary {
  materialsDisposed: number;
  materialsRemapped: number;
}

// The polish pass clones one material per override row; many rows carry
// identical final values, so the scene ends up with hundreds of visually
// interchangeable materials. Rebinding meshes to one canonical material per
// distinct visual signature lets the static merge collapse across rows.
export function deduplicateMaterials(scene: Scene): DeduplicateMaterialsSummary {
  const canonical = new Map<string, PBRMaterial>();
  const signatures = new Map<PBRMaterial, string>();
  const getSignature = (material: PBRMaterial) => {
    let signature = signatures.get(material);
    if (signature === undefined) {
      signature = materialSignature(material);
      signatures.set(material, signature);
    }
    return signature;
  };
  let materialsRemapped = 0;

  for (const mesh of scene.meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial)) continue;

    const key = getSignature(material);
    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, material);
      continue;
    }
    if (existing !== material) {
      mesh.material = existing;
      materialsRemapped += 1;
    }
  }

  let materialsDisposed = 0;
  for (const material of [...scene.materials]) {
    if (!(material instanceof PBRMaterial) || isMaterialReferenced(scene, material)) {
      continue;
    }

    const key = getSignature(material);
    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, material);
      continue;
    }
    if (existing !== material) {
      // The canonical material owns the shared textures. Dispose only this
      // orphan's material/effect resources, never the textures themselves.
      material.dispose(false, false);
      materialsDisposed += 1;
    }
  }

  return { materialsDisposed, materialsRemapped };
}

function materialSignature(material: PBRMaterial) {
  // PBRMaterial.serialize covers the complete shader-visible state,
  // including BRDF, clearcoat, sheen, anisotropy, subsurface, stencil,
  // texture transforms, culling, and depth settings. Remove only instance
  // identity so visually identical clones can share one canonical material.
  // A signature compares texture settings and the shared image, not an
  // exported copy of its pixels. glTF textures otherwise re-encode their
  // buffers (or read back the GPU) for every cloned material.
  const serializeBuffers = Texture.SerializeBuffers;
  const forceSerializeBuffers = Texture.ForceSerializeBuffers;
  let serialized;
  try {
    Texture.SerializeBuffers = false;
    Texture.ForceSerializeBuffers = false;
    serialized = material.serialize();
  } finally {
    Texture.SerializeBuffers = serializeBuffers;
    Texture.ForceSerializeBuffers = forceSerializeBuffers;
  }
  delete serialized.id;
  delete serialized.name;
  delete serialized.uniqueId;
  // Distinct images with the same URL/name must not be coalesced. Cloned
  // Texture wrappers can still share the same underlying GPU image.
  return JSON.stringify([serialized, material.getActiveTextures().map(texture =>
    texture.getInternalTexture()?.uniqueId ?? `texture:${texture.uniqueId}`)]);
}

function isMaterialReferenced(scene: Scene, material: PBRMaterial) {
  return (
    scene.meshes.some((mesh) => mesh.material === material) ||
    scene.multiMaterials.some((multiMaterial) => multiMaterial.subMaterials.includes(material))
  );
}
