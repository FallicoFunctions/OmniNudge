import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { polishMainStageMaterials } from '../mainStageMaterialPolish';

describe('polishMainStageMaterials', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
    scene = undefined;
    engine = undefined;
  });

  function createMeshWithMaterial(materialName: string) {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const mesh = MeshBuilder.CreateBox(`${materialName}-mesh`, { size: 1 }, scene);
    const material = new PBRMaterial(materialName, scene);
    mesh.material = material;

    return { material, mesh };
  }

  it('upgrades named Main Stage material families for richer in-engine rendering', () => {
    const screen = createMeshWithMaterial('V14_CosmicScreenEmission');
    const cyanGlass = createMeshWithMaterial('V20_CelestialCyanGlass');
    const gold = createMeshWithMaterial('V20_ChasedGoldFiligree');
    const pearl = createMeshWithMaterial('V20_LayeredPearlShell');
    const wetStone = createMeshWithMaterial('V19_DeepWetArrivalStone');
    const blackRigging = createMeshWithMaterial('V18_BlackPowderCoatTruss');
    const untouched = createMeshWithMaterial('UncategorizedImportedMaterial');

    const result = polishMainStageMaterials([
      screen.mesh,
      cyanGlass.mesh,
      gold.mesh,
      pearl.mesh,
      wetStone.mesh,
      blackRigging.mesh,
      untouched.mesh,
    ]);

    expect(result).toEqual({
      black: 1,
      emissive: 2,
      gold: 1,
      pearl: 1,
      untouched: 1,
      wet: 1,
    });
    expect(screen.material.emissiveIntensity).toBeGreaterThanOrEqual(0.55);
    expect(screen.material.emissiveIntensity).toBeLessThanOrEqual(1.05);
    expect(screen.material.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(screen.material.roughness).toBeGreaterThanOrEqual(0.38);
    expect(screen.material.clearCoat.intensity).toBeLessThanOrEqual(0.2);
    expect(screen.material.environmentIntensity).toBeLessThanOrEqual(0.8);
    expect(cyanGlass.material.emissiveColor.b).toBeGreaterThan(cyanGlass.material.emissiveColor.r);
    expect(gold.material.metallic).toBeGreaterThan(0.85);
    expect(gold.material.roughness).toBeLessThan(0.42);
    expect(pearl.material.clearCoat.isEnabled).toBe(true);
    expect(wetStone.material.clearCoat.intensity).toBeGreaterThan(0.55);
    expect(blackRigging.material.roughness).toBeGreaterThan(0.58);
    expect(untouched.material.metadata?.mainStageMaterialPolish).toBeUndefined();
  });

  it('gives the support-tent canopies their own neutralized fabric finish instead of sharing the bright pearl shell material', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.75, 0.68);

    const frame = MeshBuilder.CreateBox('V91_SupportTentFrame_L', { size: 1 }, scene);
    frame.material = sharedPearlMaterial;

    const canopy = MeshBuilder.CreateBox('V91_SupportTentCanopy_L', { size: 1 }, scene);
    canopy.material = sharedPearlMaterial;

    polishMainStageMaterials([frame, canopy]);

    expect(frame.material).toBe(sharedPearlMaterial);
    expect(canopy.material).toBeInstanceOf(PBRMaterial);
    expect(canopy.material).not.toBe(sharedPearlMaterial);

    const canopyMaterial = canopy.material as PBRMaterial;
    expect(canopyMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(canopyMaterial.metadata?.mainStageMaterialOverride).toBe('support-tent-canopy');
    expect(canopyMaterial.albedoColor.r).toBeLessThanOrEqual(0.72);
    expect(canopyMaterial.albedoColor.g).toBeLessThanOrEqual(0.76);
    expect(canopyMaterial.albedoColor.b).toBeLessThanOrEqual(0.8);
    expect(canopyMaterial.roughness).toBeGreaterThanOrEqual(0.58);
    expect(canopyMaterial.clearCoat.roughness).toBeGreaterThanOrEqual(0.34);
    expect(canopyMaterial.environmentIntensity).toBeLessThanOrEqual(0.72);
  });

  it('neutralizes the V87 wing-facade shadow frames so they do not inherit the bright cyan shadow texture read in the VIP terrace view', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const vault = MeshBuilder.CreateBox('V87_WingFacadeShadowVaultArray_L', { size: 1 }, scene);
    vault.material = sharedShadowMaterial;

    const frame = MeshBuilder.CreateBox('V87_WingFacadeShadowFrameArray_L', { size: 1 }, scene);
    frame.material = sharedShadowMaterial;

    polishMainStageMaterials([vault, frame]);

    expect(vault.material).toBe(sharedShadowMaterial);
    expect(frame.material).toBeInstanceOf(PBRMaterial);
    expect(frame.material).not.toBe(sharedShadowMaterial);

    const frameMaterial = frame.material as PBRMaterial;
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-shadow-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('gives the VIP shell fascia its own stone-shell finish so the terrace fascia does not read as a cyan slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.58, 0.86, 0.98);
    sharedPearlMaterial.emissiveColor.set(0.16, 0.3, 0.4);
    sharedPearlMaterial.emissiveIntensity = 0.28;
    const sharedAlbedoTexture = {
      clone() {
        return this;
      },
      name: 'layered-pearl-albedo',
    } as unknown as PBRMaterial['albedoTexture'];
    sharedPearlMaterial.albedoTexture = sharedAlbedoTexture;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const vipFascia = MeshBuilder.CreateBox('V30_VipShellFascia_L', { size: 1 }, scene);
    vipFascia.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, vipFascia]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(vipFascia.material).toBeInstanceOf(PBRMaterial);
    expect(vipFascia.material).not.toBe(sharedPearlMaterial);

    const otherPearlMaterial = otherPearl.material as PBRMaterial;
    const fasciaMaterial = vipFascia.material as PBRMaterial;
    expect(fasciaMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(fasciaMaterial.metadata?.mainStageMaterialOverride).toBe('vip-shell-fascia');
    expect(otherPearlMaterial.albedoTexture).toBe(sharedAlbedoTexture);
    expect(fasciaMaterial.albedoTexture).toBeNull();
    expect(fasciaMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(fasciaMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(fasciaMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(fasciaMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(fasciaMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(fasciaMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(fasciaMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);
  });

  it('gives the side screen glass lens a smoked transparent finish so the VIP terrace view does not read as a cyan card', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedLensMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedLensMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedLensMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedLensMaterial.emissiveIntensity = 0.34;
    sharedLensMaterial.alpha = 1;
    sharedLensMaterial.environmentIntensity = 0.82;

    const centerLens = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    centerLens.material = sharedLensMaterial;

    const sideLens = MeshBuilder.CreateBox('V31_SideGlassLens_L', { size: 1 }, scene);
    sideLens.material = sharedLensMaterial;

    polishMainStageMaterials([centerLens, sideLens]);

    expect(centerLens.material).toBe(sharedLensMaterial);
    expect(sideLens.material).toBeInstanceOf(PBRMaterial);
    expect(sideLens.material).not.toBe(sharedLensMaterial);

    const centerLensMaterial = centerLens.material as PBRMaterial;
    const sideLensMaterial = sideLens.material as PBRMaterial;
    expect(sideLensMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(sideLensMaterial.metadata?.mainStageMaterialOverride).toBe('side-screen-glass-lens');
    expect(centerLensMaterial.alpha).toBe(1);
    expect(sideLensMaterial.alpha).toBeLessThanOrEqual(0.5);
    expect(sideLensMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(sideLensMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(sideLensMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(sideLensMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(sideLensMaterial.roughness).toBeGreaterThanOrEqual(0.08);
    expect(sideLensMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
    expect(sideLensMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('regrades the spawn field and approach deck into authored night materials so the entry view does not read as muddy proxy texture', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStoneMaterial = new PBRMaterial('V19_DeepWetArrivalStone', scene);
    sharedStoneMaterial.albedoColor.set(0.62, 0.58, 0.5);
    sharedStoneMaterial.emissiveColor.set(0.06, 0.04, 0.03);
    sharedStoneMaterial.emissiveIntensity = 0.16;
    sharedStoneMaterial.roughness = 0.42;
    const sharedAlbedoTexture = {
      clone() {
        return this;
      },
      name: 'deep-wet-arrival-stone-albedo',
    } as unknown as PBRMaterial['albedoTexture'];
    sharedStoneMaterial.albedoTexture = sharedAlbedoTexture;

    const untouchedStone = MeshBuilder.CreateBox('V19_DeepWetArrivalStone_01', { size: 1 }, scene);
    untouchedStone.material = sharedStoneMaterial;

    const festivalField = MeshBuilder.CreateBox('FestivalField', { size: 1 }, scene);
    festivalField.material = sharedStoneMaterial;

    const approachPaver = MeshBuilder.CreateBox('V34_ApproachPaverField', { size: 1 }, scene);
    approachPaver.material = sharedStoneMaterial;

    const reflectionUnderlay = MeshBuilder.CreateBox('V34_ApproachReflectionUnderlay', { size: 1 }, scene);
    reflectionUnderlay.material = sharedStoneMaterial;

    polishMainStageMaterials([untouchedStone, festivalField, approachPaver, reflectionUnderlay]);

    expect(untouchedStone.material).toBe(sharedStoneMaterial);
    expect(festivalField.material).toBeInstanceOf(PBRMaterial);
    expect(approachPaver.material).toBeInstanceOf(PBRMaterial);
    expect(reflectionUnderlay.material).toBeInstanceOf(PBRMaterial);
    expect(festivalField.material).not.toBe(sharedStoneMaterial);
    expect(approachPaver.material).not.toBe(sharedStoneMaterial);
    expect(reflectionUnderlay.material).not.toBe(sharedStoneMaterial);

    const festivalFieldMaterial = festivalField.material as PBRMaterial;
    const approachPaverMaterial = approachPaver.material as PBRMaterial;
    const reflectionUnderlayMaterial = reflectionUnderlay.material as PBRMaterial;

    expect(festivalFieldMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(festivalFieldMaterial.metadata?.mainStageMaterialOverride).toBe('festival-field-night');
    expect(festivalFieldMaterial.albedoTexture).toBeNull();
    expect(festivalFieldMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(festivalFieldMaterial.albedoColor.g).toBeLessThanOrEqual(0.13);
    expect(festivalFieldMaterial.albedoColor.b).toBeLessThanOrEqual(0.16);
    expect(festivalFieldMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(festivalFieldMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(approachPaverMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(approachPaverMaterial.metadata?.mainStageMaterialOverride).toBe('approach-paver-field');
    expect(approachPaverMaterial.albedoTexture).toBeNull();
    expect(approachPaverMaterial.albedoColor.r).toBeLessThanOrEqual(0.18);
    expect(approachPaverMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(approachPaverMaterial.albedoColor.b).toBeLessThanOrEqual(0.18);
    expect(approachPaverMaterial.roughness).toBeGreaterThanOrEqual(0.5);
    expect(approachPaverMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.2);

    expect(reflectionUnderlayMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(reflectionUnderlayMaterial.metadata?.mainStageMaterialOverride).toBe('approach-reflection-underlay');
    expect(reflectionUnderlayMaterial.albedoTexture).toBeNull();
    expect(reflectionUnderlayMaterial.alpha).toBeGreaterThanOrEqual(0.94);
    expect(reflectionUnderlayMaterial.roughness).toBeLessThanOrEqual(0.26);
    expect(reflectionUnderlayMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.55);
    expect(reflectionUnderlayMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.72);
  });

  it('darkens the promenade crown lamellae and basin copings into lower-glare stone-metal finishes so the mid-route view keeps depth instead of blowing out into pearl slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.72, 0.6);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.18;
    sharedPearlMaterial.roughness = 0.36;

    const sharedPearlBevelMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlBevelMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlBevelMaterial.emissiveIntensity = 0.12;
    sharedPearlBevelMaterial.roughness = 0.34;

    const otherShell = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
    otherShell.material = sharedPearlMaterial;

    const crownShell = MeshBuilder.CreateBox('V113_CrownShellLamellaArray_L', { size: 1 }, scene);
    crownShell.material = sharedPearlMaterial;

    const otherCoping = MeshBuilder.CreateBox('V89_BasinStoneBalusterArray_L', { size: 1 }, scene);
    otherCoping.material = sharedPearlBevelMaterial;

    const basinCoping = MeshBuilder.CreateBox('V90_BasinStoneCopingArray_L', { size: 1 }, scene);
    basinCoping.material = sharedPearlBevelMaterial;

    polishMainStageMaterials([otherShell, crownShell, otherCoping, basinCoping]);

    expect(otherShell.material).toBe(sharedPearlMaterial);
    expect(crownShell.material).toBeInstanceOf(PBRMaterial);
    expect(crownShell.material).not.toBe(sharedPearlMaterial);

    expect(otherCoping.material).toBe(sharedPearlBevelMaterial);
    expect(basinCoping.material).toBeInstanceOf(PBRMaterial);
    expect(basinCoping.material).not.toBe(sharedPearlBevelMaterial);

    const crownShellMaterial = crownShell.material as PBRMaterial;
    const basinCopingMaterial = basinCoping.material as PBRMaterial;

    expect(crownShellMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(crownShellMaterial.metadata?.mainStageMaterialOverride).toBe('crown-shell-lamella');
    expect(crownShellMaterial.albedoColor.r).toBeLessThanOrEqual(0.3);
    expect(crownShellMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(crownShellMaterial.albedoColor.b).toBeLessThanOrEqual(0.14);
    expect(crownShellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(crownShellMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(crownShellMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(basinCopingMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(basinCopingMaterial.metadata?.mainStageMaterialOverride).toBe('basin-stone-coping');
    expect(basinCopingMaterial.albedoColor.r).toBeLessThanOrEqual(0.5);
    expect(basinCopingMaterial.albedoColor.g).toBeLessThanOrEqual(0.48);
    expect(basinCopingMaterial.albedoColor.b).toBeLessThanOrEqual(0.44);
    expect(basinCopingMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(basinCopingMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(basinCopingMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('rebalances the crown screen coffers and promenade runway into lower-glare night finishes so the basin view stage face reads with depth instead of dead black bars and pearl slab washout', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedBlackMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedBlackMaterial.emissiveColor.set(0, 0, 0);
    sharedBlackMaterial.emissiveIntensity = 0;
    sharedBlackMaterial.roughness = 0.54;

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.3;

    const otherRig = MeshBuilder.CreateBox('V24_CrownHaloBackplate', { size: 1 }, scene);
    otherRig.material = sharedBlackMaterial;

    const screenCoffer = MeshBuilder.CreateBox('V127_CrownScreenShadowCoffer', { size: 1 }, scene);
    screenCoffer.material = sharedBlackMaterial;

    const otherIvory = MeshBuilder.CreateBox('V25_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const promenadeRunway = MeshBuilder.CreateBox('V70_PromenadePearlRunway', { size: 1 }, scene);
    promenadeRunway.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherRig, screenCoffer, otherIvory, promenadeRunway]);

    expect(otherRig.material).toBe(sharedBlackMaterial);
    expect(screenCoffer.material).toBeInstanceOf(PBRMaterial);
    expect(screenCoffer.material).not.toBe(sharedBlackMaterial);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(promenadeRunway.material).toBeInstanceOf(PBRMaterial);
    expect(promenadeRunway.material).not.toBe(sharedIvoryMaterial);

    const screenCofferMaterial = screenCoffer.material as PBRMaterial;
    const promenadeRunwayMaterial = promenadeRunway.material as PBRMaterial;

    expect(screenCofferMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(screenCofferMaterial.metadata?.mainStageMaterialOverride).toBe('crown-screen-shadow-coffer');
    expect(screenCofferMaterial.albedoColor.r).toBeLessThanOrEqual(0.05);
    expect(screenCofferMaterial.albedoColor.g).toBeLessThanOrEqual(0.07);
    expect(screenCofferMaterial.albedoColor.b).toBeLessThanOrEqual(0.09);
    expect(screenCofferMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(screenCofferMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(screenCofferMaterial.environmentIntensity).toBeLessThanOrEqual(0.22);

    expect(promenadeRunwayMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(promenadeRunwayMaterial.metadata?.mainStageMaterialOverride).toBe('promenade-pearl-runway');
    expect(promenadeRunwayMaterial.albedoColor.r).toBeLessThanOrEqual(0.34);
    expect(promenadeRunwayMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(promenadeRunwayMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(promenadeRunwayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(promenadeRunwayMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(promenadeRunwayMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);
  });

  it('darkens the VIP terrace balustrade and canopy metals so the terrace read stops collapsing into a cyan roof slab and flat gold wall', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanGlass.albedoColor.set(0.44, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.28, 0.36);
    sharedCyanGlass.emissiveIntensity = 0.28;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.roughness = 0.22;

    const sharedGold = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGold.albedoColor.set(0.76, 0.62, 0.24);
    sharedGold.emissiveIntensity = 0.12;
    sharedGold.metallic = 0.78;
    sharedGold.roughness = 0.36;

    const sharedCrownGold = new PBRMaterial('V17_CrownBrushedGold', scene);
    sharedCrownGold.albedoColor.set(0.72, 0.58, 0.2);
    sharedCrownGold.emissiveIntensity = 0.1;
    sharedCrownGold.metallic = 0.74;
    sharedCrownGold.roughness = 0.32;

    const otherGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    otherGlass.material = sharedCyanGlass;

    const vipBalustrade = MeshBuilder.CreateBox('V30_VipGlassBalustrade_L', { size: 1 }, scene);
    vipBalustrade.material = sharedCyanGlass;

    const otherGold = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_L', { size: 1 }, scene);
    otherGold.material = sharedGold;

    const oculusCanopy = MeshBuilder.CreateBox('V51_OculusCanopy_L', { size: 1 }, scene);
    oculusCanopy.material = sharedGold;

    const otherCrownGold = MeshBuilder.CreateBox('V24_CrownHaloBackplate', { size: 1 }, scene);
    otherCrownGold.material = sharedCrownGold;

    const wingCanopy = MeshBuilder.CreateBox('V117_WingCanopyLamellaGoldArray_L_Front', { size: 1 }, scene);
    wingCanopy.material = sharedCrownGold;

    polishMainStageMaterials([
      otherGlass,
      vipBalustrade,
      otherGold,
      oculusCanopy,
      otherCrownGold,
      wingCanopy,
    ]);

    expect(otherGlass.material).toBe(sharedCyanGlass);
    expect(vipBalustrade.material).toBeInstanceOf(PBRMaterial);
    expect(vipBalustrade.material).not.toBe(sharedCyanGlass);

    expect(otherGold.material).toBe(sharedGold);
    expect(oculusCanopy.material).toBeInstanceOf(PBRMaterial);
    expect(oculusCanopy.material).not.toBe(sharedGold);

    expect(otherCrownGold.material).toBe(sharedCrownGold);
    expect(wingCanopy.material).toBeInstanceOf(PBRMaterial);
    expect(wingCanopy.material).not.toBe(sharedCrownGold);

    const vipBalustradeMaterial = vipBalustrade.material as PBRMaterial;
    const oculusCanopyMaterial = oculusCanopy.material as PBRMaterial;
    const wingCanopyMaterial = wingCanopy.material as PBRMaterial;

    expect(vipBalustradeMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(vipBalustradeMaterial.metadata?.mainStageMaterialOverride).toBe('vip-glass-balustrade');
    expect(vipBalustradeMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(vipBalustradeMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(vipBalustradeMaterial.albedoColor.b).toBeLessThanOrEqual(0.11);
    expect(vipBalustradeMaterial.alpha).toBeLessThanOrEqual(0.24);
    expect(vipBalustradeMaterial.roughness).toBeGreaterThanOrEqual(0.68);
    expect(vipBalustradeMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);

    expect(oculusCanopyMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(oculusCanopyMaterial.metadata?.mainStageMaterialOverride).toBe('oculus-canopy');
    expect(oculusCanopyMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(oculusCanopyMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(oculusCanopyMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(oculusCanopyMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(oculusCanopyMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);

    expect(wingCanopyMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(wingCanopyMaterial.metadata?.mainStageMaterialOverride).toBe('wing-canopy-lamella-gold');
    expect(wingCanopyMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(wingCanopyMaterial.albedoColor.g).toBeLessThanOrEqual(0.14);
    expect(wingCanopyMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(wingCanopyMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(wingCanopyMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);
  });

  it('regrades the V51 shoulder and cathedral masses into darker night-shell forms so the route views stop reading them as white proxy monoliths', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const shoulderMass = MeshBuilder.CreateBox('V51_ShoulderCrownMass_L', { size: 1 }, scene);
    shoulderMass.material = sharedIvoryMaterial;

    const cathedralMass = MeshBuilder.CreateBox('V51_RearCathedralMass_L', { size: 1 }, scene);
    cathedralMass.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, shoulderMass, cathedralMass]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(shoulderMass.material).toBeInstanceOf(PBRMaterial);
    expect(cathedralMass.material).toBeInstanceOf(PBRMaterial);
    expect(shoulderMass.material).not.toBe(sharedIvoryMaterial);
    expect(cathedralMass.material).not.toBe(sharedIvoryMaterial);
    expect(cathedralMass.material).toBe(shoulderMass.material);

    const stageMassMaterial = shoulderMass.material as PBRMaterial;
    expect(stageMassMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(stageMassMaterial.metadata?.mainStageMaterialOverride).toBe('stage-mass-ivory');
    expect(stageMassMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(stageMassMaterial.albedoColor.g).toBeLessThanOrEqual(0.3);
    expect(stageMassMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(stageMassMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(stageMassMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(stageMassMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.08);
    expect(stageMassMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);
  });

  it('darkens the rear shell shadow reveal arrays so the promenade flanks stop reading as white oval proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const leftReveal = MeshBuilder.CreateBox('V106_RearShellShadowRevealArray_L', { size: 1 }, scene);
    leftReveal.material = sharedIvoryMaterial;

    const rightReveal = MeshBuilder.CreateBox('V106_RearShellShadowRevealArray_R', { size: 1 }, scene);
    rightReveal.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, leftReveal, rightReveal]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rightReveal.material).toBeInstanceOf(PBRMaterial);
    expect(leftReveal.material).not.toBe(sharedIvoryMaterial);
    expect(rightReveal.material).not.toBe(sharedIvoryMaterial);
    expect(rightReveal.material).toBe(leftReveal.material);

    const revealMaterial = leftReveal.material as PBRMaterial;
    expect(revealMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(revealMaterial.metadata?.mainStageMaterialOverride).toBe('rear-shell-shadow-reveal');
    expect(revealMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(revealMaterial.albedoColor.g).toBeLessThanOrEqual(0.22);
    expect(revealMaterial.albedoColor.b).toBeLessThanOrEqual(0.26);
    expect(revealMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(revealMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(revealMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.04);
    expect(revealMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);
  });

  it('tones down the wing terrace gold arrays so the wide views keep the terrace as support architecture instead of bright foil ribbons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.62, 0.24);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.28;

    const otherGold = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_L', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftWingTerrace = MeshBuilder.CreateBox('V133_WingTerraceGoldArray_L', { size: 1 }, scene);
    leftWingTerrace.material = sharedGoldMaterial;

    const rightWingTerrace = MeshBuilder.CreateBox('V133_WingTerraceGoldArray_R', { size: 1 }, scene);
    rightWingTerrace.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, leftWingTerrace, rightWingTerrace]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(leftWingTerrace.material).toBeInstanceOf(PBRMaterial);
    expect(rightWingTerrace.material).toBeInstanceOf(PBRMaterial);
    expect(leftWingTerrace.material).not.toBe(sharedGoldMaterial);
    expect(rightWingTerrace.material).not.toBe(sharedGoldMaterial);
    expect(rightWingTerrace.material).toBe(leftWingTerrace.material);

    const terraceGoldMaterial = leftWingTerrace.material as PBRMaterial;
    expect(terraceGoldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(terraceGoldMaterial.metadata?.mainStageMaterialOverride).toBe('wing-terrace-gold');
    expect(terraceGoldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(terraceGoldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(terraceGoldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(terraceGoldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(terraceGoldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(terraceGoldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the wing terrace fascia so the promenade flanks stop reading as bright pearl slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.74, 0.68);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.36;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftWingFascia = MeshBuilder.CreateBox('V30_WingTerraceFascia_L', { size: 1 }, scene);
    leftWingFascia.material = sharedPearlMaterial;

    const rightWingFascia = MeshBuilder.CreateBox('V30_WingTerraceFascia_R', { size: 1 }, scene);
    rightWingFascia.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftWingFascia, rightWingFascia]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftWingFascia.material).toBeInstanceOf(PBRMaterial);
    expect(rightWingFascia.material).toBeInstanceOf(PBRMaterial);
    expect(leftWingFascia.material).not.toBe(sharedPearlMaterial);
    expect(rightWingFascia.material).not.toBe(sharedPearlMaterial);
    expect(rightWingFascia.material).toBe(leftWingFascia.material);

    const wingFasciaMaterial = leftWingFascia.material as PBRMaterial;
    expect(wingFasciaMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(wingFasciaMaterial.metadata?.mainStageMaterialOverride).toBe('wing-terrace-fascia');
    expect(wingFasciaMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(wingFasciaMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(wingFasciaMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(wingFasciaMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(wingFasciaMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(wingFasciaMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });
});
