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

    if (
      mesh.name.startsWith('V80_OvalScreenPedestalShell_') ||
      mesh.name.startsWith('V80_OvalScreenCanopyShell_') ||
      mesh.name.startsWith('V80_OvalScreenSideButtressShellArray_')
    ) {
      const cacheKey = `${material.uniqueId}:oval-screen-shell-housing`;
      let housingMaterial = clonedMaterials.get(cacheKey);
      if (!housingMaterial) {
        housingMaterial = material.clone(`${material.name}__oval-screen-shell-housing`);
        applyOvalScreenShellHousingOverride(housingMaterial);
        clonedMaterials.set(cacheKey, housingMaterial);
      }

      assignOverrideMaterial(mesh, housingMaterial);
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

    if (
      mesh.name.startsWith('V80_OvalScreenPedestalGoldTrim_') ||
      mesh.name.startsWith('V80_OvalScreenCanopyGoldTrim_') ||
      mesh.name.startsWith('V80_OvalScreenSideButtressGoldTrimArray_') ||
      mesh.name.startsWith('V81_OvalScreenMullionGoldTrimArray_')
    ) {
      const cacheKey = `${material.uniqueId}:oval-screen-gold-trim`;
      let trimMaterial = clonedMaterials.get(cacheKey);
      if (!trimMaterial) {
        trimMaterial = material.clone(`${material.name}__oval-screen-gold-trim`);
        applyOvalScreenGoldTrimOverride(trimMaterial);
        clonedMaterials.set(cacheKey, trimMaterial);
      }

      assignOverrideMaterial(mesh, trimMaterial);
      continue;
    }

    if (
      mesh.name.startsWith('V99_BasinParapetRelief_') ||
      mesh.name.startsWith('V118_BasinWallRelief_') ||
      mesh.name.startsWith('V121_BasinRetainingRelief_') ||
      mesh.name.startsWith('V120_BasinDeckRelief_') ||
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

    if (
      mesh.name === 'V122_PortalApronRelief' ||
      mesh.name.startsWith('V122_StageShoulderRelief_')
    ) {
      const cacheKey = `${material.uniqueId}:stage-front-relief-shell`;
      let reliefMaterial = clonedMaterials.get(cacheKey);
      if (!reliefMaterial) {
        reliefMaterial = material.clone(`${material.name}__stage-front-relief-shell`);
        applyStageFrontReliefShellOverride(reliefMaterial);
        clonedMaterials.set(cacheKey, reliefMaterial);
      }

      assignOverrideMaterial(mesh, reliefMaterial);
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

    if (
      mesh.name === 'V126_WideHeroScreenGoldFrame' ||
      mesh.name === 'V126_WideHeroScreenGoldMullionArray' ||
      mesh.name === 'V126_WideHeroScreenGoldCrossbarArray'
    ) {
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

      assignOverrideMaterial(mesh, stageMassMaterial);
      continue;
    }

    if (
      mesh.name === 'V51_RearCathedralCore' ||
      mesh.name.startsWith('V51_ProsceniumPylon_')
    ) {
      const cacheKey = `${material.uniqueId}:rear-cathedral-pearl-core`;
      let coreMaterial = clonedMaterials.get(cacheKey);
      if (!coreMaterial) {
        coreMaterial = material.clone(`${material.name}__rear-cathedral-pearl-core`);
        applyRearCathedralPearlCoreOverride(coreMaterial);
        clonedMaterials.set(cacheKey, coreMaterial);
      }

      assignOverrideMaterial(mesh, coreMaterial);
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

    if (
      mesh.name.startsWith('V68_PortalArcadePearl_') ||
      mesh.name.startsWith('V68_GrandArcadePearlColonnade_') ||
      mesh.name === 'V68_HeroPortalPearlApron'
    ) {
      const cacheKey = `${material.uniqueId}:hero-portal-pearl-arcade`;
      let portalMaterial = clonedMaterials.get(cacheKey);
      if (!portalMaterial) {
        portalMaterial = material.clone(`${material.name}__hero-portal-pearl-arcade`);
        applyHeroPortalPearlArcadeOverride(portalMaterial);
        clonedMaterials.set(cacheKey, portalMaterial);
      }

      assignOverrideMaterial(mesh, portalMaterial);
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

    if (
      mesh.name.startsWith('V50_InnerPortalPylon_') ||
      mesh.name.startsWith('V50_InnerShellCascade_')
    ) {
      const cacheKey = `${material.uniqueId}:inner-portal-pearl-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__inner-portal-pearl-shell`);
        applyInnerPortalPearlShellOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
      continue;
    }

    if (
      mesh.name === 'V52_CrownObeliskPearlCore' ||
      mesh.name.startsWith('V52_CrownSpirePearlBlade_')
    ) {
      const cacheKey = `${material.uniqueId}:crown-obelisk-pearl-shell`;
      let shellMaterial = clonedMaterials.get(cacheKey);
      if (!shellMaterial) {
        shellMaterial = material.clone(`${material.name}__crown-obelisk-pearl-shell`);
        applyCrownObeliskPearlShellOverride(shellMaterial);
        clonedMaterials.set(cacheKey, shellMaterial);
      }

      assignOverrideMaterial(mesh, shellMaterial);
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

function applyOvalScreenShellHousingOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'oval-screen-shell-housing',
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

function applyOvalScreenGoldTrimOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'oval-screen-gold-trim',
  };
}

function applyBasinRetainingReliefOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'basin-retaining-relief',
  };
}

function applyStageFrontReliefShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'stage-front-relief-shell',
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

function applyCrownButtressGoldInlayOverride(material: PBRMaterial) {
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

function applyCrownScreenVerticalKeystoneOverride(material: PBRMaterial) {
  material.albedoTexture = null;
  material.albedoColor = new Color3(0.17, 0.13, 0.06);
  material.emissiveColor = new Color3(0.01, 0.007, 0.002);
  material.emissiveIntensity = 0.02;
  material.metallic = 0.14;
  material.roughness = 0.9;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.04;
  material.clearCoat.roughness = 0.76;
  material.environmentIntensity = 0.1;
  material.metadata = {
    ...material.metadata,
    mainStageMaterialOverride: 'crown-screen-vertical-keystone',
  };
}

function applyCenterScreenGoldInterruptRailOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'center-screen-gold-interrupt-rail',
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

function applyHeroPortalPearlArcadeOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'hero-portal-pearl-arcade',
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

function applyInnerPortalPearlShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'inner-portal-pearl-shell',
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

function applyCrownObeliskPearlShellOverride(material: PBRMaterial) {
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
    mainStageMaterialOverride: 'crown-obelisk-pearl-shell',
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
