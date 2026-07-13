import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';

import type { ReviewAvatar } from './createReviewAvatar';

export interface AvatarColorway {
  accentHex: string;
  emissiveHex: string;
  id: string;
  label: string;
  primaryHex: string;
}

interface AvatarMaterialMetadata {
  avatarBaseMaterial?: Material;
  avatarColorwayMaterials?: Record<string, Material>;
}

export const USER_AVATAR_COLORWAYS: readonly AvatarColorway[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    primaryHex: '#f4efe2',
    accentHex: '#68d8ff',
    emissiveHex: '#49b9ff',
  },
  {
    id: 'signal',
    label: 'Signal',
    primaryHex: '#1f2430',
    accentHex: '#f2c15b',
    emissiveHex: '#ffd36f',
  },
  {
    id: 'pulse',
    label: 'Pulse',
    primaryHex: '#352944',
    accentHex: '#67e2b0',
    emissiveHex: '#51ffc4',
  },
] as const;

export function applyAvatarColorway(avatar: ReviewAvatar, colorwayId: string) {
  const colorway = resolveAvatarColorway(colorwayId);

  for (const mesh of avatar.meshes) {
    if (!mesh.material) {
      continue;
    }

    const metadata = (mesh.metadata ?? {}) as AvatarMaterialMetadata;
    const baseMaterial = metadata.avatarBaseMaterial ?? mesh.material;
    const colorwayMaterials = metadata.avatarColorwayMaterials ?? {};
    let material = colorwayMaterials[colorway.id];

    if (!material) {
      material = createColorwayMaterial(baseMaterial, colorway);
      colorwayMaterials[colorway.id] = material;
    }

    mesh.material = material;
    mesh.metadata = {
      ...mesh.metadata,
      avatarBaseMaterial: baseMaterial,
      avatarColorway: colorway.id,
      avatarColorwayMaterials: colorwayMaterials,
    };
  }

  avatar.root.metadata = {
    ...avatar.root.metadata,
    avatarColorway: colorway.id,
  };

  return colorway;
}

export function resolveAvatarColorway(colorwayId: string) {
  return USER_AVATAR_COLORWAYS.find((colorway) => colorway.id === colorwayId) ?? USER_AVATAR_COLORWAYS[0];
}

function createColorwayMaterial(baseMaterial: Material, colorway: AvatarColorway) {
  const material = baseMaterial.clone(`${baseMaterial.name}__avatar_${colorway.id}`) ?? baseMaterial;
  const primary = Color3.FromHexString(colorway.primaryHex);
  const accent = Color3.FromHexString(colorway.accentHex);
  const emissive = Color3.FromHexString(colorway.emissiveHex);

  if (material instanceof PBRMaterial) {
    material.albedoColor = primary;
    material.reflectivityColor = accent.scale(0.26);
    material.emissiveColor = emissive.scale(0.18);
    material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.35);
  } else if (material instanceof StandardMaterial) {
    material.diffuseColor = primary;
    material.specularColor = accent.scale(0.38);
    material.emissiveColor = emissive.scale(0.16);
  }

  return material;
}
