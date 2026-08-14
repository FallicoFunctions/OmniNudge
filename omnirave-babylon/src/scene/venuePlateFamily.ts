import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { Scene } from '@babylonjs/core/scene';

// The venue's ornate plate family - the pearl lamella / gold seam pair the
// V113 crown shell (and most of the authored pearl-and-gold trim) is built
// from. New pieces that must READ as part of the venue rather than as bolted-
// on props derive their material from these by lookup, so they inherit the
// family's metallic/roughness/clearcoat/environment character instead of
// guessing at it.
//
// The lookup has to cope with mainStageMaterialPolish, which clones each
// shared material per rule as `${source}__${ruleKey}` - so an exact-name hit
// is preferred, then any polished variant, then any prefix match. If nothing
// matches (NullEngine tests, or a venue GLB without the family) the caller's
// fallback numbers are used and `sourceName` comes back null, which is what
// the summary/tests report on.

export const PEARL_PLATE_MATERIAL = 'V20_LayeredPearlShell';
export const GOLD_PLATE_MATERIAL = 'V20_ChasedGoldFiligree';

export interface PlateMaterialOptions {
  /** Albedo for the new piece. Authored, not inherited: the crown plates are
   *  tuned near-black for geometry 24m overhead, which is invisible at the
   *  ground level these pieces live at. */
  albedoColor: Color3;
  emissiveColor: Color3;
  emissiveIntensity: number;
  /** Used only when the family material is not in the scene. */
  fallbackMetallic: number;
  fallbackRoughness: number;
  name: string;
  sourceName: string;
}

export interface PlateMaterialResult {
  material: PBRMaterial;
  /** Name of the scene material actually reused, or null if we fell back. */
  sourceName: string | null;
}

function findFamilyMaterial(scene: Scene, sourceName: string): PBRMaterial | null {
  const exact = scene.materials.find((material) => material.name === sourceName);
  const polished = scene.materials.find((material) => material.name.startsWith(`${sourceName}__`));
  const prefixed = scene.materials.find((material) => material.name.startsWith(sourceName));
  const found = exact ?? polished ?? prefixed;
  return found instanceof PBRMaterial ? found : null;
}

export function createPlateMaterial(scene: Scene, options: PlateMaterialOptions): PlateMaterialResult {
  const family = findFamilyMaterial(scene, options.sourceName);
  let material: PBRMaterial | null = null;
  let reusedName: string | null = null;

  if (family) {
    const clone = family.clone(options.name);
    if (clone instanceof PBRMaterial) {
      material = clone;
      reusedName = family.name;
      // The venue is frozen (freezeStaticScene) before these modules run, and
      // a clone can inherit that frozen state - edits below would be dropped.
      material.unfreeze();
      // Drop the family's UV-mapped maps: the boxes/planes here carry their
      // own trivial UVs, so an inherited albedo/normal map would tile at a
      // meaningless scale. Everything else (metallic, roughness, clearcoat,
      // environmentIntensity) is exactly the family look we want.
      material.albedoTexture = null;
      material.bumpTexture = null;
      material.metallicTexture = null;
    }
  }

  if (!material) {
    material = new PBRMaterial(options.name, scene);
    material.metallic = options.fallbackMetallic;
    material.roughness = options.fallbackRoughness;
  }

  material.albedoColor = options.albedoColor;
  material.emissiveColor = options.emissiveColor;
  material.emissiveIntensity = options.emissiveIntensity;

  return { material, sourceName: reusedName };
}
