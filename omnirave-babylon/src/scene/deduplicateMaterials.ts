import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { Scene } from '@babylonjs/core/scene';

export interface DeduplicateMaterialsSummary {
  materialsRemapped: number;
}

const color = (c: { r: number; g: number; b: number } | null | undefined) =>
  c ? `${c.r},${c.g},${c.b}` : 'x';

const texture = (t: { uniqueId?: number } | null | undefined) => (t ? `t${t.uniqueId}` : 'x');

// The polish pass clones one material per override row; many rows carry
// identical final values, so the scene ends up with hundreds of visually
// interchangeable materials. Rebinding meshes to one canonical material per
// distinct visual signature lets the static merge collapse across rows.
export function deduplicateMaterials(scene: Scene): DeduplicateMaterialsSummary {
  const canonical = new Map<string, PBRMaterial>();
  let materialsRemapped = 0;

  const signature = (m: PBRMaterial) =>
    [
      color(m.albedoColor),
      color(m.emissiveColor),
      m.emissiveIntensity,
      m.metallic ?? 'x',
      m.roughness ?? 'x',
      m.alpha,
      m.transparencyMode ?? 'x',
      m.zOffset,
      m.environmentIntensity,
      m.clearCoat.isEnabled ? `${m.clearCoat.intensity},${m.clearCoat.roughness}` : 'x',
      texture(m.albedoTexture),
      texture(m.bumpTexture),
      texture(m.metallicTexture),
      texture(m.ambientTexture),
      texture(m.emissiveTexture),
      m.unlit ? 1 : 0,
      m.backFaceCulling ? 1 : 0,
      m.maxSimultaneousLights,
    ].join('|');

  for (const mesh of scene.meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial)) continue;

    const key = signature(material);
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

  return { materialsRemapped };
}
