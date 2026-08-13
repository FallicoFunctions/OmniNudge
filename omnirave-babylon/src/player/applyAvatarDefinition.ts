import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial.js';

import {
  normalizeAvatarDefinition,
  resolveAvatarHeightScale,
  resolveAvatarOption,
  type AvatarBottomsSilhouette,
  type AvatarDefinition,
  type AvatarHairSilhouette,
  type AvatarJacketSilhouette,
  type AvatarShoesSilhouette,
  type AvatarTopSilhouette,
} from './avatarDefinition';
import type { AvatarMeshMetadata, AvatarPartRole, ReviewAvatar } from './createReviewAvatar';

// Applies an AvatarDefinition (sec 6.4) to the procedural avatar, and the
// height effects of sec 6.5 that live on the body (scale). The capsule/eye
// half of sec 6.5 belongs to createPlayerRig.setHeightInches.
//
// MATERIAL DISCIPLINE: this reuses the exact metadata contract established by
// avatarColorways.ts - `avatarBaseMaterial` plus a keyed `avatarColorwayMaterials`
// cache - so createRemotePlayerRigs' disposeCachedAvatarMaterials already
// reaches every clone made here. Do not introduce a second cache: the strict
// leak tests in createRemotePlayerRigs.test.ts only know about this one.
// Cache keys are prefixed `def_` so definition clones cannot collide with a
// colorway id. The key space is bounded by the option pools (<=10 colours per
// part role), so the cache cannot grow without limit.

interface AvatarMaterialMetadata {
  avatarBaseMaterial?: Material;
  avatarColorwayMaterials?: Record<string, Material>;
  avatarPartRole?: AvatarPartRole;
  avatarBodyBase?: 'female' | 'male';
  avatarBodySurface?: 'skin' | 'undergarment';
  avatarFallbackAnatomy?: boolean;
  avatarPreserveMaterial?: boolean;
}

/** Roles rendered as glowing rave-tech dressing rather than cloth or skin. */
const EMISSIVE_ROLES: ReadonlySet<AvatarPartRole> = new Set<AvatarPartRole>(['emissive']);

export interface AppliedAvatarPalette {
  armHex: string;
  bottomsHex: string;
  hairHex: string;
  jacketHex: string;
  legHex: string;
  shoesHex: string;
  skinHex: string;
  topHex: string;
}

export function resolveAvatarPalette(definition: AvatarDefinition): AppliedAvatarPalette {
  const skin = resolveAvatarOption('skinTone', definition.skinTone);
  const hair = resolveAvatarOption('hairColor', definition.hairColor);
  const top = resolveAvatarOption('top', definition.top);
  const jacket = resolveAvatarOption('jacket', definition.jacket);
  const bottoms = resolveAvatarOption('bottoms', definition.bottoms);
  const shoes = resolveAvatarOption('shoes', definition.shoes);

  const topSilhouette = top.silhouette as AvatarTopSilhouette | undefined;
  const bottomsSilhouette = bottoms.silhouette as AvatarBottomsSilhouette | undefined;

  return {
    skinHex: skin.colorHex,
    hairHex: hair.colorHex,
    topHex: top.colorHex,
    jacketHex: jacket.colorHex,
    bottomsHex: bottoms.colorHex,
    shoesHex: shoes.colorHex,
    // Sleeves are a colour decision, not a mesh: a long-sleeve top paints the
    // arm capsules, anything else leaves them skin.
    armHex: topSilhouette === 'longsleeve' ? top.colorHex : skin.colorHex,
    // Only full-length bottoms reach the leg capsules. Shorts and skirts leave
    // the legs bare and live entirely on the (widened) hips mesh.
    legHex: bottomsSilhouette === 'pants' ? bottoms.colorHex : skin.colorHex,
  };
}

function hexForRole(role: AvatarPartRole | undefined, palette: AppliedAvatarPalette): string | null {
  switch (role) {
    case 'skin':
      return palette.skinHex;
    case 'arm':
      return palette.armHex;
    case 'leg':
      return palette.legHex;
    case 'top':
      return palette.topHex;
    case 'jacket':
      return palette.jacketHex;
    case 'bottoms':
      return palette.bottomsHex;
    case 'shoes':
      return palette.shoesHex;
    case 'hair':
      return palette.hairHex;
    // The visor / chest strip / back halo are festival-runner tech dressing
    // with no category of their own; they take their colour from the outfit so
    // the whole avatar reads as one look.
    case 'emissive':
      return palette.topHex;
    case 'accent':
      return palette.jacketHex;
    default:
      return null;
  }
}

/**
 * Applies a definition to the procedural avatar. Total: an invalid definition
 * is normalized first, so this never throws on data from another client.
 */
