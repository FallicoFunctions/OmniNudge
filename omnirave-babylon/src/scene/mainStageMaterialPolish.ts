import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';

export interface MainStageMaterialPolishSummary {
  black: number;
  emissive: number;
  gold: number;
  pearl: number;
  untouched: number;
  wet: number;
}

type MainStageMaterialFamily = Exclude<keyof MainStageMaterialPolishSummary, 'untouched'>;

const createSummary = (): MainStageMaterialPolishSummary => ({
  black: 0,
  emissive: 0,
  gold: 0,
  pearl: 0,
  untouched: 0,
  wet: 0,
});

export function polishMainStageMaterials(meshes: AbstractMesh[]): MainStageMaterialPolishSummary {
  const summary = createSummary();
  const visitedMaterials = new Set<PBRMaterial>();

  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial) || visitedMaterials.has(material)) {
      continue;
    }
    visitedMaterials.add(material);

    const family = resolveMainStageMaterialFamily(material.name);
    if (!family) {
      summary.untouched += 1;
      continue;
    }

    applyMainStageMaterialFamily(material, family);
    summary[family] += 1;
  }

  return summary;
}

function resolveMainStageMaterialFamily(materialName: string): MainStageMaterialFamily | null {
  const name = materialName.toLowerCase();

  if (
    name.includes('screen') ||
    name.includes('glow') ||
    name.includes('cyan') ||
    name.includes('lens') ||
    name.includes('practical') ||
    name.includes('pyro')
  ) {
    return 'emissive';
  }

  if (name.includes('gold') || name.includes('filigree') || name.includes('anchor')) {
    return 'gold';
  }

  if (name.includes('wet') || name.includes('water') || name.includes('pool') || name.includes('stone')) {
    return 'wet';
  }

  if (
    name.includes('pearl') ||
    name.includes('moonstone') ||
    name.includes('shell') ||
    name.includes('limestone') ||
    name.includes('facade') ||
    name.includes('gateway') ||
    name.includes('inlay')
  ) {
    return 'pearl';
  }

  if (
    name.includes('black') ||
    name.includes('graphite') ||
    name.includes('truss') ||
    name.includes('rigging') ||
    name.includes('hardware') ||
    name.includes('shadow')
  ) {
    return 'black';
  }

  return null;
}

function applyMainStageMaterialFamily(material: PBRMaterial, family: MainStageMaterialFamily) {
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: family,
  };

  if (family === 'emissive') {
    material.metallic = Math.max(material.metallic ?? 0, 0.08);
    material.roughness = 0.24;
    material.emissiveColor = new Color3(0.1, 0.72, 1);
    material.emissiveIntensity = 2.35;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.45;
    material.clearCoat.roughness = 0.16;
    material.environmentIntensity = 1.25;
    return;
  }

  if (family === 'gold') {
    material.metallic = 0.96;
    material.roughness = 0.28;
    material.emissiveColor = new Color3(0.12, 0.075, 0.02);
    material.emissiveIntensity = 0.18;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.22;
    material.clearCoat.roughness = 0.12;
    material.environmentIntensity = 1.35;
    return;
  }

  if (family === 'wet') {
    material.metallic = 0.04;
    material.roughness = 0.16;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.72;
    material.clearCoat.roughness = 0.05;
    material.environmentIntensity = 1.2;
    return;
  }

  if (family === 'pearl') {
    material.metallic = 0.02;
    material.roughness = 0.46;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.42;
    material.clearCoat.roughness = 0.2;
    material.environmentIntensity = 0.95;
    return;
  }

  material.metallic = 0.32;
  material.roughness = 0.68;
  material.environmentIntensity = 0.55;
}
