import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Node } from '@babylonjs/core/node.js';

/** glTF primitive children inherit the authored clothing owner and its carrier. */
export function applyCompleteAvatarMetadata(mesh: AbstractMesh): void {
  let owner: Node | null = mesh;
  while (owner && !owner.metadata?.gltf?.extras?.avatarSlot) owner = owner.parent;
  const extras = owner?.metadata?.gltf?.extras ?? mesh.metadata?.gltf?.extras ?? {};
  mesh.metadata = { ...mesh.metadata, ...extras, avatarAssetKind: 'detail', avatarPreserveMaterial: true };
  const sourceName = owner?.name ?? mesh.name;
  if (extras.outfitDetailCarrier === 'AvatarBottoms_cargo-pants'
    || extras.avatarOptionId === 'plurr-belt' || sourceName.startsWith('Launch hanging strap ')) {
    mesh.metadata.avatarAttachmentSlot = 'bottoms';
  } else if (extras.avatarOptionId === 'plurr-pony-tie') {
    mesh.metadata.avatarAttachmentSlot = 'hair';
  }
}