export function applyAvatarDefinition(
  avatar: ReviewAvatar,
  definition: AvatarDefinition,
): AvatarDefinition {
  const safe = normalizeAvatarDefinition(definition);
  const palette = resolveAvatarPalette(safe);

  for (const mesh of avatar.meshes) {
    const metadata = (mesh.metadata ?? {}) as AvatarMaterialMetadata;
    if (metadata.avatarBodyBase) {
      mesh.setEnabled(metadata.avatarBodyBase === safe.bodyBase);
      if (metadata.avatarPreserveMaterial) {
        continue;
      }
      if (metadata.avatarBodySurface === 'skin' || metadata.avatarPartRole === 'skin') {
        applyAuthoredBodyMaterial(mesh, palette.skinHex);
      } else if (metadata.avatarPartRole && !metadata.avatarPreserveMaterial) {
        const hex = hexForRole(metadata.avatarPartRole, palette);
        if (hex !== null) applyPartMaterial(mesh, metadata.avatarPartRole, hex);
      }
      continue;
    }
    const role = metadata.avatarPartRole;
    const hex = hexForRole(role, palette);
    if (hex === null) continue;
    applyPartMaterial(mesh, role!, hex);
  }

  applySilhouettes(avatar, safe);
  applyAvatarHeightScale(avatar, safe.heightInches);

  avatar.root.metadata = {
    ...avatar.root.metadata,
    avatarDefinition: safe,
  };

  return safe;
}

/** Sec 6.5: height affects body scale. Movement constants are untouched. */
export function applyAvatarHeightScale(avatar: ReviewAvatar, heightInches: number): number {
  const scale = resolveAvatarHeightScale(heightInches);
  avatar.root.scaling.setAll(scale);
  return scale;
}

function applyPartMaterial(mesh: AbstractMesh, role: AvatarPartRole, hex: string) {
  if (!mesh.material) return;

  const metadata = (mesh.metadata ?? {}) as AvatarMaterialMetadata;
  const baseMaterial = metadata.avatarBaseMaterial ?? mesh.material;
  const cache = metadata.avatarColorwayMaterials ?? {};
  const key = `def_${role}_${hex}`;
  let material = cache[key];

  if (!material) {
    material = baseMaterial.clone(`${baseMaterial.name}__${key}`) ?? baseMaterial;
    paintPartMaterial(material, role, hex);
    cache[key] = material;
  }

  mesh.material = material;
  mesh.metadata = {
    ...mesh.metadata,
    avatarBaseMaterial: baseMaterial,
    avatarColorwayMaterials: cache,
  };
}

function applyAuthoredBodyMaterial(mesh: AbstractMesh, skinHex: string) {
  if (!mesh.material) return;
  const metadata = (mesh.metadata ?? {}) as AvatarMaterialMetadata;
  const baseMaterial = metadata.avatarBaseMaterial ?? mesh.material;
  const cache = metadata.avatarColorwayMaterials ?? {};
  const key = `def_skin_${skinHex}`;
  let material = cache[key];

  if (!material) {
    if (baseMaterial instanceof MultiMaterial) {
      const multi = new MultiMaterial(`${baseMaterial.name}__${key}`, mesh.getScene());
      multi.subMaterials = baseMaterial.subMaterials.map((subMaterial) => {
        if (!subMaterial) return null;
        const clone = subMaterial.clone(`${subMaterial.name}__${key}`) ?? subMaterial;
        if (subMaterial.name.toLowerCase().includes('skin')) {
          paintPartMaterial(clone, 'skin', skinHex);
        }
        return clone;
      });
      material = multi;
    } else {
      material = baseMaterial.clone(`${baseMaterial.name}__${key}`) ?? baseMaterial;
      paintPartMaterial(material, 'skin', skinHex);
    }
    cache[key] = material;
  }

  mesh.material = material;
  mesh.metadata = {
    ...mesh.metadata,
    avatarBaseMaterial: baseMaterial,
    avatarColorwayMaterials: cache,
  } satisfies AvatarMeshMetadata & AvatarMaterialMetadata;
}

function paintPartMaterial(material: Material, role: AvatarPartRole, hex: string) {
  const color = Color3.FromHexString(hex);
  const emissive = EMISSIVE_ROLES.has(role);

  // PBR only: StandardMaterial renders flat white in this venue's pipeline.
  // The StandardMaterial branch exists solely so a hand-built test avatar (or
  // a future authored mesh that ships one) still recolours instead of silently
  // keeping its base colour.
  if (material instanceof PBRMaterial) {
    material.albedoColor = color;
    material.reflectivityColor = color.scale(role === 'shoes' ? 0.3 : 0.16);
    material.emissiveColor = emissive ? color : color.scale(0.06);
    material.emissiveIntensity = emissive ? 1.2 : 0.2;
    material.roughness = role === 'skin' || role === 'arm' || role === 'leg' ? 0.62 : 0.48;
    material.metallic = 0.08;
  } else if (material instanceof StandardMaterial) {
    material.diffuseColor = color;
    material.specularColor = color.scale(0.24);
    material.emissiveColor = emissive ? color : color.scale(0.06);
  }
}

// ---------------------------------------------------------------------------
// Silhouette hints
// ---------------------------------------------------------------------------

