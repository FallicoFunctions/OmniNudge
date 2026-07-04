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

      assignOverrideMaterial(mesh, canopyMaterial);
      continue;
    }

    if (mesh.name.startsWith('V91_SupportTentFrame_')) {
      const cacheKey = `${material.uniqueId}:support-tent-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__support-tent-frame`);
        applySupportTentFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name.startsWith('V91_SupportTentCrest_')) {
      const cacheKey = `${material.uniqueId}:support-tent-crest`;
      let crestMaterial = clonedMaterials.get(cacheKey);
      if (!crestMaterial) {
        crestMaterial = material.clone(`${material.name}__support-tent-crest`);
        applySupportTentCrestOverride(crestMaterial);
        clonedMaterials.set(cacheKey, crestMaterial);
      }

      assignOverrideMaterial(mesh, crestMaterial);
      continue;
    }

    if (mesh.name.startsWith('V92_ServiceCaseBank_')) {
      const cacheKey = `${material.uniqueId}:service-case-bank`;
      let bankMaterial = clonedMaterials.get(cacheKey);
      if (!bankMaterial) {
        bankMaterial = material.clone(`${material.name}__service-case-bank`);
        applyServiceCaseBankOverride(bankMaterial);
        clonedMaterials.set(cacheKey, bankMaterial);
      }

      assignOverrideMaterial(mesh, bankMaterial);
      continue;
    }

    if (mesh.name.startsWith('V92_ServiceCaseTopper_')) {
      const cacheKey = `${material.uniqueId}:service-case-topper`;
      let topperMaterial = clonedMaterials.get(cacheKey);
      if (!topperMaterial) {
        topperMaterial = material.clone(`${material.name}__service-case-topper`);
        applyServiceCaseTopperOverride(topperMaterial);
        clonedMaterials.set(cacheKey, topperMaterial);
      }

      assignOverrideMaterial(mesh, topperMaterial);
      continue;
    }

    if (mesh.name.startsWith('V93_ServiceCaseArray_')) {
      const cacheKey = `${material.uniqueId}:wing-service-case-array`;
      let arrayMaterial = clonedMaterials.get(cacheKey);
      if (!arrayMaterial) {
        arrayMaterial = material.clone(`${material.name}__wing-service-case-array`);
        applyWingServiceCaseArrayOverride(arrayMaterial);
        clonedMaterials.set(cacheKey, arrayMaterial);
      }

      assignOverrideMaterial(mesh, arrayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V95_PyroPylonArray_')) {
      const cacheKey = `${material.uniqueId}:pyro-pylon-array`;
      let pylonMaterial = clonedMaterials.get(cacheKey);
      if (!pylonMaterial) {
        pylonMaterial = material.clone(`${material.name}__pyro-pylon-array`);
        applyPyroPylonArrayOverride(pylonMaterial);
        clonedMaterials.set(cacheKey, pylonMaterial);
      }

      assignOverrideMaterial(mesh, pylonMaterial);
      continue;
    }

    if (mesh.name.startsWith('V95_PyroNozzleArray_')) {
      const cacheKey = `${material.uniqueId}:pyro-nozzle-array`;
      let nozzleMaterial = clonedMaterials.get(cacheKey);
      if (!nozzleMaterial) {
        nozzleMaterial = material.clone(`${material.name}__pyro-nozzle-array`);
        applyPyroNozzleArrayOverride(nozzleMaterial);
        clonedMaterials.set(cacheKey, nozzleMaterial);
      }

      assignOverrideMaterial(mesh, nozzleMaterial);
      continue;
    }

    if (mesh.name.startsWith('V96_RearMassGoldBandArray_')) {
      const cacheKey = `${material.uniqueId}:rear-mass-gold-band`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__rear-mass-gold-band`);
        applyRearMassGoldBandOverride(goldMaterial);
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V96_RearMassShadowChannelArray_')) {
      const cacheKey = `${material.uniqueId}:rear-mass-shadow-channel`;
      let shadowMaterial = clonedMaterials.get(cacheKey);
      if (!shadowMaterial) {
        shadowMaterial = material.clone(`${material.name}__rear-mass-shadow-channel`);
        applyRearMassShadowChannelOverride(shadowMaterial);
        clonedMaterials.set(cacheKey, shadowMaterial);
      }

      assignOverrideMaterial(mesh, shadowMaterial);
      continue;
    }

    if (mesh.name === 'V97_WetRouteStoneBandArray') {
      const cacheKey = `${material.uniqueId}:wet-route-stone-band`;
      let stoneMaterial = clonedMaterials.get(cacheKey);
      if (!stoneMaterial) {
        stoneMaterial = material.clone(`${material.name}__wet-route-stone-band`);
        applyWetRouteStoneBandOverride(stoneMaterial);
        clonedMaterials.set(cacheKey, stoneMaterial);
      }

      assignOverrideMaterial(mesh, stoneMaterial);
      continue;
    }

    if (mesh.name === 'V97_WetRouteGoldSeamArray') {
      const cacheKey = `${material.uniqueId}:wet-route-gold-seam`;
      let seamMaterial = clonedMaterials.get(cacheKey);
      if (!seamMaterial) {
        seamMaterial = material.clone(`${material.name}__wet-route-gold-seam`);
        applyWetRouteGoldSeamOverride(seamMaterial);
        clonedMaterials.set(cacheKey, seamMaterial);
      }

      assignOverrideMaterial(mesh, seamMaterial);
      continue;
    }

    if (mesh.name === 'V76_SideScreenAnchorGoldSpine_L' || mesh.name === 'V76_SideScreenAnchorGoldSpine_R') {
      const cacheKey = `${material.uniqueId}:side-screen-anchor-gold-spine`;
      let spineMaterial = clonedMaterials.get(cacheKey);
      if (!spineMaterial) {
        spineMaterial = material.clone(`${material.name}__side-screen-anchor-gold-spine`);
        applySideScreenAnchorGoldSpineOverride(spineMaterial);
        clonedMaterials.set(cacheKey, spineMaterial);
      }

      assignOverrideMaterial(mesh, spineMaterial);
      continue;
    }

    if (mesh.name === 'V75_ArcAnchorGoldCluster_L' || mesh.name === 'V75_ArcAnchorGoldCluster_R') {
      const cacheKey = `${material.uniqueId}:arc-anchor-gold-cluster`;
      let clusterMaterial = clonedMaterials.get(cacheKey);
      if (!clusterMaterial) {
        clusterMaterial = material.clone(`${material.name}__arc-anchor-gold-cluster`);
        applyArcAnchorGoldClusterOverride(clusterMaterial);
        clonedMaterials.set(cacheKey, clusterMaterial);
      }

      assignOverrideMaterial(mesh, clusterMaterial);
      continue;
    }

    if (mesh.name === 'V74_SweepOuterAnchorGoldCrown_L' || mesh.name === 'V74_SweepOuterAnchorGoldCrown_R') {
      const cacheKey = `${material.uniqueId}:sweep-anchor-outer-gold-crown`;
      let crownMaterial = clonedMaterials.get(cacheKey);
      if (!crownMaterial) {
        crownMaterial = material.clone(`${material.name}__sweep-anchor-outer-gold-crown`);
        applySweepAnchorOuterGoldCrownOverride(crownMaterial);
        clonedMaterials.set(cacheKey, crownMaterial);
      }

      assignOverrideMaterial(mesh, crownMaterial);
      continue;
    }

    if (mesh.name === 'V74_SweepInnerAnchorGoldCrown_L' || mesh.name === 'V74_SweepInnerAnchorGoldCrown_R') {
      const cacheKey = `${material.uniqueId}:sweep-anchor-inner-gold-crown`;
      let crownMaterial = clonedMaterials.get(cacheKey);
      if (!crownMaterial) {
        crownMaterial = material.clone(`${material.name}__sweep-anchor-inner-gold-crown`);
        applySweepAnchorInnerGoldCrownOverride(crownMaterial);
        clonedMaterials.set(cacheKey, crownMaterial);
      }

      assignOverrideMaterial(mesh, crownMaterial);
      continue;
    }

    if (mesh.name === 'V74_SweepOuterAnchorShadowCore_L' || mesh.name === 'V74_SweepOuterAnchorShadowCore_R') {
      const cacheKey = `${material.uniqueId}:sweep-anchor-outer-shadow-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__sweep-anchor-outer-shadow-core`);
        applySweepAnchorOuterShadowCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (mesh.name === 'V74_SweepInnerAnchorShadowCore_L' || mesh.name === 'V74_SweepInnerAnchorShadowCore_R') {
      const cacheKey = `${material.uniqueId}:sweep-anchor-inner-shadow-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__sweep-anchor-inner-shadow-core`);
        applySweepAnchorInnerShadowCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (
      mesh.name === 'V73_HeroPortalServiceDoorFrameCluster_L' ||
      mesh.name === 'V73_HeroPortalServiceDoorFrameCluster_R'
    ) {
      const cacheKey = `${material.uniqueId}:hero-portal-service-door-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__hero-portal-service-door-frame`);
        applyHeroPortalServiceDoorFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (
      mesh.name === 'V73_HeroPortalServiceDoorLeafCluster_L' ||
      mesh.name === 'V73_HeroPortalServiceDoorLeafCluster_R'
    ) {
      const cacheKey = `${material.uniqueId}:hero-portal-service-door-leaf`;
      let leafMaterial = clonedMaterials.get(cacheKey);
      if (!leafMaterial) {
        leafMaterial = material.clone(`${material.name}__hero-portal-service-door-leaf`);
        applyHeroPortalServiceDoorLeafOverride(leafMaterial);
        clonedMaterials.set(cacheKey, leafMaterial);
      }

      assignOverrideMaterial(mesh, leafMaterial);
      continue;
    }

    if (mesh.name === 'V72_CrownRiggingGoldBosses') {
      const cacheKey = `${material.uniqueId}:crown-rigging-gold-boss`;
      let bossMaterial = clonedMaterials.get(cacheKey);
      if (!bossMaterial) {
        bossMaterial = material.clone(`${material.name}__crown-rigging-gold-boss`);
        applyCrownRiggingGoldBossOverride(bossMaterial);
        clonedMaterials.set(cacheKey, bossMaterial);
      }

      assignOverrideMaterial(mesh, bossMaterial);
      continue;
    }

    if (
      mesh.name === 'V47_CrownGoldLatticeBraceA' ||
      mesh.name === 'V47_CrownGoldLatticeBraceB'
    ) {
      const cacheKey = `${material.uniqueId}:crown-gold-lattice`;
      let latticeMaterial = clonedMaterials.get(cacheKey);
      if (!latticeMaterial) {
        latticeMaterial = material.clone(`${material.name}__crown-gold-lattice`);
        applyCrownGoldLatticeOverride(latticeMaterial);
        clonedMaterials.set(cacheKey, latticeMaterial);
      }

      assignOverrideMaterial(mesh, latticeMaterial);
      continue;
    }

    if (
      mesh.name === 'V29_MainLineArrayCabinet_L_00' ||
      mesh.name === 'V29_MainLineArrayCabinet_R_00' ||
      mesh.name === 'V29_MainLineArrayDriver_L_00' ||
      mesh.name === 'V29_MainLineArrayDriver_R_00' ||
      mesh.name === 'V29_FrontSubCabinet_L_00' ||
      mesh.name === 'V29_FrontSubCabinet_R_00'
    ) {
      const cacheKey = `${material.uniqueId}:line-array-graphite`;
      let graphiteMaterial = clonedMaterials.get(cacheKey);
      if (!graphiteMaterial) {
        graphiteMaterial = material.clone(`${material.name}__line-array-graphite`);
        applyLineArrayGraphiteOverride(graphiteMaterial);
        clonedMaterials.set(cacheKey, graphiteMaterial);
      }

      assignOverrideMaterial(mesh, graphiteMaterial);
      continue;
    }

    if (
      mesh.name === 'V29_MainLineArrayGrille_L_00' ||
      mesh.name === 'V29_MainLineArrayGrille_R_00' ||
      mesh.name === 'V29_MainLineArrayHorn_L_00' ||
      mesh.name === 'V29_MainLineArrayHorn_R_00' ||
      mesh.name === 'V29_FrontSubPort_L_00' ||
      mesh.name === 'V29_FrontSubPort_R_00'
    ) {
      const cacheKey = `${material.uniqueId}:line-array-acoustic-black`;
      let blackMaterial = clonedMaterials.get(cacheKey);
      if (!blackMaterial) {
        blackMaterial = material.clone(`${material.name}__line-array-acoustic-black`);
        applyLineArrayAcousticBlackOverride(blackMaterial);
        clonedMaterials.set(cacheKey, blackMaterial);
      }

      assignOverrideMaterial(mesh, blackMaterial);
      continue;
    }

    if (
      mesh.name === 'V29_MainLineArrayYoke_L' ||
      mesh.name === 'V29_MainLineArrayYoke_R' ||
      mesh.name === 'V29_MainLineArraySideRail_L' ||
      mesh.name === 'V29_MainLineArraySideRail_R'
    ) {
      const cacheKey = `${material.uniqueId}:line-array-suspension-hardware`;
      let hardwareMaterial = clonedMaterials.get(cacheKey);
      if (!hardwareMaterial) {
        hardwareMaterial = material.clone(`${material.name}__line-array-suspension-hardware`);
        applyLineArraySuspensionHardwareOverride(hardwareMaterial);
        clonedMaterials.set(cacheKey, hardwareMaterial);
      }

      assignOverrideMaterial(mesh, hardwareMaterial);
      continue;
    }

    if (mesh.name === 'V29_MainLineArrayPinBars_L' || mesh.name === 'V29_MainLineArrayPinBars_R') {
      const cacheKey = `${material.uniqueId}:line-array-pin-bars`;
      let pinBarMaterial = clonedMaterials.get(cacheKey);
      if (!pinBarMaterial) {
        pinBarMaterial = material.clone(`${material.name}__line-array-pin-bars`);
        applyLineArrayPinBarsOverride(pinBarMaterial);
        clonedMaterials.set(cacheKey, pinBarMaterial);
      }

      assignOverrideMaterial(mesh, pinBarMaterial);
      continue;
    }

    if (mesh.name === 'V35_BasinFountainMist_L' || mesh.name === 'V35_BasinFountainMist_R') {
      const cacheKey = `${material.uniqueId}:basin-fountain-mist`;
      let mistMaterial = clonedMaterials.get(cacheKey);
      if (!mistMaterial) {
        mistMaterial = material.clone(`${material.name}__basin-fountain-mist`);
        applyBasinFountainMistOverride(mistMaterial);
        clonedMaterials.set(cacheKey, mistMaterial);
      }

      assignOverrideMaterial(mesh, mistMaterial);
      continue;
    }

    if (mesh.name === 'V35_BasinFountainNozzleArray_L' || mesh.name === 'V35_BasinFountainNozzleArray_R') {
      const cacheKey = `${material.uniqueId}:basin-fountain-nozzle-array`;
      let nozzleMaterial = clonedMaterials.get(cacheKey);
      if (!nozzleMaterial) {
        nozzleMaterial = material.clone(`${material.name}__basin-fountain-nozzle-array`);
        applyBasinFountainNozzleArrayOverride(nozzleMaterial);
        clonedMaterials.set(cacheKey, nozzleMaterial);
      }

      assignOverrideMaterial(mesh, nozzleMaterial);
      continue;
    }

    if (mesh.name === 'V35_BasinPlantingIslandRim_L' || mesh.name === 'V35_BasinPlantingIslandRim_R') {
      const cacheKey = `${material.uniqueId}:basin-planting-island-rim`;
      let islandMaterial = clonedMaterials.get(cacheKey);
      if (!islandMaterial) {
        islandMaterial = material.clone(`${material.name}__basin-planting-island-rim`);
        applyBasinPlantingIslandRimOverride(islandMaterial);
        clonedMaterials.set(cacheKey, islandMaterial);
      }

      assignOverrideMaterial(mesh, islandMaterial);
      continue;
    }

    if (mesh.name === 'V36_ForegroundBarricadeFrame_L' || mesh.name === 'V36_ForegroundBarricadeFrame_R') {
      const cacheKey = `${material.uniqueId}:foreground-barricade-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__foreground-barricade-frame`);
        applyForegroundBarricadeFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name === 'V36_ForegroundBarricadeGoldRail_L' || mesh.name === 'V36_ForegroundBarricadeGoldRail_R') {
      const cacheKey = `${material.uniqueId}:foreground-barricade-gold-rail`;
      let railMaterial = clonedMaterials.get(cacheKey);
      if (!railMaterial) {
        railMaterial = material.clone(`${material.name}__foreground-barricade-gold-rail`);
        applyForegroundBarricadeGoldRailOverride(railMaterial);
        clonedMaterials.set(cacheKey, railMaterial);
      }

      assignOverrideMaterial(mesh, railMaterial);
      continue;
    }

    if (mesh.name === 'V24_CelestialCrownFrontArch_L' || mesh.name === 'V24_CelestialCrownFrontArch_R') {
      const cacheKey = `${material.uniqueId}:v24-celestial-crown-front-arch`;
      let pearlMaterial = clonedMaterials.get(cacheKey);
      if (!pearlMaterial) {
        pearlMaterial = material.clone(`${material.name}__v24-celestial-crown-front-arch`);
        applyV24CelestialCrownFrontArchOverride(pearlMaterial);
        clonedMaterials.set(cacheKey, pearlMaterial);
      }

      assignOverrideMaterial(mesh, pearlMaterial);
      continue;
    }

    if (mesh.name === 'V24_ProsceniumFlyingButtress_L' || mesh.name === 'V24_ProsceniumFlyingButtress_R') {
      const cacheKey = `${material.uniqueId}:v24-proscenium-flying-buttress`;
      let pearlMaterial = clonedMaterials.get(cacheKey);
      if (!pearlMaterial) {
        pearlMaterial = material.clone(`${material.name}__v24-proscenium-flying-buttress`);
        applyV24ProsceniumFlyingButtressOverride(pearlMaterial);
        clonedMaterials.set(cacheKey, pearlMaterial);
      }

      assignOverrideMaterial(mesh, pearlMaterial);
      continue;
    }

    if (mesh.name === 'V24_CelestialCrownGoldReveal_L' || mesh.name === 'V24_CelestialCrownGoldReveal_R') {
      const cacheKey = `${material.uniqueId}:v24-crown-gold-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__v24-crown-gold-reveal`);
        applyV24CrownGoldRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (
      mesh.name === 'V24_CrownSpireDepthRib_0' ||
      mesh.name === 'V24_CrownSpireDepthRib_1' ||
      mesh.name === 'V24_CrownSpireDepthRib_R_1' ||
      mesh.name === 'V24_CrownSpireDepthRib_2' ||
      mesh.name === 'V24_CrownSpireDepthRib_R_2'
    ) {
      const cacheKey = `${material.uniqueId}:v24-crown-depth-rib`;
      let ribMaterial = clonedMaterials.get(cacheKey);
      if (!ribMaterial) {
        ribMaterial = material.clone(`${material.name}__v24-crown-depth-rib`);
        applyV24CrownDepthRibOverride(ribMaterial);
        clonedMaterials.set(cacheKey, ribMaterial);
      }

      assignOverrideMaterial(mesh, ribMaterial);
      continue;
    }

    if (mesh.name === 'V24_ProsceniumButtressGoldReveal_L' || mesh.name === 'V24_ProsceniumButtressGoldReveal_R') {
      const cacheKey = `${material.uniqueId}:v24-buttress-gold-reveal`;
      let buttressRevealMaterial = clonedMaterials.get(cacheKey);
      if (!buttressRevealMaterial) {
        buttressRevealMaterial = material.clone(`${material.name}__v24-buttress-gold-reveal`);
        applyV24ButtressGoldRevealOverride(buttressRevealMaterial);
        clonedMaterials.set(cacheKey, buttressRevealMaterial);
      }

      assignOverrideMaterial(mesh, buttressRevealMaterial);
      continue;
    }

    if (mesh.name === 'V24_CrownHaloCyanInlay') {
      const cacheKey = `${material.uniqueId}:crown-halo-cyan-inlay`;
      let inlayMaterial = clonedMaterials.get(cacheKey);
      if (!inlayMaterial) {
        inlayMaterial = material.clone(`${material.name}__crown-halo-cyan-inlay`);
        applyCrownHaloCyanInlayOverride(inlayMaterial);
        clonedMaterials.set(cacheKey, inlayMaterial);
      }

      assignOverrideMaterial(mesh, inlayMaterial);
      continue;
    }

    if (mesh.name === 'V33_BasinLanternStem_L' || mesh.name === 'V33_BasinLanternStem_R') {
      const cacheKey = `${material.uniqueId}:basin-lantern-stem`;
      let stemMaterial = clonedMaterials.get(cacheKey);
      if (!stemMaterial) {
        stemMaterial = material.clone(`${material.name}__basin-lantern-stem`);
        applyBasinLanternStemOverride(stemMaterial);
        clonedMaterials.set(cacheKey, stemMaterial);
      }

      assignOverrideMaterial(mesh, stemMaterial);
      continue;
    }

    if (mesh.name === 'V33_BasinLanternHousing_L' || mesh.name === 'V33_BasinLanternHousing_R') {
      const cacheKey = `${material.uniqueId}:basin-lantern-housing`;
      let housingMaterial = clonedMaterials.get(cacheKey);
      if (!housingMaterial) {
        housingMaterial = material.clone(`${material.name}__basin-lantern-housing`);
        applyBasinLanternHousingOverride(housingMaterial);
        clonedMaterials.set(cacheKey, housingMaterial);
      }

      assignOverrideMaterial(mesh, housingMaterial);
      continue;
    }

    if (mesh.name === 'V33_BasinLanternCore_L' || mesh.name === 'V33_BasinLanternCore_R') {
      const cacheKey = `${material.uniqueId}:basin-lantern-warm-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__basin-lantern-warm-core`);
        applyBasinLanternWarmCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (
      mesh.name === 'V33_BasinFoliageMidstory_L' ||
      mesh.name === 'V33_BasinFoliageMidstory_R'
    ) {
      const cacheKey = `${material.uniqueId}:basin-foliage-midstory`;
      let foliageMaterial = clonedMaterials.get(cacheKey);
      if (!foliageMaterial) {
        foliageMaterial = material.clone(`${material.name}__basin-foliage-midstory`);
        applyBasinFoliageMidstoryOverride(foliageMaterial);
        clonedMaterials.set(cacheKey, foliageMaterial);
      }

      assignOverrideMaterial(mesh, foliageMaterial);
      continue;
    }

    if (
      mesh.name === 'V33_BasinFoliageCanopy_L' ||
      mesh.name === 'V33_BasinFoliageCanopy_R' ||
      mesh.name === 'V33_VipFoliageCanopy_L' ||
      mesh.name === 'V33_VipFoliageCanopy_R'
    ) {
      const cacheKey = `${material.uniqueId}:layered-foliage-canopy`;
      let canopyMaterial = clonedMaterials.get(cacheKey);
      if (!canopyMaterial) {
        canopyMaterial = material.clone(`${material.name}__layered-foliage-canopy`);
        applyLayeredFoliageCanopyOverride(canopyMaterial);
        clonedMaterials.set(cacheKey, canopyMaterial);
      }

      assignOverrideMaterial(mesh, canopyMaterial);
      continue;
    }

    if (
      mesh.name === 'V33_BasinFoliageUnderstory_L' ||
      mesh.name === 'V33_BasinFoliageUnderstory_R' ||
      mesh.name === 'V33_VipFoliageUnderstory_L' ||
      mesh.name === 'V33_VipFoliageUnderstory_R'
    ) {
      const cacheKey = `${material.uniqueId}:deep-foliage-understory`;
      let understoryMaterial = clonedMaterials.get(cacheKey);
      if (!understoryMaterial) {
        understoryMaterial = material.clone(`${material.name}__deep-foliage-understory`);
        applyDeepFoliageUnderstoryOverride(understoryMaterial);
        clonedMaterials.set(cacheKey, understoryMaterial);
      }

      assignOverrideMaterial(mesh, understoryMaterial);
      continue;
    }

    if (
      mesh.name === 'V32_CrowdCluster_L_Near' ||
      mesh.name === 'V32_CrowdCluster_R_Near' ||
      mesh.name === 'V32_CrowdCluster_L_Mid' ||
      mesh.name === 'V32_CrowdCluster_R_Mid'
    ) {
      const cacheKey = `${material.uniqueId}:crowd-cluster-graphite`;
      let crowdMaterial = clonedMaterials.get(cacheKey);
      if (!crowdMaterial) {
        crowdMaterial = material.clone(`${material.name}__crowd-cluster-graphite`);
        applyCrowdClusterGraphiteOverride(crowdMaterial);
        clonedMaterials.set(cacheKey, crowdMaterial);
      }

      assignOverrideMaterial(mesh, crowdMaterial);
      continue;
    }

    if (
      mesh.name === 'V32_CrowdWearableGlow_L_Near' ||
      mesh.name === 'V32_CrowdWearableGlow_R_Near' ||
      mesh.name === 'V32_CrowdWearableGlow_L_Mid' ||
      mesh.name === 'V32_CrowdWearableGlow_R_Mid'
    ) {
      const cacheKey = `${material.uniqueId}:crowd-wearable-glow`;
      let glowMaterial = clonedMaterials.get(cacheKey);
      if (!glowMaterial) {
        glowMaterial = material.clone(`${material.name}__crowd-wearable-glow`);
        applyCrowdWearableGlowOverride(glowMaterial);
        clonedMaterials.set(cacheKey, glowMaterial);
      }

      assignOverrideMaterial(mesh, glowMaterial);
      continue;
    }

    if (
      mesh.name === 'V72_CrownRiggingFrontTruss' ||
      mesh.name === 'V72_CrownRiggingRearTruss' ||
      mesh.name === 'V72_CrownRiggingCenterSpine'
    ) {
      const cacheKey = `${material.uniqueId}:crown-rigging-structure`;
      let structureMaterial = clonedMaterials.get(cacheKey);
      if (!structureMaterial) {
        structureMaterial = material.clone(`${material.name}__crown-rigging-structure`);
        applyCrownRiggingStructureOverride(structureMaterial);
        clonedMaterials.set(cacheKey, structureMaterial);
      }

      assignOverrideMaterial(mesh, structureMaterial);
      continue;
    }

    if (
      mesh.name === 'V83_MainTrussTowerGoldCrossbarArray_L' ||
      mesh.name === 'V83_MainTrussTowerGoldCrossbarArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:main-truss-tower-gold-crossbar`;
      let crossbarMaterial = clonedMaterials.get(cacheKey);
      if (!crossbarMaterial) {
        crossbarMaterial = material.clone(`${material.name}__main-truss-tower-gold-crossbar`);
        applyMainTrussTowerGoldCrossbarOverride(crossbarMaterial);
        clonedMaterials.set(cacheKey, crossbarMaterial);
      }

      assignOverrideMaterial(mesh, crossbarMaterial);
      continue;
    }

    if (
      mesh.name === 'V83_MainTrussTowerShellArray_L' ||
      mesh.name === 'V83_MainTrussTowerShellArray_R' ||
      mesh.name === 'V83_MainTrussTowerDiagonalArray_L' ||
      mesh.name === 'V83_MainTrussTowerDiagonalArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:main-truss-tower-rig`;
      let rigMaterial = clonedMaterials.get(cacheKey);
      if (!rigMaterial) {
        rigMaterial = material.clone(`${material.name}__main-truss-tower-rig`);
        applyMainTrussTowerRigOverride(rigMaterial);
        clonedMaterials.set(cacheKey, rigMaterial);
      }

      assignOverrideMaterial(mesh, rigMaterial);
      continue;
    }

    if (mesh.name === 'V85_WetPaverStoneBands') {
      const cacheKey = `${material.uniqueId}:wet-paver-stone-band`;
      let stoneMaterial = clonedMaterials.get(cacheKey);
      if (!stoneMaterial) {
        stoneMaterial = material.clone(`${material.name}__wet-paver-stone-band`);
        applyWetPaverStoneBandOverride(stoneMaterial);
        clonedMaterials.set(cacheKey, stoneMaterial);
      }

      assignOverrideMaterial(mesh, stoneMaterial);
      continue;
    }

    if (mesh.name === 'V85_WetPaverGoldSeamBands') {
      const cacheKey = `${material.uniqueId}:wet-paver-gold-seam`;
      let seamMaterial = clonedMaterials.get(cacheKey);
      if (!seamMaterial) {
        seamMaterial = material.clone(`${material.name}__wet-paver-gold-seam`);
        applyWetPaverGoldSeamOverride(seamMaterial);
        clonedMaterials.set(cacheKey, seamMaterial);
      }

      assignOverrideMaterial(mesh, seamMaterial);
      continue;
    }

    if (
      mesh.name === 'V86_SpawnWetInsetPoolArray_L' ||
      mesh.name === 'V86_SpawnWetInsetPoolArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:spawn-wet-inset-pool`;
      let poolMaterial = clonedMaterials.get(cacheKey);
      if (!poolMaterial) {
        poolMaterial = material.clone(`${material.name}__spawn-wet-inset-pool`);
        applySpawnWetInsetPoolOverride(poolMaterial);
        clonedMaterials.set(cacheKey, poolMaterial);
      }

      assignOverrideMaterial(mesh, poolMaterial);
      continue;
    }

    if (
      mesh.name === 'V86_GardenStoneEdgeArray_L' ||
      mesh.name === 'V86_GardenStoneEdgeArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:garden-stone-edge`;
      let edgeMaterial = clonedMaterials.get(cacheKey);
      if (!edgeMaterial) {
        edgeMaterial = material.clone(`${material.name}__garden-stone-edge`);
        applyGardenStoneEdgeOverride(edgeMaterial);
        clonedMaterials.set(cacheKey, edgeMaterial);
      }

      assignOverrideMaterial(mesh, edgeMaterial);
      continue;
    }

    if (
      mesh.name === 'V89_BasinFountainPedestalArray_L' ||
      mesh.name === 'V89_BasinFountainPedestalArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:basin-fountain-pedestal`;
      let pedestalMaterial = clonedMaterials.get(cacheKey);
      if (!pedestalMaterial) {
        pedestalMaterial = material.clone(`${material.name}__basin-fountain-pedestal`);
        applyBasinFountainPedestalOverride(pedestalMaterial);
        clonedMaterials.set(cacheKey, pedestalMaterial);
      }

      assignOverrideMaterial(mesh, pedestalMaterial);
      continue;
    }

    if (
      mesh.name === 'V89_BasinFountainLightArray_L' ||
      mesh.name === 'V89_BasinFountainLightArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:basin-fountain-light`;
      let lightMaterial = clonedMaterials.get(cacheKey);
      if (!lightMaterial) {
        lightMaterial = material.clone(`${material.name}__basin-fountain-light`);
        applyBasinFountainLightOverride(lightMaterial);
        clonedMaterials.set(cacheKey, lightMaterial);
      }

      assignOverrideMaterial(mesh, lightMaterial);
      continue;
    }

    if (
      mesh.name === 'V89_BasinFountainJetArray_L' ||
      mesh.name === 'V89_BasinFountainJetArray_R'
    ) {
      const cacheKey = `${material.uniqueId}:basin-fountain-jet`;
      let jetMaterial = clonedMaterials.get(cacheKey);
      if (!jetMaterial) {
        jetMaterial = material.clone(`${material.name}__basin-fountain-jet`);
        applyBasinFountainJetOverride(jetMaterial);
        clonedMaterials.set(cacheKey, jetMaterial);
      }

      assignOverrideMaterial(mesh, jetMaterial);
      continue;
    }

    if (mesh.name === 'V75_ArcAnchorShadowCluster_L' || mesh.name === 'V75_ArcAnchorShadowCluster_R') {
      const cacheKey = `${material.uniqueId}:arc-anchor-shadow-cluster`;
      let clusterMaterial = clonedMaterials.get(cacheKey);
      if (!clusterMaterial) {
        clusterMaterial = material.clone(`${material.name}__arc-anchor-shadow-cluster`);
        applyArcAnchorShadowClusterOverride(clusterMaterial);
        clonedMaterials.set(cacheKey, clusterMaterial);
      }

      assignOverrideMaterial(mesh, clusterMaterial);
      continue;
    }

    if (mesh.name === 'V76_SideScreenAnchorShadowBrace_L' || mesh.name === 'V76_SideScreenAnchorShadowBrace_R') {
      const cacheKey = `${material.uniqueId}:side-screen-anchor-shadow-brace`;
      let braceMaterial = clonedMaterials.get(cacheKey);
      if (!braceMaterial) {
        braceMaterial = material.clone(`${material.name}__side-screen-anchor-shadow-brace`);
        applySideScreenAnchorShadowBraceOverride(braceMaterial);
        clonedMaterials.set(cacheKey, braceMaterial);
      }

      assignOverrideMaterial(mesh, braceMaterial);
      continue;
    }

    if (mesh.name === 'V77_OvalScreenRecessGoldFrame_L' || mesh.name === 'V77_OvalScreenRecessGoldFrame_R') {
      const cacheKey = `${material.uniqueId}:oval-screen-recess-gold-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__oval-screen-recess-gold-frame`);
        applyOvalScreenRecessGoldFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name === 'V77_OvalScreenRecessShadowPocket_L' || mesh.name === 'V77_OvalScreenRecessShadowPocket_R') {
      const cacheKey = `${material.uniqueId}:oval-screen-recess-shadow-pocket`;
      let pocketMaterial = clonedMaterials.get(cacheKey);
      if (!pocketMaterial) {
        pocketMaterial = material.clone(`${material.name}__oval-screen-recess-shadow-pocket`);
        applyOvalScreenRecessShadowPocketOverride(pocketMaterial);
        clonedMaterials.set(cacheKey, pocketMaterial);
      }

      assignOverrideMaterial(mesh, pocketMaterial);
      continue;
    }

    if (mesh.name.startsWith('V80_OvalScreenPedestalShell_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-pedestal-shell`;
      let pedestalMaterial = clonedMaterials.get(cacheKey);
      if (!pedestalMaterial) {
        pedestalMaterial = material.clone(`${material.name}__oval-screen-pedestal-shell`);
        applyOvalScreenPedestalShellOverride(pedestalMaterial);
        clonedMaterials.set(cacheKey, pedestalMaterial);
      }

      assignOverrideMaterial(mesh, pedestalMaterial);
      continue;
    }

    if (mesh.name.startsWith('V80_OvalScreenCanopyShell_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-canopy-shell`;
      let canopyMaterial = clonedMaterials.get(cacheKey);
      if (!canopyMaterial) {
        canopyMaterial = material.clone(`${material.name}__oval-screen-canopy-shell`);
        applyOvalScreenCanopyShellOverride(canopyMaterial);
        clonedMaterials.set(cacheKey, canopyMaterial);
      }

      assignOverrideMaterial(mesh, canopyMaterial);
      continue;
    }

    if (mesh.name.startsWith('V80_OvalScreenSideButtressShellArray_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-buttress-shell`;
      let buttressMaterial = clonedMaterials.get(cacheKey);
      if (!buttressMaterial) {
        buttressMaterial = material.clone(`${material.name}__oval-screen-buttress-shell`);
        applyOvalScreenButtressShellOverride(buttressMaterial);
        clonedMaterials.set(cacheKey, buttressMaterial);
      }

      assignOverrideMaterial(mesh, buttressMaterial);
      continue;
    }

    if (mesh.name.startsWith('V81_OvalScreenMullionShellArray_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-mullion-shell`;
      let mullionMaterial = clonedMaterials.get(cacheKey);
      if (!mullionMaterial) {
        mullionMaterial = material.clone(`${material.name}__oval-screen-mullion-shell`);
        applyOvalScreenMullionShellOverride(mullionMaterial);
        clonedMaterials.set(cacheKey, mullionMaterial);
      }

      assignOverrideMaterial(mesh, mullionMaterial);
      continue;
    }

    if (mesh.name.startsWith('V80_OvalScreenPedestalGoldTrim_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-pedestal-gold-trim`;
      let pedestalTrimMaterial = clonedMaterials.get(cacheKey);
      if (!pedestalTrimMaterial) {
        pedestalTrimMaterial = material.clone(`${material.name}__oval-screen-pedestal-gold-trim`);
        applyOvalScreenPedestalGoldTrimOverride(pedestalTrimMaterial);
        clonedMaterials.set(cacheKey, pedestalTrimMaterial);
      }

      assignOverrideMaterial(mesh, pedestalTrimMaterial);
      continue;
    }

    if (mesh.name.startsWith('V80_OvalScreenCanopyGoldTrim_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-canopy-gold-trim`;
      let canopyTrimMaterial = clonedMaterials.get(cacheKey);
      if (!canopyTrimMaterial) {
        canopyTrimMaterial = material.clone(`${material.name}__oval-screen-canopy-gold-trim`);
        applyOvalScreenCanopyGoldTrimOverride(canopyTrimMaterial);
        clonedMaterials.set(cacheKey, canopyTrimMaterial);
      }

      assignOverrideMaterial(mesh, canopyTrimMaterial);
      continue;
    }

    if (mesh.name.startsWith('V80_OvalScreenSideButtressGoldTrimArray_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-buttress-gold-trim`;
      let buttressTrimMaterial = clonedMaterials.get(cacheKey);
      if (!buttressTrimMaterial) {
        buttressTrimMaterial = material.clone(`${material.name}__oval-screen-buttress-gold-trim`);
        applyOvalScreenButtressGoldTrimOverride(buttressTrimMaterial);
        clonedMaterials.set(cacheKey, buttressTrimMaterial);
      }

      assignOverrideMaterial(mesh, buttressTrimMaterial);
      continue;
    }

    if (mesh.name.startsWith('V81_OvalScreenMullionGoldTrimArray_')) {
      const cacheKey = `${material.uniqueId}:oval-screen-mullion-gold-trim`;
      let mullionTrimMaterial = clonedMaterials.get(cacheKey);
      if (!mullionTrimMaterial) {
        mullionTrimMaterial = material.clone(`${material.name}__oval-screen-mullion-gold-trim`);
        applyOvalScreenMullionGoldTrimOverride(mullionTrimMaterial);
        clonedMaterials.set(cacheKey, mullionTrimMaterial);
      }

      assignOverrideMaterial(mesh, mullionTrimMaterial);
      continue;
    }

    if (mesh.name.startsWith('V120_BasinDeckRelief_')) {
      const cacheKey = `${material.uniqueId}:basin-deck-relief`;
      let deckReliefMaterial = clonedMaterials.get(cacheKey);
      if (!deckReliefMaterial) {
        deckReliefMaterial = material.clone(`${material.name}__basin-deck-relief`);
        applyBasinDeckReliefOverride(deckReliefMaterial);
        clonedMaterials.set(cacheKey, deckReliefMaterial);
      }

      assignOverrideMaterial(mesh, deckReliefMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V99_BasinParapetRelief_') ||
      mesh.name.startsWith('V118_BasinWallRelief_') ||
      mesh.name.startsWith('V121_BasinRetainingRelief_') ||
      mesh.name === 'V121_BasinBridgeRelief_North' ||
      mesh.name === 'V121_BasinBridgeRelief_South' ||
      mesh.name === 'V121_BasinBridgeRelief_Center'
    ) {
      const cacheKey = `${material.uniqueId}:basin-retaining-relief`;
      let retainingMaterial = clonedMaterials.get(cacheKey);
      if (!retainingMaterial) {
        retainingMaterial = material.clone(`${material.name}__basin-retaining-relief`);
        applyBasinRetainingReliefOverride(retainingMaterial);
        clonedMaterials.set(cacheKey, retainingMaterial);
      }

      assignOverrideMaterial(mesh, retainingMaterial);
      continue;
    }

    if (mesh.name === 'V99_BasinChannelRelief') {
      const cacheKey = `${material.uniqueId}:basin-channel-relief`;
      let basinStoneMaterial = clonedMaterials.get(cacheKey);
      if (!basinStoneMaterial) {
        basinStoneMaterial = material.clone(`${material.name}__basin-channel-relief`);
        applyBasinChannelReliefOverride(basinStoneMaterial);
        clonedMaterials.set(cacheKey, basinStoneMaterial);
      }

      assignOverrideMaterial(mesh, basinStoneMaterial);
      continue;
    }

    if (mesh.name === 'V99_BasinRunwaySpine') {
      const cacheKey = `${material.uniqueId}:basin-runway-spine`;
      let basinStoneMaterial = clonedMaterials.get(cacheKey);
      if (!basinStoneMaterial) {
        basinStoneMaterial = material.clone(`${material.name}__basin-runway-spine`);
        applyBasinRunwaySpineOverride(basinStoneMaterial);
        clonedMaterials.set(cacheKey, basinStoneMaterial);
      }

      assignOverrideMaterial(mesh, basinStoneMaterial);
      continue;
    }

    if (mesh.name === 'V99_BasinRetainingWall_L' || mesh.name === 'V99_BasinRetainingWall_R') {
      const cacheKey = `${material.uniqueId}:basin-retaining-wall`;
      let basinStoneMaterial = clonedMaterials.get(cacheKey);
      if (!basinStoneMaterial) {
        basinStoneMaterial = material.clone(`${material.name}__basin-retaining-wall`);
        applyBasinRetainingWallOverride(basinStoneMaterial);
        clonedMaterials.set(cacheKey, basinStoneMaterial);
      }

      assignOverrideMaterial(mesh, basinStoneMaterial);
      continue;
    }

    if (mesh.name === 'V100_CentralWaterLightHousingArray') {
      const cacheKey = `${material.uniqueId}:central-water-light-housing`;
      let housingMaterial = clonedMaterials.get(cacheKey);
      if (!housingMaterial) {
        housingMaterial = material.clone(`${material.name}__central-water-light-housing`);
        applyCentralWaterLightHousingOverride(housingMaterial);
        clonedMaterials.set(cacheKey, housingMaterial);
      }

      assignOverrideMaterial(mesh, housingMaterial);
      continue;
    }

    if (mesh.name === 'V100_CentralWaterLightGoldTrimArray') {
      const cacheKey = `${material.uniqueId}:central-water-light-gold-trim`;
      let trimMaterial = clonedMaterials.get(cacheKey);
      if (!trimMaterial) {
        trimMaterial = material.clone(`${material.name}__central-water-light-gold-trim`);
        applyCentralWaterLightGoldTrimOverride(trimMaterial);
        clonedMaterials.set(cacheKey, trimMaterial);
      }

      assignOverrideMaterial(mesh, trimMaterial);
      continue;
    }

    if (mesh.name === 'V100_CentralWaterLightLensArray') {
      const cacheKey = `${material.uniqueId}:central-water-light-lens`;
      let lensMaterial = clonedMaterials.get(cacheKey);
      if (!lensMaterial) {
        lensMaterial = material.clone(`${material.name}__central-water-light-lens`);
        applyCentralWaterLightLensOverride(lensMaterial);
        clonedMaterials.set(cacheKey, lensMaterial);
      }

      assignOverrideMaterial(mesh, lensMaterial);
      continue;
    }

    if (mesh.name === 'V122_PortalApronRelief') {
      const cacheKey = `${material.uniqueId}:portal-apron-relief-shell`;
      let reliefMaterial = clonedMaterials.get(cacheKey);
      if (!reliefMaterial) {
        reliefMaterial = material.clone(`${material.name}__portal-apron-relief-shell`);
        applyPortalApronReliefShellOverride(reliefMaterial);
        clonedMaterials.set(cacheKey, reliefMaterial);
      }

      assignOverrideMaterial(mesh, reliefMaterial);
      continue;
    }

    if (mesh.name.startsWith('V122_StageShoulderRelief_')) {
      const cacheKey = `${material.uniqueId}:stage-shoulder-relief-shell`;
      let reliefMaterial = clonedMaterials.get(cacheKey);
      if (!reliefMaterial) {
        reliefMaterial = material.clone(`${material.name}__stage-shoulder-relief-shell`);
        applyStageShoulderReliefShellOverride(reliefMaterial);
        clonedMaterials.set(cacheKey, reliefMaterial);
      }

      assignOverrideMaterial(mesh, reliefMaterial);
      continue;
    }

    if (mesh.name === 'V123_CentralStairGoldNosingArray') {
      const cacheKey = `${material.uniqueId}:central-stair-gold-nosing`;
      let stairGoldMaterial = clonedMaterials.get(cacheKey);
      if (!stairGoldMaterial) {
        stairGoldMaterial = material.clone(`${material.name}__central-stair-gold-nosing`);
        applyCentralStairGoldNosingOverride(stairGoldMaterial);
        clonedMaterials.set(cacheKey, stairGoldMaterial);
      }

      assignOverrideMaterial(mesh, stairGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V123_SpawnRouteGoldEdgeArray_')) {
      const cacheKey = `${material.uniqueId}:spawn-route-gold-edge`;
      let routeGoldMaterial = clonedMaterials.get(cacheKey);
      if (!routeGoldMaterial) {
        routeGoldMaterial = material.clone(`${material.name}__spawn-route-gold-edge`);
        applySpawnRouteGoldEdgeOverride(routeGoldMaterial);
        clonedMaterials.set(cacheKey, routeGoldMaterial);
      }

      assignOverrideMaterial(mesh, routeGoldMaterial);
      continue;
    }

    if (mesh.name === 'V123_SpawnRouteWetCenterInlayArray') {
      const cacheKey = `${material.uniqueId}:spawn-route-wet-center-inlay`;
      let wetInlayMaterial = clonedMaterials.get(cacheKey);
      if (!wetInlayMaterial) {
        wetInlayMaterial = material.clone(`${material.name}__spawn-route-wet-center-inlay`);
        applySpawnRouteWetCenterInlayOverride(wetInlayMaterial);
        clonedMaterials.set(cacheKey, wetInlayMaterial);
      }

      assignOverrideMaterial(mesh, wetInlayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V124_CrowdControlFrameArray_')) {
      const cacheKey = `${material.uniqueId}:crowd-control-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__crowd-control-frame`);
        applyCrowdControlFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name.startsWith('V124_CrowdControlRailArray_')) {
      const cacheKey = `${material.uniqueId}:crowd-control-rail`;
      let railMaterial = clonedMaterials.get(cacheKey);
      if (!railMaterial) {
        railMaterial = material.clone(`${material.name}__crowd-control-rail`);
        applyCrowdControlRailOverride(railMaterial);
        clonedMaterials.set(cacheKey, railMaterial);
      }

      assignOverrideMaterial(mesh, railMaterial);
      continue;
    }

    if (mesh.name.startsWith('V125_CrowdBarrierBaseArray_')) {
      const cacheKey = `${material.uniqueId}:crowd-barrier-base`;
      let baseMaterial = clonedMaterials.get(cacheKey);
      if (!baseMaterial) {
        baseMaterial = material.clone(`${material.name}__crowd-barrier-base`);
        applyCrowdBarrierBaseOverride(baseMaterial);
        clonedMaterials.set(cacheKey, baseMaterial);
      }

      assignOverrideMaterial(mesh, baseMaterial);
      continue;
    }

    if (mesh.name.startsWith('V125_CrowdBarrierRailArray_')) {
      const cacheKey = `${material.uniqueId}:crowd-barrier-rail`;
      let railMaterial = clonedMaterials.get(cacheKey);
      if (!railMaterial) {
        railMaterial = material.clone(`${material.name}__crowd-barrier-rail`);
        applyCrowdBarrierRailOverride(railMaterial);
        clonedMaterials.set(cacheKey, railMaterial);
      }

      assignOverrideMaterial(mesh, railMaterial);
      continue;
    }

    if (mesh.name === 'V48_SpawnCableTroughBlackShell') {
      const cacheKey = `${material.uniqueId}:spawn-cable-trough-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__spawn-cable-trough-shell`);
        applyCrowdBarrierBaseOverride(shellMaterial);
        shellMaterial.metadata = {
          ...shellMaterial.metadata,
          mainStageMaterialOverride: 'spawn-cable-trough-shell',
        };
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
      continue;
    }

    if (mesh.name === 'V48_SpawnCableTroughGoldCollar') {
      const cacheKey = `${material.uniqueId}:spawn-cable-trough-collar`;
      let collarMaterial = clonedMaterials.get(cacheKey);
      if (!collarMaterial) {
        collarMaterial = material.clone(`${material.name}__spawn-cable-trough-collar`);
        applyProcessionalRouteGoldTrimOverride(collarMaterial);
        collarMaterial.metadata = {
          ...collarMaterial.metadata,
          mainStageMaterialOverride: 'spawn-cable-trough-collar',
        };
        clonedMaterials.set(cacheKey, collarMaterial);
      }

      assignOverrideMaterial(mesh, collarMaterial);
      continue;
    }

    if (mesh.name === 'V48_SpawnCableTroughWetInset') {
      const cacheKey = `${material.uniqueId}:spawn-cable-trough-wet-inset`;
      let insetMaterial = clonedMaterials.get(cacheKey);
      if (!insetMaterial) {
        insetMaterial = material.clone(`${material.name}__spawn-cable-trough-wet-inset`);
        applySpawnRouteWetCenterInlayOverride(insetMaterial);
        insetMaterial.metadata = {
          ...insetMaterial.metadata,
          mainStageMaterialOverride: 'spawn-cable-trough-wet-inset',
        };
        clonedMaterials.set(cacheKey, insetMaterial);
      }

      assignOverrideMaterial(mesh, insetMaterial);
      continue;
    }

    if (mesh.name === 'V49_ScreenServiceCatwalkBlackFrame') {
      const cacheKey = `${material.uniqueId}:screen-service-catwalk-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__screen-service-catwalk-frame`);
        applyCrowdBarrierBaseOverride(frameMaterial);
        frameMaterial.metadata = {
          ...frameMaterial.metadata,
          mainStageMaterialOverride: 'screen-service-catwalk-frame',
        };
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name === 'V49_ScreenServiceCatwalkCableLoom') {
      const cacheKey = `${material.uniqueId}:screen-service-catwalk-cable-loom`;
      let loomMaterial = clonedMaterials.get(cacheKey);
      if (!loomMaterial) {
        loomMaterial = material.clone(`${material.name}__screen-service-catwalk-cable-loom`);
        applyScreenServiceCatwalkCableLoomOverride(loomMaterial);
        clonedMaterials.set(cacheKey, loomMaterial);
      }

      assignOverrideMaterial(mesh, loomMaterial);
      continue;
    }

    if (mesh.name === 'V49_ScreenServiceCatwalkGoldGuardrail') {
      const cacheKey = `${material.uniqueId}:screen-service-catwalk-guardrail`;
      let guardrailMaterial = clonedMaterials.get(cacheKey);
      if (!guardrailMaterial) {
        guardrailMaterial = material.clone(`${material.name}__screen-service-catwalk-guardrail`);
        applyProcessionalRouteGoldTrimOverride(guardrailMaterial);
        guardrailMaterial.metadata = {
          ...guardrailMaterial.metadata,
          mainStageMaterialOverride: 'screen-service-catwalk-guardrail',
        };
        clonedMaterials.set(cacheKey, guardrailMaterial);
      }

      assignOverrideMaterial(mesh, guardrailMaterial);
      continue;
    }

    if (mesh.name === 'V49_ScreenServiceCatwalkCyanPracticals') {
      const cacheKey = `${material.uniqueId}:screen-service-catwalk-practicals`;
      let practicalMaterial = clonedMaterials.get(cacheKey);
      if (!practicalMaterial) {
        practicalMaterial = material.clone(`${material.name}__screen-service-catwalk-practicals`);
        applyArrivalRunwayCyanThreadsOverride(practicalMaterial);
        practicalMaterial.metadata = {
          ...practicalMaterial.metadata,
          mainStageMaterialOverride: 'screen-service-catwalk-practicals',
        };
        clonedMaterials.set(cacheKey, practicalMaterial);
      }

      assignOverrideMaterial(mesh, practicalMaterial);
      continue;
    }

    if (mesh.name.startsWith('V39_CrownSideRibGoldCluster_')) {
      const cacheKey = `${material.uniqueId}:crown-side-rib-gold`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__crown-side-rib-gold`);
        applyCelestialHaloOuterRingOverride(goldMaterial);
        goldMaterial.metadata = {
          ...goldMaterial.metadata,
          mainStageMaterialOverride: 'crown-side-rib-gold',
        };
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V39_CrownSideRibCyanInset_')) {
      const cacheKey = `${material.uniqueId}:crown-side-rib-cyan`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__crown-side-rib-cyan`);
        applyCelestialHaloCyanEdgeOverride(cyanMaterial);
        cyanMaterial.metadata = {
          ...cyanMaterial.metadata,
          mainStageMaterialOverride: 'crown-side-rib-cyan',
        };
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (mesh.name.startsWith('V41_CrownBladePearlLamellaCluster_')) {
      const cacheKey = `${material.uniqueId}:crown-blade-lamella-pearl`;
      let pearlMaterial = clonedMaterials.get(cacheKey);
      if (!pearlMaterial) {
        pearlMaterial = material.clone(`${material.name}__crown-blade-lamella-pearl`);
        applyCrownBladeLamellaPearlOverride(pearlMaterial);
        clonedMaterials.set(cacheKey, pearlMaterial);
      }

      assignOverrideMaterial(mesh, pearlMaterial);
      continue;
    }

    if (mesh.name.startsWith('V41_CrownBladeGoldRevealCluster_')) {
      const cacheKey = `${material.uniqueId}:crown-blade-gold-reveal`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__crown-blade-gold-reveal`);
        applyCrownBladeGoldRevealOverride(goldMaterial);
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V41_CrownBladeCyanInsetCluster_')) {
      const cacheKey = `${material.uniqueId}:crown-blade-cyan-inset`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__crown-blade-cyan-inset`);
        applyCrownBladeCyanInsetOverride(cyanMaterial);
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V42_TrussDiagonalBraceA_') ||
      mesh.name.startsWith('V42_TrussDiagonalBraceB_')
    ) {
      const cacheKey = `${material.uniqueId}:truss-diagonal-brace`;
      let braceMaterial = clonedMaterials.get(cacheKey);
      if (!braceMaterial) {
        braceMaterial = material.clone(`${material.name}__truss-diagonal-brace`);
        applyTrussDiagonalBraceOverride(braceMaterial);
        clonedMaterials.set(cacheKey, braceMaterial);
      }

      assignOverrideMaterial(mesh, braceMaterial);
      continue;
    }

    if (mesh.name.startsWith('V37_ProductionTrussTowerFrame_')) {
      const cacheKey = `${material.uniqueId}:production-truss-tower-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__production-truss-tower-frame`);
        applyProductionTrussTowerFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name.startsWith('V37_ProductionTrussCrossBrace_')) {
      const cacheKey = `${material.uniqueId}:production-truss-cross-brace`;
      let braceMaterial = clonedMaterials.get(cacheKey);
      if (!braceMaterial) {
        braceMaterial = material.clone(`${material.name}__production-truss-cross-brace`);
        applyProductionTrussCrossBraceOverride(braceMaterial);
        clonedMaterials.set(cacheKey, braceMaterial);
      }

      assignOverrideMaterial(mesh, braceMaterial);
      continue;
    }

    if (mesh.name.startsWith('V37_ProductionTowerServiceLadder_')) {
      const cacheKey = `${material.uniqueId}:production-tower-service-ladder`;
      let ladderMaterial = clonedMaterials.get(cacheKey);
      if (!ladderMaterial) {
        ladderMaterial = material.clone(`${material.name}__production-tower-service-ladder`);
        applyProductionTowerServiceLadderOverride(ladderMaterial);
        clonedMaterials.set(cacheKey, ladderMaterial);
      }

      assignOverrideMaterial(mesh, ladderMaterial);
      continue;
    }

    if (mesh.name.startsWith('V37_ProductionTowerBeaconArray_')) {
      const cacheKey = `${material.uniqueId}:production-tower-beacon`;
      let beaconMaterial = clonedMaterials.get(cacheKey);
      if (!beaconMaterial) {
        beaconMaterial = material.clone(`${material.name}__production-tower-beacon`);
        applyProductionTowerBeaconOverride(beaconMaterial);
        clonedMaterials.set(cacheKey, beaconMaterial);
      }

      assignOverrideMaterial(mesh, beaconMaterial);
      continue;
    }

    if (mesh.name.startsWith('V38_WingFacadeArcadePierCluster_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-arcade-pier`;
      let pierMaterial = clonedMaterials.get(cacheKey);
      if (!pierMaterial) {
        pierMaterial = material.clone(`${material.name}__wing-facade-arcade-pier`);
        applyWingFacadeArcadePierOverride(pierMaterial);
        clonedMaterials.set(cacheKey, pierMaterial);
      }

      assignOverrideMaterial(mesh, pierMaterial);
      continue;
    }

    if (mesh.name.startsWith('V38_WingFacadeGoldCapital_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-gold-capital`;
      let capitalMaterial = clonedMaterials.get(cacheKey);
      if (!capitalMaterial) {
        capitalMaterial = material.clone(`${material.name}__wing-facade-gold-capital`);
        applyWingFacadeGoldCapitalOverride(capitalMaterial);
        clonedMaterials.set(cacheKey, capitalMaterial);
      }

      assignOverrideMaterial(mesh, capitalMaterial);
      continue;
    }

    if (mesh.name.startsWith('V38_WingFacadeShadowReveal_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-shadow-reveal`;
      let shadowMaterial = clonedMaterials.get(cacheKey);
      if (!shadowMaterial) {
        shadowMaterial = material.clone(`${material.name}__wing-facade-shadow-reveal`);
        applyWingFacadeShadowRevealOverride(shadowMaterial);
        clonedMaterials.set(cacheKey, shadowMaterial);
      }

      assignOverrideMaterial(mesh, shadowMaterial);
      continue;
    }

    if (
      mesh.name === 'V46_CrownLightDropCableCluster' ||
      mesh.name === 'V46_CrownMovingLightHousingCluster'
    ) {
      const isCableCluster = mesh.name === 'V46_CrownLightDropCableCluster';
      const cacheKey = isCableCluster
        ? `${material.uniqueId}:crown-light-drop-cable`
        : `${material.uniqueId}:crown-moving-light-housing`;
      let hardwareMaterial = clonedMaterials.get(cacheKey);
      if (!hardwareMaterial) {
        hardwareMaterial = material.clone(
          isCableCluster
            ? `${material.name}__crown-light-drop-cable`
            : `${material.name}__crown-moving-light-housing`,
        );
        if (isCableCluster) {
          applyCrownLightDropCableOverride(hardwareMaterial);
        } else {
          applyCrownMovingLightHousingOverride(hardwareMaterial);
        }
        hardwareMaterial.metadata = {
          ...hardwareMaterial.metadata,
        };
        clonedMaterials.set(cacheKey, hardwareMaterial);
      }

      assignOverrideMaterial(mesh, hardwareMaterial);
      continue;
    }

    if (mesh.name === 'V46_CrownCyanLensCluster') {
      const cacheKey = `${material.uniqueId}:crown-moving-light-lens`;
      let lensMaterial = clonedMaterials.get(cacheKey);
      if (!lensMaterial) {
        lensMaterial = material.clone(`${material.name}__crown-moving-light-lens`);
        applyCelestialHaloCyanEdgeOverride(lensMaterial);
        lensMaterial.metadata = {
          ...lensMaterial.metadata,
          mainStageMaterialOverride: 'crown-moving-light-lens',
        };
        clonedMaterials.set(cacheKey, lensMaterial);
      }

      assignOverrideMaterial(mesh, lensMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V87_WingFacadeShadowFrameArray_') ||
      mesh.name.startsWith('V87_WingFacadeShadowVaultArray_')
    ) {
      const cacheKey = `${material.uniqueId}:wing-facade-shadow-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__wing-facade-shadow-frame`);
        applyWingFacadeShadowFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name.startsWith('V116_ProsceniumShadowPocketArray_')) {
      const cacheKey = `${material.uniqueId}:proscenium-shadow-pocket`;
      let pocketMaterial = clonedMaterials.get(cacheKey);
      if (!pocketMaterial) {
        pocketMaterial = material.clone(`${material.name}__proscenium-shadow-pocket`);
        applyProsceniumShadowPocketOverride(pocketMaterial);
        clonedMaterials.set(cacheKey, pocketMaterial);
      }

      assignOverrideMaterial(mesh, pocketMaterial);
      continue;
    }

    if (mesh.name.startsWith('V87_WingFacadeGoldLintelArray_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-gold-lintel`;
      let lintelMaterial = clonedMaterials.get(cacheKey);
      if (!lintelMaterial) {
        lintelMaterial = material.clone(`${material.name}__wing-facade-gold-lintel`);
        applyWingFacadeGoldLintelOverride(lintelMaterial);
        clonedMaterials.set(cacheKey, lintelMaterial);
      }

      assignOverrideMaterial(mesh, lintelMaterial);
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

      assignOverrideMaterial(mesh, fasciaMaterial);
      continue;
    }

    if (mesh.name.startsWith('V88_RearCathedralLancetPearlArray_')) {
      const cacheKey = `${material.uniqueId}:rear-cathedral-lancet-pearl`;
      let lancetMaterial = clonedMaterials.get(cacheKey);
      if (!lancetMaterial) {
        lancetMaterial = material.clone(`${material.name}__rear-cathedral-lancet-pearl`);
        applyRearCathedralLancetPearlOverride(lancetMaterial);
        clonedMaterials.set(cacheKey, lancetMaterial);
      }

      assignOverrideMaterial(mesh, lancetMaterial);
      continue;
    }

    if (mesh.name.startsWith('V88_RearCathedralLancetFrameArray_')) {
      const cacheKey = `${material.uniqueId}:rear-cathedral-lancet-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__rear-cathedral-lancet-frame`);
        applyRearCathedralLancetFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name.startsWith('V88_RearCathedralLancetGoldArray_')) {
      const cacheKey = `${material.uniqueId}:rear-cathedral-lancet-gold`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__rear-cathedral-lancet-gold`);
        applyRearCathedralLancetGoldOverride(goldMaterial);
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
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

      assignOverrideMaterial(mesh, fieldMaterial);
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

      assignOverrideMaterial(mesh, paverMaterial);
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

      assignOverrideMaterial(mesh, reflectionMaterial);
      continue;
    }

    if (mesh.name === 'V34_ApproachGoldInlayNetwork') {
      const cacheKey = `${material.uniqueId}:approach-gold-inlay-network`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__approach-gold-inlay-network`);
        applyApproachGoldInlayNetworkOverride(goldMaterial);
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V34_ApproachEdgeRail_')) {
      const cacheKey = `${material.uniqueId}:approach-edge-rail`;
      let railMaterial = clonedMaterials.get(cacheKey);
      if (!railMaterial) {
        railMaterial = material.clone(`${material.name}__approach-edge-rail`);
        applyApproachEdgeRailOverride(railMaterial);
        clonedMaterials.set(cacheKey, railMaterial);
      }

      assignOverrideMaterial(mesh, railMaterial);
      continue;
    }

    if (mesh.name.startsWith('V34_BackPlazaGatewayGoldCrown_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-gateway-gold-crown`;
      let crownMaterial = clonedMaterials.get(cacheKey);
      if (!crownMaterial) {
        crownMaterial = material.clone(`${material.name}__back-plaza-gateway-gold-crown`);
        applyBackPlazaGatewayGoldCrownOverride(crownMaterial);
        clonedMaterials.set(cacheKey, crownMaterial);
      }

      assignOverrideMaterial(mesh, crownMaterial);
      continue;
    }

    if (mesh.name.startsWith('V34_BackPlazaBannerRail_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-banner-rail`;
      let bannerMaterial = clonedMaterials.get(cacheKey);
      if (!bannerMaterial) {
        bannerMaterial = material.clone(`${material.name}__back-plaza-banner-rail`);
        applyBackPlazaBannerRailOverride(bannerMaterial);
        clonedMaterials.set(cacheKey, bannerMaterial);
      }

      assignOverrideMaterial(mesh, bannerMaterial);
      continue;
    }

    if (mesh.name.startsWith('V34_BarricadeAssembly_')) {
      const cacheKey = `${material.uniqueId}:approach-barricade-assembly`;
      let barricadeMaterial = clonedMaterials.get(cacheKey);
      if (!barricadeMaterial) {
        barricadeMaterial = material.clone(`${material.name}__approach-barricade-assembly`);
        applyApproachBarricadeAssemblyOverride(barricadeMaterial);
        clonedMaterials.set(cacheKey, barricadeMaterial);
      }

      assignOverrideMaterial(mesh, barricadeMaterial);
      continue;
    }

    if (mesh.name === 'V112_CrownCrystalGoldEdgeArray') {
      const cacheKey = `${material.uniqueId}:crown-crystal-gold-edge`;
      let goldEdgeMaterial = clonedMaterials.get(cacheKey);
      if (!goldEdgeMaterial) {
        goldEdgeMaterial = material.clone(`${material.name}__crown-crystal-gold-edge`);
        applyCrownCrystalGoldEdgeOverride(goldEdgeMaterial);
        clonedMaterials.set(cacheKey, goldEdgeMaterial);
      }

      assignOverrideMaterial(mesh, goldEdgeMaterial);
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

      assignOverrideMaterial(mesh, lamellaMaterial);
      continue;
    }

    if (mesh.name.startsWith('V113_CrownShellGoldSeamArray_')) {
      const cacheKey = `${material.uniqueId}:crown-shell-gold-seam`;
      let goldSeamMaterial = clonedMaterials.get(cacheKey);
      if (!goldSeamMaterial) {
        goldSeamMaterial = material.clone(`${material.name}__crown-shell-gold-seam`);
        applyCrownShellGoldSeamOverride(goldSeamMaterial);
        clonedMaterials.set(cacheKey, goldSeamMaterial);
      }

      assignOverrideMaterial(mesh, goldSeamMaterial);
      continue;
    }

    if (mesh.name === 'V114_CelestialHaloOuterRingArray') {
      const cacheKey = `${material.uniqueId}:celestial-halo-outer-ring`;
      let outerRingMaterial = clonedMaterials.get(cacheKey);
      if (!outerRingMaterial) {
        outerRingMaterial = material.clone(`${material.name}__celestial-halo-outer-ring`);
        applyCelestialHaloOuterRingOverride(outerRingMaterial);
        clonedMaterials.set(cacheKey, outerRingMaterial);
      }

      assignOverrideMaterial(mesh, outerRingMaterial);
      continue;
    }

    if (mesh.name === 'V114_CelestialHaloInnerRingArray') {
      const cacheKey = `${material.uniqueId}:celestial-halo-inner-ring`;
      let innerRingMaterial = clonedMaterials.get(cacheKey);
      if (!innerRingMaterial) {
        innerRingMaterial = material.clone(`${material.name}__celestial-halo-inner-ring`);
        applyCelestialHaloInnerRingOverride(innerRingMaterial);
        clonedMaterials.set(cacheKey, innerRingMaterial);
      }

      assignOverrideMaterial(mesh, innerRingMaterial);
      continue;
    }

    if (mesh.name === 'V114_CelestialHaloCyanEdgeArray') {
      const cacheKey = `${material.uniqueId}:celestial-halo-cyan-edge`;
      let cyanEdgeMaterial = clonedMaterials.get(cacheKey);
      if (!cyanEdgeMaterial) {
        cyanEdgeMaterial = material.clone(`${material.name}__celestial-halo-cyan-edge`);
        applyCelestialHaloCyanEdgeOverride(cyanEdgeMaterial);
        clonedMaterials.set(cacheKey, cyanEdgeMaterial);
      }

      assignOverrideMaterial(mesh, cyanEdgeMaterial);
      continue;
    }

    if (mesh.name === 'V115_CenterScreenMullionArray') {
      const cacheKey = `${material.uniqueId}:center-screen-mullion`;
      let mullionMaterial = clonedMaterials.get(cacheKey);
      if (!mullionMaterial) {
        mullionMaterial = material.clone(`${material.name}__center-screen-mullion`);
        applyCenterScreenMullionOverride(mullionMaterial);
        clonedMaterials.set(cacheKey, mullionMaterial);
      }

      assignOverrideMaterial(mesh, mullionMaterial);
      continue;
    }

    if (mesh.name === 'V115_CenterScreenCyanEdgeArray') {
      const cacheKey = `${material.uniqueId}:center-screen-cyan-edge`;
      let cyanEdgeMaterial = clonedMaterials.get(cacheKey);
      if (!cyanEdgeMaterial) {
        cyanEdgeMaterial = material.clone(`${material.name}__center-screen-cyan-edge`);
        applyCenterScreenCyanEdgeOverride(cyanEdgeMaterial);
        clonedMaterials.set(cacheKey, cyanEdgeMaterial);
      }

      assignOverrideMaterial(mesh, cyanEdgeMaterial);
      continue;
    }

    if (mesh.name.startsWith('V118_BasinWaterSheet_')) {
      const cacheKey = `${material.uniqueId}:basin-water-sheet`;
      let waterSheetMaterial = clonedMaterials.get(cacheKey);
      if (!waterSheetMaterial) {
        waterSheetMaterial = material.clone(`${material.name}__basin-water-sheet`);
        applyBasinWaterSheetOverride(waterSheetMaterial);
        clonedMaterials.set(cacheKey, waterSheetMaterial);
      }

      assignOverrideMaterial(mesh, waterSheetMaterial);
      continue;
    }

    if (mesh.name.startsWith('V119_OvalPortalGlowGoldArray_')) {
      const cacheKey = `${material.uniqueId}:oval-portal-glow-gold`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__oval-portal-glow-gold`);
        applyOvalPortalGlowGoldOverride(goldMaterial);
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V119_OvalPortalGlowEmissionArray_')) {
      const cacheKey = `${material.uniqueId}:oval-portal-glow-emission`;
      let emissionMaterial = clonedMaterials.get(cacheKey);
      if (!emissionMaterial) {
        emissionMaterial = material.clone(`${material.name}__oval-portal-glow-emission`);
        applyOvalPortalGlowEmissionOverride(emissionMaterial);
        clonedMaterials.set(cacheKey, emissionMaterial);
      }

      assignOverrideMaterial(mesh, emissionMaterial);
      continue;
    }

    if (mesh.name.startsWith('V111_RearShellPanelArray_')) {
      const cacheKey = `${material.uniqueId}:rear-shell-panel`;
      let panelMaterial = clonedMaterials.get(cacheKey);
      if (!panelMaterial) {
        panelMaterial = material.clone(`${material.name}__rear-shell-panel`);
        applyRearShellPanelOverride(panelMaterial);
        clonedMaterials.set(cacheKey, panelMaterial);
      }

      assignOverrideMaterial(mesh, panelMaterial);
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

      assignOverrideMaterial(mesh, copingMaterial);
      continue;
    }

    if (mesh.name.startsWith('V98_CrownButtressGoldInlay_')) {
      const cacheKey = `${material.uniqueId}:crown-buttress-gold-inlay`;
      let inlayMaterial = clonedMaterials.get(cacheKey);
      if (!inlayMaterial) {
        inlayMaterial = material.clone(`${material.name}__crown-buttress-gold-inlay`);
        applyCrownButtressGoldInlayOverride(inlayMaterial);
        clonedMaterials.set(cacheKey, inlayMaterial);
      }

      assignOverrideMaterial(mesh, inlayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V98_CrownButtressRelief_')) {
      const cacheKey = `${material.uniqueId}:crown-buttress-relief`;
      let reliefMaterial = clonedMaterials.get(cacheKey);
      if (!reliefMaterial) {
        reliefMaterial = material.clone(`${material.name}__crown-buttress-relief`);
        applyCrownButtressReliefOverride(reliefMaterial);
        clonedMaterials.set(cacheKey, reliefMaterial);
      }

      assignOverrideMaterial(mesh, reliefMaterial);
      continue;
    }

    if (mesh.name.startsWith('V107_OuterWingButtressArray_')) {
      const cacheKey = `${material.uniqueId}:outer-wing-buttress-shell`;
      let buttressMaterial = clonedMaterials.get(cacheKey);
      if (!buttressMaterial) {
        buttressMaterial = material.clone(`${material.name}__outer-wing-buttress-shell`);
        applyOuterWingButtressShellOverride(buttressMaterial);
        clonedMaterials.set(cacheKey, buttressMaterial);
      }

      assignOverrideMaterial(mesh, buttressMaterial);
      continue;
    }

    if (mesh.name.startsWith('V109_WingFacadeArchInlayArray_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-arch-inlay`;
      let inlayMaterial = clonedMaterials.get(cacheKey);
      if (!inlayMaterial) {
        inlayMaterial = material.clone(`${material.name}__wing-facade-arch-inlay`);
        applyWingFacadeArchInlayOverride(inlayMaterial);
        clonedMaterials.set(cacheKey, inlayMaterial);
      }

      assignOverrideMaterial(mesh, inlayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V110_WingFacadeInsetGlowArray_')) {
      const cacheKey = `${material.uniqueId}:wing-facade-inset-glow`;
      let glowMaterial = clonedMaterials.get(cacheKey);
      if (!glowMaterial) {
        glowMaterial = material.clone(`${material.name}__wing-facade-inset-glow`);
        applyWingFacadeInsetGlowOverride(glowMaterial);
        clonedMaterials.set(cacheKey, glowMaterial);
      }

      assignOverrideMaterial(mesh, glowMaterial);
      continue;
    }

    if (mesh.name === 'V126_WideHeroScreenGoldFrame') {
      const cacheKey = `${material.uniqueId}:wide-hero-screen-gold-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__wide-hero-screen-gold-frame`);
        applyWideHeroScreenGoldFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name === 'V126_WideHeroScreenGoldMullionArray') {
      const cacheKey = `${material.uniqueId}:wide-hero-screen-gold-mullion`;
      let mullionMaterial = clonedMaterials.get(cacheKey);
      if (!mullionMaterial) {
        mullionMaterial = material.clone(`${material.name}__wide-hero-screen-gold-mullion`);
        applyWideHeroScreenGoldMullionOverride(mullionMaterial);
        clonedMaterials.set(cacheKey, mullionMaterial);
      }

      assignOverrideMaterial(mesh, mullionMaterial);
      continue;
    }

    if (mesh.name === 'V126_WideHeroScreenGoldCrossbarArray') {
      const cacheKey = `${material.uniqueId}:wide-hero-screen-gold-crossbar`;
      let crossbarMaterial = clonedMaterials.get(cacheKey);
      if (!crossbarMaterial) {
        crossbarMaterial = material.clone(`${material.name}__wide-hero-screen-gold-crossbar`);
        applyWideHeroScreenGoldCrossbarOverride(crossbarMaterial);
        clonedMaterials.set(cacheKey, crossbarMaterial);
      }

      assignOverrideMaterial(mesh, crossbarMaterial);
      continue;
    }

    if (
      mesh.name === 'V126_WideHeroScreenIvoryHeader' ||
      mesh.name === 'V126_WideHeroScreenIvoryFooter'
    ) {
      const cacheKey = `${material.uniqueId}:wide-hero-screen-ivory-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__wide-hero-screen-ivory-shell`);
        applyWideHeroScreenIvoryShellOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
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

      assignOverrideMaterial(mesh, cofferMaterial);
      continue;
    }

    if (mesh.name === 'V127_CrownScreenVerticalKeystone') {
      const cacheKey = `${material.uniqueId}:crown-screen-vertical-keystone`;
      let keystoneMaterial = clonedMaterials.get(cacheKey);
      if (!keystoneMaterial) {
        keystoneMaterial = material.clone(`${material.name}__crown-screen-vertical-keystone`);
        applyCrownScreenVerticalKeystoneOverride(keystoneMaterial);
        clonedMaterials.set(cacheKey, keystoneMaterial);
      }

      assignOverrideMaterial(mesh, keystoneMaterial);
      continue;
    }

    if (mesh.name === 'V78_CenterScreenSidePierGoldFrame_L' || mesh.name === 'V78_CenterScreenSidePierGoldFrame_R') {
      const cacheKey = `${material.uniqueId}:center-screen-side-pier-gold-frame`;
      let frameMaterial = clonedMaterials.get(cacheKey);
      if (!frameMaterial) {
        frameMaterial = material.clone(`${material.name}__center-screen-side-pier-gold-frame`);
        applyCenterScreenSidePierGoldFrameOverride(frameMaterial);
        clonedMaterials.set(cacheKey, frameMaterial);
      }

      assignOverrideMaterial(mesh, frameMaterial);
      continue;
    }

    if (mesh.name === 'V78_CenterScreenSidePierCyanCore_L' || mesh.name === 'V78_CenterScreenSidePierCyanCore_R') {
      const cacheKey = `${material.uniqueId}:center-screen-side-pier-cyan-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__center-screen-side-pier-cyan-core`);
        applyCenterScreenSidePierCyanCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (mesh.name === 'V128_CenterScreenGoldInterruptRailArray') {
      const cacheKey = `${material.uniqueId}:center-screen-gold-interrupt-rail`;
      let railMaterial = clonedMaterials.get(cacheKey);
      if (!railMaterial) {
        railMaterial = material.clone(`${material.name}__center-screen-gold-interrupt-rail`);
        applyCenterScreenGoldInterruptRailOverride(railMaterial);
        clonedMaterials.set(cacheKey, railMaterial);
      }

      assignOverrideMaterial(mesh, railMaterial);
      continue;
    }

    if (mesh.name === 'V129_CenterScreenDepthBaffleArray') {
      const cacheKey = `${material.uniqueId}:center-screen-depth-baffle-array`;
      let baffleMaterial = clonedMaterials.get(cacheKey);
      if (!baffleMaterial) {
        baffleMaterial = material.clone(`${material.name}__center-screen-depth-baffle-array`);
        applyCenterScreenDepthBaffleArrayOverride(baffleMaterial);
        clonedMaterials.set(cacheKey, baffleMaterial);
      }

      assignOverrideMaterial(mesh, baffleMaterial);
      continue;
    }

    if (mesh.name === 'V131_WingScreenDepthBaffleArray_L' || mesh.name === 'V131_WingScreenDepthBaffleArray_R') {
      const cacheKey = `${material.uniqueId}:wing-screen-depth-baffle-array`;
      let baffleMaterial = clonedMaterials.get(cacheKey);
      if (!baffleMaterial) {
        baffleMaterial = material.clone(`${material.name}__wing-screen-depth-baffle-array`);
        applyWingScreenDepthBaffleArrayOverride(baffleMaterial);
        clonedMaterials.set(cacheKey, baffleMaterial);
      }

      assignOverrideMaterial(mesh, baffleMaterial);
      continue;
    }

    if (mesh.name === 'V132_WingScreenShadowCofferArray_L' || mesh.name === 'V132_WingScreenShadowCofferArray_R') {
      const cacheKey = `${material.uniqueId}:wing-screen-shadow-coffer-array`;
      let cofferMaterial = clonedMaterials.get(cacheKey);
      if (!cofferMaterial) {
        cofferMaterial = material.clone(`${material.name}__wing-screen-shadow-coffer-array`);
        applyWingScreenShadowCofferArrayOverride(cofferMaterial);
        clonedMaterials.set(cacheKey, cofferMaterial);
      }

      assignOverrideMaterial(mesh, cofferMaterial);
      continue;
    }

    if (mesh.name === 'V130_CenterScreenShadowCofferArray') {
      const cacheKey = `${material.uniqueId}:center-screen-shadow-coffer-array`;
      let cofferMaterial = clonedMaterials.get(cacheKey);
      if (!cofferMaterial) {
        cofferMaterial = material.clone(`${material.name}__center-screen-shadow-coffer-array`);
        applyCenterScreenShadowCofferArrayOverride(cofferMaterial);
        clonedMaterials.set(cacheKey, cofferMaterial);
      }

      assignOverrideMaterial(mesh, cofferMaterial);
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

      assignOverrideMaterial(mesh, runwayMaterial);
      continue;
    }

    if (mesh.name === 'V70_PromenadeGoldShoulders') {
      const cacheKey = `${material.uniqueId}:promenade-gold-shoulders`;
      let shoulderMaterial = clonedMaterials.get(cacheKey);
      if (!shoulderMaterial) {
        shoulderMaterial = material.clone(`${material.name}__promenade-gold-shoulders`);
        applyPromenadeGoldShouldersOverride(shoulderMaterial);
        clonedMaterials.set(cacheKey, shoulderMaterial);
      }

      assignOverrideMaterial(mesh, shoulderMaterial);
      continue;
    }

    if (mesh.name === 'V70_PromenadeCyanSpine') {
      const cacheKey = `${material.uniqueId}:promenade-cyan-spine`;
      let spineMaterial = clonedMaterials.get(cacheKey);
      if (!spineMaterial) {
        spineMaterial = material.clone(`${material.name}__promenade-cyan-spine`);
        applyPromenadeCyanSpineOverride(spineMaterial);
        clonedMaterials.set(cacheKey, spineMaterial);
      }

      assignOverrideMaterial(mesh, spineMaterial);
      continue;
    }

    if (mesh.name === 'V70_PromenadeShadowKeel') {
      const cacheKey = `${material.uniqueId}:promenade-shadow-keel`;
      let keelMaterial = clonedMaterials.get(cacheKey);
      if (!keelMaterial) {
        keelMaterial = material.clone(`${material.name}__promenade-shadow-keel`);
        applyPromenadeShadowKeelOverride(keelMaterial);
        clonedMaterials.set(cacheKey, keelMaterial);
      }

      assignOverrideMaterial(mesh, keelMaterial);
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

      assignOverrideMaterial(mesh, balustradeMaterial);
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

      assignOverrideMaterial(mesh, balustradeMaterial);
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

      assignOverrideMaterial(mesh, canopyMaterial);
      continue;
    }

    if (mesh.name.startsWith('V51_ShoulderCrownMass_')) {
      const cacheKey = `${material.uniqueId}:shoulder-crown-mass-ivory`;
      let stageMassMaterial = clonedMaterials.get(cacheKey);
      if (!stageMassMaterial) {
        stageMassMaterial = material.clone(`${material.name}__shoulder-crown-mass-ivory`);
        applyShoulderCrownMassIvoryOverride(stageMassMaterial);
        clonedMaterials.set(cacheKey, stageMassMaterial);
      }

      assignOverrideMaterial(mesh, stageMassMaterial);
      continue;
    }

    if (mesh.name.startsWith('V51_RearCathedralMass_')) {
      const cacheKey = `${material.uniqueId}:rear-cathedral-mass-ivory`;
      let stageMassMaterial = clonedMaterials.get(cacheKey);
      if (!stageMassMaterial) {
        stageMassMaterial = material.clone(`${material.name}__rear-cathedral-mass-ivory`);
        applyRearCathedralMassIvoryOverride(stageMassMaterial);
        clonedMaterials.set(cacheKey, stageMassMaterial);
      }

      assignOverrideMaterial(mesh, stageMassMaterial);
      continue;
    }

    if (mesh.name === 'V51_RearCathedralCore') {
      const cacheKey = `${material.uniqueId}:rear-cathedral-pearl-core`;
      let cathedralCoreMaterial = clonedMaterials.get(cacheKey);
      if (!cathedralCoreMaterial) {
        cathedralCoreMaterial = material.clone(`${material.name}__rear-cathedral-pearl-core`);
        applyRearCathedralPearlCoreOverride(cathedralCoreMaterial);
        clonedMaterials.set(cacheKey, cathedralCoreMaterial);
      }

      assignOverrideMaterial(mesh, cathedralCoreMaterial);
      continue;
    }

    if (mesh.name.startsWith('V51_ProsceniumPylon_')) {
      const cacheKey = `${material.uniqueId}:proscenium-pylon-pearl-shell`;
      let pylonMaterial = clonedMaterials.get(cacheKey);
      if (!pylonMaterial) {
        pylonMaterial = material.clone(`${material.name}__proscenium-pylon-pearl-shell`);
        applyProsceniumPylonPearlShellOverride(pylonMaterial);
        clonedMaterials.set(cacheKey, pylonMaterial);
      }

      assignOverrideMaterial(mesh, pylonMaterial);
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

      assignOverrideMaterial(mesh, arcadeMaterial);
      continue;
    }

    if (mesh.name.startsWith('V53_SpawnGalleryCorniceGold_')) {
      const cacheKey = `${material.uniqueId}:spawn-gallery-cornice-gold`;
      let corniceGoldMaterial = clonedMaterials.get(cacheKey);
      if (!corniceGoldMaterial) {
        corniceGoldMaterial = material.clone(`${material.name}__spawn-gallery-cornice-gold`);
        applySpawnGalleryCorniceGoldOverride(corniceGoldMaterial);
        clonedMaterials.set(cacheKey, corniceGoldMaterial);
      }

      assignOverrideMaterial(mesh, corniceGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V53_SpawnGalleryHaloGold_')) {
      const cacheKey = `${material.uniqueId}:spawn-gallery-halo-gold`;
      let haloGoldMaterial = clonedMaterials.get(cacheKey);
      if (!haloGoldMaterial) {
        haloGoldMaterial = material.clone(`${material.name}__spawn-gallery-halo-gold`);
        applySpawnGalleryHaloGoldOverride(haloGoldMaterial);
        clonedMaterials.set(cacheKey, haloGoldMaterial);
      }

      assignOverrideMaterial(mesh, haloGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V53_SpawnGalleryShadowSpine_')) {
      const cacheKey = `${material.uniqueId}:spawn-gallery-arcade-shadow`;
      let arcadeShadowMaterial = clonedMaterials.get(cacheKey);
      if (!arcadeShadowMaterial) {
        arcadeShadowMaterial = material.clone(`${material.name}__spawn-gallery-arcade-shadow`);
        applySpawnGalleryArcadeShadowOverride(arcadeShadowMaterial);
        clonedMaterials.set(cacheKey, arcadeShadowMaterial);
      }

      assignOverrideMaterial(mesh, arcadeShadowMaterial);
      continue;
    }

    if (mesh.name.startsWith('V53_SpawnGalleryCyanLancets_')) {
      const cacheKey = `${material.uniqueId}:spawn-gallery-arcade-cyan`;
      let arcadeCyanMaterial = clonedMaterials.get(cacheKey);
      if (!arcadeCyanMaterial) {
        arcadeCyanMaterial = material.clone(`${material.name}__spawn-gallery-arcade-cyan`);
        applySpawnGalleryArcadeCyanOverride(arcadeCyanMaterial);
        clonedMaterials.set(cacheKey, arcadeCyanMaterial);
      }

      assignOverrideMaterial(mesh, arcadeCyanMaterial);
      continue;
    }

    if (mesh.name.startsWith('V55_SpawnPylonPearlShell_')) {
      const cacheKey = `${material.uniqueId}:spawn-pylon-pearl-shell`;
      let pylonMaterial = clonedMaterials.get(cacheKey);
      if (!pylonMaterial) {
        pylonMaterial = material.clone(`${material.name}__spawn-pylon-pearl-shell`);
        applySpawnPylonPearlShellOverride(pylonMaterial);
        clonedMaterials.set(cacheKey, pylonMaterial);
      }

      assignOverrideMaterial(mesh, pylonMaterial);
      continue;
    }

    if (mesh.name.startsWith('V55_SpawnPylonGoldCrown_')) {
      const cacheKey = `${material.uniqueId}:spawn-pylon-gold-crown`;
      let pylonGoldMaterial = clonedMaterials.get(cacheKey);
      if (!pylonGoldMaterial) {
        pylonGoldMaterial = material.clone(`${material.name}__spawn-pylon-gold-crown`);
        applySpawnPylonGoldCrownOverride(pylonGoldMaterial);
        clonedMaterials.set(cacheKey, pylonGoldMaterial);
      }

      assignOverrideMaterial(mesh, pylonGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V55_SpawnPylonShadowSpine_')) {
      const cacheKey = `${material.uniqueId}:spawn-pylon-shadow-spine`;
      let pylonShadowMaterial = clonedMaterials.get(cacheKey);
      if (!pylonShadowMaterial) {
        pylonShadowMaterial = material.clone(`${material.name}__spawn-pylon-shadow-spine`);
        applySpawnPylonShadowSpineOverride(pylonShadowMaterial);
        clonedMaterials.set(cacheKey, pylonShadowMaterial);
      }

      assignOverrideMaterial(mesh, pylonShadowMaterial);
      continue;
    }

    if (mesh.name.startsWith('V55_SpawnPylonCyanCore_')) {
      const cacheKey = `${material.uniqueId}:spawn-pylon-cyan-core`;
      let pylonCyanMaterial = clonedMaterials.get(cacheKey);
      if (!pylonCyanMaterial) {
        pylonCyanMaterial = material.clone(`${material.name}__spawn-pylon-cyan-core`);
        applySpawnPylonCyanCoreOverride(pylonCyanMaterial);
        clonedMaterials.set(cacheKey, pylonCyanMaterial);
      }

      assignOverrideMaterial(mesh, pylonCyanMaterial);
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

      assignOverrideMaterial(mesh, canopyVaultMaterial);
      continue;
    }

    if (mesh.name.startsWith('V56_SpawnCanopyGoldCrest_')) {
      const cacheKey = `${material.uniqueId}:spawn-canopy-gold-crest`;
      let canopyGoldMaterial = clonedMaterials.get(cacheKey);
      if (!canopyGoldMaterial) {
        canopyGoldMaterial = material.clone(`${material.name}__spawn-canopy-gold-crest`);
        applySpawnCanopyGoldCrestOverride(canopyGoldMaterial);
        clonedMaterials.set(cacheKey, canopyGoldMaterial);
      }

      assignOverrideMaterial(mesh, canopyGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V56_SpawnCanopyShadowSoffit_')) {
      const cacheKey = `${material.uniqueId}:spawn-canopy-shadow-soffit`;
      let canopyShadowMaterial = clonedMaterials.get(cacheKey);
      if (!canopyShadowMaterial) {
        canopyShadowMaterial = material.clone(`${material.name}__spawn-canopy-shadow-soffit`);
        applySpawnCanopyShadowSoffitOverride(canopyShadowMaterial);
        clonedMaterials.set(cacheKey, canopyShadowMaterial);
      }

      assignOverrideMaterial(mesh, canopyShadowMaterial);
      continue;
    }

    if (mesh.name.startsWith('V56_SpawnCanopyCyanLantern_')) {
      const cacheKey = `${material.uniqueId}:spawn-canopy-cyan-lantern`;
      let canopyCyanMaterial = clonedMaterials.get(cacheKey);
      if (!canopyCyanMaterial) {
        canopyCyanMaterial = material.clone(`${material.name}__spawn-canopy-cyan-lantern`);
        applySpawnCanopyCyanLanternOverride(canopyCyanMaterial);
        clonedMaterials.set(cacheKey, canopyCyanMaterial);
      }

      assignOverrideMaterial(mesh, canopyCyanMaterial);
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

      assignOverrideMaterial(mesh, causewayMaterial);
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

      assignOverrideMaterial(mesh, terraceMaterial);
      continue;
    }

    if (mesh.name === 'V63_BasinWaterParterre') {
      const cacheKey = `${material.uniqueId}:basin-water-parterre`;
      let parterreMaterial = clonedMaterials.get(cacheKey);
      if (!parterreMaterial) {
        parterreMaterial = material.clone(`${material.name}__basin-water-parterre`);
        applyBasinWaterParterreOverride(parterreMaterial);
        clonedMaterials.set(cacheKey, parterreMaterial);
      }

      assignOverrideMaterial(mesh, parterreMaterial);
      continue;
    }

    if (mesh.name === 'V63_BasinScreenReflectionVeil') {
      const cacheKey = `${material.uniqueId}:basin-screen-reflection-veil`;
      let reflectionVeilMaterial = clonedMaterials.get(cacheKey);
      if (!reflectionVeilMaterial) {
        reflectionVeilMaterial = material.clone(`${material.name}__basin-screen-reflection-veil`);
        applyBasinScreenReflectionVeilOverride(reflectionVeilMaterial);
        clonedMaterials.set(cacheKey, reflectionVeilMaterial);
      }

      assignOverrideMaterial(mesh, reflectionVeilMaterial);
      continue;
    }

    if (mesh.name === 'V65_ArrivalRunwayPearlBands') {
      const cacheKey = `${material.uniqueId}:arrival-runway-pearl-bands`;
      let runwayMaterial = clonedMaterials.get(cacheKey);
      if (!runwayMaterial) {
        runwayMaterial = material.clone(`${material.name}__arrival-runway-pearl-bands`);
        applyArrivalRunwayPearlBandsOverride(runwayMaterial);
        clonedMaterials.set(cacheKey, runwayMaterial);
      }

      assignOverrideMaterial(mesh, runwayMaterial);
      continue;
    }

    if (mesh.name === 'V65_ArrivalRunwayGoldBands') {
      const cacheKey = `${material.uniqueId}:arrival-runway-gold-bands`;
      let runwayGoldMaterial = clonedMaterials.get(cacheKey);
      if (!runwayGoldMaterial) {
        runwayGoldMaterial = material.clone(`${material.name}__arrival-runway-gold-bands`);
        applyArrivalRunwayGoldBandsOverride(runwayGoldMaterial);
        clonedMaterials.set(cacheKey, runwayGoldMaterial);
      }

      assignOverrideMaterial(mesh, runwayGoldMaterial);
      continue;
    }

    if (mesh.name === 'V65_ArrivalThresholdGoldBands') {
      const cacheKey = `${material.uniqueId}:arrival-threshold-gold-bands`;
      let thresholdGoldMaterial = clonedMaterials.get(cacheKey);
      if (!thresholdGoldMaterial) {
        thresholdGoldMaterial = material.clone(`${material.name}__arrival-threshold-gold-bands`);
        applyArrivalThresholdGoldBandsOverride(thresholdGoldMaterial);
        clonedMaterials.set(cacheKey, thresholdGoldMaterial);
      }

      assignOverrideMaterial(mesh, thresholdGoldMaterial);
      continue;
    }

    if (mesh.name === 'V65_ArrivalRunwayCyanThreads') {
      const cacheKey = `${material.uniqueId}:arrival-runway-cyan-threads`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__arrival-runway-cyan-threads`);
        applyArrivalRunwayCyanThreadsOverride(cyanMaterial);
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (mesh.name === 'V65_ArrivalThresholdShadowGrooves') {
      const cacheKey = `${material.uniqueId}:arrival-threshold-shadow-grooves`;
      let shadowMaterial = clonedMaterials.get(cacheKey);
      if (!shadowMaterial) {
        shadowMaterial = material.clone(`${material.name}__arrival-threshold-shadow-grooves`);
        applyArrivalThresholdShadowGroovesOverride(shadowMaterial);
        clonedMaterials.set(cacheKey, shadowMaterial);
      }

      assignOverrideMaterial(mesh, shadowMaterial);
      continue;
    }

    if (mesh.name === 'V44_PlazaLanternStemCluster') {
      const cacheKey = `${material.uniqueId}:plaza-lantern-stem`;
      let stemMaterial = clonedMaterials.get(cacheKey);
      if (!stemMaterial) {
        stemMaterial = material.clone(`${material.name}__plaza-lantern-stem`);
        applyBackPlazaLanternStemOverride(stemMaterial);
        stemMaterial.metadata = {
          ...stemMaterial.metadata,
          mainStageMaterialOverride: 'plaza-lantern-stem',
        };
        clonedMaterials.set(cacheKey, stemMaterial);
      }

      assignOverrideMaterial(mesh, stemMaterial);
      continue;
    }

    if (mesh.name === 'V44_PlazaLanternGoldHardware') {
      const cacheKey = `${material.uniqueId}:plaza-lantern-gold-hardware`;
      let hardwareMaterial = clonedMaterials.get(cacheKey);
      if (!hardwareMaterial) {
        hardwareMaterial = material.clone(`${material.name}__plaza-lantern-gold-hardware`);
        applyBackPlazaLanternGoldCageOverride(hardwareMaterial);
        hardwareMaterial.metadata = {
          ...hardwareMaterial.metadata,
          mainStageMaterialOverride: 'plaza-lantern-gold-hardware',
        };
        clonedMaterials.set(cacheKey, hardwareMaterial);
      }

      assignOverrideMaterial(mesh, hardwareMaterial);
      continue;
    }

    if (mesh.name === 'V44_PlazaLanternWarmCore') {
      const cacheKey = `${material.uniqueId}:plaza-lantern-warm-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__plaza-lantern-warm-core`);
        applyBackPlazaLanternWarmCoreOverride(coreMaterial);
        coreMaterial.metadata = {
          ...coreMaterial.metadata,
          mainStageMaterialOverride: 'plaza-lantern-warm-core',
        };
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (mesh.name === 'V44_PlazaLanternHaloRim') {
      const cacheKey = `${material.uniqueId}:plaza-lantern-halo-rim`;
      let haloMaterial = clonedMaterials.get(cacheKey);
      if (!haloMaterial) {
        haloMaterial = material.clone(`${material.name}__plaza-lantern-halo-rim`);
        applyBackPlazaLanternHaloRimOverride(haloMaterial);
        haloMaterial.metadata = {
          ...haloMaterial.metadata,
          mainStageMaterialOverride: 'plaza-lantern-halo-rim',
        };
        clonedMaterials.set(cacheKey, haloMaterial);
      }

      assignOverrideMaterial(mesh, haloMaterial);
      continue;
    }

    if (mesh.name.startsWith('V40_ApproachLightStem_')) {
      const cacheKey = `${material.uniqueId}:approach-light-stem`;
      let stemMaterial = clonedMaterials.get(cacheKey);
      if (!stemMaterial) {
        stemMaterial = material.clone(`${material.name}__approach-light-stem`);
        applyBackPlazaLanternStemOverride(stemMaterial);
        stemMaterial.metadata = {
          ...stemMaterial.metadata,
          mainStageMaterialOverride: 'approach-light-stem',
        };
        clonedMaterials.set(cacheKey, stemMaterial);
      }

      assignOverrideMaterial(mesh, stemMaterial);
      continue;
    }

    if (mesh.name.startsWith('V40_ApproachLightHousing_')) {
      const cacheKey = `${material.uniqueId}:approach-light-housing`;
      let housingMaterial = clonedMaterials.get(cacheKey);
      if (!housingMaterial) {
        housingMaterial = material.clone(`${material.name}__approach-light-housing`);
        applyBackPlazaLanternGoldCageOverride(housingMaterial);
        housingMaterial.metadata = {
          ...housingMaterial.metadata,
          mainStageMaterialOverride: 'approach-light-housing',
        };
        clonedMaterials.set(cacheKey, housingMaterial);
      }

      assignOverrideMaterial(mesh, housingMaterial);
      continue;
    }

    if (mesh.name.startsWith('V40_ApproachLightCore_')) {
      const cacheKey = `${material.uniqueId}:approach-light-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__approach-light-core`);
        applyArrivalRunwayCyanThreadsOverride(coreMaterial);
        coreMaterial.metadata = {
          ...coreMaterial.metadata,
          mainStageMaterialOverride: 'approach-light-core',
        };
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (mesh.name.startsWith('V40_ApproachLightHalo_')) {
      const cacheKey = `${material.uniqueId}:approach-light-halo`;
      let haloMaterial = clonedMaterials.get(cacheKey);
      if (!haloMaterial) {
        haloMaterial = material.clone(`${material.name}__approach-light-halo`);
        applyBackPlazaLanternHaloRimOverride(haloMaterial);
        haloMaterial.metadata = {
          ...haloMaterial.metadata,
          mainStageMaterialOverride: 'approach-light-halo',
        };
        clonedMaterials.set(cacheKey, haloMaterial);
      }

      assignOverrideMaterial(mesh, haloMaterial);
      continue;
    }

    if (mesh.name.startsWith('V58_ArrivalPlinthPearlDais_')) {
      const cacheKey = `${material.uniqueId}:arrival-plinth-pearl-dais`;
      let plinthMaterial = clonedMaterials.get(cacheKey);
      if (!plinthMaterial) {
        plinthMaterial = material.clone(`${material.name}__arrival-plinth-pearl-dais`);
        applyArrivalPlinthPearlDaisOverride(plinthMaterial);
        clonedMaterials.set(cacheKey, plinthMaterial);
      }

      assignOverrideMaterial(mesh, plinthMaterial);
      continue;
    }

    if (mesh.name.startsWith('V58_ArrivalPlinthGoldInlay_')) {
      const cacheKey = `${material.uniqueId}:arrival-plinth-gold-inlay`;
      let plinthGoldMaterial = clonedMaterials.get(cacheKey);
      if (!plinthGoldMaterial) {
        plinthGoldMaterial = material.clone(`${material.name}__arrival-plinth-gold-inlay`);
        applyArrivalPlinthGoldInlayOverride(plinthGoldMaterial);
        clonedMaterials.set(cacheKey, plinthGoldMaterial);
      }

      assignOverrideMaterial(mesh, plinthGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V58_ArrivalPlinthCyanSpine_')) {
      const cacheKey = `${material.uniqueId}:arrival-plinth-cyan-spine`;
      let plinthCyanMaterial = clonedMaterials.get(cacheKey);
      if (!plinthCyanMaterial) {
        plinthCyanMaterial = material.clone(`${material.name}__arrival-plinth-cyan-spine`);
        applyArrivalPlinthCyanSpineOverride(plinthCyanMaterial);
        clonedMaterials.set(cacheKey, plinthCyanMaterial);
      }

      assignOverrideMaterial(mesh, plinthCyanMaterial);
      continue;
    }

    if (mesh.name.startsWith('V58_ArrivalPlinthShadowReveal_')) {
      const cacheKey = `${material.uniqueId}:arrival-plinth-shadow-reveal`;
      let plinthShadowMaterial = clonedMaterials.get(cacheKey);
      if (!plinthShadowMaterial) {
        plinthShadowMaterial = material.clone(`${material.name}__arrival-plinth-shadow-reveal`);
        applyArrivalPlinthShadowRevealOverride(plinthShadowMaterial);
        clonedMaterials.set(cacheKey, plinthShadowMaterial);
      }

      assignOverrideMaterial(mesh, plinthShadowMaterial);
      continue;
    }

    if (mesh.name.startsWith('V59_BackPlazaLanternStemCluster_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-lantern-stem`;
      let stemMaterial = clonedMaterials.get(cacheKey);
      if (!stemMaterial) {
        stemMaterial = material.clone(`${material.name}__back-plaza-lantern-stem`);
        applyBackPlazaLanternStemOverride(stemMaterial);
        clonedMaterials.set(cacheKey, stemMaterial);
      }

      assignOverrideMaterial(mesh, stemMaterial);
      continue;
    }

    if (mesh.name.startsWith('V59_BackPlazaLanternGoldCage_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-lantern-gold-cage`;
      let cageMaterial = clonedMaterials.get(cacheKey);
      if (!cageMaterial) {
        cageMaterial = material.clone(`${material.name}__back-plaza-lantern-gold-cage`);
        applyBackPlazaLanternGoldCageOverride(cageMaterial);
        clonedMaterials.set(cacheKey, cageMaterial);
      }

      assignOverrideMaterial(mesh, cageMaterial);
      continue;
    }

    if (mesh.name.startsWith('V59_BackPlazaLanternWarmCore_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-lantern-warm-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__back-plaza-lantern-warm-core`);
        applyBackPlazaLanternWarmCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (mesh.name.startsWith('V59_BackPlazaLanternHaloRim_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-lantern-halo-rim`;
      let haloMaterial = clonedMaterials.get(cacheKey);
      if (!haloMaterial) {
        haloMaterial = material.clone(`${material.name}__back-plaza-lantern-halo-rim`);
        applyBackPlazaLanternHaloRimOverride(haloMaterial);
        clonedMaterials.set(cacheKey, haloMaterial);
      }

      assignOverrideMaterial(mesh, haloMaterial);
      continue;
    }

    if (mesh.name === 'V64_PromenadePearlRibbon') {
      const cacheKey = `${material.uniqueId}:promenade-pearl-ribbon`;
      let ribbonMaterial = clonedMaterials.get(cacheKey);
      if (!ribbonMaterial) {
        ribbonMaterial = material.clone(`${material.name}__promenade-pearl-ribbon`);
        applyPromenadePearlRibbonOverride(ribbonMaterial);
        clonedMaterials.set(cacheKey, ribbonMaterial);
      }

      assignOverrideMaterial(mesh, ribbonMaterial);
      continue;
    }

    if (mesh.name === 'V69_PlazaPaverPearlBands') {
      const cacheKey = `${material.uniqueId}:plaza-paver-pearl-bands`;
      let plazaMaterial = clonedMaterials.get(cacheKey);
      if (!plazaMaterial) {
        plazaMaterial = material.clone(`${material.name}__plaza-paver-pearl-bands`);
        applyPlazaPaverPearlBandsOverride(plazaMaterial);
        clonedMaterials.set(cacheKey, plazaMaterial);
      }

      assignOverrideMaterial(mesh, plazaMaterial);
      continue;
    }

    if (mesh.name === 'V69_PlazaPaverGoldFiligree') {
      const cacheKey = `${material.uniqueId}:plaza-paver-gold-filigree`;
      let filigreeMaterial = clonedMaterials.get(cacheKey);
      if (!filigreeMaterial) {
        filigreeMaterial = material.clone(`${material.name}__plaza-paver-gold-filigree`);
        applyPlazaPaverGoldFiligreeOverride(filigreeMaterial);
        clonedMaterials.set(cacheKey, filigreeMaterial);
      }

      assignOverrideMaterial(mesh, filigreeMaterial);
      continue;
    }

    if (mesh.name.startsWith('V68_PortalArcadePearl_')) {
      const cacheKey = `${material.uniqueId}:portal-arcade-pearl-shell`;
      let portalMaterial = clonedMaterials.get(cacheKey);
      if (!portalMaterial) {
        portalMaterial = material.clone(`${material.name}__portal-arcade-pearl-shell`);
        applyPortalArcadePearlShellOverride(portalMaterial);
        clonedMaterials.set(cacheKey, portalMaterial);
      }

      assignOverrideMaterial(mesh, portalMaterial);
      continue;
    }

    if (mesh.name.startsWith('V68_GrandArcadePearlColonnade_')) {
      const cacheKey = `${material.uniqueId}:grand-arcade-pearl-colonnade`;
      let colonnadeMaterial = clonedMaterials.get(cacheKey);
      if (!colonnadeMaterial) {
        colonnadeMaterial = material.clone(`${material.name}__grand-arcade-pearl-colonnade`);
        applyGrandArcadePearlColonnadeOverride(colonnadeMaterial);
        clonedMaterials.set(cacheKey, colonnadeMaterial);
      }

      assignOverrideMaterial(mesh, colonnadeMaterial);
      continue;
    }

    if (mesh.name === 'V68_HeroPortalPearlApron') {
      const cacheKey = `${material.uniqueId}:hero-portal-pearl-apron`;
      let apronMaterial = clonedMaterials.get(cacheKey);
      if (!apronMaterial) {
        apronMaterial = material.clone(`${material.name}__hero-portal-pearl-apron`);
        applyHeroPortalPearlApronOverride(apronMaterial);
        clonedMaterials.set(cacheKey, apronMaterial);
      }

      assignOverrideMaterial(mesh, apronMaterial);
      continue;
    }

    if (mesh.name === 'V68_PortalArcadeGoldCrest_L' || mesh.name === 'V68_PortalArcadeGoldCrest_R') {
      const cacheKey = `${material.uniqueId}:portal-arcade-gold-crest`;
      let crestMaterial = clonedMaterials.get(cacheKey);
      if (!crestMaterial) {
        crestMaterial = material.clone(`${material.name}__portal-arcade-gold-crest`);
        applyPortalArcadeGoldCrestOverride(crestMaterial);
        clonedMaterials.set(cacheKey, crestMaterial);
      }

      assignOverrideMaterial(mesh, crestMaterial);
      continue;
    }

    if (mesh.name === 'V68_PortalArcadeCyanSpine_L' || mesh.name === 'V68_PortalArcadeCyanSpine_R') {
      const cacheKey = `${material.uniqueId}:portal-arcade-cyan-spine`;
      let spineMaterial = clonedMaterials.get(cacheKey);
      if (!spineMaterial) {
        spineMaterial = material.clone(`${material.name}__portal-arcade-cyan-spine`);
        applyPortalArcadeCyanSpineOverride(spineMaterial);
        clonedMaterials.set(cacheKey, spineMaterial);
      }

      assignOverrideMaterial(mesh, spineMaterial);
      continue;
    }

    if (mesh.name === 'V68_PortalArcadeShadowCore_L' || mesh.name === 'V68_PortalArcadeShadowCore_R') {
      const cacheKey = `${material.uniqueId}:portal-arcade-shadow-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__portal-arcade-shadow-core`);
        applyPortalArcadeShadowCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
      continue;
    }

    if (mesh.name === 'V68_HeroPortalGoldCap') {
      const cacheKey = `${material.uniqueId}:hero-portal-gold-cap`;
      let capMaterial = clonedMaterials.get(cacheKey);
      if (!capMaterial) {
        capMaterial = material.clone(`${material.name}__hero-portal-gold-cap`);
        applyHeroPortalGoldCapOverride(capMaterial);
        clonedMaterials.set(cacheKey, capMaterial);
      }

      assignOverrideMaterial(mesh, capMaterial);
      continue;
    }

    if (mesh.name === 'V68_HeroPortalCyanPlinth') {
      const cacheKey = `${material.uniqueId}:hero-portal-cyan-plinth`;
      let plinthMaterial = clonedMaterials.get(cacheKey);
      if (!plinthMaterial) {
        plinthMaterial = material.clone(`${material.name}__hero-portal-cyan-plinth`);
        applyHeroPortalCyanPlinthOverride(plinthMaterial);
        clonedMaterials.set(cacheKey, plinthMaterial);
      }

      assignOverrideMaterial(mesh, plinthMaterial);
      continue;
    }

    if (mesh.name === 'V68_HeroPortalShadowDais') {
      const cacheKey = `${material.uniqueId}:hero-portal-shadow-dais`;
      let daisMaterial = clonedMaterials.get(cacheKey);
      if (!daisMaterial) {
        daisMaterial = material.clone(`${material.name}__hero-portal-shadow-dais`);
        applyHeroPortalShadowDaisOverride(daisMaterial);
        clonedMaterials.set(cacheKey, daisMaterial);
      }

      assignOverrideMaterial(mesh, daisMaterial);
      continue;
    }

    if (mesh.name === 'V68_GrandArcadeGoldBands_L' || mesh.name === 'V68_GrandArcadeGoldBands_R') {
      const cacheKey = `${material.uniqueId}:grand-arcade-gold-bands`;
      let bandsMaterial = clonedMaterials.get(cacheKey);
      if (!bandsMaterial) {
        bandsMaterial = material.clone(`${material.name}__grand-arcade-gold-bands`);
        applyGrandArcadeGoldBandsOverride(bandsMaterial);
        clonedMaterials.set(cacheKey, bandsMaterial);
      }

      assignOverrideMaterial(mesh, bandsMaterial);
      continue;
    }

    if (mesh.name.startsWith('V61_RearMassAuroraPearl_')) {
      const cacheKey = `${material.uniqueId}:rear-mass-aurora-pearl`;
      let auroraMaterial = clonedMaterials.get(cacheKey);
      if (!auroraMaterial) {
        auroraMaterial = material.clone(`${material.name}__rear-mass-aurora-pearl`);
        applyRearMassAuroraPearlOverride(auroraMaterial);
        clonedMaterials.set(cacheKey, auroraMaterial);
      }

      assignOverrideMaterial(mesh, auroraMaterial);
      continue;
    }

    if (mesh.name.startsWith('V61_RearMassAuroraGoldSpine_')) {
      const cacheKey = `${material.uniqueId}:rear-mass-aurora-gold-spine`;
      let auroraMaterial = clonedMaterials.get(cacheKey);
      if (!auroraMaterial) {
        auroraMaterial = material.clone(`${material.name}__rear-mass-aurora-gold-spine`);
        applyRearMassAuroraGoldSpineOverride(auroraMaterial);
        clonedMaterials.set(cacheKey, auroraMaterial);
      }

      assignOverrideMaterial(mesh, auroraMaterial);
      continue;
    }

    if (mesh.name.startsWith('V61_RearMassAuroraCyanCore_')) {
      const cacheKey = `${material.uniqueId}:rear-mass-aurora-cyan-core`;
      let auroraMaterial = clonedMaterials.get(cacheKey);
      if (!auroraMaterial) {
        auroraMaterial = material.clone(`${material.name}__rear-mass-aurora-cyan-core`);
        applyRearMassAuroraCyanCoreOverride(auroraMaterial);
        clonedMaterials.set(cacheKey, auroraMaterial);
      }

      assignOverrideMaterial(mesh, auroraMaterial);
      continue;
    }

    if (mesh.name.startsWith('V61_RearMassAuroraShadowRibbon_')) {
      const cacheKey = `${material.uniqueId}:rear-mass-aurora-shadow-ribbon`;
      let auroraMaterial = clonedMaterials.get(cacheKey);
      if (!auroraMaterial) {
        auroraMaterial = material.clone(`${material.name}__rear-mass-aurora-shadow-ribbon`);
        applyRearMassAuroraShadowRibbonOverride(auroraMaterial);
        clonedMaterials.set(cacheKey, auroraMaterial);
      }

      assignOverrideMaterial(mesh, auroraMaterial);
      continue;
    }

    if (mesh.name.startsWith('V57_BackPlazaSentinelPearl_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-sentinel-pearl`;
      let sentinelMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelMaterial) {
        sentinelMaterial = material.clone(`${material.name}__back-plaza-sentinel-pearl`);
        applyBackPlazaSentinelPearlOverride(sentinelMaterial);
        clonedMaterials.set(cacheKey, sentinelMaterial);
      }

      assignOverrideMaterial(mesh, sentinelMaterial);
      continue;
    }

    if (mesh.name.startsWith('V57_BackPlazaSentinelGoldCrown_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-sentinel-gold-crown`;
      let sentinelGoldMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelGoldMaterial) {
        sentinelGoldMaterial = material.clone(`${material.name}__back-plaza-sentinel-gold-crown`);
        applyBackPlazaSentinelGoldCrownOverride(sentinelGoldMaterial);
        clonedMaterials.set(cacheKey, sentinelGoldMaterial);
      }

      assignOverrideMaterial(mesh, sentinelGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V57_BackPlazaSentinelCyanSpine_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-sentinel-cyan-spine`;
      let sentinelCyanMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelCyanMaterial) {
        sentinelCyanMaterial = material.clone(`${material.name}__back-plaza-sentinel-cyan-spine`);
        applyBackPlazaSentinelCyanSpineOverride(sentinelCyanMaterial);
        clonedMaterials.set(cacheKey, sentinelCyanMaterial);
      }

      assignOverrideMaterial(mesh, sentinelCyanMaterial);
      continue;
    }

    if (mesh.name.startsWith('V57_BackPlazaSentinelShadowCore_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-sentinel-shadow-core`;
      let sentinelShadowMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelShadowMaterial) {
        sentinelShadowMaterial = material.clone(`${material.name}__back-plaza-sentinel-shadow-core`);
        applyBackPlazaSentinelShadowCoreOverride(sentinelShadowMaterial);
        clonedMaterials.set(cacheKey, sentinelShadowMaterial);
      }

      assignOverrideMaterial(mesh, sentinelShadowMaterial);
      continue;
    }

    if (mesh.name.startsWith('V66_BackPlazaSightlinePearlPostCluster_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-sightline-pearl-posts`;
      let postMaterial = clonedMaterials.get(cacheKey);
      if (!postMaterial) {
        postMaterial = material.clone(`${material.name}__back-plaza-sightline-pearl-posts`);
        applyBackPlazaSightlinePearlPostsOverride(postMaterial);
        clonedMaterials.set(cacheKey, postMaterial);
      }

      assignOverrideMaterial(mesh, postMaterial);
      continue;
    }

    if (mesh.name.startsWith('V67_VipGardenPearlBasin_')) {
      const cacheKey = `${material.uniqueId}:vip-garden-pearl-basin`;
      let basinMaterial = clonedMaterials.get(cacheKey);
      if (!basinMaterial) {
        basinMaterial = material.clone(`${material.name}__vip-garden-pearl-basin`);
        applyVipGardenPearlBasinOverride(basinMaterial);
        clonedMaterials.set(cacheKey, basinMaterial);
      }

      assignOverrideMaterial(mesh, basinMaterial);
      continue;
    }

    if (
      mesh.name === 'V67_VipGardenReflectingPool_L' ||
      mesh.name === 'V67_VipGardenReflectingPool_R'
    ) {
      const cacheKey = `${material.uniqueId}:vip-garden-reflecting-pool`;
      let poolMaterial = clonedMaterials.get(cacheKey);
      if (!poolMaterial) {
        poolMaterial = material.clone(`${material.name}__vip-garden-reflecting-pool`);
        applyVipGardenReflectingPoolOverride(poolMaterial);
        clonedMaterials.set(cacheKey, poolMaterial);
      }

      assignOverrideMaterial(mesh, poolMaterial);
      continue;
    }

    if (
      mesh.name === 'V67_VipGardenGoldRibCanopy_L' ||
      mesh.name === 'V67_VipGardenGoldRibCanopy_R'
    ) {
      const cacheKey = `${material.uniqueId}:vip-garden-gold-rib-canopy`;
      let ribMaterial = clonedMaterials.get(cacheKey);
      if (!ribMaterial) {
        ribMaterial = material.clone(`${material.name}__vip-garden-gold-rib-canopy`);
        applyVipGardenGoldRibCanopyOverride(ribMaterial);
        clonedMaterials.set(cacheKey, ribMaterial);
      }

      assignOverrideMaterial(mesh, ribMaterial);
      continue;
    }

    if (mesh.name === 'V43_WayfindingPylonPearlShell') {
      const cacheKey = `${material.uniqueId}:wayfinding-pylon-pearl-shell`;
      let pylonMaterial = clonedMaterials.get(cacheKey);
      if (!pylonMaterial) {
        pylonMaterial = material.clone(`${material.name}__wayfinding-pylon-pearl-shell`);
        applyWayfindingPylonPearlShellOverride(pylonMaterial);
        clonedMaterials.set(cacheKey, pylonMaterial);
      }

      assignOverrideMaterial(mesh, pylonMaterial);
      continue;
    }

    if (mesh.name === 'V43_WayfindingPylonGoldCrown') {
      const cacheKey = `${material.uniqueId}:wayfinding-pylon-gold-crown`;
      let goldMaterial = clonedMaterials.get(cacheKey);
      if (!goldMaterial) {
        goldMaterial = material.clone(`${material.name}__wayfinding-pylon-gold-crown`);
        applyWayfindingPylonGoldCrownOverride(goldMaterial);
        clonedMaterials.set(cacheKey, goldMaterial);
      }

      assignOverrideMaterial(mesh, goldMaterial);
      continue;
    }

    if (mesh.name === 'V43_WayfindingPylonCyanGlyph') {
      const cacheKey = `${material.uniqueId}:wayfinding-pylon-cyan-glyph`;
      let glyphMaterial = clonedMaterials.get(cacheKey);
      if (!glyphMaterial) {
        glyphMaterial = material.clone(`${material.name}__wayfinding-pylon-cyan-glyph`);
        applyWayfindingPylonCyanGlyphOverride(glyphMaterial);
        clonedMaterials.set(cacheKey, glyphMaterial);
      }

      assignOverrideMaterial(mesh, glyphMaterial);
      continue;
    }

    if (mesh.name === 'V45_PyroPodPearlShell') {
      const cacheKey = `${material.uniqueId}:pyro-pod-pearl-shell`;
      let pyroMaterial = clonedMaterials.get(cacheKey);
      if (!pyroMaterial) {
        pyroMaterial = material.clone(`${material.name}__pyro-pod-pearl-shell`);
        applyPyroPodPearlShellOverride(pyroMaterial);
        clonedMaterials.set(cacheKey, pyroMaterial);
      }

      assignOverrideMaterial(mesh, pyroMaterial);
      continue;
    }

    if (mesh.name === 'V45_PyroPodGoldNozzle') {
      const cacheKey = `${material.uniqueId}:pyro-pod-gold-nozzle`;
      let nozzleMaterial = clonedMaterials.get(cacheKey);
      if (!nozzleMaterial) {
        nozzleMaterial = material.clone(`${material.name}__pyro-pod-gold-nozzle`);
        applyPyroPodGoldNozzleOverride(nozzleMaterial);
        clonedMaterials.set(cacheKey, nozzleMaterial);
      }

      assignOverrideMaterial(mesh, nozzleMaterial);
      continue;
    }

    if (mesh.name === 'V45_PyroPodRedGlass') {
      const cacheKey = `${material.uniqueId}:pyro-pod-red-glass`;
      let glassMaterial = clonedMaterials.get(cacheKey);
      if (!glassMaterial) {
        glassMaterial = material.clone(`${material.name}__pyro-pod-red-glass`);
        applyPyroPodRedGlassOverride(glassMaterial);
        clonedMaterials.set(cacheKey, glassMaterial);
      }

      assignOverrideMaterial(mesh, glassMaterial);
      continue;
    }

    if (mesh.name.startsWith('V34_BackPlazaGatewayPearl_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-gateway-pearl`;
      let gatewayMaterial = clonedMaterials.get(cacheKey);
      if (!gatewayMaterial) {
        gatewayMaterial = material.clone(`${material.name}__back-plaza-gateway-pearl`);
        applyBackPlazaGatewayPearlOverride(gatewayMaterial);
        clonedMaterials.set(cacheKey, gatewayMaterial);
      }

      assignOverrideMaterial(mesh, gatewayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V34_BackPlazaGatewayCyanInlay_')) {
      const cacheKey = `${material.uniqueId}:back-plaza-gateway-cyan-inlay`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__back-plaza-gateway-cyan-inlay`);
        applyBackPlazaGatewayCyanInlayOverride(cyanMaterial);
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (mesh.name.startsWith('V54_SpawnGalleryPierPearl_')) {
      const cacheKey = `${material.uniqueId}:spawn-gallery-pier-pearl`;
      let pierMaterial = clonedMaterials.get(cacheKey);
      if (!pierMaterial) {
        pierMaterial = material.clone(`${material.name}__spawn-gallery-pier-pearl`);
        applySpawnGalleryPierPearlOverride(pierMaterial);
        clonedMaterials.set(cacheKey, pierMaterial);
      }

      assignOverrideMaterial(mesh, pierMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V54_SpawnGalleryFiligreeGold_')
    ) {
      const cacheKey = `${material.uniqueId}:spawn-filigree-gold`;
      let filigreeMaterial = clonedMaterials.get(cacheKey);
      if (!filigreeMaterial) {
        filigreeMaterial = material.clone(`${material.name}__spawn-filigree-gold`);
        applySpawnFiligreeGoldOverride(filigreeMaterial);
        clonedMaterials.set(cacheKey, filigreeMaterial);
      }

      assignOverrideMaterial(mesh, filigreeMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V54_SpawnGalleryShadowSeam_')
    ) {
      const cacheKey = `${material.uniqueId}:spawn-shadow-seam`;
      let seamMaterial = clonedMaterials.get(cacheKey);
      if (!seamMaterial) {
        seamMaterial = material.clone(`${material.name}__spawn-shadow-seam`);
        applySpawnShadowSeamOverride(seamMaterial);
        clonedMaterials.set(cacheKey, seamMaterial);
      }

      assignOverrideMaterial(mesh, seamMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V54_SpawnGalleryBeaconCyan_')
    ) {
      const cacheKey = `${material.uniqueId}:spawn-beacon-cyan`;
      let beaconMaterial = clonedMaterials.get(cacheKey);
      if (!beaconMaterial) {
        beaconMaterial = material.clone(`${material.name}__spawn-beacon-cyan`);
        applySpawnBeaconCyanOverride(beaconMaterial);
        clonedMaterials.set(cacheKey, beaconMaterial);
      }

      assignOverrideMaterial(mesh, beaconMaterial);
      continue;
    }

    if (mesh.name === 'V62_BasinCausewayCyanInlay') {
      const cacheKey = `${material.uniqueId}:arrival-causeway-cyan-inlay`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__arrival-causeway-cyan-inlay`);
        applyArrivalCausewayCyanInlayOverride(cyanMaterial);
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (mesh.name === 'V64_PromenadeCyanThread') {
      const cacheKey = `${material.uniqueId}:arrival-promenade-cyan-thread`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__arrival-promenade-cyan-thread`);
        applyArrivalPromenadeCyanThreadOverride(cyanMaterial);
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (mesh.name.startsWith('V66_BackPlazaSightlineCyanThread_')) {
      const cacheKey = `${material.uniqueId}:arrival-sightline-cyan-thread`;
      let cyanMaterial = clonedMaterials.get(cacheKey);
      if (!cyanMaterial) {
        cyanMaterial = material.clone(`${material.name}__arrival-sightline-cyan-thread`);
        applyArrivalSightlineCyanThreadOverride(cyanMaterial);
        clonedMaterials.set(cacheKey, cyanMaterial);
      }

      assignOverrideMaterial(mesh, cyanMaterial);
      continue;
    }

    if (mesh.name === 'V64_PlazaCrossBands') {
      const cacheKey = `${material.uniqueId}:plaza-cross-bands`;
      let crossBandMaterial = clonedMaterials.get(cacheKey);
      if (!crossBandMaterial) {
        crossBandMaterial = material.clone(`${material.name}__plaza-cross-bands`);
        applyPlazaCrossBandsOverride(crossBandMaterial);
        clonedMaterials.set(cacheKey, crossBandMaterial);
      }

      assignOverrideMaterial(mesh, crossBandMaterial);
      continue;
    }

    if (mesh.name === 'V64_PlazaStoneSpine') {
      const cacheKey = `${material.uniqueId}:plaza-stone-spine`;
      let spineMaterial = clonedMaterials.get(cacheKey);
      if (!spineMaterial) {
        spineMaterial = material.clone(`${material.name}__plaza-stone-spine`);
        applyPlazaStoneSpineOverride(spineMaterial);
        clonedMaterials.set(cacheKey, spineMaterial);
      }

      assignOverrideMaterial(mesh, spineMaterial);
      continue;
    }

    if (
      mesh.name === 'V31_SideParallaxGoldOrbit_L' ||
      mesh.name === 'V31_SideParallaxGoldOrbit_R'
    ) {
      const cacheKey = `${material.uniqueId}:side-parallax-gold-orbit`;
      let orbitMaterial = clonedMaterials.get(cacheKey);
      if (!orbitMaterial) {
        orbitMaterial = material.clone(`${material.name}__side-parallax-gold-orbit`);
        applySideParallaxGoldOrbitOverride(orbitMaterial);
        clonedMaterials.set(cacheKey, orbitMaterial);
      }

      assignOverrideMaterial(mesh, orbitMaterial);
      continue;
    }

    if (mesh.name === 'V51_PortalCrestBridge') {
      const cacheKey = `${material.uniqueId}:portal-crest-bridge`;
      let bridgeMaterial = clonedMaterials.get(cacheKey);
      if (!bridgeMaterial) {
        bridgeMaterial = material.clone(`${material.name}__portal-crest-bridge`);
        applyPortalCrestBridgeOverride(bridgeMaterial);
        clonedMaterials.set(cacheKey, bridgeMaterial);
      }

      assignOverrideMaterial(mesh, bridgeMaterial);
      continue;
    }

    if (mesh.name === 'V62_BasinCausewayShadowReveal') {
      const cacheKey = `${material.uniqueId}:basin-causeway-shadow-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__basin-causeway-shadow-reveal`);
        applyBasinCausewayShadowRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (mesh.name.startsWith('V116_ProsceniumPearlRevealArray_')) {
      const cacheKey = `${material.uniqueId}:proscenium-pearl-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__proscenium-pearl-reveal`);
        applyProsceniumPearlRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (mesh.name.startsWith('V50_InnerPortalPylon_')) {
      const cacheKey = `${material.uniqueId}:inner-portal-pylon-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__inner-portal-pylon-shell`);
        applyInnerPortalPylonShellOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
      continue;
    }

    if (mesh.name.startsWith('V50_InnerShellCascade_')) {
      const cacheKey = `${material.uniqueId}:inner-shell-cascade`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__inner-shell-cascade`);
        applyInnerShellCascadeOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
      continue;
    }

    if (mesh.name.startsWith('V50_InnerPortalGoldReveal_')) {
      const cacheKey = `${material.uniqueId}:inner-portal-gold-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__inner-portal-gold-reveal`);
        applyInnerPortalGoldRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (mesh.name.startsWith('V50_OuterSweepSpire_')) {
      const cacheKey = `${material.uniqueId}:outer-sweep-spire`;
      let spireMaterial = clonedMaterials.get(cacheKey);
      if (!spireMaterial) {
        spireMaterial = material.clone(`${material.name}__outer-sweep-spire`);
        applyOuterSweepSpireOverride(spireMaterial);
        clonedMaterials.set(cacheKey, spireMaterial);
      }

      assignOverrideMaterial(mesh, spireMaterial);
      continue;
    }

    if (mesh.name === 'V52_CrownObeliskPearlCore') {
      const cacheKey = `${material.uniqueId}:crown-obelisk-core-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__crown-obelisk-core-shell`);
        applyCrownObeliskCoreShellOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
      continue;
    }

    if (mesh.name.startsWith('V52_CrownSpirePearlBlade_')) {
      const cacheKey = `${material.uniqueId}:crown-spire-pearl-blade`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__crown-spire-pearl-blade`);
        applyCrownSpirePearlBladeOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
      continue;
    }

    if (mesh.name === 'V52_CrownObeliskGoldTracery') {
      const cacheKey = `${material.uniqueId}:crown-obelisk-gold-tracery`;
      let traceryMaterial = clonedMaterials.get(cacheKey);
      if (!traceryMaterial) {
        traceryMaterial = material.clone(`${material.name}__crown-obelisk-gold-tracery`);
        applyCrownObeliskGoldTraceryOverride(traceryMaterial);
        clonedMaterials.set(cacheKey, traceryMaterial);
      }

      assignOverrideMaterial(mesh, traceryMaterial);
      continue;
    }

    if (mesh.name.startsWith('V52_CrownSpireGoldFin_')) {
      const cacheKey = `${material.uniqueId}:crown-obelisk-gold-fin`;
      let finMaterial = clonedMaterials.get(cacheKey);
      if (!finMaterial) {
        finMaterial = material.clone(`${material.name}__crown-obelisk-gold-fin`);
        applyCrownObeliskGoldFinOverride(finMaterial);
        clonedMaterials.set(cacheKey, finMaterial);
      }

      assignOverrideMaterial(mesh, finMaterial);
      continue;
    }

    if (mesh.name === 'V52_CrownApexPedestal') {
      const cacheKey = `${material.uniqueId}:crown-obelisk-apex-pedestal`;
      let pedestalMaterial = clonedMaterials.get(cacheKey);
      if (!pedestalMaterial) {
        pedestalMaterial = material.clone(`${material.name}__crown-obelisk-apex-pedestal`);
        applyCrownObeliskApexPedestalOverride(pedestalMaterial);
        clonedMaterials.set(cacheKey, pedestalMaterial);
      }

      assignOverrideMaterial(mesh, pedestalMaterial);
      continue;
    }

    if (mesh.name === 'V52_CrownObeliskShadowSpine') {
      const cacheKey = `${material.uniqueId}:crown-obelisk-shadow-spine`;
      let shadowMaterial = clonedMaterials.get(cacheKey);
      if (!shadowMaterial) {
        shadowMaterial = material.clone(`${material.name}__crown-obelisk-shadow-spine`);
        applyCrownObeliskShadowSpineOverride(shadowMaterial);
        clonedMaterials.set(cacheKey, shadowMaterial);
      }

      assignOverrideMaterial(mesh, shadowMaterial);
      continue;
    }

    if (mesh.name === 'V52_CrownApexCrystal') {
      const cacheKey = `${material.uniqueId}:crown-obelisk-apex-crystal`;
      let crystalMaterial = clonedMaterials.get(cacheKey);
      if (!crystalMaterial) {
        crystalMaterial = material.clone(`${material.name}__crown-obelisk-apex-crystal`);
        applyCrownObeliskApexCrystalOverride(crystalMaterial);
        clonedMaterials.set(cacheKey, crystalMaterial);
      }

      assignOverrideMaterial(mesh, crystalMaterial);
      continue;
    }

    if (mesh.name.startsWith('V71_CrownBladePearlSocket_')) {
      const cacheKey = `${material.uniqueId}:crown-jewel-pearl-socket`;
      let socketMaterial = clonedMaterials.get(cacheKey);
      if (!socketMaterial) {
        socketMaterial = material.clone(`${material.name}__crown-jewel-pearl-socket`);
        applyCrownJewelPearlSocketOverride(socketMaterial);
        clonedMaterials.set(cacheKey, socketMaterial);
      }

      assignOverrideMaterial(mesh, socketMaterial);
      continue;
    }

    if (mesh.name === 'V71_CrownJewelGoldCradle') {
      const cacheKey = `${material.uniqueId}:crown-jewel-gold-cradle`;
      let cradleMaterial = clonedMaterials.get(cacheKey);
      if (!cradleMaterial) {
        cradleMaterial = material.clone(`${material.name}__crown-jewel-gold-cradle`);
        applyCrownJewelGoldCradleOverride(cradleMaterial);
        clonedMaterials.set(cacheKey, cradleMaterial);
      }

      assignOverrideMaterial(mesh, cradleMaterial);
      continue;
    }

    if (mesh.name === 'V71_CrownJewelShadowCore') {
      const cacheKey = `${material.uniqueId}:crown-jewel-shadow-core`;
      let shadowMaterial = clonedMaterials.get(cacheKey);
      if (!shadowMaterial) {
        shadowMaterial = material.clone(`${material.name}__crown-jewel-shadow-core`);
        applyCrownJewelShadowCoreOverride(shadowMaterial);
        clonedMaterials.set(cacheKey, shadowMaterial);
      }

      assignOverrideMaterial(mesh, shadowMaterial);
      continue;
    }

    if (mesh.name === 'V71_CrownTopCyanJewel') {
      const cacheKey = `${material.uniqueId}:crown-jewel-cyan`;
      let jewelMaterial = clonedMaterials.get(cacheKey);
      if (!jewelMaterial) {
        jewelMaterial = material.clone(`${material.name}__crown-jewel-cyan`);
        applyCrownJewelCyanOverride(jewelMaterial);
        clonedMaterials.set(cacheKey, jewelMaterial);
      }

      assignOverrideMaterial(mesh, jewelMaterial);
      continue;
    }

    if (mesh.name.startsWith('V82_OvalPortalGlowShell_')) {
      const cacheKey = `${material.uniqueId}:oval-portal-glow-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__oval-portal-glow-shell`);
        applyOvalPortalGlowShellOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
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

      assignOverrideMaterial(mesh, sentinelMaterial);
      continue;
    }

    if (mesh.name.startsWith('V60_SpawnGateSentinelGoldCrown_')) {
      const cacheKey = `${material.uniqueId}:spawn-gate-sentinel-gold-crown`;
      let sentinelMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelMaterial) {
        sentinelMaterial = material.clone(`${material.name}__spawn-gate-sentinel-gold-crown`);
        applySpawnGateSentinelGoldCrownOverride(sentinelMaterial);
        clonedMaterials.set(cacheKey, sentinelMaterial);
      }

      assignOverrideMaterial(mesh, sentinelMaterial);
      continue;
    }

    if (mesh.name.startsWith('V60_SpawnGateSentinelCyanCore_')) {
      const cacheKey = `${material.uniqueId}:spawn-gate-sentinel-cyan-core`;
      let sentinelMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelMaterial) {
        sentinelMaterial = material.clone(`${material.name}__spawn-gate-sentinel-cyan-core`);
        applySpawnGateSentinelCyanCoreOverride(sentinelMaterial);
        clonedMaterials.set(cacheKey, sentinelMaterial);
      }

      assignOverrideMaterial(mesh, sentinelMaterial);
      continue;
    }

    if (mesh.name.startsWith('V60_SpawnGateSentinelShadowKeel_')) {
      const cacheKey = `${material.uniqueId}:spawn-gate-sentinel-shadow-keel`;
      let sentinelMaterial = clonedMaterials.get(cacheKey);
      if (!sentinelMaterial) {
        sentinelMaterial = material.clone(`${material.name}__spawn-gate-sentinel-shadow-keel`);
        applySpawnGateSentinelShadowKeelOverride(sentinelMaterial);
        clonedMaterials.set(cacheKey, sentinelMaterial);
      }

      assignOverrideMaterial(mesh, sentinelMaterial);
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

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (mesh.name === 'V25_HeroPortalOuterOgive_L' || mesh.name === 'V25_HeroPortalOuterOgive_R') {
      const cacheKey = `${material.uniqueId}:hero-portal-outer-ogive`;
      let ogiveMaterial = clonedMaterials.get(cacheKey);
      if (!ogiveMaterial) {
        ogiveMaterial = material.clone(`${material.name}__hero-portal-outer-ogive`);
        applyHeroPortalOuterOgiveOverride(ogiveMaterial);
        clonedMaterials.set(cacheKey, ogiveMaterial);
      }

      assignOverrideMaterial(mesh, ogiveMaterial);
      continue;
    }

    if (mesh.name === 'V25_HeroPortalGoldReveal_L' || mesh.name === 'V25_HeroPortalGoldReveal_R') {
      const cacheKey = `${material.uniqueId}:hero-portal-gold-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__hero-portal-gold-reveal`);
        applyHeroPortalGoldRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (mesh.name === 'V25_HeroPortalPearlApron_L' || mesh.name === 'V25_HeroPortalPearlApron_R') {
      const cacheKey = `${material.uniqueId}:hero-portal-pearl-apron`;
      let apronMaterial = clonedMaterials.get(cacheKey);
      if (!apronMaterial) {
        apronMaterial = material.clone(`${material.name}__hero-portal-pearl-apron`);
        applyHeroPortalPearlApronOverride(apronMaterial);
        clonedMaterials.set(cacheKey, apronMaterial);
      }

      assignOverrideMaterial(mesh, apronMaterial);
      continue;
    }

    if (mesh.name === 'V25_HeroPortalShadowVault') {
      const cacheKey = `${material.uniqueId}:hero-portal-shadow-vault`;
      let vaultMaterial = clonedMaterials.get(cacheKey);
      if (!vaultMaterial) {
        vaultMaterial = material.clone(`${material.name}__hero-portal-shadow-vault`);
        applyHeroPortalShadowVaultOverride(vaultMaterial);
        clonedMaterials.set(cacheKey, vaultMaterial);
      }

      assignOverrideMaterial(mesh, vaultMaterial);
      continue;
    }

    if (mesh.name === 'V25_CrownApexCrystal') {
      const cacheKey = `${material.uniqueId}:crown-apex-crystal`;
      let crystalMaterial = clonedMaterials.get(cacheKey);
      if (!crystalMaterial) {
        crystalMaterial = material.clone(`${material.name}__crown-apex-crystal`);
        applyCrownApexCrystalOverride(crystalMaterial);
        clonedMaterials.set(cacheKey, crystalMaterial);
      }

      assignOverrideMaterial(mesh, crystalMaterial);
      continue;
    }

    if (mesh.name === 'V27_PerformanceDaisLower') {
      const cacheKey = `${material.uniqueId}:performance-dais-lower`;
      let daisMaterial = clonedMaterials.get(cacheKey);
      if (!daisMaterial) {
        daisMaterial = material.clone(`${material.name}__performance-dais-lower`);
        applyPerformanceDaisLowerOverride(daisMaterial);
        clonedMaterials.set(cacheKey, daisMaterial);
      }

      assignOverrideMaterial(mesh, daisMaterial);
      continue;
    }

    if (mesh.name === 'V27_PerformanceDaisMid') {
      const cacheKey = `${material.uniqueId}:performance-dais-mid`;
      let daisMaterial = clonedMaterials.get(cacheKey);
      if (!daisMaterial) {
        daisMaterial = material.clone(`${material.name}__performance-dais-mid`);
        applyPerformanceDaisMidOverride(daisMaterial);
        clonedMaterials.set(cacheKey, daisMaterial);
      }

      assignOverrideMaterial(mesh, daisMaterial);
      continue;
    }

    if (mesh.name === 'V27_PerformanceDaisUpper') {
      const cacheKey = `${material.uniqueId}:performance-dais-upper`;
      let daisMaterial = clonedMaterials.get(cacheKey);
      if (!daisMaterial) {
        daisMaterial = material.clone(`${material.name}__performance-dais-upper`);
        applyPerformanceDaisUpperOverride(daisMaterial);
        clonedMaterials.set(cacheKey, daisMaterial);
      }

      assignOverrideMaterial(mesh, daisMaterial);
      continue;
    }

    if (mesh.name === 'V28_WingArcadePearlArch_L' || mesh.name === 'V28_WingArcadePearlArch_R') {
      const cacheKey = `${material.uniqueId}:wing-arcade-pearl-arch`;
      let archMaterial = clonedMaterials.get(cacheKey);
      if (!archMaterial) {
        archMaterial = material.clone(`${material.name}__wing-arcade-pearl-arch`);
        applyWingArcadePearlArchOverride(archMaterial);
        clonedMaterials.set(cacheKey, archMaterial);
      }

      assignOverrideMaterial(mesh, archMaterial);
      continue;
    }

    if (mesh.name === 'V28_WingArcadeGoldReveal_L' || mesh.name === 'V28_WingArcadeGoldReveal_R') {
      const cacheKey = `${material.uniqueId}:wing-arcade-gold-reveal`;
      let revealMaterial = clonedMaterials.get(cacheKey);
      if (!revealMaterial) {
        revealMaterial = material.clone(`${material.name}__wing-arcade-gold-reveal`);
        applyWingArcadeGoldRevealOverride(revealMaterial);
        clonedMaterials.set(cacheKey, revealMaterial);
      }

      assignOverrideMaterial(mesh, revealMaterial);
      continue;
    }

    if (mesh.name === 'V28_WingArcadeCyanInlay_L' || mesh.name === 'V28_WingArcadeCyanInlay_R') {
      const cacheKey = `${material.uniqueId}:wing-arcade-cyan-inlay`;
      let inlayMaterial = clonedMaterials.get(cacheKey);
      if (!inlayMaterial) {
        inlayMaterial = material.clone(`${material.name}__wing-arcade-cyan-inlay`);
        applyWingArcadeCyanInlayOverride(inlayMaterial);
        clonedMaterials.set(cacheKey, inlayMaterial);
      }

      assignOverrideMaterial(mesh, inlayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V26_VipTerraceOuterSweep_')) {
      const cacheKey = `${material.uniqueId}:vip-terrace-outer-sweep`;
      let sweepMaterial = clonedMaterials.get(cacheKey);
      if (!sweepMaterial) {
        sweepMaterial = material.clone(`${material.name}__vip-terrace-outer-sweep`);
        applyVipTerraceOuterSweepOverride(sweepMaterial);
        clonedMaterials.set(cacheKey, sweepMaterial);
      }

      assignOverrideMaterial(mesh, sweepMaterial);
      continue;
    }

    if (mesh.name.startsWith('V26_VipTerraceGoldInlay_')) {
      const cacheKey = `${material.uniqueId}:vip-terrace-gold-inlay`;
      let inlayMaterial = clonedMaterials.get(cacheKey);
      if (!inlayMaterial) {
        inlayMaterial = material.clone(`${material.name}__vip-terrace-gold-inlay`);
        applyVipTerraceGoldInlayOverride(inlayMaterial);
        clonedMaterials.set(cacheKey, inlayMaterial);
      }

      assignOverrideMaterial(mesh, inlayMaterial);
      continue;
    }

    if (mesh.name.startsWith('V101_VipBalustradeLowerChordArray_')) {
      const cacheKey = `${material.uniqueId}:vip-balustrade-lower-chord`;
      let chordMaterial = clonedMaterials.get(cacheKey);
      if (!chordMaterial) {
        chordMaterial = material.clone(`${material.name}__vip-balustrade-lower-chord`);
        applyVipBalustradeLowerChordOverride(chordMaterial);
        clonedMaterials.set(cacheKey, chordMaterial);
      }

      assignOverrideMaterial(mesh, chordMaterial);
      continue;
    }

    if (mesh.name.startsWith('V102_VipBalustradeFiligreeArray_')) {
      const cacheKey = `${material.uniqueId}:vip-balustrade-filigree`;
      let filigreeMaterial = clonedMaterials.get(cacheKey);
      if (!filigreeMaterial) {
        filigreeMaterial = material.clone(`${material.name}__vip-balustrade-filigree`);
        applyVipBalustradeFiligreeOverride(filigreeMaterial);
        clonedMaterials.set(cacheKey, filigreeMaterial);
      }

      assignOverrideMaterial(mesh, filigreeMaterial);
      continue;
    }

    if (mesh.name.startsWith('V103_PearlSurfaceGoldRelief_')) {
      const cacheKey = `${material.uniqueId}:vip-pearl-surface-gold-relief`;
      let reliefMaterial = clonedMaterials.get(cacheKey);
      if (!reliefMaterial) {
        reliefMaterial = material.clone(`${material.name}__vip-pearl-surface-gold-relief`);
        applyVipPearlSurfaceGoldReliefOverride(reliefMaterial);
        clonedMaterials.set(cacheKey, reliefMaterial);
      }

      assignOverrideMaterial(mesh, reliefMaterial);
      continue;
    }

    if (mesh.name.startsWith('V103_PearlSurfaceCyanInset_')) {
      const cacheKey = `${material.uniqueId}:vip-pearl-surface-cyan-inset`;
      let insetMaterial = clonedMaterials.get(cacheKey);
      if (!insetMaterial) {
        insetMaterial = material.clone(`${material.name}__vip-pearl-surface-cyan-inset`);
        applyVipPearlSurfaceCyanInsetOverride(insetMaterial);
        clonedMaterials.set(cacheKey, insetMaterial);
      }

      assignOverrideMaterial(mesh, insetMaterial);
      continue;
    }

    if (mesh.name.startsWith('V104_OuterWingGoldSpineArray_')) {
      const cacheKey = `${material.uniqueId}:outer-wing-gold-spine`;
      let spineMaterial = clonedMaterials.get(cacheKey);
      if (!spineMaterial) {
        spineMaterial = material.clone(`${material.name}__outer-wing-gold-spine`);
        applyOuterWingGoldSpineOverride(spineMaterial);
        clonedMaterials.set(cacheKey, spineMaterial);
      }

      assignOverrideMaterial(mesh, spineMaterial);
      continue;
    }

    if (mesh.name.startsWith('V105_RearShellGoldSeamArray_')) {
      const cacheKey = `${material.uniqueId}:rear-shell-gold-seam`;
      let seamMaterial = clonedMaterials.get(cacheKey);
      if (!seamMaterial) {
        seamMaterial = material.clone(`${material.name}__rear-shell-gold-seam`);
        applyRearShellGoldSeamOverride(seamMaterial);
        clonedMaterials.set(cacheKey, seamMaterial);
      }

      assignOverrideMaterial(mesh, seamMaterial);
      continue;
    }

    if (mesh.name === 'V108_ForegroundBarricadeGoldRun') {
      const cacheKey = `${material.uniqueId}:foreground-barricade-gold-run`;
      let goldRunMaterial = clonedMaterials.get(cacheKey);
      if (!goldRunMaterial) {
        goldRunMaterial = material.clone(`${material.name}__foreground-barricade-gold-run`);
        applyForegroundBarricadeGoldRunOverride(goldRunMaterial);
        clonedMaterials.set(cacheKey, goldRunMaterial);
      }

      assignOverrideMaterial(mesh, goldRunMaterial);
      continue;
    }

    if (mesh.name === 'V108_ForegroundBarricadePearlRun') {
      const cacheKey = `${material.uniqueId}:foreground-barricade-pearl-run`;
      let pearlRunMaterial = clonedMaterials.get(cacheKey);
      if (!pearlRunMaterial) {
        pearlRunMaterial = material.clone(`${material.name}__foreground-barricade-pearl-run`);
        applyForegroundBarricadePearlRunOverride(pearlRunMaterial);
        clonedMaterials.set(cacheKey, pearlRunMaterial);
      }

      assignOverrideMaterial(mesh, pearlRunMaterial);
      continue;
    }

    if (mesh.name.startsWith('V133_VipTerraceGoldArray_')) {
      const cacheKey = `${material.uniqueId}:vip-terrace-gold`;
      let terraceGoldMaterial = clonedMaterials.get(cacheKey);
      if (!terraceGoldMaterial) {
        terraceGoldMaterial = material.clone(`${material.name}__vip-terrace-gold`);
        applyVipTerraceGoldOverride(terraceGoldMaterial);
        clonedMaterials.set(cacheKey, terraceGoldMaterial);
      }

      assignOverrideMaterial(mesh, terraceGoldMaterial);
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

      assignOverrideMaterial(mesh, terraceGoldMaterial);
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

      assignOverrideMaterial(mesh, terraceFasciaMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V30_WingSoffitShadow_') ||
      mesh.name.startsWith('V30_WingUndersideRib_')
    ) {
      const cacheKey = `${material.uniqueId}:wing-soffit-shadow`;
      let soffitShadowMaterial = clonedMaterials.get(cacheKey);
      if (!soffitShadowMaterial) {
        soffitShadowMaterial = material.clone(`${material.name}__wing-soffit-shadow`);
        applyWingSoffitShadowOverride(soffitShadowMaterial);
        clonedMaterials.set(cacheKey, soffitShadowMaterial);
      }

      assignOverrideMaterial(mesh, soffitShadowMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V30_VipSoffitShadow_') ||
      mesh.name.startsWith('V30_VipUndersideRib_')
    ) {
      const cacheKey = `${material.uniqueId}:vip-soffit-shadow`;
      let soffitShadowMaterial = clonedMaterials.get(cacheKey);
      if (!soffitShadowMaterial) {
        soffitShadowMaterial = material.clone(`${material.name}__vip-soffit-shadow`);
        applyVipSoffitShadowOverride(soffitShadowMaterial);
        clonedMaterials.set(cacheKey, soffitShadowMaterial);
      }

      assignOverrideMaterial(mesh, soffitShadowMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V30_VipGoldBaluster_') ||
      mesh.name.startsWith('V30_WingGoldBaluster_') ||
      mesh.name.startsWith('V30_VipGoldHandrail_') ||
      mesh.name.startsWith('V30_WingGoldHandrail_')
    ) {
      const cacheKey = `${material.uniqueId}:terrace-gold-rail`;
      let railMaterial = clonedMaterials.get(cacheKey);
      if (!railMaterial) {
        railMaterial = material.clone(`${material.name}__terrace-gold-rail`);
        applyTerraceGoldRailOverride(railMaterial);
        clonedMaterials.set(cacheKey, railMaterial);
      }

      assignOverrideMaterial(mesh, railMaterial);
      continue;
    }

    if (mesh.name.startsWith('V62_BasinCausewayGoldRail_')) {
      const cacheKey = `${material.uniqueId}:arrival-causeway-gold-rail`;
      let causewayGoldMaterial = clonedMaterials.get(cacheKey);
      if (!causewayGoldMaterial) {
        causewayGoldMaterial = material.clone(`${material.name}__arrival-causeway-gold-rail`);
        applyArrivalCausewayGoldRailOverride(causewayGoldMaterial);
        clonedMaterials.set(cacheKey, causewayGoldMaterial);
      }

      assignOverrideMaterial(mesh, causewayGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V63_BasinGardenGoldCrest_')) {
      const cacheKey = `${material.uniqueId}:arrival-garden-gold-crest`;
      let gardenGoldMaterial = clonedMaterials.get(cacheKey);
      if (!gardenGoldMaterial) {
        gardenGoldMaterial = material.clone(`${material.name}__arrival-garden-gold-crest`);
        applyArrivalGardenGoldCrestOverride(gardenGoldMaterial);
        clonedMaterials.set(cacheKey, gardenGoldMaterial);
      }

      assignOverrideMaterial(mesh, gardenGoldMaterial);
      continue;
    }

    if (mesh.name === 'V64_PromenadeGoldInlay') {
      const cacheKey = `${material.uniqueId}:arrival-promenade-gold-inlay`;
      let promenadeGoldMaterial = clonedMaterials.get(cacheKey);
      if (!promenadeGoldMaterial) {
        promenadeGoldMaterial = material.clone(`${material.name}__arrival-promenade-gold-inlay`);
        applyArrivalPromenadeGoldInlayOverride(promenadeGoldMaterial);
        clonedMaterials.set(cacheKey, promenadeGoldMaterial);
      }

      assignOverrideMaterial(mesh, promenadeGoldMaterial);
      continue;
    }

    if (mesh.name.startsWith('V66_BackPlazaSightlineGoldRail_')) {
      const cacheKey = `${material.uniqueId}:arrival-sightline-gold-rail`;
      let sightlineGoldMaterial = clonedMaterials.get(cacheKey);
      if (!sightlineGoldMaterial) {
        sightlineGoldMaterial = material.clone(`${material.name}__arrival-sightline-gold-rail`);
        applyArrivalSightlineGoldRailOverride(sightlineGoldMaterial);
        clonedMaterials.set(cacheKey, sightlineGoldMaterial);
      }

      assignOverrideMaterial(mesh, sightlineGoldMaterial);
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

      assignOverrideMaterial(mesh, wingCanopyMaterial);
      continue;
    }

    if (mesh.name.startsWith('V117_WingCanopyLamellaPearlArray_')) {
      const cacheKey = `${material.uniqueId}:wing-canopy-lamella-pearl`;
      let wingCanopyMaterial = clonedMaterials.get(cacheKey);
      if (!wingCanopyMaterial) {
        wingCanopyMaterial = material.clone(`${material.name}__wing-canopy-lamella-pearl`);
        applyWingCanopyLamellaPearlOverride(wingCanopyMaterial);
        clonedMaterials.set(cacheKey, wingCanopyMaterial);
      }

      assignOverrideMaterial(mesh, wingCanopyMaterial);
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

      assignOverrideMaterial(mesh, lensMaterial);
      continue;
    }

    if (mesh.name.startsWith('V31_SideLedTileField_')) {
      const cacheKey = `${material.uniqueId}:side-led-tile-field`;
      let ledFieldMaterial = clonedMaterials.get(cacheKey);
      if (!ledFieldMaterial) {
        ledFieldMaterial = material.clone(`${material.name}__side-led-tile-field`);
        applySideLedTileFieldOverride(ledFieldMaterial);
        clonedMaterials.set(cacheKey, ledFieldMaterial);
      }

      assignOverrideMaterial(mesh, ledFieldMaterial);
    }

    if (mesh.name === 'V31_CenterParallaxStarfield') {
      const cacheKey = `${material.uniqueId}:center-parallax-starfield`;
      let parallaxMaterial = clonedMaterials.get(cacheKey);
      if (!parallaxMaterial) {
        parallaxMaterial = material.clone(`${material.name}__center-parallax-starfield`);
        applyCenterParallaxStarfieldOverride(parallaxMaterial);
        clonedMaterials.set(cacheKey, parallaxMaterial);
      }

      assignOverrideMaterial(mesh, parallaxMaterial);
    }

    if (
      mesh.name === 'V31_SideParallaxOrbitalContent_L' ||
      mesh.name === 'V31_SideParallaxOrbitalContent_R'
    ) {
      const cacheKey = `${material.uniqueId}:side-parallax-orbital-content`;
      let parallaxMaterial = clonedMaterials.get(cacheKey);
      if (!parallaxMaterial) {
        parallaxMaterial = material.clone(`${material.name}__side-parallax-orbital-content`);
        applySideParallaxOrbitalContentOverride(parallaxMaterial);
        clonedMaterials.set(cacheKey, parallaxMaterial);
      }

      assignOverrideMaterial(mesh, parallaxMaterial);
    }
  }
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

function applySupportTentFrameOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.07, 0.09);
  material.emissiveColor = new Color3(0.004, 0.004, 0.006);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.7;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'support-tent-frame',
  };
}

function applySupportTentCrestOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.21, 0.16, 0.06);
  material.emissiveColor = new Color3(0.005, 0.004, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.14;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'support-tent-crest',
  };
}

function applyServiceCaseBankOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.07, 0.08);
  material.emissiveColor = new Color3(0.004, 0.004, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'service-case-bank',
  };
}

function applyServiceCaseTopperOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.15, 0.06);
  material.emissiveColor = new Color3(0.005, 0.004, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.14;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'service-case-topper',
  };
}

function applyWingServiceCaseArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.07, 0.08);
  material.emissiveColor = new Color3(0.004, 0.004, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-service-case-array',
  };
}

function applyPyroPylonArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
  material.emissiveColor = new Color3(0.005, 0.007, 0.01);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'pyro-pylon-array',
  };
}

function applyPyroNozzleArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.15, 0.06);
  material.emissiveColor = new Color3(0.005, 0.004, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'pyro-nozzle-array',
  };
}

function applyRearMassGoldBandOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.15, 0.06);
  material.emissiveColor = new Color3(0.005, 0.004, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-mass-gold-band',
  };
}

function applyRearMassShadowChannelOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.06, 0.08);
  material.emissiveColor = new Color3(0.006, 0.012, 0.016);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-mass-shadow-channel',
  };
}

function applyWetRouteStoneBandOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.22;
  material.clearCoat.roughness = 0.34;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wet-route-stone-band',
  };
}

function applyWetRouteGoldSeamOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.15, 0.06);
  material.emissiveColor = new Color3(0.005, 0.004, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wet-route-gold-seam',
  };
}

function applyCentralWaterLightHousingOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'central-water-light-housing',
  };
}

function applyCentralWaterLightGoldTrimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.15, 0.06);
  material.emissiveColor = new Color3(0.005, 0.004, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'central-water-light-gold-trim',
  };
}

function applyCentralWaterLightLensOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'central-water-light-lens',
  };
}

function applySideScreenAnchorGoldSpineOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'side-screen-anchor-gold-spine',
  };
}

function applyArcAnchorGoldClusterOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'arc-anchor-gold-cluster',
  };
}

function applySweepAnchorOuterGoldCrownOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'sweep-anchor-outer-gold-crown',
  };
}

function applySweepAnchorInnerGoldCrownOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'sweep-anchor-inner-gold-crown',
  };
}

function applySweepAnchorOuterShadowCoreOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.8;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'sweep-anchor-outer-shadow-core',
  };
}

function applySweepAnchorInnerShadowCoreOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.06, 0.08);
  material.emissiveColor = new Color3(0.008, 0.045, 0.07);
  material.emissiveIntensity = 0.06;
  material.metallic = 0.05;
  material.roughness = 0.76;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'sweep-anchor-inner-shadow-core',
  };
}

function applyHeroPortalServiceDoorFrameOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'hero-portal-service-door-frame',
  };
}

function applyHeroPortalServiceDoorLeafOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'hero-portal-service-door-leaf',
  };
}

function applyCrownRiggingGoldBossOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crown-rigging-gold-boss',
  };
}

function applyCrownGoldLatticeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.1, 0.04);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.1;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-gold-lattice',
  };
}

function applyCrownBladeLamellaPearlOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.24, 0.2, 0.1);
  material.emissiveColor = new Color3(0.012, 0.009, 0.004);
  material.emissiveIntensity = 0.022;
  material.metallic = 0.14;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-blade-lamella-pearl',
  };
}

function applyCrownBladeGoldRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.04);
  material.emissiveColor = new Color3(0.008, 0.005, 0.001);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-blade-gold-reveal',
  };
}

function applyCrownBladeCyanInsetOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.2, 0.26);
  material.emissiveColor = new Color3(0.008, 0.036, 0.052);
  material.emissiveIntensity = 0.06;
  material.alpha = 0.3;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-blade-cyan-inset',
  };
}

function applyTrussDiagonalBraceOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.05, 0.07, 0.09);
  material.emissiveColor = new Color3(0.004, 0.014, 0.02);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.06;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'truss-diagonal-brace',
  };
}

function applyProductionTrussTowerFrameOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.19, 0.23);
  material.emissiveColor = new Color3(0.012, 0.02, 0.028);
  material.emissiveIntensity = 0.03;
  material.metallic = 0.1;
  material.roughness = 0.8;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.56;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'production-truss-tower-frame',
  };
}

function applyProductionTrussCrossBraceOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.06, 0.08);
  material.emissiveColor = new Color3(0.006, 0.018, 0.026);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.06;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'production-truss-cross-brace',
  };
}

function applyProductionTowerServiceLadderOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.16, 0.08);
  material.emissiveColor = new Color3(0.008, 0.005, 0.001);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.2;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'production-tower-service-ladder',
  };
}

function applyProductionTowerBeaconOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.21, 0.26);
  material.emissiveColor = new Color3(0.008, 0.028, 0.038);
  material.emissiveIntensity = 0.06;
  material.alpha = 0.28;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.2;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'production-tower-beacon',
  };
}

function applyWingFacadeArcadePierOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.205, 0.24);
  material.emissiveColor = new Color3(0.005, 0.008, 0.011);
  material.emissiveIntensity = 0.022;
  material.metallic = 0.03;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-facade-arcade-pier',
  };
}

function applyWingFacadeGoldCapitalOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.152, 0.066);
  material.emissiveColor = new Color3(0.011, 0.008, 0.0023);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.19;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-facade-gold-capital',
  };
}

function applyWingFacadeShadowRevealOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.125, 0.16);
  material.emissiveColor = new Color3(0.006, 0.009, 0.012);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-facade-shadow-reveal',
  };
}

function applyCrownRiggingStructureOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-rigging-structure',
  };
}

function applyLineArrayGraphiteOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.2, 0.24);
  material.emissiveColor = new Color3(0.01, 0.012, 0.014);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.08;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.2;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'line-array-graphite',
  };
}

function applyCrowdClusterGraphiteOverride(material: PBRMaterial) {
  applyLineArrayGraphiteOverride(material);
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crowd-cluster-graphite',
  };
}

function applyLineArrayAcousticBlackOverride(material: PBRMaterial) {
  applyMainTrussTowerRigOverride(material);
  material.albedoColor = new Color3(0.05, 0.07, 0.09);
  material.emissiveColor = new Color3(0.01, 0.052, 0.074);
  material.emissiveIntensity = 0.08;
  material.roughness = 0.74;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'line-array-acoustic-black',
  };
}

function applyMainTrussTowerGoldCrossbarOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'main-truss-tower-gold-crossbar',
  };
}

function applyMainTrussTowerRigOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'main-truss-tower-rig',
  };
}

function applyLineArraySuspensionHardwareOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.19, 0.23);
  material.emissiveColor = new Color3(0.012, 0.018, 0.024);
  material.emissiveIntensity = 0.026;
  material.metallic = 0.1;
  material.roughness = 0.8;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.58;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'line-array-suspension-hardware',
  };
}

function applyLineArrayPinBarsOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.16, 0.08);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.2;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'line-array-pin-bars',
  };
}

function applyBasinFountainMistOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.09, 0.11);
  material.emissiveColor = new Color3(0.014, 0.036, 0.05);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.86;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.28;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.62;
  material.clearCoat.roughness = 0.16;
  material.environmentIntensity = 0.82;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-fountain-mist',
  };
}

function applyBasinFountainNozzleArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.13, 0.06);
  material.emissiveColor = new Color3(0.006, 0.004, 0.001);
  material.emissiveIntensity = 0.012;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-fountain-nozzle-array',
  };
}

function applyBasinPlantingIslandRimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.26, 0.28, 0.32);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.02;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.56;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-planting-island-rim',
  };
}

function applyForegroundBarricadeFrameOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.19, 0.23);
  material.emissiveColor = new Color3(0.012, 0.018, 0.024);
  material.emissiveIntensity = 0.026;
  material.metallic = 0.1;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.56;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'foreground-barricade-frame',
  };
}

function applyForegroundBarricadeGoldRailOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.16, 0.08);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.2;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'foreground-barricade-gold-rail',
  };
}

function applyV24CelestialCrownFrontArchOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
  material.emissiveColor = new Color3(0.006, 0.008, 0.012);
  material.emissiveIntensity = 0.022;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.7;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'v24-celestial-crown-front-arch',
  };
}

function applyV24ProsceniumFlyingButtressOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'v24-proscenium-flying-buttress',
  };
}

function applyV24CrownGoldRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.064);
  material.emissiveColor = new Color3(0.012, 0.008, 0.0025);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'v24-crown-gold-reveal',
  };
}

function applyV24CrownDepthRibOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0015);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'v24-crown-depth-rib',
  };
}

function applyV24ButtressGoldRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'v24-buttress-gold-reveal',
  };
}

function applyCrownHaloCyanInlayOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.04, 0.12, 0.18);
  material.emissiveColor = new Color3(0.008, 0.03, 0.05);
  material.emissiveIntensity = 0.06;
  material.alpha = 0.55;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.42;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-halo-cyan-inlay',
  };
}

function applyBasinLanternStemOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.19, 0.23);
  material.emissiveColor = new Color3(0.012, 0.018, 0.024);
  material.emissiveIntensity = 0.026;
  material.metallic = 0.1;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.56;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-lantern-stem',
  };
}

function applyBasinLanternHousingOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.16, 0.08);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.2;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-lantern-housing',
  };
}

function applyBasinLanternWarmCoreOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.84, 0.62, 0.28);
  material.emissiveColor = new Color3(0.96, 0.7, 0.26);
  material.emissiveIntensity = 0.62;
  material.metallic = 0.02;
  material.roughness = 0.34;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.16;
  material.clearCoat.roughness = 0.26;
  material.environmentIntensity = 0.38;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-lantern-warm-core',
  };
}

function applyBasinFoliageMidstoryOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.08, 0.04);
  material.emissiveColor = new Color3(0.004, 0.006, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'basin-foliage-midstory',
  };
}

function applyLayeredFoliageCanopyOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.08, 0.04);
  material.emissiveColor = new Color3(0.004, 0.006, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'layered-foliage-canopy',
  };
}

function applyDeepFoliageUnderstoryOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.08, 0.04);
  material.emissiveColor = new Color3(0.004, 0.006, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'deep-foliage-understory',
  };
}

function applyWetPaverStoneBandOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wet-paver-stone-band',
  };
}

function applyWetPaverGoldSeamOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wet-paver-gold-seam',
  };
}

function applySpawnWetInsetPoolOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'spawn-wet-inset-pool',
  };
}

function applyGardenStoneEdgeOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'garden-stone-edge',
  };
}

function applyBasinFountainPedestalOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'basin-fountain-pedestal',
  };
}

function applyBasinFountainLightOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.8, 0.56, 0.24);
  material.emissiveColor = new Color3(1, 0.68, 0.24);
  material.emissiveIntensity = 0.7;
  material.metallic = 0.02;
  material.roughness = 0.32;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.18;
  material.clearCoat.roughness = 0.24;
  material.environmentIntensity = 0.42;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-fountain-light',
  };
}

function applyBasinFountainJetOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.06, 0.08);
  material.emissiveColor = new Color3(0.02, 0.16, 0.24);
  material.emissiveIntensity = 0.4;
  material.alpha = 0.94;
  material.metallic = 0.01;
  material.roughness = 0.38;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.4;
  material.clearCoat.roughness = 0.18;
  material.environmentIntensity = 0.62;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-fountain-jet',
  };
}

function applyArcAnchorShadowClusterOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arc-anchor-shadow-cluster',
  };
}

function applySideScreenAnchorShadowBraceOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'side-screen-anchor-shadow-brace',
  };
}

function applyOvalScreenRecessGoldFrameOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'oval-screen-recess-gold-frame',
  };
}

function applyOvalScreenRecessShadowPocketOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.01, 0.06, 0.09);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-recess-shadow-pocket',
  };
}

function applyOvalScreenCanopyShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
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
    mainStageMaterialOverride: 'oval-screen-canopy-shell',
  };
}

function applyOvalScreenPedestalShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.02;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-pedestal-shell',
  };
}

function applyOvalScreenButtressShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.21, 0.23, 0.27);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.7;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-buttress-shell',
  };
}

function applyOvalScreenMullionShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'oval-screen-mullion-shell',
  };
}

function applyOvalScreenPedestalGoldTrimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0015);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-pedestal-gold-trim',
  };
}

function applyOvalScreenCanopyGoldTrimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.15, 0.075);
  material.emissiveColor = new Color3(0.012, 0.009, 0.003);
  material.emissiveIntensity = 0.025;
  material.metallic = 0.22;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-canopy-gold-trim',
  };
}

function applyOvalScreenButtressGoldTrimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.009, 0.006, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-buttress-gold-trim',
  };
}

function applyOvalScreenMullionGoldTrimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.13, 0.1, 0.045);
  material.emissiveColor = new Color3(0.005, 0.0035, 0.0012);
  material.emissiveIntensity = 0.014;
  material.metallic = 0.12;
  material.roughness = 0.93;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-screen-mullion-gold-trim',
  };
}

function applyBasinRetainingReliefOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.17, 0.21);
  material.emissiveColor = new Color3(0.004, 0.006, 0.01);
  material.emissiveIntensity = 0.01;
  material.metallic = 0.02;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-retaining-relief',
  };
}

function applyBasinChannelReliefOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.16, 0.20);
  material.emissiveColor = new Color3(0.004, 0.006, 0.008);
  material.emissiveIntensity = 0.01;
  material.metallic = 0.02;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-channel-relief',
  };
}

function applyBasinRunwaySpineOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.12, 0.15, 0.19);
  material.emissiveColor = new Color3(0.003, 0.004, 0.007);
  material.emissiveIntensity = 0.008;
  material.metallic = 0.02;
  material.roughness = 0.96;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.05;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-runway-spine',
  };
}

function applyBasinRetainingWallOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.19, 0.23);
  material.emissiveColor = new Color3(0.005, 0.007, 0.01);
  material.emissiveIntensity = 0.012;
  material.metallic = 0.02;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-retaining-wall',
  };
}

function applyBasinDeckReliefOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.11, 0.13, 0.17);
  material.emissiveColor = new Color3(0.002, 0.003, 0.006);
  material.emissiveIntensity = 0.008;
  material.metallic = 0.02;
  material.roughness = 0.96;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.04;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-deck-relief',
  };
}

function applyPortalApronReliefShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'portal-apron-relief-shell',
  };
}

function applyStageShoulderReliefShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'stage-shoulder-relief-shell',
  };
}

function applyCentralStairGoldNosingOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.16, 0.08);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.2;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.86;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'central-stair-gold-nosing',
  };
}

function applyProcessionalRouteGoldTrimOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'processional-route-gold-trim',
  };
}

function applySpawnRouteGoldEdgeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.12, 0.05);
  material.emissiveColor = new Color3(0.008, 0.005, 0.001);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.14;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-route-gold-edge',
  };
}

function applySpawnRouteWetCenterInlayOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'spawn-route-wet-center-inlay',
  };
}

function applyScreenServiceCatwalkCableLoomOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.12, 0.14, 0.18);
  material.emissiveColor = new Color3(0.006, 0.008, 0.01);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'screen-service-catwalk-cable-loom',
  };
}

function applyCrowdControlFrameOverride(material: PBRMaterial) {
  material.albedoTexture = null;
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
    mainStageMaterialOverride: 'crowd-control-frame',
  };
}

function applyCrowdControlRailOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crowd-control-rail',
  };
}

function applyCrownLightDropCableOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.12, 0.16, 0.2);
  material.emissiveColor = new Color3(0.004, 0.005, 0.007);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.76;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'crown-light-drop-cable',
  };
}

function applyCrownMovingLightHousingOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.19, 0.23);
  material.emissiveColor = new Color3(0.008, 0.01, 0.013);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.05;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.28;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'crown-moving-light-housing',
  };
}

function applyCrowdBarrierBaseOverride(material: PBRMaterial) {
  material.albedoTexture = null;
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
    mainStageMaterialOverride: 'crowd-barrier-base',
  };
}

function applyCrowdBarrierRailOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crowd-barrier-rail',
  };
}

function applyWingFacadeShadowFrameOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.15, 0.19);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.08;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-facade-shadow-frame',
  };
}

function applyProsceniumShadowPocketOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'proscenium-shadow-pocket',
  };
}

function applyWingFacadeGoldLintelOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wing-facade-gold-lintel',
  };
}

function applyVipShellFasciaOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.21, 0.25);
  material.emissiveColor = new Color3(0.01, 0.015, 0.02);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.54;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'vip-shell-fascia',
  };
}

function applyFestivalFieldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.08, 0.1);
  material.emissiveColor = new Color3(0.003, 0.006, 0.009);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.56;
  material.environmentIntensity = 0.12;
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

function applyApproachGoldInlayNetworkOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.145, 0.11, 0.045);
  material.emissiveColor = new Color3(0.008, 0.005, 0.002);
  material.emissiveIntensity = 0.014;
  material.metallic = 0.1;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'approach-gold-inlay-network',
  };
}

function applyApproachEdgeRailOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.16, 0.07);
  material.emissiveColor = new Color3(0.012, 0.009, 0.003);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.2;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'approach-edge-rail',
  };
}

function applyApproachBarricadeAssemblyOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.12, 0.145, 0.18);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'approach-barricade-assembly',
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
  material.albedoColor = new Color3(0.38, 0.36, 0.32);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.02;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-stone-coping',
  };
}

function applyCrownButtressGoldInlayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.148, 0.109, 0.044);
  material.emissiveColor = new Color3(0.0036, 0.0023, 0.0008);
  material.emissiveIntensity = 0.008;
  material.metallic = 0.11;
  material.roughness = 0.93;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-buttress-gold-inlay',
  };
}

function applyCrownButtressReliefOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crown-buttress-relief',
  };
}

function applyOuterWingButtressShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.2, 0.24);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'outer-wing-buttress-shell',
  };
}

function applyWingFacadeArchInlayOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wing-facade-arch-inlay',
  };
}

function applyWingFacadeInsetGlowOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.01, 0.05, 0.07);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.36;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-facade-inset-glow',
  };
}

function applyWideHeroScreenGoldFrameOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wide-hero-screen-gold-frame',
  };
}

function applyWideHeroScreenGoldMullionOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.14;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wide-hero-screen-gold-mullion',
  };
}

function applyWideHeroScreenGoldCrossbarOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.178, 0.136, 0.058);
  material.emissiveColor = new Color3(0.005, 0.0032, 0.0011);
  material.emissiveIntensity = 0.012;
  material.metallic = 0.17;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wide-hero-screen-gold-crossbar',
  };
}

function applyWideHeroScreenIvoryShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wide-hero-screen-ivory-shell',
  };
}

function applyCrownScreenShadowCofferOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.08, 0.1);
  material.emissiveColor = new Color3(0.012, 0.052, 0.076);
  material.emissiveIntensity = 0.09;
  material.metallic = 0.04;
  material.roughness = 0.74;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-screen-shadow-coffer',
  };
}

function applyCrownScreenVerticalKeystoneOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.158, 0.12, 0.054);
  material.emissiveColor = new Color3(0.008, 0.0055, 0.0018);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.09;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-screen-vertical-keystone',
  };
}

function applyCenterScreenSidePierGoldFrameOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.136, 0.058);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0012);
  material.emissiveIntensity = 0.014;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-side-pier-gold-frame',
  };
}

function applyCenterScreenSidePierCyanCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.22, 0.28);
  material.emissiveColor = new Color3(0.012, 0.042, 0.056);
  material.emissiveIntensity = 0.088;
  material.alpha = 0.34;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.08;
  material.clearCoat.roughness = 0.56;
  material.environmentIntensity = 0.36;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-side-pier-cyan-core',
  };
}

function applyCenterScreenGoldInterruptRailOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.145, 0.106, 0.042);
  material.emissiveColor = new Color3(0.004, 0.0025, 0.0009);
  material.emissiveIntensity = 0.01;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.07;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-gold-interrupt-rail',
  };
}

function applyCenterScreenDepthBaffleArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.06, 0.08, 0.1);
  material.emissiveColor = new Color3(0.008, 0.032, 0.05);
  material.emissiveIntensity = 0.06;
  material.metallic = 0.04;
  material.roughness = 0.76;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.7;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-depth-baffle-array',
  };
}

function applyWingScreenDepthBaffleArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.03, 0.05, 0.07);
  material.emissiveColor = new Color3(0.006, 0.03, 0.05);
  material.emissiveIntensity = 0.05;
  material.metallic = 0.04;
  material.roughness = 0.8;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-screen-depth-baffle-array',
  };
}

function applyWingScreenShadowCofferArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.06, 0.08);
  material.emissiveColor = new Color3(0.008, 0.04, 0.06);
  material.emissiveIntensity = 0.06;
  material.metallic = 0.05;
  material.roughness = 0.78;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-screen-shadow-coffer-array',
  };
}

function applyCenterScreenShadowCofferArrayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.07, 0.09, 0.11);
  material.emissiveColor = new Color3(0.01, 0.042, 0.06);
  material.emissiveIntensity = 0.07;
  material.metallic = 0.05;
  material.roughness = 0.74;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-shadow-coffer-array',
  };
}

function applyPromenadePearlRunwayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.24, 0.22, 0.2);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.02;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.76;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'promenade-pearl-runway',
  };
}

function applyPromenadeGoldShouldersOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.07);
  material.emissiveColor = new Color3(0.018, 0.012, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'promenade-gold-shoulders',
  };
}

function applyPromenadeCyanSpineOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.015, 0.045, 0.06);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.38;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.6;
  material.environmentIntensity = 0.34;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'promenade-cyan-spine',
  };
}

function applyPromenadeShadowKeelOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'promenade-shadow-keel',
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
  material.albedoColor = new Color3(0.11, 0.08, 0.035);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0.01;
  material.metallic = 0.14;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oculus-canopy',
  };
}

function applyWingCanopyLamellaGoldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.149, 0.111, 0.047);
  material.emissiveColor = new Color3(0.0038, 0.0025, 0.0009);
  material.emissiveIntensity = 0.008;
  material.metallic = 0.12;
  material.roughness = 0.93;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.07;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-canopy-lamella-gold',
  };
}

function applyWingCanopyLamellaPearlOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wing-canopy-lamella-pearl',
  };
}

function applyShoulderCrownMassIvoryOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.24, 0.26, 0.3);
  material.emissiveColor = new Color3(0.006, 0.01, 0.014);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'shoulder-crown-mass-ivory',
  };
}

function applyRearCathedralMassIvoryOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.26, 0.28, 0.32);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.02;
  material.roughness = 0.84;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-cathedral-mass-ivory',
  };
}

function applyRearCathedralPearlCoreOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'rear-cathedral-pearl-core',
  };
}

function applyProsceniumPylonPearlShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.2, 0.24);
  material.emissiveColor = new Color3(0.004, 0.006, 0.009);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.76;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'proscenium-pylon-pearl-shell',
  };
}

function applyRearCathedralLancetPearlOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'rear-cathedral-lancet-pearl',
  };
}

function applyRearCathedralLancetFrameOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'rear-cathedral-lancet-frame',
  };
}

function applyRearCathedralLancetGoldOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'rear-cathedral-lancet-gold',
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

function applySpawnGalleryCorniceGoldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.145, 0.105, 0.042);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.metallic = 0.1;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gallery-cornice-gold',
  };
}

function applySpawnGalleryHaloGoldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gallery-halo-gold',
  };
}

function applySpawnGalleryArcadeShadowOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.16, 0.2);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.06;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gallery-arcade-shadow',
  };
}

function applySpawnGalleryArcadeCyanOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.21, 0.27);
  material.emissiveColor = new Color3(0.012, 0.038, 0.052);
  material.emissiveIntensity = 0.082;
  material.alpha = 0.34;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gallery-arcade-cyan',
  };
}

function applySpawnPylonPearlShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'spawn-pylon-pearl-shell',
  };
}

function applySpawnPylonGoldCrownOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.062);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.017;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-pylon-gold-crown',
  };
}

function applySpawnPylonShadowSpineOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.135, 0.17);
  material.emissiveColor = new Color3(0.007, 0.01, 0.013);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-pylon-shadow-spine',
  };
}

function applySpawnPylonCyanCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.19, 0.24);
  material.emissiveColor = new Color3(0.01, 0.03, 0.042);
  material.emissiveIntensity = 0.076;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.28;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-pylon-cyan-core',
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

function applySpawnCanopyGoldCrestOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.065);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.16;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-canopy-gold-crest',
  };
}

function applySpawnCanopyShadowSoffitOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.145, 0.18);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-canopy-shadow-soffit',
  };
}

function applySpawnCanopyCyanLanternOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.2, 0.25);
  material.emissiveColor = new Color3(0.008, 0.028, 0.038);
  material.emissiveIntensity = 0.07;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.01;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-canopy-cyan-lantern',
  };
}

function applyBasinCausewayPearlSpanOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.19, 0.23);
  material.emissiveColor = new Color3(0.004, 0.006, 0.01);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.76;
  material.environmentIntensity = 0.08;
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

function applyArrivalRunwayPearlBandsOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'arrival-runway-pearl-bands',
  };
}

function applyArrivalRunwayGoldBandsOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'arrival-runway-gold-bands',
  };
}

function applyArrivalThresholdGoldBandsOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0015);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-threshold-gold-bands',
  };
}

function applyArrivalRunwayCyanThreadsOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.01, 0.05, 0.07);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.36;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-runway-cyan-threads',
  };
}

function applyArrivalThresholdShadowGroovesOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'arrival-threshold-shadow-grooves',
  };
}

function applyArrivalPlinthPearlDaisOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'arrival-plinth-pearl-dais',
  };
}

function applyArrivalPlinthGoldInlayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.06);
  material.emissiveColor = new Color3(0.008, 0.0055, 0.0018);
  material.emissiveIntensity = 0.013;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-plinth-gold-inlay',
  };
}

function applyArrivalPlinthCyanSpineOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.21, 0.27);
  material.emissiveColor = new Color3(0.012, 0.036, 0.048);
  material.emissiveIntensity = 0.085;
  material.alpha = 0.3;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-plinth-cyan-spine',
  };
}

function applyArrivalPlinthShadowRevealOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.14, 0.18);
  material.emissiveColor = new Color3(0.008, 0.011, 0.015);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-plinth-shadow-reveal',
  };
}

function applyBackPlazaLanternStemOverride(material: PBRMaterial) {
  material.albedoTexture = null;
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
    mainStageMaterialOverride: 'back-plaza-lantern-stem',
  };
}

function applyBackPlazaLanternGoldCageOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'back-plaza-lantern-gold-cage',
  };
}

function applyBackPlazaLanternWarmCoreOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.8, 0.56, 0.24);
  material.emissiveColor = new Color3(1, 0.68, 0.24);
  material.emissiveIntensity = 0.7;
  material.metallic = 0.02;
  material.roughness = 0.32;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.18;
  material.clearCoat.roughness = 0.24;
  material.environmentIntensity = 0.42;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-lantern-warm-core',
  };
}

function applyBackPlazaLanternHaloRimOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.17, 0.08);
  material.emissiveColor = new Color3(0.12, 0.08, 0.03);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.1;
  material.roughness = 0.78;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.52;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-lantern-halo-rim',
  };
}

function applyPromenadePearlRibbonOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'promenade-pearl-ribbon',
  };
}

function applyPlazaPaverPearlBandsOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'plaza-paver-pearl-bands',
  };
}

function applyPlazaPaverGoldFiligreeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.07);
  material.emissiveColor = new Color3(0.018, 0.012, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'plaza-paver-gold-filigree',
  };
}

function applyPortalArcadePearlShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.006, 0.01, 0.014);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.89;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.09;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'portal-arcade-pearl-shell',
  };
}

function applyGrandArcadePearlColonnadeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
  material.emissiveColor = new Color3(0.008, 0.012, 0.017);
  material.emissiveIntensity = 0.025;
  material.metallic = 0.02;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.6;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'grand-arcade-pearl-colonnade',
  };
}

function applyHeroPortalPearlApronOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.2, 0.24);
  material.emissiveColor = new Color3(0.005, 0.008, 0.012);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.02;
  material.roughness = 0.91;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'hero-portal-pearl-apron',
  };
}

function applyPortalArcadeGoldCrestOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.07);
  material.emissiveColor = new Color3(0.018, 0.012, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'portal-arcade-gold-crest',
  };
}

function applyPortalArcadeCyanSpineOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.015, 0.045, 0.06);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.38;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.6;
  material.environmentIntensity = 0.34;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'portal-arcade-cyan-spine',
  };
}

function applyPortalArcadeShadowCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.15, 0.19);
  material.emissiveColor = new Color3(0.01, 0.015, 0.02);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.08;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.58;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'portal-arcade-shadow-core',
  };
}

function applyHeroPortalGoldCapOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.07);
  material.emissiveColor = new Color3(0.018, 0.012, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'hero-portal-gold-cap',
  };
}

function applyHeroPortalCyanPlinthOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.015, 0.045, 0.06);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.38;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.6;
  material.environmentIntensity = 0.34;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'hero-portal-cyan-plinth',
  };
}

function applyHeroPortalShadowDaisOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'hero-portal-shadow-dais',
  };
}

function applyGrandArcadeGoldBandsOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.07);
  material.emissiveColor = new Color3(0.018, 0.012, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'grand-arcade-gold-bands',
  };
}

function applyRearMassAuroraPearlOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'rear-mass-aurora-pearl',
  };
}

function applyRearMassAuroraGoldSpineOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.062);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.017;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-mass-aurora-gold-spine',
  };
}

function applyRearMassAuroraCyanCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.19, 0.24);
  material.emissiveColor = new Color3(0.01, 0.03, 0.042);
  material.emissiveIntensity = 0.076;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.28;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-mass-aurora-cyan-core',
  };
}

function applyRearMassAuroraShadowRibbonOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.135, 0.17);
  material.emissiveColor = new Color3(0.007, 0.01, 0.013);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-mass-aurora-shadow-ribbon',
  };
}

function applyBackPlazaSentinelPearlOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'back-plaza-sentinel-pearl',
  };
}

function applyBackPlazaSentinelGoldCrownOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.062);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.017;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-sentinel-gold-crown',
  };
}

function applyBackPlazaSentinelCyanSpineOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.19, 0.24);
  material.emissiveColor = new Color3(0.01, 0.03, 0.042);
  material.emissiveIntensity = 0.076;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.28;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-sentinel-cyan-spine',
  };
}

function applyBackPlazaSentinelShadowCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.135, 0.17);
  material.emissiveColor = new Color3(0.007, 0.01, 0.013);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-sentinel-shadow-core',
  };
}

function applyBackPlazaSightlinePearlPostsOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'back-plaza-sightline-pearl-posts',
  };
}

function applyVipGardenPearlBasinOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-garden-pearl-basin',
  };
}

function applyVipGardenReflectingPoolOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.006, 0.01, 0.014);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'vip-garden-reflecting-pool',
  };
}

function applyVipGardenGoldRibCanopyOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-garden-gold-rib-canopy',
  };
}

function applyWayfindingPylonPearlShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'wayfinding-pylon-pearl-shell',
  };
}

function applyWayfindingPylonGoldCrownOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.065);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.17;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wayfinding-pylon-gold-crown',
  };
}

function applyWayfindingPylonCyanGlyphOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.2, 0.25);
  material.emissiveColor = new Color3(0.008, 0.03, 0.04);
  material.emissiveIntensity = 0.07;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.01;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wayfinding-pylon-cyan-glyph',
  };
}

function applyPyroPodPearlShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'pyro-pod-pearl-shell',
  };
}

function applyPyroPodGoldNozzleOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.19, 0.155, 0.07);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.18;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.78;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'pyro-pod-gold-nozzle',
  };
}

function applyPyroPodRedGlassOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.2, 0.06, 0.06);
  material.emissiveColor = new Color3(0.22, 0.04, 0.03);
  material.emissiveIntensity = 0.16;
  material.alpha = 0.44;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.58;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'pyro-pod-red-glass',
  };
}

function applyBackPlazaGatewayPearlOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'back-plaza-gateway-pearl',
  };
}

function applyBackPlazaGatewayCyanInlayOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.2, 0.25);
  material.emissiveColor = new Color3(0.008, 0.032, 0.042);
  material.emissiveIntensity = 0.065;
  material.alpha = 0.3;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.01;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.24;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-gateway-cyan-inlay',
  };
}

function applyBackPlazaGatewayGoldCrownOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.06);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.18;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.76;
  material.environmentIntensity = 0.12;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-gateway-gold-crown',
  };
}

function applyBackPlazaBannerRailOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.11, 0.05);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.012;
  material.metallic = 0.12;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'back-plaza-banner-rail',
  };
}

function applySpawnGalleryPierPearlOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'spawn-gallery-pier-pearl',
  };
}

function applySpawnFiligreeGoldOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'spawn-filigree-gold',
  };
}

function applySpawnShadowSeamOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-shadow-seam',
  };
}

function applySpawnBeaconCyanOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.04, 0.12, 0.18);
  material.emissiveColor = new Color3(0.008, 0.03, 0.05);
  material.emissiveIntensity = 0.06;
  material.alpha = 0.55;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.42;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-beacon-cyan',
  };
}

function applyArrivalCausewayCyanInlayOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.035, 0.11, 0.18);
  material.emissiveColor = new Color3(0.007, 0.026, 0.046);
  material.emissiveIntensity = 0.055;
  material.alpha = 0.55;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.44;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.2;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-causeway-cyan-inlay',
  };
}

function applyArrivalPromenadeCyanThreadOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.03, 0.1, 0.17);
  material.emissiveColor = new Color3(0.006, 0.024, 0.042);
  material.emissiveIntensity = 0.048;
  material.alpha = 0.52;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.46;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-promenade-cyan-thread',
  };
}

function applyArrivalSightlineCyanThreadOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.04, 0.12, 0.2);
  material.emissiveColor = new Color3(0.008, 0.029, 0.048);
  material.emissiveIntensity = 0.058;
  material.alpha = 0.56;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.42;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-sightline-cyan-thread',
  };
}

function applyPlazaCrossBandsOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'plaza-cross-bands',
  };
}

function applyPlazaStoneSpineOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.006, 0.008, 0.012);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'black',
    mainStageMaterialOverride: 'plaza-stone-spine',
  };
}

function applySideParallaxGoldOrbitOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'side-parallax-gold-orbit',
  };
}

function applyPortalCrestBridgeOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'portal-crest-bridge',
  };
}

function applyBasinCausewayShadowRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-causeway-shadow-reveal',
  };
}

function applyInnerPortalPylonShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'inner-portal-pylon-shell',
  };
}

function applyInnerShellCascadeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
  material.emissiveColor = new Color3(0.007, 0.009, 0.013);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.15;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'inner-shell-cascade',
  };
}

function applyInnerPortalGoldRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.06);
  material.emissiveColor = new Color3(0.008, 0.0055, 0.0018);
  material.emissiveIntensity = 0.013;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'inner-portal-gold-reveal',
  };
}

function applyOuterSweepSpireOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'outer-sweep-spire',
  };
}

function applyProsceniumPearlRevealOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'proscenium-pearl-reveal',
  };
}

function applyCrownObeliskCoreShellOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.22, 0.26);
  material.emissiveColor = new Color3(0.005, 0.007, 0.011);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-obelisk-core-shell',
  };
}

function applyCrownSpirePearlBladeOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.22, 0.24, 0.28);
  material.emissiveColor = new Color3(0.007, 0.009, 0.013);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.68;
  material.environmentIntensity = 0.15;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-spire-pearl-blade',
  };
}

function applyCrownObeliskGoldTraceryOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.06);
  material.emissiveColor = new Color3(0.009, 0.006, 0.0018);
  material.emissiveIntensity = 0.014;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-obelisk-gold-tracery',
  };
}

function applyCrownObeliskGoldFinOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-obelisk-gold-fin',
  };
}

function applyCrownObeliskApexPedestalOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0015);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-obelisk-apex-pedestal',
  };
}

function applyCrownObeliskShadowSpineOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.135, 0.17);
  material.emissiveColor = new Color3(0.007, 0.01, 0.013);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-obelisk-shadow-spine',
  };
}

function applyCrownObeliskApexCrystalOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.09, 0.19, 0.24);
  material.emissiveColor = new Color3(0.01, 0.03, 0.042);
  material.emissiveIntensity = 0.076;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.66;
  material.environmentIntensity = 0.28;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-obelisk-apex-crystal',
  };
}

function applyCrownJewelPearlSocketOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crown-jewel-pearl-socket',
  };
}

function applyCrownJewelGoldCradleOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.06);
  material.emissiveColor = new Color3(0.008, 0.005, 0.0018);
  material.emissiveIntensity = 0.012;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-jewel-gold-cradle',
  };
}

function applyCrownJewelShadowCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.14, 0.18);
  material.emissiveColor = new Color3(0.008, 0.011, 0.015);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-jewel-shadow-core',
  };
}

function applyCrownJewelCyanOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.21, 0.27);
  material.emissiveColor = new Color3(0.012, 0.036, 0.048);
  material.emissiveIntensity = 0.085;
  material.alpha = 0.3;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-jewel-cyan',
  };
}

function applyOvalPortalGlowShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'oval-portal-glow-shell',
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

function applySpawnGateSentinelGoldCrownOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.145, 0.06);
  material.emissiveColor = new Color3(0.008, 0.0055, 0.0018);
  material.emissiveIntensity = 0.013;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.8;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gate-sentinel-gold-crown',
  };
}

function applySpawnGateSentinelCyanCoreOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.21, 0.27);
  material.emissiveColor = new Color3(0.012, 0.036, 0.048);
  material.emissiveIntensity = 0.085;
  material.alpha = 0.3;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.24;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.05;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gate-sentinel-cyan-core',
  };
}

function applySpawnGateSentinelShadowKeelOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.11, 0.14, 0.18);
  material.emissiveColor = new Color3(0.008, 0.011, 0.015);
  material.emissiveIntensity = 0.016;
  material.metallic = 0.06;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'spawn-gate-sentinel-shadow-keel',
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
  material.albedoColor = new Color3(0.16, 0.12, 0.06);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.86;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-terrace-gold',
  };
}

function applyHeroPortalOuterOgiveOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'hero-portal-outer-ogive',
  };
}

function applyHeroPortalGoldRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.14, 0.07);
  material.emissiveColor = new Color3(0.018, 0.012, 0.005);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.environmentIntensity = 0.13;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'hero-portal-gold-reveal',
  };
}

function applyHeroPortalShadowVaultOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'hero-portal-shadow-vault',
  };
}

function applyCrownApexCrystalOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.015, 0.045, 0.06);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.38;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.6;
  material.environmentIntensity = 0.34;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-apex-crystal',
  };
}

function applyPerformanceDaisLowerOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.16, 0.19, 0.23);
  material.emissiveColor = new Color3(0.012, 0.018, 0.024);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.08;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.54;
  material.environmentIntensity = 0.32;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'performance-dais-lower',
  };
}

function applyPerformanceDaisMidOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.26, 0.29, 0.33);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.024;
  material.metallic = 0.02;
  material.roughness = 0.82;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.58;
  material.environmentIntensity = 0.18;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'performance-dais-mid',
  };
}

function applyPerformanceDaisUpperOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'performance-dais-upper',
  };
}

function applyWingArcadePearlArchOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.18, 0.22);
  material.emissiveColor = new Color3(0.004, 0.007, 0.01);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-arcade-pearl-arch',
  };
}

function applyWingArcadeGoldRevealOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.11, 0.05);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.14;
  material.roughness = 0.92;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-arcade-gold-reveal',
  };
}

function applyWingArcadeCyanInlayOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.015, 0.045, 0.06);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.38;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.6;
  material.environmentIntensity = 0.34;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-arcade-cyan-inlay',
  };
}

function applyCrowdWearableGlowOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.22, 0.28);
  material.emissiveColor = new Color3(0.01, 0.032, 0.042);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.01;
  material.roughness = 0.2;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.26;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crowd-wearable-glow',
  };
}

function applyVipTerraceOuterSweepOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-terrace-outer-sweep',
  };
}

function applyVipTerraceGoldInlayOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-terrace-gold-inlay',
  };
}

function applyVipBalustradeLowerChordOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-balustrade-lower-chord',
  };
}

function applyVipBalustradeFiligreeOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-balustrade-filigree',
  };
}

function applyVipPearlSurfaceGoldReliefOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'vip-pearl-surface-gold-relief',
  };
}

function applyVipPearlSurfaceCyanInsetOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.01, 0.05, 0.07);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.36;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'vip-pearl-surface-cyan-inset',
  };
}

function applyOuterWingGoldSpineOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'outer-wing-gold-spine',
  };
}

function applyRearShellGoldSeamOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'rear-shell-gold-seam',
  };
}

function applyForegroundBarricadeGoldRunOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.12, 0.1, 0.05);
  material.emissiveColor = new Color3(0.004, 0.003, 0.001);
  material.emissiveIntensity = 0.008;
  material.metallic = 0.12;
  material.roughness = 0.94;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.9;
  material.environmentIntensity = 0.06;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'foreground-barricade-gold-run',
  };
}

function applyForegroundBarricadePearlRunOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'foreground-barricade-pearl-run',
  };
}

function applyRearShellPanelOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.24, 0.26, 0.3);
  material.emissiveColor = new Color3(0.006, 0.01, 0.014);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.86;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.03;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'rear-shell-panel',
  };
}

function applyCrownCrystalGoldEdgeOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crown-crystal-gold-edge',
  };
}

function applyCrownShellGoldSeamOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crown-shell-gold-seam',
  };
}

function applyCelestialHaloOuterRingOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'celestial-halo-outer-ring',
  };
}

function applyCelestialHaloInnerRingOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'celestial-halo-inner-ring',
  };
}

function applyCelestialHaloCyanEdgeOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.01, 0.05, 0.07);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.36;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'celestial-halo-cyan-edge',
  };
}

function applyCenterScreenMullionOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.2, 0.155, 0.068);
  material.emissiveColor = new Color3(0.012, 0.008, 0.0025);
  material.emissiveIntensity = 0.022;
  material.metallic = 0.18;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.14;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-mullion',
  };
}

function applyCenterScreenCyanEdgeOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.1, 0.22, 0.28);
  material.emissiveColor = new Color3(0.014, 0.058, 0.082);
  material.emissiveIntensity = 0.1;
  material.alpha = 0.32;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.2;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.06;
  material.clearCoat.roughness = 0.58;
  material.environmentIntensity = 0.34;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'center-screen-cyan-edge',
  };
}

function applyBasinWaterSheetOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'basin-water-sheet',
  };
}

function applyBasinWaterParterreOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.02, 0.04, 0.06);
  material.emissiveColor = new Color3(0.004, 0.012, 0.018);
  material.emissiveIntensity = 0.025;
  material.alpha = 0.74;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.62;
  material.clearCoat.roughness = 0.1;
  material.environmentIntensity = 0.38;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-water-parterre',
  };
}

function applyBasinScreenReflectionVeilOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.07, 0.09);
  material.emissiveColor = new Color3(0.002, 0.012, 0.018);
  material.emissiveIntensity = 0.03;
  material.alpha = 0.12;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.22;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.82;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'basin-screen-reflection-veil',
  };
}

function applyOvalPortalGlowGoldOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'oval-portal-glow-gold',
  };
}

function applyOvalPortalGlowEmissionOverride(material: PBRMaterial) {
  material.albedoColor = new Color3(0.12, 0.24, 0.3);
  material.emissiveColor = new Color3(0.01, 0.05, 0.07);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.36;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.18;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.62;
  material.environmentIntensity = 0.3;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'oval-portal-glow-emission',
  };
}

function applyVipTerraceGoldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.16, 0.12, 0.06);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.16;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.86;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'vip-terrace-gold',
  };
}

function applyWingTerraceFasciaOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.18, 0.2, 0.24);
  material.emissiveColor = new Color3(0.006, 0.007, 0.01);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.02;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-terrace-fascia',
  };
}

function applyWingSoffitShadowOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'wing-soffit-shadow',
  };
}

function applyVipSoffitShadowOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.14, 0.17, 0.21);
  material.emissiveColor = new Color3(0.008, 0.012, 0.016);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.04;
  material.roughness = 0.88;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.64;
  material.environmentIntensity = 0.16;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'vip-soffit-shadow',
  };
}

function applyTerraceGoldRailOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'terrace-gold-rail',
  };
}

function applyArrivalCausewayGoldRailOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0015);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-causeway-gold-rail',
  };
}

function applyArrivalGardenGoldCrestOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.175, 0.135, 0.058);
  material.emissiveColor = new Color3(0.008, 0.006, 0.002);
  material.emissiveIntensity = 0.018;
  material.metallic = 0.18;
  material.roughness = 0.87;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.01;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.11;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-garden-gold-crest',
  };
}

function applyArrivalPromenadeGoldInlayOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.15, 0.11, 0.045);
  material.emissiveColor = new Color3(0.006, 0.004, 0.0015);
  material.emissiveIntensity = 0.015;
  material.metallic = 0.12;
  material.roughness = 0.92;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.88;
  material.environmentIntensity = 0.08;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-promenade-gold-inlay',
  };
}

function applyArrivalSightlineGoldRailOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.17, 0.13, 0.055);
  material.emissiveColor = new Color3(0.007, 0.005, 0.0018);
  material.emissiveIntensity = 0.017;
  material.metallic = 0.15;
  material.roughness = 0.89;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.86;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'arrival-sightline-gold-rail',
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

function applySideLedTileFieldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.02, 0.05, 0.07);
  material.emissiveColor = new Color3(0.001, 0.008, 0.012);
  material.emissiveIntensity = 0.016;
  material.alpha = 0.08;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.02;
  material.roughness = 0.32;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0;
  material.clearCoat.roughness = 0.84;
  material.environmentIntensity = 0.04;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'side-led-tile-field',
  };
}

function applyCenterParallaxStarfieldOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.035, 0.072, 0.098);
  material.emissiveColor = new Color3(0.01, 0.024, 0.032);
  material.emissiveIntensity = 0.072;
  material.alpha = 0.5;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.04;
  material.roughness = 0.46;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.74;
  material.environmentIntensity = 0.2;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'smoked',
    mainStageMaterialOverride: 'center-parallax-starfield',
  };
}

function applySideParallaxOrbitalContentOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.04, 0.08, 0.11);
  material.emissiveColor = new Color3(0.012, 0.028, 0.038);
  material.emissiveIntensity = 0.08;
  material.alpha = 0.52;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.metallic = 0.04;
  material.roughness = 0.42;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.02;
  material.clearCoat.roughness = 0.72;
  material.environmentIntensity = 0.22;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialPolish: 'smoked',
    mainStageMaterialOverride: 'side-parallax-orbital-content',
  };
}
