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

  applyMeshSpecificOverrides(meshes);

  return summary;
}

function applyMeshSpecificOverrides(meshes: AbstractMesh[]) {
  const clonedMaterials = new Map<string, PBRMaterial>();

  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial)) {
      continue;
    }

    if (mesh.name.startsWith('V91_SupportTentCanopy_')) {
      const cacheKey = `${material.uniqueId}:support-tent-canopy`;
      let canopyMaterial = clonedMaterials.get(cacheKey);
      if (!canopyMaterial) {
        canopyMaterial = material.clone(`${material.name}__support-tent-canopy`);
        applySupportTentCanopyOverride(canopyMaterial);
        clonedMaterials.set(cacheKey, canopyMaterial);
      }

      mesh.material = canopyMaterial;
      continue;
    }

    if (mesh.name.startsWith('V87_WingFacadeShadowFrameArray_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-shadow-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__wing-facade-shadow-frame`);
        applyWingFacadeShadowFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      mesh.material = frameMaterial;
      continue;
    }

    if (mesh.name.startsWith('V30_VipShellFascia_')) {
      const cacheKey = `${material.uniqueId}:vip-shell-fascia`;
      let fasciaMaterial = clonedMaterials.get(cacheKey);
      if (!fasciaMaterial) {
        fasciaMaterial = material.clone(`${material.name}__vip-shell-fascia`);
        applyVipShellFasciaOverride(fasciaMaterial);
        clonedMaterials.set(cacheKey, fasciaMaterial);
      }

      mesh.material = fasciaMaterial;
      continue;
    }

    if (mesh.name === 'FestivalField') {
      const cacheKey = `${material.uniqueId}:festival-field-night`;
      let fieldMaterial = clonedMaterials.get(cacheKey);
      if (!fieldMaterial) {
        fieldMaterial = material.clone(`${material.name}__festival-field-night`);
        applyFestivalFieldOverride(fieldMaterial);
        clonedMaterials.set(cacheKey, fieldMaterial);
      }

      mesh.material = fieldMaterial;
      continue;
    }

    if (mesh.name === 'V34_ApproachPaverField') {
      const cacheKey = `${material.uniqueId}:approach-paver-field`;
      let paverMaterial = clonedMaterials.get(cacheKey);
      if (!paverMaterial) {
        paverMaterial = material.clone(`${material.name}__approach-paver-field`);
        applyApproachPaverFieldOverride(paverMaterial);
        clonedMaterials.set(cacheKey, paverMaterial);
      }

      mesh.material = paverMaterial;
      continue;
    }

    if (mesh.name === 'V34_ApproachReflectionUnderlay') {
      const cacheKey = `${material.uniqueId}:approach-reflection-underlay`;
      let reflectionMaterial = clonedMaterials.get(cacheKey);
      if (!reflectionMaterial) {
        reflectionMaterial = material.clone(`${material.name}__approach-reflection-underlay`);
        applyApproachReflectionUnderlayOverride(reflectionMaterial);
        clonedMaterials.set(cacheKey, reflectionMaterial);
      }

      mesh.material = reflectionMaterial;
      continue;
    }

    if (mesh.name.startsWith('V113_CrownShellLamellaArray_')) {
      const cacheKey = `${material.uniqueId}:crown-shell-lamella`;
      let lamellaMaterial = clonedMaterials.get(cacheKey);
      if (!lamellaMaterial) {
        lamellaMaterial = material.clone(`${material.name}__crown-shell-lamella`);
        applyCrownShellLamellaOverride(lamellaMaterial);
        clonedMaterials.set(cacheKey, lamellaMaterial);
      }

      mesh.material = lamellaMaterial;
      continue;
    }

    if (mesh.name.startsWith('V90_BasinStoneCopingArray_')) {
      const cacheKey = `${material.uniqueId}:basin-stone-coping`;
      let copingMaterial = clonedMaterials.get(cacheKey);
      if (!copingMaterial) {
        copingMaterial = material.clone(`${material.name}__basin-stone-coping`);
        applyBasinStoneCopingOverride(copingMaterial);
        clonedMaterials.set(cacheKey, copingMaterial);
      }

      mesh.material = copingMaterial;
      continue;
    }

    if (mesh.name === 'V127_CrownScreenShadowCoffer') {
      const cacheKey = `${material.uniqueId}:crown-screen-shadow-coffer`;
      let cofferMaterial = clonedMaterials.get(cacheKey);
      if (!cofferMaterial) {
        cofferMaterial = material.clone(`${material.name}__crown-screen-shadow-coffer`);
        applyCrownScreenShadowCofferOverride(cofferMaterial);
        clonedMaterials.set(cacheKey, cofferMaterial);
      }

      mesh.material = cofferMaterial;
      continue;
    }

    if (mesh.name === 'V70_PromenadePearlRunway') {
      const cacheKey = `${material.uniqueId}:promenade-pearl-runway`;
      let runwayMaterial = clonedMaterials.get(cacheKey);
      if (!runwayMaterial) {
        runwayMaterial = material.clone(`${material.name}__promenade-pearl-runway`);
        applyPromenadePearlRunwayOverride(runwayMaterial);
        clonedMaterials.set(cacheKey, runwayMaterial);
      }

      mesh.material = runwayMaterial;
      continue;
    }

    if (mesh.name.startsWith('V30_VipGlassBalustrade_')) {
      const cacheKey = `${material.uniqueId}:vip-glass-balustrade`;
      let balustradeMaterial = clonedMaterials.get(cacheKey);
      if (!balustradeMaterial) {
        balustradeMaterial = material.clone(`${material.name}__vip-glass-balustrade`);
        applyVipGlassBalustradeOverride(balustradeMaterial);
        clonedMaterials.set(cacheKey, balustradeMaterial);
      }

      mesh.material = balustradeMaterial;
      continue;
    }

    if (mesh.name.startsWith('V30_WingGlassBalustrade_')) {
      const cacheKey = `${material.uniqueId}:wing-glass-balustrade`;
      let balustradeMaterial = clonedMaterials.get(cacheKey);
      if (!balustradeMaterial) {
        balustradeMaterial = material.clone(`${material.name}__wing-glass-balustrade`);
        applyWingGlassBalustradeOverride(balustradeMaterial);
        clonedMaterials.set(cacheKey, balustradeMaterial);
      }

      mesh.material = balustradeMaterial;
      continue;
    }

    if (mesh.name.startsWith('V51_OculusCanopy_')) {
      const cacheKey = `${material.uniqueId}:oculus-canopy`;
      let canopyMaterial = clonedMaterials.get(cacheKey);
      if (!canopyMaterial) {
        canopyMaterial = material.clone(`${material.name}__oculus-canopy`);
        applyOculusCanopyOverride(canopyMaterial);
        clonedMaterials.set(cacheKey, canopyMaterial);
      }

      mesh.material = canopyMaterial;
      continue;
    }

    if (
      mesh.name.startsWith('V51_ShoulderCrownMass_') ||
      mesh.name.startsWith('V51_RearCathedralMass_')
    ) {
      const cacheKey = `${material.uniqueId}:stage-mass-ivory`;
      let stageMassMaterial = clonedMaterials.get(cacheKey);
      if (!stageMassMaterial) {
        stageMassMaterial = material.clone(`${material.name}__stage-mass-ivory`);
        applyStageMassIvoryOverride(stageMassMaterial);
        clonedMaterials.set(cacheKey, stageMassMaterial);
      }

      mesh.material = stageMassMaterial;
      continue;
    }

    if (mesh.name.startsWith('V53_SpawnGalleryArcadePearl_')) {
      const cacheKey = `${material.uniqueId}:spawn-gallery-arcade-pearl`;
      let arcadeMaterial = clonedMaterials.get(cacheKey);
      if (!arcadeMaterial) {
        arcadeMaterial = material.clone(`${material.name}__spawn-gallery-arcade-pearl`);
        applySpawnGalleryArcadePearlOverride(arcadeMaterial);
        clonedMaterials.set(cacheKey, arcadeMaterial);
      }

      mesh.material = arcadeMaterial;
      continue;
    }

    if (mesh.name.startsWith('V56_SpawnCanopyPearlVault_')) {
      const cacheKey = `${material.uniqueId}:spawn-canopy-pearl-vault`;
      let canopyVaultMaterial = clonedMaterials.get(cacheKey);
      if (!canopyVaultMaterial) {
        canopyVaultMaterial = material.clone(`${material.name}__spawn-canopy-pearl-vault`);
        applySpawnCanopyPearlVaultOverride(canopyVaultMaterial);
        clonedMaterials.set(cacheKey, canopyVaultMaterial);
      }

      mesh.material = canopyVaultMaterial;
      continue;
    }

    if (mesh.name === 'V62_BasinCausewayPearlSpan') {
      const cacheKey = `${material.uniqueId}:basin-causeway-pearl-span`;
      let causewayMaterial = clonedMaterials.get(cacheKey);
      if (!causewayMaterial) {
        causewayMaterial = material.clone(`${material.name}__basin-causeway-pearl-span`);
        applyBasinCausewayPearlSpanOverride(causewayMaterial);
        clonedMaterials.set(cacheKey, causewayMaterial);
      }

      mesh.material = causewayMaterial;
      continue;
    }

    if (mesh.name.startsWith('V63_BasinGardenTerrace_')) {
      const cacheKey = `${material.uniqueId}:basin-garden-terrace`;
      let terraceMaterial = clonedMaterials.get(cacheKey);
      if (!terraceMaterial) {
        terraceMaterial = material.clone(`${material.name}__basin-garden-terrace`);
        applyBasinGardenTerraceOverride(terraceMaterial);
        clonedMaterials.set(cacheKey, terraceMaterial);
      }

      mesh.material = terraceMaterial;
      continue;
    }

    if (mesh.name.startsWith('V60_SpawnGateSentinelPearl_')) {
      const cacheKey = `${material.uniqueId}:spawn-gate-sentinel-pearl`;
      let sentinelMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelMaterial) {
        sentinelMaterial = material.clone(`${material.name}__spawn-gate-sentinel-pearl`);
        applySpawnGateSentinelPearlOverride(sentinelMaterial);
        clonedMaterials.set(cacheKey, sentinelMaterial);
      }

      mesh.material = sentinelMaterial;
      continue;
    }

    if (mesh.name.startsWith('V106_RearShellShadowRevealArray_')) {
      const cacheKey = `${material.uniqueId}:rear-shell-shadow-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__rear-shell-shadow-reveal`);
        applyRearShellShadowRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      mesh.material = revealMaterial;
      continue;
    }

    if (mesh.name.startsWith('V133_WingTerraceGoldArray_')) {
      const cacheKey = `${material.uniqueId}:wing-terrace-gold`;
      let terraceGoldMaterial = clonedMaterials.get(cacheKey);
      if (!terraceGoldMaterial) {
        terraceGoldMaterial = material.clone(`${material.name}__wing-terrace-gold`);
        applyWingTerraceGoldOverride(terraceGoldMaterial);
        clonedMaterials.set(cacheKey, terraceGoldMaterial);
      }

      mesh.material = terraceGoldMaterial;
      continue;
    }

    if (mesh.name.startsWith('V30_WingTerraceFascia_')) {
      const cacheKey = `${material.uniqueId}:wing-terrace-fascia`;
      let terraceFasciaMaterial = clonedMaterials.get(cacheKey);
      if (!terraceFasciaMaterial) {
        terraceFasciaMaterial = material.clone(`${material.name}__wing-terrace-fascia`);
        applyWingTerraceFasciaOverride(terraceFasciaMaterial);
        clonedMaterials.set(cacheKey, terraceFasciaMaterial);
      }

      mesh.material = terraceFasciaMaterial;
      continue;
    }

    if (mesh.name.startsWith('V117_WingCanopyLamellaGoldArray_')) {
      const cacheKey = `${material.uniqueId}:wing-canopy-lamella-gold`;
      let wingCanopyMaterial = clonedMaterials.get(cacheKey);
      if (!wingCanopyMaterial) {
        wingCanopyMaterial = material.clone(`${material.name}__wing-canopy-lamella-gold`);
        applyWingCanopyLamellaGoldOverride(wingCanopyMaterial);
        clonedMaterials.set(cacheKey, wingCanopyMaterial);
      }

      mesh.material = wingCanopyMaterial;
      continue;
    }

    if (mesh.name.startsWith('V31_SideGlassLens_')) {
      const cacheKey = `${material.uniqueId}:side-screen-glass-lens`;
      let lensMaterial = clonedMaterials.get(cacheKey);
      if (!lensMaterial) {
        lensMaterial = material.clone(`${material.name}__side-screen-glass-lens`);
        applySideScreenGlassLensOverride(lensMaterial);
        clonedMaterials.set(cacheKey, lensMaterial);
      }

      mesh.material = lensMaterial;
    }
  }
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
    material.albedoColor = new Color3(0.015, 0.14, 0.24);
    material.metallic = Math.max(material.metallic ?? 0, 0.08);
    material.roughness = 0.42;
    material.emissiveColor = new Color3(0.04, 0.42, 0.62);
    material.emissiveIntensity = 0.86;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.14;
    material.clearCoat.roughness = 0.24;
    material.environmentIntensity = 0.68;
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

function applySupportTentCanopyOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.34, 0.38, 0.44);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.01;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.08;
  material.clearCoat.roughness = 0.48;
  material.environmentIntensity = 0.32;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'support-tent-canopy',
  };
}

function applyWingFacadeShadowFrameOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.01, 0.015, 0.02);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.08;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.58;
  material.environmentIntensity = 0.28;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-facade-shadow-frame',
  };
}

function applyVipShellFasciaOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.25, 0.3);
  material.emissiveColor = new Color3(0.01, 0.015, 0.02);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.54;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'vip-shell-fascia',
  };
}

function applyFestivalFieldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.08, 0.1, 0.14);
  material.emissiveColor = new Color3(0.005, 0.01, 0.014);
  material.emissiveIntensity = 0.06;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.12;
  material.clearCoat.roughness = 0.42;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'festival-field-night',
  };
}

function applyApproachPaverFieldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.135, 0.13);
  material.emissiveColor = new Color3(0.01, 0.012, 0.015);
  material.emissiveIntensity = 0.05;
  material.metallic = 0.06;
  material.roughness = 0.58;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.26;
  material.clearCoat.roughness = 0.2;
  material.environmentIntensity = 0.5;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'approach-paver-field',
  };
}

function applyApproachReflectionUnderlayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.06, 0.08);
  material.emissiveColor = new Color3(0.01, 0.025, 0.035);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.98;
  material.metallic = 0.02;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.7;
  material.clearCoat.roughness = 0.08;
  material.environmentIntensity = 0.86;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'approach-reflection-underlay',
  };
}

function applyCrownShellLamellaOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.18, 0.08);
  material.emissiveColor = new Color3(0.01, 0.008, 0.004);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.22;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-shell-lamella',
  };
}

function applyBasinStoneCopingOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.44, 0.42, 0.38);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.02;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-stone-coping',
  };
}

function applyCrownScreenShadowCofferOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-screen-shadow-coffer',
  };
}

function applyPromenadePearlRunwayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.3, 0.28, 0.24);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'promenade-pearl-runway',
  };
}

function applyVipGlassBalustradeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.05, 0.07, 0.08);
  material.emissiveColor = new Color3(0, 0.01, 0.015);
  material.emissiveIntensity = 0.01;
  material.alpha = 0.18;
  material.metallic = 0.02;
  material.roughness = 0.72;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'vip-glass-balustrade',
  };
}

function applyWingGlassBalustradeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.05, 0.08, 0.1);
  material.emissiveColor = new Color3(0, 0.012, 0.018);
  material.emissiveIntensity = 0.015;
  material.alpha = 0.22;
  material.metallic = 0.02;
  material.roughness = 0.72;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-glass-balustrade',
  };
}

function applyOculusCanopyOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.13, 0.05);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0.01;
  material.metallic = 0.18;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oculus-canopy',
  };
}

function applyWingCanopyLamellaGoldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.12, 0.05);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.14;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-canopy-lamella-gold',
  };
}

function applyStageMassIvoryOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.24, 0.26, 0.3);
  material.emissiveColor = new Color3(0.006, 0.01, 0.014);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'stage-mass-ivory',
  };
}

function applySpawnGalleryArcadePearlOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gallery-arcade-pearl',
  };
}

function applySpawnCanopyPearlVaultOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
  material.emissiveColor = new Color3(0.006, 0.008, 0.012);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-canopy-pearl-vault',
  };
}

function applyBasinCausewayPearlSpanOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.23, 0.27);
  material.emissiveColor = new Color3(0.006, 0.008, 0.012);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-causeway-pearl-span',
  };
}

function applyBasinGardenTerraceOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.21, 0.23, 0.27);
  material.emissiveColor = new Color3(0.006, 0.008, 0.012);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.7;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-garden-terrace',
  };
}

function applySpawnGateSentinelPearlOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.21, 0.23, 0.27);
  material.emissiveColor = new Color3(0.006, 0.008, 0.012);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.7;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gate-sentinel-pearl',
  };
}

function applyRearShellShadowRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.18, 0.22);
  material.emissiveColor = new Color3(0.004, 0.007, 0.01);
  material.emissiveIntensity = 0.01;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-shell-shadow-reveal',
  };
}

function applyWingTerraceGoldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.06);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.86;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-terrace-gold',
  };
}

function applyWingTerraceFasciaOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.006, 0.007, 0.01);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-terrace-fascia',
  };
}

function applySideScreenGlassLensOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.08, 0.18, 0.24);
  material.emissiveColor = new Color3(0.01, 0.04, 0.06);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.42;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'side-screen-glass-lens',
  };
}
