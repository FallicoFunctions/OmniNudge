import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh.js';
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

type Rgb = readonly [number, number, number];

export interface MainStageOverrideParams {
  clearAlbedoTexture?: boolean;
  albedoColor?: Rgb;
  emissiveColor?: Rgb;
  emissiveIntensity?: number;
  metallic?: number;
  roughness?: number;
  alpha?: number;
  alphaBlend?: boolean;
  clearCoat?: { readonly intensity: number; readonly roughness: number };
  environmentIntensity?: number;
  metadataPolish?: 'black' | 'smoked';
}

export interface MainStageOverrideMatcher {
  readonly prefix?: string;
  readonly exact?: string;
  readonly suffix?: string;
}

export interface MainStageOverrideRule {
  readonly key: string;
  readonly match: readonly MainStageOverrideMatcher[];
  readonly params: MainStageOverrideParams;
}

// Ordered rules: the first matching rule wins. Append new rules with care —
// a more specific matcher must come before any broader one that also matches.
export const MAIN_STAGE_MESH_OVERRIDES: readonly MainStageOverrideRule[] = [
  {
    key: 'support-tent-canopy',
    match: [{ prefix: 'V91_SupportTentCanopy_' }],
    params: {
      albedoColor: [0.34, 0.38, 0.44],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.01,
      roughness: 0.82,
      clearCoat: { intensity: 0.08, roughness: 0.48 },
      environmentIntensity: 0.32,
    },
  },
  {
    key: 'support-tent-frame',
    match: [{ prefix: 'V91_SupportTentFrame_' }],
    params: {
      albedoColor: [0.075, 0.0875, 0.1125],
      emissiveColor: [0.004, 0.004, 0.006],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.03, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'support-tent-crest',
    match: [{ prefix: 'V91_SupportTentCrest_' }],
    params: {
      albedoColor: [0.2625, 0.2, 0.075],
      emissiveColor: [0.005, 0.004, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.14,
      roughness: 0.84,
      clearCoat: { intensity: 0.02, roughness: 0.78 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'service-case-bank',
    match: [{ prefix: 'V92_ServiceCaseBank_' }],
    params: {
      albedoColor: [0.075, 0.0875, 0.1],
      emissiveColor: [0.004, 0.004, 0.005],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.72 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'service-case-topper',
    match: [{ prefix: 'V92_ServiceCaseTopper_' }],
    params: {
      albedoColor: [0.2375, 0.1875, 0.075],
      emissiveColor: [0.005, 0.004, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.14,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'wing-service-case-array',
    match: [{ prefix: 'V93_ServiceCaseArray_' }],
    params: {
      albedoColor: [0.075, 0.0875, 0.1],
      emissiveColor: [0.004, 0.004, 0.005],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.72 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'pyro-pylon-array',
    match: [{ prefix: 'V95_PyroPylonArray_' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.005, 0.007, 0.01],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'pyro-nozzle-array',
    match: [{ prefix: 'V95_PyroNozzleArray_' }],
    params: {
      albedoColor: [0.2375, 0.1875, 0.075],
      emissiveColor: [0.005, 0.004, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.15,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'rear-mass-gold-band',
    match: [{ prefix: 'V96_RearMassGoldBandArray_' }],
    params: {
      albedoColor: [0.2375, 0.1875, 0.075],
      emissiveColor: [0.005, 0.004, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.15,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'rear-mass-shadow-channel',
    match: [{ prefix: 'V96_RearMassShadowChannelArray_' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.006, 0.012, 0.016],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.84,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'wet-route-stone-band',
    match: [{ exact: 'V97_WetRouteStoneBandArray' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.22, roughness: 0.34 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'wet-route-gold-seam',
    match: [{ exact: 'V97_WetRouteGoldSeamArray' }],
    params: {
      albedoColor: [0.2375, 0.1875, 0.075],
      emissiveColor: [0.005, 0.004, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'side-screen-anchor-gold-spine',
    match: [{ exact: 'V76_SideScreenAnchorGoldSpine_L' }, { exact: 'V76_SideScreenAnchorGoldSpine_R' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'arc-anchor-gold-cluster',
    match: [{ exact: 'V75_ArcAnchorGoldCluster_L' }, { exact: 'V75_ArcAnchorGoldCluster_R' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'sweep-anchor-outer-gold-crown',
    match: [{ exact: 'V74_SweepOuterAnchorGoldCrown_L' }, { exact: 'V74_SweepOuterAnchorGoldCrown_R' }],
    params: {
      albedoColor: [0.1825, 0.135, 0.0537],
      emissiveColor: [0.0034, 0.0022, 0.0008],
      emissiveIntensity: 0.007,
      metallic: 0.11,
      roughness: 0.93,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'sweep-anchor-inner-gold-crown',
    match: [{ exact: 'V74_SweepInnerAnchorGoldCrown_L' }, { exact: 'V74_SweepInnerAnchorGoldCrown_R' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'sweep-anchor-outer-shadow-core',
    match: [{ exact: 'V74_SweepOuterAnchorShadowCore_L' }, { exact: 'V74_SweepOuterAnchorShadowCore_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.8,
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'sweep-anchor-inner-shadow-core',
    match: [{ exact: 'V74_SweepInnerAnchorShadowCore_L' }, { exact: 'V74_SweepInnerAnchorShadowCore_R' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.008, 0.045, 0.07],
      emissiveIntensity: 0.06,
      metallic: 0.05,
      roughness: 0.76,
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'hero-portal-service-door-frame',
    match: [{ exact: 'V73_HeroPortalServiceDoorFrameCluster_L' }, { exact: 'V73_HeroPortalServiceDoorFrameCluster_R' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'hero-portal-service-door-leaf',
    match: [{ exact: 'V73_HeroPortalServiceDoorLeafCluster_L' }, { exact: 'V73_HeroPortalServiceDoorLeafCluster_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'crown-rigging-gold-boss',
    match: [{ exact: 'V72_CrownRiggingGoldBosses' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'crown-gold-lattice',
    match: [{ exact: 'V47_CrownGoldLatticeBraceA' }, { exact: 'V47_CrownGoldLatticeBraceB' }],
    params: {
      albedoColor: [0.175, 0.125, 0.05],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.1,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'line-array-graphite',
    match: [{ prefix: 'V29_MainLineArrayCabinet_' }, { prefix: 'V29_MainLineArrayDriver_' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.01, 0.012, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.02, roughness: 0.64 },
      environmentIntensity: 0.2,
    },
  },
  {
    key: 'front-sub-graphite',
    match: [{ prefix: 'V29_FrontSubCabinet_' }],
    params: {
      albedoColor: [0.2, 0.225, 0.2625],
      emissiveColor: [0.007, 0.0085, 0.01],
      emissiveIntensity: 0.014,
      metallic: 0.05,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.64 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'line-array-acoustic-black',
    match: [{ prefix: 'V29_MainLineArrayGrille_' }, { prefix: 'V29_MainLineArrayHorn_' }],
    params: {
      albedoColor: [0.0625, 0.0875, 0.1125],
      emissiveColor: [0.01, 0.052, 0.074],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'front-sub-port-black',
    match: [{ prefix: 'V29_FrontSubPort_' }],
    params: {
      albedoColor: [0.05, 0.0688, 0.0875],
      emissiveColor: [0.008, 0.04, 0.058],
      emissiveIntensity: 0.06,
      metallic: 0.04,
      roughness: 0.82,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'line-array-suspension-hardware',
    match: [{ exact: 'V29_MainLineArrayYoke_L' }, { exact: 'V29_MainLineArrayYoke_R' }],
    params: {
      albedoColor: [0.2, 0.2375, 0.2875],
      emissiveColor: [0.012, 0.018, 0.024],
      emissiveIntensity: 0.026,
      metallic: 0.1,
      roughness: 0.8,
      clearCoat: { intensity: 0.03, roughness: 0.58 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'line-array-side-rail-hardware',
    match: [{ exact: 'V29_MainLineArraySideRail_L' }, { exact: 'V29_MainLineArraySideRail_R' }],
    params: {
      albedoColor: [0.1375, 0.1812, 0.225],
      emissiveColor: [0.008, 0.014, 0.02],
      emissiveIntensity: 0.018,
      metallic: 0.08,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.7 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'line-array-pin-bars',
    match: [{ exact: 'V29_MainLineArrayPinBars_L' }, { exact: 'V29_MainLineArrayPinBars_R' }],
    params: {
      albedoColor: [0.25, 0.2, 0.1],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.2,
      roughness: 0.86,
      clearCoat: { intensity: 0, roughness: 0.82 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'basin-fountain-mist',
    match: [{ exact: 'V35_BasinFountainMist_L' }, { exact: 'V35_BasinFountainMist_R' }],
    params: {
      albedoColor: [0.075, 0.1125, 0.1375],
      emissiveColor: [0.014, 0.036, 0.05],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.28,
      alpha: 0.86,
      alphaBlend: true,
      clearCoat: { intensity: 0.62, roughness: 0.16 },
      environmentIntensity: 0.82,
    },
  },
  {
    key: 'basin-fountain-nozzle-array',
    match: [{ exact: 'V35_BasinFountainNozzleArray_L' }, { exact: 'V35_BasinFountainNozzleArray_R' }],
    params: {
      albedoColor: [0.2, 0.1625, 0.075],
      emissiveColor: [0.006, 0.004, 0.001],
      emissiveIntensity: 0.012,
      metallic: 0.16,
      roughness: 0.88,
      clearCoat: { intensity: 0, roughness: 0.84 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'basin-planting-island-rim',
    match: [{ exact: 'V35_BasinPlantingIslandRim_L' }, { exact: 'V35_BasinPlantingIslandRim_R' }],
    params: {
      albedoColor: [0.325, 0.35, 0.4],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.82,
      clearCoat: { intensity: 0.04, roughness: 0.56 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'foreground-barricade-frame',
    match: [{ exact: 'V36_ForegroundBarricadeFrame_L' }, { exact: 'V36_ForegroundBarricadeFrame_R' }],
    params: {
      albedoColor: [0.2, 0.2375, 0.2875],
      emissiveColor: [0.012, 0.018, 0.024],
      emissiveIntensity: 0.026,
      metallic: 0.1,
      roughness: 0.82,
      clearCoat: { intensity: 0.04, roughness: 0.56 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'foreground-barricade-gold-rail',
    match: [{ exact: 'V36_ForegroundBarricadeGoldRail_L' }, { exact: 'V36_ForegroundBarricadeGoldRail_R' }],
    params: {
      albedoColor: [0.25, 0.2, 0.1],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.2,
      roughness: 0.86,
      clearCoat: { intensity: 0, roughness: 0.82 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'v24-celestial-crown-front-arch',
    match: [{ exact: 'V24_CelestialCrownFrontArch_L' }, { exact: 'V24_CelestialCrownFrontArch_R' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.022,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.05, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'v24-proscenium-flying-buttress',
    match: [{ exact: 'V24_ProsceniumFlyingButtress_L' }, { exact: 'V24_ProsceniumFlyingButtress_R' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'v24-crown-gold-reveal',
    match: [{ exact: 'V24_CelestialCrownGoldReveal_L' }, { exact: 'V24_CelestialCrownGoldReveal_R' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.08],
      emissiveColor: [0.012, 0.008, 0.0025],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'v24-crown-depth-rib',
    match: [{ exact: 'V24_CrownSpireDepthRib_0' }, { exact: 'V24_CrownSpireDepthRib_1' }, { exact: 'V24_CrownSpireDepthRib_R_1' }, { exact: 'V24_CrownSpireDepthRib_2' }, { exact: 'V24_CrownSpireDepthRib_R_2' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.006, 0.004, 0.0015],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'v24-buttress-gold-reveal',
    match: [{ exact: 'V24_ProsceniumButtressGoldReveal_L' }, { exact: 'V24_ProsceniumButtressGoldReveal_R' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'crown-halo-cyan-inlay',
    match: [{ exact: 'V24_CrownHaloCyanInlay' }],
    params: {
      albedoColor: [0.04, 0.12, 0.18],
      emissiveColor: [0.008, 0.03, 0.05],
      emissiveIntensity: 0.06,
      metallic: 0.02,
      roughness: 0.42,
      alpha: 0.55,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'basin-lantern-stem',
    match: [{ exact: 'V33_BasinLanternStem_L' }, { exact: 'V33_BasinLanternStem_R' }],
    params: {
      albedoColor: [0.2, 0.2375, 0.2875],
      emissiveColor: [0.012, 0.018, 0.024],
      emissiveIntensity: 0.026,
      metallic: 0.1,
      roughness: 0.82,
      clearCoat: { intensity: 0.04, roughness: 0.56 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'basin-lantern-housing',
    match: [{ exact: 'V33_BasinLanternHousing_L' }, { exact: 'V33_BasinLanternHousing_R' }],
    params: {
      albedoColor: [0.25, 0.2, 0.1],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.2,
      roughness: 0.86,
      clearCoat: { intensity: 0, roughness: 0.82 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'basin-lantern-warm-core',
    match: [{ exact: 'V33_BasinLanternCore_L' }, { exact: 'V33_BasinLanternCore_R' }],
    params: {
      albedoColor: [0.95, 0.775, 0.35],
      emissiveColor: [0.96, 0.7, 0.26],
      emissiveIntensity: 4.6,
      metallic: 0.02,
      roughness: 0.34,
      clearCoat: { intensity: 0.16, roughness: 0.26 },
      environmentIntensity: 0.38,
    },
  },
  {
    key: 'basin-foliage-midstory',
    match: [{ exact: 'V33_BasinFoliageMidstory_L' }, { exact: 'V33_BasinFoliageMidstory_R' }],
    params: {
      albedoColor: [0.075, 0.1, 0.05],
      emissiveColor: [0.004, 0.006, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.16,
      metadataPolish: 'black',
    },
  },
  {
    key: 'vip-foliage-canopy',
    match: [{ exact: 'V33_VipFoliageCanopy_L' }, { exact: 'V33_VipFoliageCanopy_R' }],
    params: {
      albedoColor: [0.075, 0.1063, 0.0525],
      emissiveColor: [0.004, 0.0065, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.03, roughness: 0.74 },
      environmentIntensity: 0.14,
      metadataPolish: 'black',
    },
  },
  {
    key: 'basin-foliage-canopy',
    match: [{ exact: 'V33_BasinFoliageCanopy_L' }, { exact: 'V33_BasinFoliageCanopy_R' }],
    params: {
      albedoColor: [0.0938, 0.125, 0.0625],
      emissiveColor: [0.005, 0.008, 0.0025],
      emissiveIntensity: 0.022,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.05, roughness: 0.68 },
      environmentIntensity: 0.18,
      metadataPolish: 'black',
    },
  },
  {
    key: 'vip-foliage-understory',
    match: [{ exact: 'V33_VipFoliageUnderstory_L' }, { exact: 'V33_VipFoliageUnderstory_R' }],
    params: {
      albedoColor: [0.045, 0.0625, 0.0325],
      emissiveColor: [0.002, 0.0035, 0.0012],
      emissiveIntensity: 0.014,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.015, roughness: 0.8 },
      environmentIntensity: 0.1,
      metadataPolish: 'black',
    },
  },
  {
    key: 'basin-foliage-understory',
    match: [{ exact: 'V33_BasinFoliageUnderstory_L' }, { exact: 'V33_BasinFoliageUnderstory_R' }],
    params: {
      albedoColor: [0.0525, 0.0725, 0.0375],
      emissiveColor: [0.0025, 0.004, 0.0014],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.76 },
      environmentIntensity: 0.13,
      metadataPolish: 'black',
    },
  },
  {
    key: 'crowd-cluster-mid-graphite',
    match: [{ exact: 'V32_CrowdCluster_L_Mid' }, { exact: 'V32_CrowdCluster_R_Mid' }],
    params: {
      albedoColor: [0.1938, 0.2188, 0.2687],
      emissiveColor: [0.008, 0.01, 0.012],
      emissiveIntensity: 0.012,
      metallic: 0.04,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.64 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'crowd-cluster-near-graphite',
    match: [{ exact: 'V32_CrowdCluster_L_Near' }, { exact: 'V32_CrowdCluster_R_Near' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.01, 0.012, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.02, roughness: 0.64 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'crowd-wearable-glow-mid',
    match: [{ exact: 'V32_CrowdWearableGlow_L_Mid' }, { exact: 'V32_CrowdWearableGlow_R_Mid' }],
    params: {
      albedoColor: [0.085, 0.19, 0.25],
      emissiveColor: [0.008, 0.024, 0.032],
      emissiveIntensity: 0.06,
      metallic: 0.01,
      roughness: 0.28,
      alpha: 0.26,
      alphaBlend: true,
      clearCoat: { intensity: 0.02, roughness: 0.7 },
      environmentIntensity: 0.2,
    },
  },
  {
    key: 'crowd-wearable-glow-near',
    match: [{ exact: 'V32_CrowdWearableGlow_L_Near' }, { exact: 'V32_CrowdWearableGlow_R_Near' }],
    params: {
      albedoColor: [0.1, 0.22, 0.28],
      emissiveColor: [0.01, 0.032, 0.042],
      emissiveIntensity: 0.08,
      metallic: 0.01,
      roughness: 0.2,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'crown-rigging-structure',
    match: [{ exact: 'V72_CrownRiggingFrontTruss' }, { exact: 'V72_CrownRiggingRearTruss' }, { exact: 'V72_CrownRiggingCenterSpine' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'main-truss-tower-gold-crossbar',
    match: [{ exact: 'V83_MainTrussTowerGoldCrossbarArray_L' }, { exact: 'V83_MainTrussTowerGoldCrossbarArray_R' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'main-truss-tower-rig',
    match: [{ exact: 'V83_MainTrussTowerShellArray_L' }, { exact: 'V83_MainTrussTowerShellArray_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'main-truss-tower-diagonal',
    match: [{ exact: 'V83_MainTrussTowerDiagonalArray_L' }, { exact: 'V83_MainTrussTowerDiagonalArray_R' }],
    params: {
      albedoColor: [0.0312, 0.05, 0.0688],
      emissiveColor: [0.008, 0.038, 0.056],
      emissiveIntensity: 0.05,
      metallic: 0.03,
      roughness: 0.84,
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'wet-paver-stone-band',
    match: [{ exact: 'V85_WetPaverStoneBands' }],
    params: {
      albedoColor: [0.263, 0.287, 0.337],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'wet-paver-gold-seam',
    match: [{ exact: 'V85_WetPaverGoldSeamBands' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'spawn-wet-inset-pool',
    match: [{ exact: 'V86_SpawnWetInsetPoolArray_L' }, { exact: 'V86_SpawnWetInsetPoolArray_R' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.01, 0.025, 0.035],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.98,
      clearCoat: { intensity: 0.7, roughness: 0.08 },
      environmentIntensity: 0.86,
    },
  },
  {
    key: 'garden-stone-edge',
    match: [{ exact: 'V86_GardenStoneEdgeArray_L' }, { exact: 'V86_GardenStoneEdgeArray_R' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'basin-fountain-pedestal',
    match: [{ exact: 'V89_BasinFountainPedestalArray_L' }, { exact: 'V89_BasinFountainPedestalArray_R' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'basin-fountain-light',
    match: [{ exact: 'V89_BasinFountainLightArray_L' }, { exact: 'V89_BasinFountainLightArray_R' }],
    params: {
      albedoColor: [0.95, 0.7, 0.3],
      emissiveColor: [1, 0.68, 0.24],
      emissiveIntensity: 4.8,
      metallic: 0.02,
      roughness: 0.32,
      clearCoat: { intensity: 0.18, roughness: 0.24 },
      environmentIntensity: 0.42,
    },
  },
  {
    key: 'basin-fountain-jet',
    match: [{ exact: 'V89_BasinFountainJetArray_L' }, { exact: 'V89_BasinFountainJetArray_R' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.02, 0.16, 0.24],
      emissiveIntensity: 0.4,
      metallic: 0.01,
      roughness: 0.38,
      alpha: 0.94,
      clearCoat: { intensity: 0.4, roughness: 0.18 },
      environmentIntensity: 0.62,
    },
  },
  {
    key: 'arc-anchor-shadow-cluster',
    match: [{ exact: 'V75_ArcAnchorShadowCluster_L' }, { exact: 'V75_ArcAnchorShadowCluster_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'side-screen-anchor-shadow-brace',
    match: [{ exact: 'V76_SideScreenAnchorShadowBrace_L' }, { exact: 'V76_SideScreenAnchorShadowBrace_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'oval-screen-recess-gold-frame',
    match: [{ exact: 'V77_OvalScreenRecessGoldFrame_L' }, { exact: 'V77_OvalScreenRecessGoldFrame_R' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'oval-screen-recess-shadow-pocket',
    match: [{ exact: 'V77_OvalScreenRecessShadowPocket_L' }, { exact: 'V77_OvalScreenRecessShadowPocket_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.01, 0.06, 0.09],
      emissiveIntensity: 0.08,
      metallic: 0.04,
      roughness: 0.74,
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'oval-screen-pedestal-shell',
    match: [{ prefix: 'V80_OvalScreenPedestalShell_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.018,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.03, roughness: 0.72 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'oval-screen-canopy-shell',
    match: [{ prefix: 'V80_OvalScreenCanopyShell_' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.04, roughness: 0.68 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'oval-screen-buttress-shell',
    match: [{ prefix: 'V80_OvalScreenSideButtressShellArray_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.018,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'oval-screen-mullion-shell',
    match: [{ prefix: 'V81_OvalScreenMullionShellArray_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'oval-screen-pedestal-gold-trim',
    match: [{ prefix: 'V80_OvalScreenPedestalGoldTrim_' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.006, 0.004, 0.0015],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'oval-screen-canopy-gold-trim',
    match: [{ prefix: 'V80_OvalScreenCanopyGoldTrim_' }],
    params: {
      albedoColor: [0.2375, 0.1875, 0.0938],
      emissiveColor: [0.012, 0.009, 0.003],
      emissiveIntensity: 0.025,
      metallic: 0.22,
      roughness: 0.86,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'oval-screen-buttress-gold-trim',
    match: [{ prefix: 'V80_OvalScreenSideButtressGoldTrimArray_' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.009, 0.006, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'oval-screen-mullion-gold-trim',
    match: [{ prefix: 'V81_OvalScreenMullionGoldTrimArray_' }],
    params: {
      albedoColor: [0.1625, 0.125, 0.0562],
      emissiveColor: [0.005, 0.0035, 0.0012],
      emissiveIntensity: 0.014,
      metallic: 0.12,
      roughness: 0.93,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'basin-deck-relief',
    match: [{ prefix: 'V120_BasinDeckRelief_' }],
    params: {
      albedoColor: [0.1375, 0.1625, 0.2125],
      emissiveColor: [0.002, 0.003, 0.006],
      emissiveIntensity: 0.008,
      metallic: 0.02,
      roughness: 0.96,
      clearCoat: { intensity: 0.02, roughness: 0.78 },
      environmentIntensity: 0.04,
    },
  },
  {
    key: 'basin-retaining-relief',
    match: [{ prefix: 'V121_BasinRetainingRelief_' }],
    params: {
      albedoColor: [0.1875, 0.2125, 0.2625],
      emissiveColor: [0.004, 0.006, 0.01],
      emissiveIntensity: 0.01,
      metallic: 0.02,
      roughness: 0.94,
      clearCoat: { intensity: 0.02, roughness: 0.74 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'basin-wall-relief',
    match: [{ prefix: 'V118_BasinWallRelief_' }],
    params: {
      albedoColor: [0.2125, 0.2375, 0.2875],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.04, roughness: 0.76 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'basin-parapet-relief',
    match: [{ prefix: 'V99_BasinParapetRelief_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.01],
      emissiveIntensity: 0.014,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.04, roughness: 0.68 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'basin-bridge-relief',
    match: [{ exact: 'V121_BasinBridgeRelief_North' }, { exact: 'V121_BasinBridgeRelief_South' }, { exact: 'V121_BasinBridgeRelief_Center' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.014,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.03, roughness: 0.7 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'basin-channel-relief',
    match: [{ exact: 'V99_BasinChannelRelief' }],
    params: {
      albedoColor: [0.175, 0.2, 0.25],
      emissiveColor: [0.004, 0.006, 0.008],
      emissiveIntensity: 0.01,
      metallic: 0.02,
      roughness: 0.94,
      clearCoat: { intensity: 0.02, roughness: 0.74 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'basin-runway-spine',
    match: [{ exact: 'V99_BasinRunwaySpine' }],
    params: {
      albedoColor: [0.15, 0.1875, 0.2375],
      emissiveColor: [0.003, 0.004, 0.007],
      emissiveIntensity: 0.008,
      metallic: 0.02,
      roughness: 0.96,
      clearCoat: { intensity: 0.01, roughness: 0.78 },
      environmentIntensity: 0.05,
    },
  },
  {
    key: 'basin-retaining-wall',
    match: [{ exact: 'V99_BasinRetainingWall_L' }, { exact: 'V99_BasinRetainingWall_R' }],
    params: {
      albedoColor: [0.2, 0.2375, 0.2875],
      emissiveColor: [0.005, 0.007, 0.01],
      emissiveIntensity: 0.012,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.03, roughness: 0.72 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'central-water-light-housing',
    match: [{ exact: 'V100_CentralWaterLightHousingArray' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'central-water-light-gold-trim',
    match: [{ exact: 'V100_CentralWaterLightGoldTrimArray' }],
    params: {
      albedoColor: [0.2375, 0.1875, 0.075],
      emissiveColor: [0.005, 0.004, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'central-water-light-lens',
    match: [{ exact: 'V100_CentralWaterLightLensArray' }],
    params: {
      albedoColor: [0.08, 0.18, 0.24],
      emissiveColor: [0.01, 0.04, 0.06],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.42,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'portal-apron-relief-shell',
    match: [{ exact: 'V122_PortalApronRelief' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'stage-shoulder-relief-shell',
    match: [{ prefix: 'V122_StageShoulderRelief_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'central-stair-gold-nosing',
    match: [{ exact: 'V123_CentralStairGoldNosingArray' }],
    params: {
      albedoColor: [0.25, 0.2, 0.1],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.2,
      roughness: 0.86,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'spawn-route-gold-edge',
    match: [{ prefix: 'V123_SpawnRouteGoldEdgeArray_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0.008, 0.005, 0.001],
      emissiveIntensity: 0.018,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'spawn-route-wet-center-inlay',
    match: [{ exact: 'V123_SpawnRouteWetCenterInlayArray' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.01, 0.025, 0.035],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.98,
      clearCoat: { intensity: 0.7, roughness: 0.08 },
      environmentIntensity: 0.86,
    },
  },
  {
    key: 'crowd-control-frame',
    match: [{ prefix: 'V124_CrowdControlFrameArray_' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'crowd-control-rail',
    match: [{ prefix: 'V124_CrowdControlRailArray_' }],
    params: {
      albedoColor: [0.2013, 0.155, 0.0638],
      emissiveColor: [0.008, 0.0052, 0.0016],
      emissiveIntensity: 0.013,
      metallic: 0.16,
      roughness: 0.95,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.088,
    },
  },
  {
    key: 'crowd-barrier-base',
    match: [{ prefix: 'V125_CrowdBarrierBaseArray_' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'crowd-barrier-rail',
    match: [{ prefix: 'V125_CrowdBarrierRailArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'spawn-cable-trough-shell',
    match: [{ exact: 'V48_SpawnCableTroughBlackShell' }],
    params: {
      albedoColor: [0.15, 0.1875, 0.2375],
      emissiveColor: [0.008, 0.011, 0.015],
      emissiveIntensity: 0.018,
      metallic: 0.05,
      roughness: 0.88,
      clearCoat: { intensity: 0.03, roughness: 0.64 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'spawn-cable-trough-collar',
    match: [{ exact: 'V48_SpawnCableTroughGoldCollar' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.007, 0.004, 0.0012],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'spawn-cable-trough-wet-inset',
    match: [{ exact: 'V48_SpawnCableTroughWetInset' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.008, 0.02, 0.03],
      emissiveIntensity: 0.065,
      metallic: 0.02,
      roughness: 0.26,
      alpha: 0.98,
      clearCoat: { intensity: 0.64, roughness: 0.1 },
      environmentIntensity: 0.82,
    },
  },
  {
    key: 'screen-service-catwalk-frame',
    match: [{ exact: 'V49_ScreenServiceCatwalkBlackFrame' }],
    params: {
      albedoColor: [0.1625, 0.2, 0.25],
      emissiveColor: [0.008, 0.011, 0.015],
      emissiveIntensity: 0.018,
      metallic: 0.03,
      roughness: 0.92,
      clearCoat: { intensity: 0.02, roughness: 0.7 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'screen-service-catwalk-cable-loom',
    match: [{ exact: 'V49_ScreenServiceCatwalkCableLoom' }],
    params: {
      albedoColor: [0.15, 0.175, 0.225],
      emissiveColor: [0.006, 0.008, 0.01],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.68 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'screen-service-catwalk-guardrail',
    match: [{ exact: 'V49_ScreenServiceCatwalkGoldGuardrail' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0.008, 0.005, 0.0015],
      emissiveIntensity: 0.016,
      metallic: 0.14,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'screen-service-catwalk-practicals',
    match: [{ exact: 'V49_ScreenServiceCatwalkCyanPracticals' }],
    params: {
      albedoColor: [0.1, 0.22, 0.28],
      emissiveColor: [0.008, 0.038, 0.052],
      emissiveIntensity: 0.05,
      metallic: 0.02,
      roughness: 0.26,
      alpha: 0.39,
      alphaBlend: true,
      clearCoat: { intensity: 0.03, roughness: 0.66 },
      environmentIntensity: 0.2,
    },
  },
  {
    key: 'crown-side-rib-gold',
    match: [{ prefix: 'V39_CrownSideRibGoldCluster_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0.008, 0.005, 0.0015],
      emissiveIntensity: 0.016,
      metallic: 0.14,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'crown-side-rib-cyan',
    match: [{ prefix: 'V39_CrownSideRibCyanInset_' }],
    params: {
      albedoColor: [0.11, 0.23, 0.29],
      emissiveColor: [0.008, 0.04, 0.056],
      emissiveIntensity: 0.06,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.39,
      alphaBlend: true,
      clearCoat: { intensity: 0.03, roughness: 0.68 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'crown-blade-lamella-pearl',
    match: [{ prefix: 'V41_CrownBladePearlLamellaCluster_' }],
    params: {
      albedoColor: [0.3, 0.25, 0.125],
      emissiveColor: [0.012, 0.009, 0.004],
      emissiveIntensity: 0.022,
      metallic: 0.14,
      roughness: 0.86,
      clearCoat: { intensity: 0.03, roughness: 0.82 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'crown-blade-gold-reveal',
    match: [{ prefix: 'V41_CrownBladeGoldRevealCluster_' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.05],
      emissiveColor: [0.008, 0.005, 0.001],
      emissiveIntensity: 0.016,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'crown-blade-cyan-inset',
    match: [{ prefix: 'V41_CrownBladeCyanInsetCluster_' }],
    params: {
      albedoColor: [0.1, 0.2, 0.26],
      emissiveColor: [0.008, 0.036, 0.052],
      emissiveIntensity: 0.06,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.3,
      alphaBlend: true,
      clearCoat: { intensity: 0.03, roughness: 0.68 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'truss-diagonal-brace',
    match: [{ prefix: 'V42_TrussDiagonalBraceA_' }, { prefix: 'V42_TrussDiagonalBraceB_' }],
    params: {
      albedoColor: [0.0625, 0.0875, 0.1125],
      emissiveColor: [0.004, 0.014, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.06,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'production-truss-tower-frame',
    match: [{ prefix: 'V37_ProductionTrussTowerFrame_' }],
    params: {
      albedoColor: [0.2, 0.2375, 0.2875],
      emissiveColor: [0.012, 0.02, 0.028],
      emissiveIntensity: 0.03,
      metallic: 0.1,
      roughness: 0.8,
      clearCoat: { intensity: 0.03, roughness: 0.56 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'production-truss-cross-brace',
    match: [{ prefix: 'V37_ProductionTrussCrossBrace_' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.006, 0.018, 0.026],
      emissiveIntensity: 0.02,
      metallic: 0.06,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'production-tower-service-ladder',
    match: [{ prefix: 'V37_ProductionTowerServiceLadder_' }],
    params: {
      albedoColor: [0.25, 0.2, 0.1],
      emissiveColor: [0.008, 0.005, 0.001],
      emissiveIntensity: 0.02,
      metallic: 0.2,
      roughness: 0.86,
      clearCoat: { intensity: 0.01, roughness: 0.78 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'production-tower-beacon',
    match: [{ prefix: 'V37_ProductionTowerBeaconArray_' }],
    params: {
      albedoColor: [0.1, 0.21, 0.26],
      emissiveColor: [0.008, 0.028, 0.038],
      emissiveIntensity: 0.06,
      metallic: 0.02,
      roughness: 0.2,
      alpha: 0.28,
      alphaBlend: true,
      clearCoat: { intensity: 0.02, roughness: 0.68 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'wing-facade-arcade-pier',
    match: [{ prefix: 'V38_WingFacadeArcadePierCluster_' }],
    params: {
      albedoColor: [0.2375, 0.2562, 0.3],
      emissiveColor: [0.005, 0.008, 0.011],
      emissiveIntensity: 0.022,
      metallic: 0.03,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.68 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'wing-facade-gold-capital',
    match: [{ prefix: 'V38_WingFacadeGoldCapital_' }],
    params: {
      albedoColor: [0.2375, 0.19, 0.0825],
      emissiveColor: [0.011, 0.008, 0.0023],
      emissiveIntensity: 0.018,
      metallic: 0.19,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.82 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'wing-facade-shadow-reveal',
    match: [{ prefix: 'V38_WingFacadeShadowReveal_' }],
    params: {
      albedoColor: [0.1, 0.125, 0.16],
      emissiveColor: [0.006, 0.009, 0.012],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.92,
      clearCoat: { intensity: 0.01, roughness: 0.78 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'crown-light-drop-cable',
    match: [{ exact: 'V46_CrownLightDropCableCluster' }],
    params: {
      albedoColor: [0.15, 0.2, 0.25],
      emissiveColor: [0.004, 0.005, 0.007],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.76 },
      environmentIntensity: 0.18,
      metadataPolish: 'black',
    },
  },
  {
    key: 'crown-moving-light-housing',
    match: [{ exact: 'V46_CrownMovingLightHousingCluster' }],
    params: {
      albedoColor: [0.1875, 0.2375, 0.2875],
      emissiveColor: [0.008, 0.01, 0.013],
      emissiveIntensity: 0.024,
      metallic: 0.05,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.66 },
      environmentIntensity: 0.28,
      metadataPolish: 'black',
    },
  },
  {
    key: 'crown-moving-light-lens',
    match: [{ exact: 'V46_CrownCyanLensCluster' }],
    params: {
      albedoColor: [0.11, 0.23, 0.29],
      emissiveColor: [0.012, 0.056, 0.078],
      emissiveIntensity: 0.096,
      metallic: 0.02,
      roughness: 0.16,
      alpha: 0.28,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.56 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'wing-facade-shadow-frame',
    match: [{ prefix: 'V87_WingFacadeShadowFrameArray_' }],
    params: {
      albedoColor: [0.12, 0.15, 0.19],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'wing-facade-shadow-vault',
    match: [{ prefix: 'V87_WingFacadeShadowVaultArray_' }],
    params: {
      albedoColor: [0.1375, 0.175, 0.225],
      emissiveColor: [0.004, 0.006, 0.009],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.94,
      clearCoat: { intensity: 0.02, roughness: 0.78 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'proscenium-shadow-pocket',
    match: [{ prefix: 'V116_ProsceniumShadowPocketArray_' }],
    params: {
      albedoColor: [0.14, 0.17, 0.21],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'wing-facade-gold-lintel',
    match: [{ prefix: 'V87_WingFacadeGoldLintelArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'vip-shell-fascia',
    match: [{ prefix: 'V30_VipShellFascia_' }],
    params: {
      albedoColor: [0.225, 0.2625, 0.3125],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.04, roughness: 0.54 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'rear-cathedral-lancet-pearl',
    match: [{ prefix: 'V88_RearCathedralLancetPearlArray_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'rear-cathedral-lancet-frame',
    match: [{ prefix: 'V88_RearCathedralLancetFrameArray_' }],
    params: {
      albedoColor: [0.14, 0.17, 0.21],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'rear-cathedral-lancet-gold',
    match: [{ prefix: 'V88_RearCathedralLancetGoldArray_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'festival-field-night',
    match: [{ exact: 'FestivalField' }],
    params: {
      albedoColor: [0.075, 0.1, 0.125],
      emissiveColor: [0.003, 0.006, 0.009],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.94,
      clearCoat: { intensity: 0.04, roughness: 0.56 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'approach-paver-field',
    match: [{ exact: 'V34_ApproachPaverField' }],
    params: {
      albedoColor: [0.175, 0.1688, 0.1625],
      emissiveColor: [0.01, 0.012, 0.015],
      emissiveIntensity: 0.05,
      metallic: 0.06,
      roughness: 0.58,
      clearCoat: { intensity: 0.26, roughness: 0.2 },
      environmentIntensity: 0.5,
    },
  },
  {
    key: 'approach-reflection-underlay',
    match: [{ exact: 'V34_ApproachReflectionUnderlay' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.01, 0.025, 0.035],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.98,
      clearCoat: { intensity: 0.7, roughness: 0.08 },
      environmentIntensity: 0.86,
    },
  },
  {
    key: 'approach-gold-inlay-network',
    match: [{ exact: 'V34_ApproachGoldInlayNetwork' }],
    params: {
      albedoColor: [0.1812, 0.1375, 0.0562],
      emissiveColor: [0.008, 0.005, 0.002],
      emissiveIntensity: 0.014,
      metallic: 0.1,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'approach-edge-rail',
    match: [{ prefix: 'V34_ApproachEdgeRail_' }],
    params: {
      albedoColor: [0.25, 0.2, 0.0875],
      emissiveColor: [0.012, 0.009, 0.003],
      emissiveIntensity: 0.018,
      metallic: 0.2,
      roughness: 0.82,
      clearCoat: { intensity: 0.03, roughness: 0.72 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'back-plaza-gateway-gold-crown',
    match: [{ prefix: 'V34_BackPlazaGatewayGoldCrown_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.016,
      metallic: 0.18,
      roughness: 0.86,
      clearCoat: { intensity: 0.02, roughness: 0.76 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'back-plaza-banner-rail',
    match: [{ prefix: 'V34_BackPlazaBannerRail_' }],
    params: {
      albedoColor: [0.175, 0.1375, 0.0625],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.012,
      metallic: 0.12,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'approach-barricade-assembly',
    match: [{ prefix: 'V34_BarricadeAssembly_' }],
    params: {
      albedoColor: [0.15, 0.1812, 0.225],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.68 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'crown-crystal-gold-edge',
    match: [{ exact: 'V112_CrownCrystalGoldEdgeArray' }],
    params: {
      albedoColor: [0.24, 0.1862, 0.08],
      emissiveColor: [0.012, 0.0084, 0.0026],
      emissiveIntensity: 0.024,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.82 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'crown-shell-lamella',
    match: [{ prefix: 'V113_CrownShellLamellaArray_' }],
    params: {
      albedoColor: [0.275, 0.225, 0.1],
      emissiveColor: [0.01, 0.008, 0.004],
      emissiveIntensity: 0.02,
      metallic: 0.22,
      roughness: 0.82,
      clearCoat: { intensity: 0.02, roughness: 0.78 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'crown-shell-gold-seam',
    match: [{ prefix: 'V113_CrownShellGoldSeamArray_' }],
    params: {
      albedoColor: [0.205, 0.1575, 0.065],
      emissiveColor: [0.006, 0.0042, 0.0014],
      emissiveIntensity: 0.012,
      metallic: 0.13,
      roughness: 0.93,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'celestial-halo-outer-ring',
    match: [{ exact: 'V114_CelestialHaloOuterRingArray' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'celestial-halo-inner-ring',
    match: [{ exact: 'V114_CelestialHaloInnerRingArray' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'celestial-halo-cyan-edge',
    match: [{ exact: 'V114_CelestialHaloCyanEdgeArray' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.01, 0.05, 0.07],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.36,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'center-screen-mullion',
    match: [{ exact: 'V115_CenterScreenMullionArray' }],
    params: {
      albedoColor: [0.25, 0.1938, 0.085],
      emissiveColor: [0.012, 0.008, 0.0025],
      emissiveIntensity: 0.022,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.82 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'center-screen-cyan-edge',
    match: [{ exact: 'V115_CenterScreenCyanEdgeArray' }],
    params: {
      albedoColor: [0.1, 0.22, 0.28],
      emissiveColor: [0.014, 0.058, 0.082],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.2,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.58 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'basin-water-sheet',
    match: [{ prefix: 'V118_BasinWaterSheet_' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.01, 0.025, 0.035],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.98,
      clearCoat: { intensity: 0.7, roughness: 0.08 },
      environmentIntensity: 0.86,
    },
  },
  {
    key: 'oval-portal-glow-gold',
    match: [{ prefix: 'V119_OvalPortalGlowGoldArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'oval-portal-glow-emission',
    match: [{ prefix: 'V119_OvalPortalGlowEmissionArray_' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.01, 0.05, 0.07],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.36,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'rear-shell-panel',
    match: [{ prefix: 'V111_RearShellPanelArray_' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.03, roughness: 0.64 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'basin-stone-coping',
    match: [{ prefix: 'V90_BasinStoneCopingArray_' }],
    params: {
      albedoColor: [0.163, 0.156, 0.144],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.02,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.64 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'crown-buttress-gold-inlay',
    match: [{ prefix: 'V98_CrownButtressGoldInlay_' }],
    params: {
      albedoColor: [0.185, 0.1363, 0.055],
      emissiveColor: [0.0036, 0.0023, 0.0008],
      emissiveIntensity: 0.008,
      metallic: 0.11,
      roughness: 0.93,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'crown-buttress-relief',
    match: [{ prefix: 'V98_CrownButtressRelief_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'outer-wing-buttress-shell',
    match: [{ prefix: 'V107_OuterWingButtressArray_' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'wing-facade-arch-inlay',
    match: [{ prefix: 'V109_WingFacadeArchInlayArray_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'wing-facade-inset-glow',
    match: [{ prefix: 'V110_WingFacadeInsetGlowArray_' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.01, 0.05, 0.07],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.36,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'wide-hero-screen-gold-frame',
    match: [{ exact: 'V126_WideHeroScreenGoldFrame' }],
    params: {
      albedoColor: [0.2175, 0.165, 0.07],
      emissiveColor: [0.004, 0.0024, 0.0009],
      emissiveIntensity: 0.012,
      metallic: 0.15,
      roughness: 0.89,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'wide-hero-screen-gold-mullion',
    match: [{ exact: 'V126_WideHeroScreenGoldMullionArray' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.14,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'wide-hero-screen-gold-crossbar',
    match: [{ exact: 'V126_WideHeroScreenGoldCrossbarArray' }],
    params: {
      albedoColor: [0.2225, 0.17, 0.0725],
      emissiveColor: [0.005, 0.0032, 0.0011],
      emissiveIntensity: 0.012,
      metallic: 0.17,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.82 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'wide-hero-screen-ivory-header',
    match: [{ exact: 'V126_WideHeroScreenIvoryHeader' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.006, 0.009, 0.014],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.06, roughness: 0.68 },
      environmentIntensity: 0.15,
    },
  },
  {
    key: 'wide-hero-screen-ivory-footer',
    match: [{ exact: 'V126_WideHeroScreenIvoryFooter' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.004, 0.005, 0.008],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.74 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'crown-screen-shadow-coffer',
    match: [{ exact: 'V127_CrownScreenShadowCoffer' }],
    params: {
      albedoColor: [0.075, 0.1, 0.125],
      emissiveColor: [0.012, 0.052, 0.076],
      emissiveIntensity: 0.09,
      metallic: 0.04,
      roughness: 0.3,
      clearCoat: { intensity: 0.5, roughness: 0.12 },
      environmentIntensity: 0.5,
    },
  },
  {
    key: 'crown-screen-vertical-keystone',
    match: [{ exact: 'V127_CrownScreenVerticalKeystone' }],
    params: {
      albedoColor: [0.1975, 0.15, 0.0675],
      emissiveColor: [0.008, 0.0055, 0.0018],
      emissiveIntensity: 0.018,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0.03, roughness: 0.8 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'center-screen-side-pier-gold-frame',
    match: [{ exact: 'V78_CenterScreenSidePierGoldFrame_L' }, { exact: 'V78_CenterScreenSidePierGoldFrame_R' }],
    params: {
      albedoColor: [0.225, 0.17, 0.0725],
      emissiveColor: [0.006, 0.004, 0.0012],
      emissiveIntensity: 0.014,
      metallic: 0.16,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.82 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'center-screen-side-pier-cyan-core',
    match: [{ exact: 'V78_CenterScreenSidePierCyanCore_L' }, { exact: 'V78_CenterScreenSidePierCyanCore_R' }],
    params: {
      albedoColor: [0.1, 0.22, 0.28],
      emissiveColor: [0.012, 0.042, 0.056],
      emissiveIntensity: 0.088,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.34,
      alphaBlend: true,
      clearCoat: { intensity: 0.08, roughness: 0.56 },
      environmentIntensity: 0.36,
    },
  },
  {
    key: 'center-screen-gold-interrupt-rail',
    match: [{ exact: 'V128_CenterScreenGoldInterruptRailArray' }],
    params: {
      albedoColor: [0.1812, 0.1325, 0.0525],
      emissiveColor: [0.004, 0.0025, 0.0009],
      emissiveIntensity: 0.01,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.07,
    },
  },
  {
    key: 'center-screen-depth-baffle-array',
    match: [{ exact: 'V129_CenterScreenDepthBaffleArray' }],
    params: {
      albedoColor: [0.075, 0.1, 0.125],
      emissiveColor: [0.008, 0.032, 0.05],
      emissiveIntensity: 0.06,
      metallic: 0.04,
      roughness: 0.3,
      clearCoat: { intensity: 0.5, roughness: 0.12 },
      environmentIntensity: 0.5,
    },
  },
  {
    key: 'wing-screen-depth-baffle-array',
    match: [{ exact: 'V131_WingScreenDepthBaffleArray_L' }, { exact: 'V131_WingScreenDepthBaffleArray_R' }],
    params: {
      albedoColor: [0.0375, 0.0625, 0.0875],
      emissiveColor: [0.006, 0.03, 0.05],
      emissiveIntensity: 0.05,
      metallic: 0.04,
      roughness: 0.3,
      clearCoat: { intensity: 0.5, roughness: 0.12 },
      environmentIntensity: 0.5,
    },
  },
  {
    key: 'wing-screen-shadow-coffer-array',
    match: [{ exact: 'V132_WingScreenShadowCofferArray_L' }, { exact: 'V132_WingScreenShadowCofferArray_R' }],
    params: {
      albedoColor: [0.05, 0.075, 0.1],
      emissiveColor: [0.008, 0.04, 0.06],
      emissiveIntensity: 0.06,
      metallic: 0.05,
      roughness: 0.3,
      clearCoat: { intensity: 0.5, roughness: 0.12 },
      environmentIntensity: 0.5,
    },
  },
  {
    key: 'center-screen-shadow-coffer-array',
    match: [{ exact: 'V130_CenterScreenShadowCofferArray' }],
    params: {
      albedoColor: [0.0875, 0.1125, 0.1375],
      emissiveColor: [0.01, 0.042, 0.06],
      emissiveIntensity: 0.07,
      metallic: 0.05,
      roughness: 0.3,
      clearCoat: { intensity: 0.5, roughness: 0.12 },
      environmentIntensity: 0.5,
    },
  },
  {
    key: 'promenade-pearl-runway',
    match: [{ exact: 'V70_PromenadePearlRunway' }],
    params: {
      albedoColor: [0.3, 0.275, 0.25],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.02,
      roughness: 0.55,
      clearCoat: { intensity: 0, roughness: 0.76 },
      environmentIntensity: 0.4,
    },
  },
  {
    key: 'promenade-gold-shoulders',
    match: [{ exact: 'V70_PromenadeGoldShoulders' }],
    params: {
      albedoColor: [0.2, 0.1537, 0.0688],
      emissiveColor: [0.0115, 0.0072, 0.003],
      emissiveIntensity: 0.013,
      metallic: 0.18,
      roughness: 0.94,
      environmentIntensity: 0.085,
    },
  },
  {
    key: 'promenade-cyan-spine',
    match: [{ exact: 'V70_PromenadeCyanSpine' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.015, 0.045, 0.06],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.38,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.6 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'promenade-shadow-keel',
    match: [{ exact: 'V70_PromenadeShadowKeel' }],
    params: {
      albedoColor: [0.14, 0.17, 0.21],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'vip-glass-balustrade',
    match: [{ prefix: 'V30_VipGlassBalustrade_' }],
    params: {
      albedoColor: [0.0625, 0.0875, 0.1],
      emissiveColor: [0, 0.01, 0.015],
      emissiveIntensity: 0.01,
      metallic: 0.02,
      roughness: 0.72,
      alpha: 0.18,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'wing-glass-balustrade',
    match: [{ prefix: 'V30_WingGlassBalustrade_' }],
    params: {
      albedoColor: [0.0625, 0.1, 0.125],
      emissiveColor: [0, 0.012, 0.018],
      emissiveIntensity: 0.015,
      metallic: 0.02,
      roughness: 0.72,
      alpha: 0.22,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'oculus-canopy',
    match: [{ prefix: 'V51_OculusCanopy_' }],
    params: {
      albedoColor: [0.1375, 0.1, 0.0438],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0.01,
      metallic: 0.14,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'shoulder-crown-mass-ivory',
    match: [{ prefix: 'V51_ShoulderCrownMass_' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.03, roughness: 0.66 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'rear-cathedral-mass-ivory',
    match: [{ prefix: 'V51_RearCathedralMass_' }],
    params: {
      albedoColor: [0.325, 0.35, 0.4],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.84,
      clearCoat: { intensity: 0.05, roughness: 0.62 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'rear-cathedral-pearl-core',
    match: [{ exact: 'V51_RearCathedralCore' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'proscenium-pylon-pearl-shell',
    match: [{ prefix: 'V51_ProsceniumPylon_' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.004, 0.006, 0.009],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.76 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'spawn-gallery-arcade-pearl',
    match: [{ prefix: 'V53_SpawnGalleryArcadePearl_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'spawn-gallery-cornice-gold',
    match: [{ prefix: 'V53_SpawnGalleryCorniceGold_' }],
    params: {
      albedoColor: [0.1812, 0.1313, 0.0525],
      emissiveColor: [0, 0, 0],
      emissiveIntensity: 0,
      metallic: 0.1,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'spawn-gallery-halo-gold',
    match: [{ prefix: 'V53_SpawnGalleryHaloGold_' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'spawn-gallery-arcade-shadow',
    match: [{ prefix: 'V53_SpawnGalleryShadowSpine_' }],
    params: {
      albedoColor: [0.12, 0.16, 0.2],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.018,
      metallic: 0.06,
      roughness: 0.88,
      clearCoat: { intensity: 0.03, roughness: 0.64 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'spawn-gallery-arcade-cyan',
    match: [{ prefix: 'V53_SpawnGalleryCyanLancets_' }],
    params: {
      albedoColor: [0.1, 0.21, 0.27],
      emissiveColor: [0.012, 0.038, 0.052],
      emissiveIntensity: 0.082,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.34,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.64 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'spawn-pylon-pearl-shell',
    match: [{ prefix: 'V55_SpawnPylonPearlShell_' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'spawn-pylon-gold-crown',
    match: [{ prefix: 'V55_SpawnPylonGoldCrown_' }],
    params: {
      albedoColor: [0.21, 0.17, 0.07],
      emissiveColor: [0.008, 0.0055, 0.0015],
      emissiveIntensity: 0.014,
      metallic: 0.18,
      roughness: 0.86,
      clearCoat: { intensity: 0.01, roughness: 0.8 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'spawn-pylon-shadow-spine',
    match: [{ prefix: 'V55_SpawnPylonShadowSpine_' }],
    params: {
      albedoColor: [0.098, 0.122, 0.156],
      emissiveColor: [0.0055, 0.008, 0.011],
      emissiveIntensity: 0.013,
      metallic: 0.06,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.68 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'spawn-pylon-cyan-core',
    match: [{ prefix: 'V55_SpawnPylonCyanCore_' }],
    params: {
      albedoColor: [0.076, 0.168, 0.214],
      emissiveColor: [0.0085, 0.026, 0.036],
      emissiveIntensity: 0.067,
      metallic: 0.02,
      roughness: 0.28,
      alpha: 0.28,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.62 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'spawn-canopy-pearl-vault',
    match: [{ prefix: 'V56_SpawnCanopyPearlVault_' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.04, roughness: 0.66 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'spawn-canopy-gold-crest',
    match: [{ prefix: 'V56_SpawnCanopyGoldCrest_' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.0813],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.16,
      roughness: 0.88,
      clearCoat: { intensity: 0, roughness: 0.84 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'spawn-canopy-shadow-soffit',
    match: [{ prefix: 'V56_SpawnCanopyShadowSoffit_' }],
    params: {
      albedoColor: [0.12, 0.145, 0.18],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.016,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.64 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'spawn-canopy-cyan-lantern',
    match: [{ prefix: 'V56_SpawnCanopyCyanLantern_' }],
    params: {
      albedoColor: [0.09, 0.2, 0.25],
      emissiveColor: [0.008, 0.028, 0.038],
      emissiveIntensity: 0.07,
      metallic: 0.01,
      roughness: 0.22,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.66 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'basin-causeway-pearl-span',
    match: [{ exact: 'V62_BasinCausewayPearlSpan' }],
    params: {
      albedoColor: [0.225, 0.237, 0.287],
      emissiveColor: [0.004, 0.006, 0.01],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.76 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'basin-garden-terrace',
    match: [{ prefix: 'V63_BasinGardenTerrace_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'basin-water-parterre',
    match: [{ exact: 'V63_BasinWaterParterre' }],
    params: {
      albedoColor: [0.025, 0.05, 0.075],
      emissiveColor: [0.004, 0.012, 0.018],
      emissiveIntensity: 0.025,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.74,
      clearCoat: { intensity: 0.62, roughness: 0.1 },
      environmentIntensity: 0.38,
    },
  },
  {
    key: 'basin-screen-reflection-veil',
    match: [{ exact: 'V63_BasinScreenReflectionVeil' }],
    params: {
      albedoColor: [0.05, 0.0875, 0.1125],
      emissiveColor: [0.002, 0.012, 0.018],
      emissiveIntensity: 0.03,
      metallic: 0.02,
      roughness: 0.22,
      alpha: 0.12,
      alphaBlend: true,
      clearCoat: { intensity: 0, roughness: 0.82 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'arrival-runway-pearl-bands',
    match: [{ exact: 'V65_ArrivalRunwayPearlBands' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'arrival-runway-gold-bands',
    match: [{ exact: 'V65_ArrivalRunwayGoldBands' }],
    params: {
      albedoColor: [0.2025, 0.1562, 0.065],
      emissiveColor: [0.0082, 0.0053, 0.0016],
      emissiveIntensity: 0.014,
      metallic: 0.16,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'arrival-threshold-gold-bands',
    match: [{ exact: 'V65_ArrivalThresholdGoldBands' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.006, 0.004, 0.0015],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'arrival-runway-cyan-threads',
    match: [{ exact: 'V65_ArrivalRunwayCyanThreads' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.01, 0.05, 0.07],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.36,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'arrival-threshold-shadow-grooves',
    match: [{ exact: 'V65_ArrivalThresholdShadowGrooves' }],
    params: {
      albedoColor: [0.14, 0.17, 0.21],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'plaza-lantern-stem',
    match: [{ exact: 'V44_PlazaLanternStemCluster' }],
    params: {
      albedoColor: [0.1875, 0.225, 0.275],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.022,
      metallic: 0.1,
      roughness: 0.8,
      clearCoat: { intensity: 0.05, roughness: 0.54 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'plaza-lantern-gold-hardware',
    match: [{ exact: 'V44_PlazaLanternGoldHardware' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0625],
      emissiveColor: [0.008, 0.005, 0.0015],
      emissiveIntensity: 0.016,
      metallic: 0.14,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'plaza-lantern-warm-core',
    match: [{ exact: 'V44_PlazaLanternWarmCore' }],
    params: {
      albedoColor: [0.95, 0.775, 0.375],
      emissiveColor: [1, 0.74, 0.28],
      emissiveIntensity: 5.2,
      metallic: 0.02,
      roughness: 0.28,
      clearCoat: { intensity: 0.2, roughness: 0.22 },
      environmentIntensity: 0.46,
    },
  },
  {
    key: 'plaza-lantern-halo-rim',
    match: [{ exact: 'V44_PlazaLanternHaloRim' }],
    params: {
      albedoColor: [0.3, 0.225, 0.1063],
      emissiveColor: [0.14, 0.095, 0.036],
      emissiveIntensity: 0.092,
      metallic: 0.1,
      roughness: 0.74,
      clearCoat: { intensity: 0.05, roughness: 0.48 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'approach-light-stem',
    match: [{ prefix: 'V40_ApproachLightStem_' }],
    params: {
      albedoColor: [0.15, 0.1875, 0.2375],
      emissiveColor: [0.008, 0.012, 0.018],
      emissiveIntensity: 0.016,
      metallic: 0.12,
      roughness: 0.8,
      clearCoat: { intensity: 0.05, roughness: 0.5 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'approach-light-housing',
    match: [{ prefix: 'V40_ApproachLightHousing_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.0688],
      emissiveColor: [0.008, 0.005, 0.0018],
      emissiveIntensity: 0.014,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'approach-light-core',
    match: [{ prefix: 'V40_ApproachLightCore_' }],
    params: {
      albedoColor: [0.1, 0.22, 0.28],
      emissiveColor: [0.008, 0.04, 0.056],
      emissiveIntensity: 0.056,
      metallic: 0.02,
      roughness: 0.28,
      alpha: 0.39,
      alphaBlend: true,
      clearCoat: { intensity: 0.03, roughness: 0.68 },
      environmentIntensity: 0.2,
    },
  },
  {
    key: 'approach-light-halo',
    match: [{ prefix: 'V40_ApproachLightHalo_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.0813],
      emissiveColor: [0.07, 0.046, 0.016],
      emissiveIntensity: 0.05,
      metallic: 0.12,
      roughness: 0.84,
      clearCoat: { intensity: 0.03, roughness: 0.56 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'arrival-plinth-pearl-dais',
    match: [{ prefix: 'V58_ArrivalPlinthPearlDais_' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'arrival-plinth-gold-inlay',
    match: [{ prefix: 'V58_ArrivalPlinthGoldInlay_' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.075],
      emissiveColor: [0.008, 0.0055, 0.0018],
      emissiveIntensity: 0.013,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'arrival-plinth-cyan-spine',
    match: [{ prefix: 'V58_ArrivalPlinthCyanSpine_' }],
    params: {
      albedoColor: [0.1, 0.21, 0.27],
      emissiveColor: [0.012, 0.036, 0.048],
      emissiveIntensity: 0.085,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.3,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.64 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'arrival-plinth-shadow-reveal',
    match: [{ prefix: 'V58_ArrivalPlinthShadowReveal_' }],
    params: {
      albedoColor: [0.11, 0.14, 0.18],
      emissiveColor: [0.008, 0.011, 0.015],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.64 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'back-plaza-lantern-stem',
    match: [{ prefix: 'V59_BackPlazaLanternStemCluster_' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'back-plaza-lantern-gold-cage',
    match: [{ prefix: 'V59_BackPlazaLanternGoldCage_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'back-plaza-lantern-warm-core',
    match: [{ prefix: 'V59_BackPlazaLanternWarmCore_' }],
    params: {
      albedoColor: [0.95, 0.7, 0.3],
      emissiveColor: [1, 0.68, 0.24],
      emissiveIntensity: 4.8,
      metallic: 0.02,
      roughness: 0.32,
      clearCoat: { intensity: 0.18, roughness: 0.24 },
      environmentIntensity: 0.42,
    },
  },
  {
    key: 'back-plaza-lantern-halo-rim',
    match: [{ prefix: 'V59_BackPlazaLanternHaloRim_' }],
    params: {
      albedoColor: [0.275, 0.2125, 0.1],
      emissiveColor: [0.12, 0.08, 0.03],
      emissiveIntensity: 0.08,
      metallic: 0.1,
      roughness: 0.78,
      clearCoat: { intensity: 0.04, roughness: 0.52 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'promenade-pearl-ribbon',
    match: [{ exact: 'V64_PromenadePearlRibbon' }],
    params: {
      albedoColor: [0.2687, 0.2937, 0.3425],
      emissiveColor: [0.004, 0.007, 0.01],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.68 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'plaza-paver-pearl-bands',
    match: [{ exact: 'V69_PlazaPaverPearlBands' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.6,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.38,
    },
  },
  {
    key: 'plaza-paver-gold-filigree',
    match: [{ exact: 'V69_PlazaPaverGoldFiligree' }],
    params: {
      albedoColor: [0.19, 0.1475, 0.065],
      emissiveColor: [0.0105, 0.0068, 0.0027],
      emissiveIntensity: 0.011,
      metallic: 0.18,
      roughness: 0.94,
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'portal-arcade-pearl-shell',
    match: [{ prefix: 'V68_PortalArcadePearl_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.89,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'grand-arcade-pearl-colonnade',
    match: [{ prefix: 'V68_GrandArcadePearlColonnade_' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.008, 0.012, 0.017],
      emissiveIntensity: 0.025,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.05, roughness: 0.6 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'hero-portal-center-pearl-apron',
    match: [{ exact: 'V68_HeroPortalPearlApron' }],
    params: {
      albedoColor: [0.2125, 0.25, 0.3],
      emissiveColor: [0.003, 0.005, 0.008],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.03, roughness: 0.7 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'portal-arcade-gold-crest',
    match: [{ exact: 'V68_PortalArcadeGoldCrest_L' }, { exact: 'V68_PortalArcadeGoldCrest_R' }],
    params: {
      albedoColor: [0.1975, 0.1525, 0.0688],
      emissiveColor: [0.0115, 0.0075, 0.003],
      emissiveIntensity: 0.013,
      metallic: 0.18,
      roughness: 0.93,
      environmentIntensity: 0.088,
    },
  },
  {
    key: 'portal-arcade-cyan-spine',
    match: [{ exact: 'V68_PortalArcadeCyanSpine_L' }, { exact: 'V68_PortalArcadeCyanSpine_R' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.015, 0.045, 0.06],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.38,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.6 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'portal-arcade-shadow-core',
    match: [{ exact: 'V68_PortalArcadeShadowCore_L' }, { exact: 'V68_PortalArcadeShadowCore_R' }],
    params: {
      albedoColor: [0.12, 0.15, 0.19],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'hero-portal-gold-cap',
    match: [{ exact: 'V68_HeroPortalGoldCap' }],
    params: {
      albedoColor: [0.205, 0.1588, 0.0725],
      emissiveColor: [0.0125, 0.008, 0.0033],
      emissiveIntensity: 0.015,
      metallic: 0.18,
      roughness: 0.92,
      environmentIntensity: 0.095,
    },
  },
  {
    key: 'hero-portal-cyan-plinth',
    match: [{ exact: 'V68_HeroPortalCyanPlinth' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.015, 0.045, 0.06],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.38,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.6 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'hero-portal-shadow-dais',
    match: [{ exact: 'V68_HeroPortalShadowDais' }],
    params: {
      albedoColor: [0.14, 0.17, 0.21],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'grand-arcade-gold-bands',
    match: [{ exact: 'V68_GrandArcadeGoldBands_L' }, { exact: 'V68_GrandArcadeGoldBands_R' }],
    params: {
      albedoColor: [0.225, 0.175, 0.0875],
      emissiveColor: [0.018, 0.012, 0.005],
      emissiveIntensity: 0.02,
      metallic: 0.18,
      roughness: 0.88,
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'rear-mass-aurora-pearl',
    match: [{ prefix: 'V61_RearMassAuroraPearl_' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'rear-mass-aurora-gold-spine',
    match: [{ prefix: 'V61_RearMassAuroraGoldSpine_' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.0775],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.017,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'rear-mass-aurora-cyan-core',
    match: [{ prefix: 'V61_RearMassAuroraCyanCore_' }],
    params: {
      albedoColor: [0.09, 0.19, 0.24],
      emissiveColor: [0.01, 0.03, 0.042],
      emissiveIntensity: 0.076,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.66 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'rear-mass-aurora-shadow-ribbon',
    match: [{ prefix: 'V61_RearMassAuroraShadowRibbon_' }],
    params: {
      albedoColor: [0.11, 0.135, 0.17],
      emissiveColor: [0.007, 0.01, 0.013],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'back-plaza-sentinel-pearl',
    match: [{ prefix: 'V57_BackPlazaSentinelPearl_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'back-plaza-sentinel-gold-crown',
    match: [{ prefix: 'V57_BackPlazaSentinelGoldCrown_' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.0775],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.017,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'back-plaza-sentinel-cyan-spine',
    match: [{ prefix: 'V57_BackPlazaSentinelCyanSpine_' }],
    params: {
      albedoColor: [0.09, 0.19, 0.24],
      emissiveColor: [0.01, 0.03, 0.042],
      emissiveIntensity: 0.076,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.66 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'back-plaza-sentinel-shadow-core',
    match: [{ prefix: 'V57_BackPlazaSentinelShadowCore_' }],
    params: {
      albedoColor: [0.11, 0.135, 0.17],
      emissiveColor: [0.007, 0.01, 0.013],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'back-plaza-sightline-pearl-posts',
    match: [{ prefix: 'V66_BackPlazaSightlinePearlPostCluster_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'vip-garden-pearl-basin',
    match: [{ prefix: 'V67_VipGardenPearlBasin_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'vip-garden-reflecting-pool',
    match: [{ exact: 'V67_VipGardenReflectingPool_L' }, { exact: 'V67_VipGardenReflectingPool_R' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.68 },
      environmentIntensity: 0.16,
      metadataPolish: 'black',
    },
  },
  {
    key: 'vip-garden-gold-rib-canopy',
    match: [{ exact: 'V67_VipGardenGoldRibCanopy_L' }, { exact: 'V67_VipGardenGoldRibCanopy_R' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'wayfinding-pylon-pearl-shell',
    match: [{ exact: 'V43_WayfindingPylonPearlShell' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'wayfinding-pylon-gold-crown',
    match: [{ exact: 'V43_WayfindingPylonGoldCrown' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.0813],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.17,
      roughness: 0.88,
      clearCoat: { intensity: 0, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'wayfinding-pylon-cyan-glyph',
    match: [{ exact: 'V43_WayfindingPylonCyanGlyph' }],
    params: {
      albedoColor: [0.09, 0.2, 0.25],
      emissiveColor: [0.008, 0.03, 0.04],
      emissiveIntensity: 0.07,
      metallic: 0.01,
      roughness: 0.22,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.66 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'pyro-pod-pearl-shell',
    match: [{ exact: 'V45_PyroPodPearlShell' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'pyro-pod-gold-nozzle',
    match: [{ exact: 'V45_PyroPodGoldNozzle' }],
    params: {
      albedoColor: [0.2375, 0.1938, 0.0875],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.016,
      metallic: 0.18,
      roughness: 0.86,
      clearCoat: { intensity: 0.02, roughness: 0.78 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'pyro-pod-red-glass',
    match: [{ exact: 'V45_PyroPodRedGlass' }],
    params: {
      albedoColor: [0.2, 0.06, 0.06],
      emissiveColor: [0.22, 0.04, 0.03],
      emissiveIntensity: 0.16,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.44,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.58 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'back-plaza-gateway-pearl',
    match: [{ prefix: 'V34_BackPlazaGatewayPearl_' }],
    params: {
      albedoColor: [0.2625, 0.2875, 0.3375],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.87,
      clearCoat: { intensity: 0.04, roughness: 0.7 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'back-plaza-gateway-cyan-inlay',
    match: [{ prefix: 'V34_BackPlazaGatewayCyanInlay_' }],
    params: {
      albedoColor: [0.09, 0.2, 0.25],
      emissiveColor: [0.008, 0.032, 0.042],
      emissiveIntensity: 0.065,
      metallic: 0.01,
      roughness: 0.22,
      alpha: 0.3,
      alphaBlend: true,
      clearCoat: { intensity: 0.03, roughness: 0.66 },
      environmentIntensity: 0.24,
    },
  },
  {
    key: 'spawn-gallery-pier-pearl',
    match: [{ prefix: 'V54_SpawnGalleryPierPearl_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'spawn-filigree-gold',
    match: [{ prefix: 'V54_SpawnGalleryFiligreeGold_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'spawn-shadow-seam',
    match: [{ prefix: 'V54_SpawnGalleryShadowSeam_' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'spawn-beacon-cyan',
    match: [{ prefix: 'V54_SpawnGalleryBeaconCyan_' }],
    params: {
      albedoColor: [0.04, 0.12, 0.18],
      emissiveColor: [0.008, 0.03, 0.05],
      emissiveIntensity: 0.06,
      metallic: 0.02,
      roughness: 0.42,
      alpha: 0.55,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'arrival-causeway-cyan-inlay',
    match: [{ exact: 'V62_BasinCausewayCyanInlay' }],
    params: {
      albedoColor: [0.035, 0.11, 0.18],
      emissiveColor: [0.007, 0.026, 0.046],
      emissiveIntensity: 0.055,
      metallic: 0.02,
      roughness: 0.44,
      alpha: 0.55,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.2,
    },
  },
  {
    key: 'arrival-promenade-cyan-thread',
    match: [{ exact: 'V64_PromenadeCyanThread' }],
    params: {
      albedoColor: [0.03, 0.1, 0.17],
      emissiveColor: [0.006, 0.024, 0.042],
      emissiveIntensity: 0.048,
      metallic: 0.02,
      roughness: 0.46,
      alpha: 0.52,
      alphaBlend: true,
      clearCoat: { intensity: 0.03, roughness: 0.66 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'arrival-sightline-cyan-thread',
    match: [{ prefix: 'V66_BackPlazaSightlineCyanThread_' }],
    params: {
      albedoColor: [0.04, 0.12, 0.2],
      emissiveColor: [0.008, 0.029, 0.048],
      emissiveIntensity: 0.058,
      metallic: 0.02,
      roughness: 0.42,
      alpha: 0.56,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.22,
    },
  },
  {
    key: 'plaza-cross-bands',
    match: [{ exact: 'V64_PlazaCrossBands' }],
    params: {
      albedoColor: [0.205, 0.1575, 0.065],
      emissiveColor: [0.0082, 0.0054, 0.0017],
      emissiveIntensity: 0.014,
      metallic: 0.16,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'plaza-stone-spine',
    match: [{ exact: 'V64_PlazaStoneSpine' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.68 },
      environmentIntensity: 0.16,
      metadataPolish: 'black',
    },
  },
  {
    key: 'side-parallax-gold-orbit',
    match: [{ exact: 'V31_SideParallaxGoldOrbit_L' }, { exact: 'V31_SideParallaxGoldOrbit_R' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'portal-crest-bridge',
    match: [{ exact: 'V51_PortalCrestBridge' }],
    params: {
      albedoColor: [0.2075, 0.16, 0.0675],
      emissiveColor: [0.0086, 0.0057, 0.0018],
      emissiveIntensity: 0.015,
      metallic: 0.16,
      roughness: 0.93,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.095,
    },
  },
  {
    key: 'basin-causeway-shadow-reveal',
    match: [{ exact: 'V62_BasinCausewayShadowReveal' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'proscenium-pearl-reveal',
    match: [{ prefix: 'V116_ProsceniumPearlRevealArray_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'inner-portal-pylon-shell',
    match: [{ prefix: 'V50_InnerPortalPylon_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.74 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'inner-shell-cascade',
    match: [{ prefix: 'V50_InnerShellCascade_' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.007, 0.009, 0.013],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.05, roughness: 0.68 },
      environmentIntensity: 0.15,
    },
  },
  {
    key: 'inner-portal-gold-reveal',
    match: [{ prefix: 'V50_InnerPortalGoldReveal_' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.075],
      emissiveColor: [0.008, 0.0055, 0.0018],
      emissiveIntensity: 0.013,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'outer-sweep-spire',
    match: [{ prefix: 'V50_OuterSweepSpire_' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'crown-obelisk-core-shell',
    match: [{ exact: 'V52_CrownObeliskPearlCore' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.74 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'crown-spire-pearl-blade',
    match: [{ prefix: 'V52_CrownSpirePearlBlade_' }],
    params: {
      albedoColor: [0.275, 0.3, 0.35],
      emissiveColor: [0.007, 0.009, 0.013],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.86,
      clearCoat: { intensity: 0.05, roughness: 0.68 },
      environmentIntensity: 0.15,
    },
  },
  {
    key: 'crown-obelisk-gold-tracery',
    match: [{ exact: 'V52_CrownObeliskGoldTracery' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.075],
      emissiveColor: [0.009, 0.006, 0.0018],
      emissiveIntensity: 0.014,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'crown-obelisk-gold-fin',
    match: [{ prefix: 'V52_CrownSpireGoldFin_' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'crown-obelisk-apex-pedestal',
    match: [{ exact: 'V52_CrownApexPedestal' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.006, 0.004, 0.0015],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'crown-obelisk-shadow-spine',
    match: [{ exact: 'V52_CrownObeliskShadowSpine' }],
    params: {
      albedoColor: [0.11, 0.135, 0.17],
      emissiveColor: [0.007, 0.01, 0.013],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'crown-obelisk-apex-crystal',
    match: [{ exact: 'V52_CrownApexCrystal' }],
    params: {
      albedoColor: [0.09, 0.19, 0.24],
      emissiveColor: [0.01, 0.03, 0.042],
      emissiveIntensity: 0.076,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.32,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.66 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'crown-jewel-pearl-socket',
    match: [{ prefix: 'V71_CrownBladePearlSocket_' }],
    params: {
      albedoColor: [0.2325, 0.26, 0.3125],
      emissiveColor: [0.0061, 0.0084, 0.013],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.91,
      clearCoat: { intensity: 0.04, roughness: 0.76 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'crown-jewel-gold-cradle',
    match: [{ exact: 'V71_CrownJewelGoldCradle' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.008, 0.005, 0.0018],
      emissiveIntensity: 0.012,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'crown-jewel-shadow-core',
    match: [{ exact: 'V71_CrownJewelShadowCore' }],
    params: {
      albedoColor: [0.11, 0.14, 0.18],
      emissiveColor: [0.008, 0.011, 0.015],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.64 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'crown-jewel-cyan',
    match: [{ exact: 'V71_CrownTopCyanJewel' }],
    params: {
      albedoColor: [0.1, 0.21, 0.27],
      emissiveColor: [0.012, 0.036, 0.048],
      emissiveIntensity: 0.085,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.3,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.64 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'oval-portal-glow-shell',
    match: [{ prefix: 'V82_OvalPortalGlowShell_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'spawn-gate-sentinel-pearl',
    match: [{ prefix: 'V60_SpawnGateSentinelPearl_' }],
    params: {
      albedoColor: [0.2375, 0.2687, 0.3187],
      emissiveColor: [0.005, 0.007, 0.01],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.85,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'spawn-gate-sentinel-gold-crown',
    match: [{ prefix: 'V60_SpawnGateSentinelGoldCrown_' }],
    params: {
      albedoColor: [0.225, 0.1812, 0.075],
      emissiveColor: [0.008, 0.0055, 0.0018],
      emissiveIntensity: 0.013,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.02, roughness: 0.8 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'spawn-gate-sentinel-cyan-core',
    match: [{ prefix: 'V60_SpawnGateSentinelCyanCore_' }],
    params: {
      albedoColor: [0.1, 0.21, 0.27],
      emissiveColor: [0.012, 0.036, 0.048],
      emissiveIntensity: 0.085,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.3,
      alphaBlend: true,
      clearCoat: { intensity: 0.05, roughness: 0.64 },
      environmentIntensity: 0.26,
    },
  },
  {
    key: 'spawn-gate-sentinel-shadow-keel',
    match: [{ prefix: 'V60_SpawnGateSentinelShadowKeel_' }],
    params: {
      albedoColor: [0.11, 0.14, 0.18],
      emissiveColor: [0.008, 0.011, 0.015],
      emissiveIntensity: 0.016,
      metallic: 0.06,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.64 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'rear-shell-shadow-reveal',
    match: [{ prefix: 'V106_RearShellShadowRevealArray_' }],
    params: {
      albedoColor: [0.2, 0.225, 0.275],
      emissiveColor: [0.004, 0.007, 0.01],
      emissiveIntensity: 0.01,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.74 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'hero-portal-outer-ogive',
    match: [{ exact: 'V25_HeroPortalOuterOgive_L' }, { exact: 'V25_HeroPortalOuterOgive_R' }],
    params: {
      albedoColor: [0.23, 0.2575, 0.31],
      emissiveColor: [0.0062, 0.0086, 0.0132],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.91,
      clearCoat: { intensity: 0.04, roughness: 0.76 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'hero-portal-gold-reveal',
    match: [{ exact: 'V25_HeroPortalGoldReveal_L' }, { exact: 'V25_HeroPortalGoldReveal_R' }],
    params: {
      albedoColor: [0.2025, 0.1562, 0.0713],
      emissiveColor: [0.012, 0.0076, 0.0031],
      emissiveIntensity: 0.014,
      metallic: 0.18,
      roughness: 0.93,
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'hero-portal-side-pearl-apron',
    match: [{ exact: 'V25_HeroPortalPearlApron_L' }, { exact: 'V25_HeroPortalPearlApron_R' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.008, 0.012],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.66 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'hero-portal-shadow-vault',
    match: [{ exact: 'V25_HeroPortalShadowVault' }],
    params: {
      albedoColor: [0.14, 0.17, 0.21],
      emissiveColor: [0.01, 0.015, 0.02],
      emissiveIntensity: 0.02,
      metallic: 0.08,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.28,
    },
  },
  {
    key: 'crown-apex-crystal',
    match: [{ exact: 'V25_CrownApexCrystal' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.015, 0.045, 0.06],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.38,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.6 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'performance-dais-lower',
    match: [{ exact: 'V27_PerformanceDaisLower' }],
    params: {
      albedoColor: [0.16, 0.19, 0.23],
      emissiveColor: [0.012, 0.018, 0.024],
      emissiveIntensity: 0.024,
      metallic: 0.08,
      roughness: 0.82,
      clearCoat: { intensity: 0.04, roughness: 0.54 },
      environmentIntensity: 0.32,
    },
  },
  {
    key: 'performance-dais-mid',
    match: [{ exact: 'V27_PerformanceDaisMid' }],
    params: {
      albedoColor: [0.325, 0.3625, 0.4125],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.82,
      clearCoat: { intensity: 0.04, roughness: 0.58 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'performance-dais-upper',
    match: [{ exact: 'V27_PerformanceDaisUpper' }],
    params: {
      albedoColor: [0.2038, 0.1575, 0.0663],
      emissiveColor: [0.0084, 0.0055, 0.0017],
      emissiveIntensity: 0.014,
      metallic: 0.16,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'wing-arcade-pearl-arch',
    match: [{ exact: 'V28_WingArcadePearlArch_L' }, { exact: 'V28_WingArcadePearlArch_R' }],
    params: {
      albedoColor: [0.2, 0.225, 0.275],
      emissiveColor: [0.004, 0.007, 0.01],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'wing-arcade-gold-reveal',
    match: [{ exact: 'V28_WingArcadeGoldReveal_L' }, { exact: 'V28_WingArcadeGoldReveal_R' }],
    params: {
      albedoColor: [0.175, 0.1375, 0.0625],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.015,
      metallic: 0.14,
      roughness: 0.92,
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'wing-arcade-cyan-inlay',
    match: [{ exact: 'V28_WingArcadeCyanInlay_L' }, { exact: 'V28_WingArcadeCyanInlay_R' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.015, 0.045, 0.06],
      emissiveIntensity: 0.1,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.38,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.6 },
      environmentIntensity: 0.34,
    },
  },
  {
    key: 'vip-terrace-outer-sweep',
    match: [{ prefix: 'V26_VipTerraceOuterSweep_' }],
    params: {
      albedoColor: [0.25, 0.275, 0.325],
      emissiveColor: [0.005, 0.007, 0.011],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.72 },
      environmentIntensity: 0.13,
    },
  },
  {
    key: 'vip-terrace-gold-inlay',
    match: [{ prefix: 'V26_VipTerraceGoldInlay_' }],
    params: {
      albedoColor: [0.195, 0.15, 0.0625],
      emissiveColor: [0.0078, 0.005, 0.0015],
      emissiveIntensity: 0.012,
      metallic: 0.16,
      roughness: 0.95,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.082,
    },
  },
  {
    key: 'vip-balustrade-lower-chord',
    match: [{ prefix: 'V101_VipBalustradeLowerChordArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'vip-balustrade-filigree',
    match: [{ prefix: 'V102_VipBalustradeFiligreeArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'vip-pearl-surface-gold-relief',
    match: [{ prefix: 'V103_PearlSurfaceGoldRelief_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'vip-pearl-surface-cyan-inset',
    match: [{ prefix: 'V103_PearlSurfaceCyanInset_' }],
    params: {
      albedoColor: [0.12, 0.24, 0.3],
      emissiveColor: [0.01, 0.05, 0.07],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.36,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'outer-wing-gold-spine',
    match: [{ prefix: 'V104_OuterWingGoldSpineArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'rear-shell-gold-seam',
    match: [{ prefix: 'V105_RearShellGoldSeamArray_' }],
    params: {
      albedoColor: [0.225, 0.175, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.9,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'foreground-barricade-gold-run',
    match: [{ exact: 'V108_ForegroundBarricadeGoldRun' }],
    params: {
      albedoColor: [0.15, 0.125, 0.0625],
      emissiveColor: [0.004, 0.003, 0.001],
      emissiveIntensity: 0.008,
      metallic: 0.12,
      roughness: 0.94,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.06,
    },
  },
  {
    key: 'foreground-barricade-pearl-run',
    match: [{ exact: 'V108_ForegroundBarricadePearlRun' }],
    params: {
      albedoColor: [0.3, 0.325, 0.375],
      emissiveColor: [0.006, 0.01, 0.014],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.84,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'vip-terrace-gold',
    match: [{ prefix: 'V133_VipTerraceGoldArray_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'wing-terrace-gold',
    match: [{ prefix: 'V133_WingTerraceGoldArray_' }],
    params: {
      albedoColor: [0.2, 0.15, 0.075],
      emissiveColor: [0.01, 0.007, 0.002],
      emissiveIntensity: 0.02,
      metallic: 0.16,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'wing-terrace-fascia',
    match: [{ prefix: 'V30_WingTerraceFascia_' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.006, 0.007, 0.01],
      emissiveIntensity: 0.02,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'wing-soffit-shadow',
    match: [{ prefix: 'V30_WingSoffitShadow_' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'wing-underside-rib',
    match: [{ prefix: 'V30_WingUndersideRib_' }],
    params: {
      albedoColor: [0.15, 0.1875, 0.2375],
      emissiveColor: [0.005, 0.007, 0.01],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.02, roughness: 0.76 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'vip-soffit-shadow',
    match: [{ prefix: 'V30_VipSoffitShadow_' }],
    params: {
      albedoColor: [0.175, 0.2125, 0.2625],
      emissiveColor: [0.008, 0.012, 0.016],
      emissiveIntensity: 0.02,
      metallic: 0.04,
      roughness: 0.88,
      clearCoat: { intensity: 0.04, roughness: 0.64 },
      environmentIntensity: 0.16,
    },
  },
  {
    key: 'vip-underside-rib',
    match: [{ prefix: 'V30_VipUndersideRib_' }],
    params: {
      albedoColor: [0.15, 0.1875, 0.2375],
      emissiveColor: [0.005, 0.007, 0.01],
      emissiveIntensity: 0.016,
      metallic: 0.02,
      roughness: 0.92,
      clearCoat: { intensity: 0.02, roughness: 0.76 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'vip-terrace-gold-rail',
    match: [{ prefix: 'V30_VipGoldBaluster_' }],
    params: {
      albedoColor: [0.25, 0.195, 0.085],
      emissiveColor: [0.012, 0.008, 0.0026],
      emissiveIntensity: 0.022,
      metallic: 0.18,
      roughness: 0.88,
      clearCoat: { intensity: 0.01, roughness: 0.82 },
      environmentIntensity: 0.14,
    },
  },
  {
    key: 'vip-terrace-gold-handrail',
    match: [{ prefix: 'V30_VipGoldHandrail_' }],
    params: {
      albedoColor: [0.29, 0.23, 0.1],
      emissiveColor: [0.015, 0.0105, 0.0033],
      emissiveIntensity: 0.026,
      metallic: 0.24,
      roughness: 0.82,
      clearCoat: { intensity: 0.03, roughness: 0.7 },
      environmentIntensity: 0.18,
    },
  },
  {
    key: 'wing-terrace-gold-rail',
    match: [{ prefix: 'V30_WingGoldBaluster_' }],
    params: {
      albedoColor: [0.2, 0.155, 0.0675],
      emissiveColor: [0.008, 0.0054, 0.0018],
      emissiveIntensity: 0.015,
      metallic: 0.14,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'wing-terrace-gold-handrail',
    match: [{ prefix: 'V30_WingGoldHandrail_' }],
    params: {
      albedoColor: [0.2325, 0.1775, 0.0775],
      emissiveColor: [0.0094, 0.0064, 0.0021],
      emissiveIntensity: 0.017,
      metallic: 0.17,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.8 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'arrival-causeway-gold-rail',
    match: [{ prefix: 'V62_BasinCausewayGoldRail_' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.006, 0.004, 0.0015],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'arrival-garden-gold-crest',
    match: [{ prefix: 'V63_BasinGardenGoldCrest_' }],
    params: {
      albedoColor: [0.2188, 0.1688, 0.0725],
      emissiveColor: [0.008, 0.006, 0.002],
      emissiveIntensity: 0.018,
      metallic: 0.18,
      roughness: 0.87,
      clearCoat: { intensity: 0.01, roughness: 0.84 },
      environmentIntensity: 0.11,
    },
  },
  {
    key: 'arrival-promenade-gold-inlay',
    match: [{ exact: 'V64_PromenadeGoldInlay' }],
    params: {
      albedoColor: [0.1875, 0.1375, 0.0562],
      emissiveColor: [0.006, 0.004, 0.0015],
      emissiveIntensity: 0.015,
      metallic: 0.12,
      roughness: 0.92,
      clearCoat: { intensity: 0, roughness: 0.88 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'arrival-sightline-gold-rail',
    match: [{ prefix: 'V66_BackPlazaSightlineGoldRail_' }],
    params: {
      albedoColor: [0.2125, 0.1625, 0.0688],
      emissiveColor: [0.007, 0.005, 0.0018],
      emissiveIntensity: 0.017,
      metallic: 0.15,
      roughness: 0.89,
      clearCoat: { intensity: 0, roughness: 0.86 },
      environmentIntensity: 0.1,
    },
  },
  {
    key: 'wing-canopy-lamella-gold-rear',
    match: [{ prefix: 'V117_WingCanopyLamellaGoldArray_', suffix: '_Rear' }],
    params: {
      albedoColor: [0.215, 0.1625, 0.0688],
      emissiveColor: [0.0052, 0.0035, 0.0012],
      emissiveIntensity: 0.01,
      metallic: 0.15,
      roughness: 0.89,
      clearCoat: { intensity: 0.01, roughness: 0.82 },
      environmentIntensity: 0.09,
    },
  },
  {
    key: 'wing-canopy-lamella-gold-front',
    match: [{ prefix: 'V117_WingCanopyLamellaGoldArray_' }],
    params: {
      albedoColor: [0.1862, 0.1388, 0.0587],
      emissiveColor: [0.0038, 0.0025, 0.0009],
      emissiveIntensity: 0.008,
      metallic: 0.12,
      roughness: 0.93,
      clearCoat: { intensity: 0, roughness: 0.9 },
      environmentIntensity: 0.07,
    },
  },
  {
    key: 'wing-canopy-lamella-pearl',
    match: [{ prefix: 'V117_WingCanopyLamellaPearlArray_' }],
    params: {
      albedoColor: [0.225, 0.25, 0.3],
      emissiveColor: [0.006, 0.008, 0.012],
      emissiveIntensity: 0.024,
      metallic: 0.02,
      roughness: 0.9,
      clearCoat: { intensity: 0.03, roughness: 0.76 },
      environmentIntensity: 0.12,
    },
  },
  {
    key: 'center-screen-glass-lens',
    match: [{ exact: 'V31_CenterGlassLens' }],
    params: {
      albedoColor: [0.1, 0.22, 0.28],
      emissiveColor: [0.014, 0.052, 0.074],
      emissiveIntensity: 0.11,
      metallic: 0.02,
      roughness: 0.16,
      alpha: 0.56,
      alphaBlend: true,
      clearCoat: { intensity: 0.06, roughness: 0.56 },
      environmentIntensity: 0.38,
    },
  },
  {
    key: 'side-screen-glass-lens',
    match: [{ prefix: 'V31_SideGlassLens_' }],
    params: {
      albedoColor: [0.08, 0.18, 0.24],
      emissiveColor: [0.01, 0.04, 0.06],
      emissiveIntensity: 0.08,
      metallic: 0.02,
      roughness: 0.18,
      alpha: 0.42,
      alphaBlend: true,
      clearCoat: { intensity: 0.04, roughness: 0.62 },
      environmentIntensity: 0.3,
    },
  },
  {
    key: 'center-led-tile-field',
    match: [{ exact: 'V31_CenterLedTileField' }],
    params: {
      albedoColor: [0.0375, 0.0875, 0.1187],
      emissiveColor: [0.1, 0.5, 0.72],
      emissiveIntensity: 1.4,
      metallic: 0.02,
      roughness: 0.24,
      alpha: 0.72,
      alphaBlend: true,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.08,
    },
  },
  {
    key: 'side-led-tile-field',
    match: [{ prefix: 'V31_SideLedTileField_' }],
    params: {
      albedoColor: [0.025, 0.0625, 0.0875],
      emissiveColor: [0.1, 0.5, 0.72],
      emissiveIntensity: 1.4,
      metallic: 0.02,
      roughness: 0.32,
      alpha: 0.72,
      alphaBlend: true,
      clearCoat: { intensity: 0, roughness: 0.84 },
      environmentIntensity: 0.04,
    },
  },
  {
    key: 'center-parallax-starfield',
    match: [{ exact: 'V31_CenterParallaxStarfield' }],
    params: {
      albedoColor: [0.0438, 0.09, 0.1225],
      emissiveColor: [0.12, 0.5, 0.72],
      emissiveIntensity: 1.6,
      metallic: 0.04,
      roughness: 0.46,
      alpha: 0.8,
      alphaBlend: true,
      clearCoat: { intensity: 0.02, roughness: 0.74 },
      environmentIntensity: 0.2,
      metadataPolish: 'smoked',
    },
  },
  {
    key: 'side-parallax-orbital-content',
    match: [{ exact: 'V31_SideParallaxOrbitalContent_L' }, { exact: 'V31_SideParallaxOrbitalContent_R' }],
    params: {
      albedoColor: [0.05, 0.1, 0.1375],
      emissiveColor: [0.12, 0.5, 0.72],
      emissiveIntensity: 1.6,
      metallic: 0.04,
      roughness: 0.42,
      alpha: 0.8,
      alphaBlend: true,
      clearCoat: { intensity: 0.02, roughness: 0.72 },
      environmentIntensity: 0.22,
      metadataPolish: 'smoked',
    },
  },
];

function matcherMatches(matcher: MainStageOverrideMatcher, meshName: string): boolean {
  if (matcher.exact !== undefined) {
    return meshName === matcher.exact;
  }
  if (matcher.prefix !== undefined && !meshName.startsWith(matcher.prefix)) {
    return false;
  }
  if (matcher.suffix !== undefined && !meshName.endsWith(matcher.suffix)) {
    return false;
  }
  return matcher.prefix !== undefined || matcher.suffix !== undefined;
}

function findOverrideRule(meshName: string): MainStageOverrideRule | undefined {
  return MAIN_STAGE_MESH_OVERRIDES.find((rule) =>
    rule.match.some((matcher) => matcherMatches(matcher, meshName)),
  );
}

function applyMeshSpecificOverrides(meshes: AbstractMesh[]) {
  const clonedMaterials = new Map<string, PBRMaterial>();

  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial)) {
      continue;
    }

    const rule = findOverrideRule(mesh.name);
    if (!rule) {
      continue;
    }

    const cacheKey = `${material.uniqueId}:${rule.key}`;
    let overrideMaterial = clonedMaterials.get(cacheKey);
    if (!overrideMaterial) {
      overrideMaterial = material.clone(`${material.name}__${rule.key}`);
      applyOverrideParams(overrideMaterial, rule);
      clonedMaterials.set(cacheKey, overrideMaterial);
    }

    assignOverrideMaterial(mesh, overrideMaterial);
  }
}

function applyOverrideParams(material: PBRMaterial, rule: MainStageOverrideRule) {
  const params = rule.params;

  if (params.clearAlbedoTexture) {
    material.albedoTexture = null;
  }
  if (params.albedoColor) {
    material.albedoColor = new Color3(...params.albedoColor);
  }
  if (params.emissiveColor) {
    material.emissiveColor = new Color3(...params.emissiveColor);
  }
  if (params.emissiveIntensity !== undefined) {
    material.emissiveIntensity = params.emissiveIntensity;
  }
  if (params.metallic !== undefined) {
    material.metallic = params.metallic;
  }
  if (params.roughness !== undefined) {
    material.roughness = params.roughness;
  }
  if (params.alpha !== undefined) {
    material.alpha = params.alpha;
  }
  if (params.alphaBlend) {
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  if (params.clearCoat) {
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = params.clearCoat.intensity;
    material.clearCoat.roughness = params.clearCoat.roughness;
  }
  if (params.environmentIntensity !== undefined) {
    material.environmentIntensity = params.environmentIntensity;
  }

  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: rule.key,
    ...(params.metadataPolish ? { mainStageMaterialPolish: params.metadataPolish } : {}),
  };
}

function assignOverrideMaterial(mesh: AbstractMesh, material: PBRMaterial) {
  const targetMesh = realizeUniqueMaterialTarget(mesh);
  targetMesh.material = material;
}

function realizeUniqueMaterialTarget(mesh: AbstractMesh) {
  if (!(mesh instanceof InstancedMesh)) {
    return mesh;
  }

  const realizedMesh = mesh.sourceMesh.clone(mesh.name, mesh.parent ?? null, false);
  if (!realizedMesh) {
    return mesh.sourceMesh;
  }

  realizedMesh.position.copyFrom(mesh.position);
  realizedMesh.scaling.copyFrom(mesh.scaling);
  realizedMesh.rotation.copyFrom(mesh.rotation);
  realizedMesh.rotationQuaternion = mesh.rotationQuaternion?.clone() ?? null;
  realizedMesh.visibility = mesh.visibility;
  realizedMesh.isVisible = mesh.isVisible;
  realizedMesh.isPickable = mesh.isPickable;
  realizedMesh.checkCollisions = mesh.checkCollisions;
  realizedMesh.receiveShadows = mesh.receiveShadows;
  realizedMesh.renderingGroupId = mesh.renderingGroupId;
  realizedMesh.alphaIndex = mesh.alphaIndex;
  realizedMesh.layerMask = mesh.layerMask;
  realizedMesh.alwaysSelectAsActiveMesh = mesh.alwaysSelectAsActiveMesh;
  realizedMesh.metadata = mesh.metadata;
  realizedMesh.setEnabled(mesh.isEnabled());

  mesh.dispose();

  return realizedMesh;
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
