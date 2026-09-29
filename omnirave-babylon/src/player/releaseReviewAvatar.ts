import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { ReviewAvatar } from './createReviewAvatar';

// applyAvatarDefinition / applyAvatarColorway clone a material the first time
// a look is applied and cache it in mesh.metadata so re-selecting is free; the
// original base material is swapped off the mesh and cached too.
// mesh.dispose(..., true) only reaches whichever material is CURRENTLY
// assigned, so every other cached clone would otherwise leak for the life of
// the process - fatal in a 24/7 churning presence system.
const disposeCachedAvatarMaterials = (mesh: AbstractMesh) => {
  const metadata = mesh.metadata as
    | { avatarBaseMaterial?: Material; avatarColorwayMaterials?: Record<string, Material> }
    | undefined;
  if (!metadata) return;
  const current = mesh.material;
  const cached = new Set<Material>();
  if (metadata.avatarBaseMaterial) cached.add(metadata.avatarBaseMaterial);
  if (metadata.avatarColorwayMaterials) {
    for (const material of Object.values(metadata.avatarColorwayMaterials)) cached.add(material);
  }
  for (const material of cached) {
    // The currently-assigned material is disposed by the mesh.dispose(false,
    // true) call that follows; disposing it here too would double-free.
    if (material !== current) material.dispose(false, true);
  }
};

const disposeAvatarMeshes = (meshes: readonly AbstractMesh[]) => {
  for (const mesh of meshes) {
    disposeCachedAvatarMaterials(mesh);
    // doNotRecurse: shoes hang off the leg meshes, and every mesh in the list
    // is disposed by this loop anyway. Recursing would double-dispose them.
    mesh.dispose(true, true);
  }
};

export const releaseReviewAvatar = (avatar: ReviewAvatar) => {
  if (avatar.release) { avatar.release(); return; }
  avatar.dispose?.();
  disposeAvatarMeshes(avatar.meshes);
  avatar.root.dispose();
};