interface PartShape {
  scaling: readonly [number, number, number];
  position: readonly [number, number, number];
}

const HAIR_SHAPES: Readonly<Record<AvatarHairSilhouette, PartShape>> = {
  buzz: { scaling: [1, 0.72, 1], position: [0, 1.735, 0.01] },
  short: { scaling: [1.05, 0.95, 1.05], position: [0, 1.73, 0.02] },
  mid: { scaling: [1.08, 1.05, 1.18], position: [0, 1.72, 0.04] },
  long: { scaling: [1.1, 1.45, 1.3], position: [0, 1.66, 0.06] },
};

const JACKET_SHAPES: Readonly<Record<AvatarJacketSilhouette, PartShape>> = {
  vest: { scaling: [0.86, 0.82, 0.72], position: [0, 1.14, 0] },
  crop: { scaling: [0.9, 0.62, 0.76], position: [0, 1.3, 0] },
  hip: { scaling: [0.9, 1, 0.78], position: [0, 1.11, 0] },
  long: { scaling: [0.92, 1.45, 0.8], position: [0, 0.95, 0] },
};

const BOTTOMS_SHAPES: Readonly<Record<AvatarBottomsSilhouette, PartShape>> = {
  pants: { scaling: [1.12, 1, 1], position: [0, 0.78, 0] },
  shorts: { scaling: [1.16, 1.12, 1.06], position: [0, 0.76, 0] },
  skirt: { scaling: [1.5, 1.35, 1.5], position: [0, 0.74, 0] },
};

/** Box is authored 0.1m tall; the leg's local ground plane is y -0.38. */
const SHOE_SHAPES: Readonly<Record<AvatarShoesSilhouette, PartShape>> = {
  flat: { scaling: [1, 0.5, 0.95], position: [0, -0.355, -0.04] },
  sneaker: { scaling: [1, 1, 1], position: [0, -0.33, -0.04] },
  boot: { scaling: [1.05, 2.4, 1], position: [0, -0.26, -0.03] },
};

function applyShape(mesh: AbstractMesh | undefined, shape: PartShape) {
  if (!mesh) return;
  mesh.scaling.set(shape.scaling[0], shape.scaling[1], shape.scaling[2]);
  mesh.position.set(shape.position[0], shape.position[1], shape.position[2]);
}

function findPart(avatar: ReviewAvatar, suffix: string): AbstractMesh | undefined {
  return avatar.meshes.find((mesh) => mesh.name === `review-avatar-${suffix}`);
}

function applySilhouettes(avatar: ReviewAvatar, definition: AvatarDefinition) {
  const hair = resolveAvatarOption('hairStyle', definition.hairStyle)
    .silhouette as AvatarHairSilhouette | undefined;
  const jacket = resolveAvatarOption('jacket', definition.jacket)
    .silhouette as AvatarJacketSilhouette | undefined;
  const bottoms = resolveAvatarOption('bottoms', definition.bottoms)
    .silhouette as AvatarBottomsSilhouette | undefined;
  const shoes = resolveAvatarOption('shoes', definition.shoes)
    .silhouette as AvatarShoesSilhouette | undefined;

  const hasAuthoredBody = avatar.root.metadata?.avatarAuthoredBodiesLoaded === true;
  const authoredCharacterBases = avatar.root.metadata?.avatarAuthoredCharacterBases;
  const hasAuthoredCharacter = Array.isArray(authoredCharacterBases)
    && authoredCharacterBases.includes(definition.bodyBase);
  for (const mesh of avatar.meshes) {
    const metadata = (mesh.metadata ?? {}) as AvatarMaterialMetadata;
    if (metadata.avatarBodyBase) continue;
    if (hasAuthoredCharacter) {
      // The procedural capsule/box rig is an emergency fallback only. Once a
      // complete authored character exists for the selected base, none of its
      // anatomy, wardrobe, visor, or halo may leak through the real asset.
      mesh.setEnabled(false);
      continue;
    }
    if (!metadata.avatarFallbackAnatomy) continue;
    if (!hasAuthoredBody) {
      mesh.setEnabled(true);
    } else if (metadata.avatarPartRole === 'arm') {
      mesh.setEnabled(resolveAvatarOption('top', definition.top).silhouette === 'longsleeve');
    } else if (metadata.avatarPartRole === 'leg') {
      mesh.setEnabled(bottoms === 'pants');
    } else {
      mesh.setEnabled(false);
    }
  }

  applyShape(findPart(avatar, 'hair'), HAIR_SHAPES[hair ?? 'short']);
  applyShape(findPart(avatar, 'jacket'), JACKET_SHAPES[jacket ?? 'hip']);
  applyShape(findPart(avatar, 'hips'), BOTTOMS_SHAPES[bottoms ?? 'pants']);
  const shoeShape = SHOE_SHAPES[shoes ?? 'sneaker'];
  applyShape(findPart(avatar, 'left-shoe'), shoeShape);
  applyShape(findPart(avatar, 'right-shoe'), shoeShape);
}
