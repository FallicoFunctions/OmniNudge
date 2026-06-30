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

  it('darkens the oval side-screen shell housings so the promenade checkpoint no longer reads them as giant pale slab proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const pedestalShell = MeshBuilder.CreateBox('V80_OvalScreenPedestalShell_L', { size: 1 }, scene);
    pedestalShell.material = sharedPearlMaterial;

    const canopyShell = MeshBuilder.CreateBox('V80_OvalScreenCanopyShell_L', { size: 1 }, scene);
    canopyShell.material = sharedPearlMaterial;

    const buttressShell = MeshBuilder.CreateBox('V80_OvalScreenSideButtressShellArray_L', { size: 1 }, scene);
    buttressShell.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, pedestalShell, canopyShell, buttressShell]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(pedestalShell.material).toBeInstanceOf(PBRMaterial);
    expect(canopyShell.material).toBeInstanceOf(PBRMaterial);
    expect(buttressShell.material).toBeInstanceOf(PBRMaterial);
    expect(pedestalShell.material).not.toBe(sharedPearlMaterial);
    expect(canopyShell.material).not.toBe(sharedPearlMaterial);
    expect(buttressShell.material).not.toBe(sharedPearlMaterial);
    expect(canopyShell.material).toBe(pedestalShell.material);
    expect(buttressShell.material).toBe(pedestalShell.material);

    const housingMaterial = pedestalShell.material as PBRMaterial;
    expect(housingMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(housingMaterial.metadata?.mainStageMaterialOverride).toBe('oval-screen-shell-housing');
    expect(housingMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(housingMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(housingMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(housingMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(housingMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(housingMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(housingMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the oval screen mullion shell arrays so the side-screen stacks read as finished architecture instead of pale pearl ribs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftMullionShell = MeshBuilder.CreateBox('V81_OvalScreenMullionShellArray_L', { size: 1 }, scene);
    leftMullionShell.material = sharedPearlMaterial;

    const rightMullionShell = MeshBuilder.CreateBox('V81_OvalScreenMullionShellArray_R', { size: 1 }, scene);
    rightMullionShell.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftMullionShell, rightMullionShell]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftMullionShell.material).toBeInstanceOf(PBRMaterial);
    expect(rightMullionShell.material).toBeInstanceOf(PBRMaterial);
    expect(leftMullionShell.material).not.toBe(sharedPearlMaterial);
    expect(rightMullionShell.material).not.toBe(sharedPearlMaterial);
    expect(rightMullionShell.material).toBe(leftMullionShell.material);

    const mullionMaterial = leftMullionShell.material as PBRMaterial;
    expect(mullionMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(mullionMaterial.metadata?.mainStageMaterialOverride).toBe('oval-screen-mullion-shell');
    expect(mullionMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(mullionMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(mullionMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(mullionMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(mullionMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(mullionMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(mullionMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('tones down the oval side-screen gold trim families so the side-screen stacks keep relief without blowing out into pale metallic stripes', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('V124_CrowdControlRailArray_L', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const pedestalTrim = MeshBuilder.CreateBox('V80_OvalScreenPedestalGoldTrim_L', { size: 1 }, scene);
    pedestalTrim.material = sharedGoldMaterial;

    const canopyTrim = MeshBuilder.CreateBox('V80_OvalScreenCanopyGoldTrim_L', { size: 1 }, scene);
    canopyTrim.material = sharedGoldMaterial;

    const buttressTrim = MeshBuilder.CreateBox('V80_OvalScreenSideButtressGoldTrimArray_L', { size: 1 }, scene);
    buttressTrim.material = sharedGoldMaterial;

    const mullionTrim = MeshBuilder.CreateBox('V81_OvalScreenMullionGoldTrimArray_L', { size: 1 }, scene);
    mullionTrim.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, pedestalTrim, canopyTrim, buttressTrim, mullionTrim]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(pedestalTrim.material).toBeInstanceOf(PBRMaterial);
    expect(canopyTrim.material).toBeInstanceOf(PBRMaterial);
    expect(buttressTrim.material).toBeInstanceOf(PBRMaterial);
    expect(mullionTrim.material).toBeInstanceOf(PBRMaterial);
    expect(pedestalTrim.material).not.toBe(sharedGoldMaterial);
    expect(canopyTrim.material).not.toBe(sharedGoldMaterial);
    expect(buttressTrim.material).not.toBe(sharedGoldMaterial);
    expect(mullionTrim.material).not.toBe(sharedGoldMaterial);
    expect(canopyTrim.material).toBe(pedestalTrim.material);
    expect(buttressTrim.material).toBe(pedestalTrim.material);
    expect(mullionTrim.material).toBe(pedestalTrim.material);

    const trimMaterial = pedestalTrim.material as PBRMaterial;
    expect(trimMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(trimMaterial.metadata?.mainStageMaterialOverride).toBe('oval-screen-gold-trim');
    expect(trimMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(trimMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(trimMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(trimMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(trimMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(trimMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(trimMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the basin retaining reliefs so the basin-edge sidewalls read as grounded architecture instead of bright pearl sheets', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftRelief = MeshBuilder.CreateBox('V121_BasinRetainingRelief_L', { size: 1 }, scene);
    leftRelief.material = sharedPearlMaterial;

    const rightRelief = MeshBuilder.CreateBox('V121_BasinRetainingRelief_R', { size: 1 }, scene);
    rightRelief.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftRelief, rightRelief]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftRelief.material).toBeInstanceOf(PBRMaterial);
    expect(rightRelief.material).toBeInstanceOf(PBRMaterial);
    expect(leftRelief.material).not.toBe(sharedPearlMaterial);
    expect(rightRelief.material).not.toBe(sharedPearlMaterial);
    expect(rightRelief.material).toBe(leftRelief.material);

    const reliefMaterial = leftRelief.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('basin-retaining-relief');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the basin bridge relief spans so the central water crossings read as carved stonework instead of bright pearl strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const northBridge = MeshBuilder.CreateBox('V121_BasinBridgeRelief_North', { size: 1 }, scene);
    northBridge.material = sharedPearlMaterial;

    const southBridge = MeshBuilder.CreateBox('V121_BasinBridgeRelief_South', { size: 1 }, scene);
    southBridge.material = sharedPearlMaterial;

    const centerBridge = MeshBuilder.CreateBox('V121_BasinBridgeRelief_Center', { size: 1 }, scene);
    centerBridge.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, northBridge, southBridge, centerBridge]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(northBridge.material).toBeInstanceOf(PBRMaterial);
    expect(southBridge.material).toBeInstanceOf(PBRMaterial);
    expect(centerBridge.material).toBeInstanceOf(PBRMaterial);
    expect(northBridge.material).not.toBe(sharedPearlMaterial);
    expect(southBridge.material).not.toBe(sharedPearlMaterial);
    expect(centerBridge.material).not.toBe(sharedPearlMaterial);
    expect(southBridge.material).toBe(northBridge.material);
    expect(centerBridge.material).toBe(northBridge.material);

    const reliefMaterial = northBridge.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('basin-retaining-relief');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the basin deck reliefs so the route-facing basin ledges read as carved stonework instead of bright pearl slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftDeck = MeshBuilder.CreateBox('V120_BasinDeckRelief_L', { size: 1 }, scene);
    leftDeck.material = sharedPearlMaterial;

    const rightDeck = MeshBuilder.CreateBox('V120_BasinDeckRelief_R', { size: 1 }, scene);
    rightDeck.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftDeck, rightDeck]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftDeck.material).toBeInstanceOf(PBRMaterial);
    expect(rightDeck.material).toBeInstanceOf(PBRMaterial);
    expect(leftDeck.material).not.toBe(sharedPearlMaterial);
    expect(rightDeck.material).not.toBe(sharedPearlMaterial);
    expect(rightDeck.material).toBe(leftDeck.material);

    const reliefMaterial = leftDeck.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('basin-retaining-relief');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the basin wall reliefs so the basin cheeks read as carved stonework instead of bright pearl side slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftWall = MeshBuilder.CreateBox('V118_BasinWallRelief_L', { size: 1 }, scene);
    leftWall.material = sharedPearlMaterial;

    const rightWall = MeshBuilder.CreateBox('V118_BasinWallRelief_R', { size: 1 }, scene);
    rightWall.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftWall, rightWall]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftWall.material).toBeInstanceOf(PBRMaterial);
    expect(rightWall.material).toBeInstanceOf(PBRMaterial);
    expect(leftWall.material).not.toBe(sharedPearlMaterial);
    expect(rightWall.material).not.toBe(sharedPearlMaterial);
    expect(rightWall.material).toBe(leftWall.material);

    const reliefMaterial = leftWall.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('basin-retaining-relief');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the basin parapet reliefs so the route-edge basin crowns read as carved stonework instead of bright pearl ledges', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftParapet = MeshBuilder.CreateBox('V99_BasinParapetRelief_L', { size: 1 }, scene);
    leftParapet.material = sharedPearlMaterial;

    const rightParapet = MeshBuilder.CreateBox('V99_BasinParapetRelief_R', { size: 1 }, scene);
    rightParapet.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftParapet, rightParapet]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftParapet.material).toBeInstanceOf(PBRMaterial);
    expect(rightParapet.material).toBeInstanceOf(PBRMaterial);
    expect(leftParapet.material).not.toBe(sharedPearlMaterial);
    expect(rightParapet.material).not.toBe(sharedPearlMaterial);
    expect(rightParapet.material).toBe(leftParapet.material);

    const reliefMaterial = leftParapet.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('basin-retaining-relief');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the stage-front portal apron and shoulder relief shells so the spawn reveal does not collapse into giant white pearl slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const portalApron = MeshBuilder.CreateBox('V122_PortalApronRelief', { size: 1 }, scene);
    portalApron.material = sharedPearlMaterial;

    const leftShoulder = MeshBuilder.CreateBox('V122_StageShoulderRelief_L', { size: 1 }, scene);
    leftShoulder.material = sharedPearlMaterial;

    const rightShoulder = MeshBuilder.CreateBox('V122_StageShoulderRelief_R', { size: 1 }, scene);
    rightShoulder.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, portalApron, leftShoulder, rightShoulder]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(portalApron.material).toBeInstanceOf(PBRMaterial);
    expect(leftShoulder.material).toBeInstanceOf(PBRMaterial);
    expect(rightShoulder.material).toBeInstanceOf(PBRMaterial);
    expect(portalApron.material).not.toBe(sharedPearlMaterial);
    expect(leftShoulder.material).not.toBe(sharedPearlMaterial);
    expect(rightShoulder.material).not.toBe(sharedPearlMaterial);
    expect(leftShoulder.material).toBe(portalApron.material);
    expect(rightShoulder.material).toBe(portalApron.material);

    const reliefMaterial = portalApron.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('stage-front-relief-shell');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
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

  it('neutralizes the V87 wing-facade shadow vault arrays so the terrace soffits read as shadow architecture instead of bright cyan inserts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftVault = MeshBuilder.CreateBox('V87_WingFacadeShadowVaultArray_L', { size: 1 }, scene);
    leftVault.material = sharedShadowMaterial;

    const rightVault = MeshBuilder.CreateBox('V87_WingFacadeShadowVaultArray_R', { size: 1 }, scene);
    rightVault.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, leftVault, rightVault]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftVault.material).toBeInstanceOf(PBRMaterial);
    expect(rightVault.material).toBeInstanceOf(PBRMaterial);
    expect(leftVault.material).not.toBe(sharedShadowMaterial);
    expect(rightVault.material).not.toBe(sharedShadowMaterial);
    expect(rightVault.material).toBe(leftVault.material);

    const vaultMaterial = leftVault.material as PBRMaterial;
    expect(vaultMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(vaultMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-shadow-frame');
    expect(vaultMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(vaultMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(vaultMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(vaultMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(vaultMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(vaultMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('neutralizes the proscenium shadow pockets so the hero portal surround reads as recessed depth instead of bright cyan inserts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftPocket = MeshBuilder.CreateBox('V116_ProsceniumShadowPocketArray_L', { size: 1 }, scene);
    leftPocket.material = sharedShadowMaterial;

    const rightPocket = MeshBuilder.CreateBox('V116_ProsceniumShadowPocketArray_R', { size: 1 }, scene);
    rightPocket.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, leftPocket, rightPocket]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftPocket.material).toBeInstanceOf(PBRMaterial);
    expect(rightPocket.material).toBeInstanceOf(PBRMaterial);
    expect(leftPocket.material).not.toBe(sharedShadowMaterial);
    expect(rightPocket.material).not.toBe(sharedShadowMaterial);
    expect(rightPocket.material).toBe(leftPocket.material);

    const pocketMaterial = leftPocket.material as PBRMaterial;
    expect(pocketMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(pocketMaterial.metadata?.mainStageMaterialOverride).toBe('proscenium-shadow-pocket');
    expect(pocketMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(pocketMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(pocketMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(pocketMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(pocketMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(pocketMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('tones down the V87 wing-facade gold lintel arrays so the terrace soffits keep depth instead of reading as bright foil bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_L', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftLintel = MeshBuilder.CreateBox('V87_WingFacadeGoldLintelArray_L', { size: 1 }, scene);
    leftLintel.material = sharedGoldMaterial;

    const rightLintel = MeshBuilder.CreateBox('V87_WingFacadeGoldLintelArray_R', { size: 1 }, scene);
    rightLintel.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, leftLintel, rightLintel]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(leftLintel.material).toBeInstanceOf(PBRMaterial);
    expect(rightLintel.material).toBeInstanceOf(PBRMaterial);
    expect(leftLintel.material).not.toBe(sharedGoldMaterial);
    expect(rightLintel.material).not.toBe(sharedGoldMaterial);
    expect(rightLintel.material).toBe(leftLintel.material);

    const lintelMaterial = leftLintel.material as PBRMaterial;
    expect(lintelMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(lintelMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-gold-lintel');
    expect(lintelMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(lintelMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(lintelMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(lintelMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(lintelMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(lintelMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(lintelMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
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

  it('realizes instanced crown-shell lamella meshes before applying a mesh-specific override so the live stage does not keep the shared bright pearl source material', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.72, 0.6);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.18;
    sharedPearlMaterial.roughness = 0.36;

    const untouchedSource = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
    untouchedSource.material = sharedPearlMaterial;

    const crownLamellaSource = MeshBuilder.CreateBox('crown-shell-source', { size: 1 }, scene);
    crownLamellaSource.material = sharedPearlMaterial;

    const instancedLamella = crownLamellaSource.createInstance('V113_CrownShellLamellaArray_L');

    polishMainStageMaterials([untouchedSource, instancedLamella]);

    const realizedLamella = scene.getMeshByName('V113_CrownShellLamellaArray_L');
    expect(realizedLamella).toBeDefined();
    expect(realizedLamella).not.toBe(instancedLamella);
    expect(realizedLamella?.getClassName()).toBe('Mesh');
    expect(instancedLamella.isDisposed()).toBe(true);

    expect(untouchedSource.material).toBe(sharedPearlMaterial);
    expect(crownLamellaSource.material).toBe(sharedPearlMaterial);
    expect(realizedLamella?.material).toBeInstanceOf(PBRMaterial);
    expect(realizedLamella?.material).not.toBe(sharedPearlMaterial);

    const crownShellMaterial = realizedLamella?.material as PBRMaterial;
    expect(crownShellMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(crownShellMaterial.metadata?.mainStageMaterialOverride).toBe('crown-shell-lamella');
    expect(crownShellMaterial.albedoColor.r).toBeLessThanOrEqual(0.3);
    expect(crownShellMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(crownShellMaterial.albedoColor.b).toBeLessThanOrEqual(0.14);
    expect(crownShellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(crownShellMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(crownShellMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);
  });

  it('tones down the crown buttress gold inlays so the skyline keeps depth instead of bright foil chevrons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_L', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftInlay = MeshBuilder.CreateBox('V98_CrownButtressGoldInlay_L', { size: 1 }, scene);
    leftInlay.material = sharedGoldMaterial;

    const rightInlay = MeshBuilder.CreateBox('V98_CrownButtressGoldInlay_R', { size: 1 }, scene);
    rightInlay.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, leftInlay, rightInlay]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(leftInlay.material).toBeInstanceOf(PBRMaterial);
    expect(rightInlay.material).toBeInstanceOf(PBRMaterial);
    expect(leftInlay.material).not.toBe(sharedGoldMaterial);
    expect(rightInlay.material).not.toBe(sharedGoldMaterial);
    expect(rightInlay.material).toBe(leftInlay.material);

    const inlayMaterial = leftInlay.material as PBRMaterial;
    expect(inlayMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(inlayMaterial.metadata?.mainStageMaterialOverride).toBe('crown-buttress-gold-inlay');
    expect(inlayMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(inlayMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(inlayMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(inlayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(inlayMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(inlayMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(inlayMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the crown buttress relief shells so the skyline reads as carved massing instead of bright pearl wedges', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V16_ArchitecturalPearlControl', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftRelief = MeshBuilder.CreateBox('V98_CrownButtressRelief_L', { size: 1 }, scene);
    leftRelief.material = sharedPearlMaterial;

    const rightRelief = MeshBuilder.CreateBox('V98_CrownButtressRelief_R', { size: 1 }, scene);
    rightRelief.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftRelief, rightRelief]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftRelief.material).toBeInstanceOf(PBRMaterial);
    expect(rightRelief.material).toBeInstanceOf(PBRMaterial);
    expect(leftRelief.material).not.toBe(sharedPearlMaterial);
    expect(rightRelief.material).not.toBe(sharedPearlMaterial);
    expect(rightRelief.material).toBe(leftRelief.material);

    const reliefMaterial = leftRelief.material as PBRMaterial;
    expect(reliefMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(reliefMaterial.metadata?.mainStageMaterialOverride).toBe('crown-buttress-relief');
    expect(reliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(reliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(reliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(reliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(reliefMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(reliefMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(reliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
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

  it('darkens the wing-canopy pearl lamellae so the side crowns read as layered depth instead of bright ivory fins', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V16_ArchitecturalPearlControl', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftLamella = MeshBuilder.CreateBox('V117_WingCanopyLamellaPearlArray_L_Mid', { size: 1 }, scene);
    leftLamella.material = sharedPearlMaterial;

    const rightLamella = MeshBuilder.CreateBox('V117_WingCanopyLamellaPearlArray_R_Mid', { size: 1 }, scene);
    rightLamella.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftLamella, rightLamella]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftLamella.material).toBeInstanceOf(PBRMaterial);
    expect(rightLamella.material).toBeInstanceOf(PBRMaterial);
    expect(leftLamella.material).not.toBe(sharedPearlMaterial);
    expect(rightLamella.material).not.toBe(sharedPearlMaterial);
    expect(rightLamella.material).toBe(leftLamella.material);

    const lamellaMaterial = leftLamella.material as PBRMaterial;
    expect(lamellaMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(lamellaMaterial.metadata?.mainStageMaterialOverride).toBe('wing-canopy-lamella-pearl');
    expect(lamellaMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(lamellaMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(lamellaMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(lamellaMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(lamellaMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(lamellaMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(lamellaMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
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

  it('darkens the V51 cathedral core and proscenium pylon shells so the stage crown reads as carved depth instead of bright centerline pylons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const cathedralCore = MeshBuilder.CreateBox('V51_RearCathedralCore', { size: 1 }, scene);
    cathedralCore.material = sharedPearlMaterial;

    const leftPylon = MeshBuilder.CreateBox('V51_ProsceniumPylon_L', { size: 1 }, scene);
    leftPylon.material = sharedPearlMaterial;

    const rightPylon = MeshBuilder.CreateBox('V51_ProsceniumPylon_R', { size: 1 }, scene);
    rightPylon.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, cathedralCore, leftPylon, rightPylon]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(cathedralCore.material).toBeInstanceOf(PBRMaterial);
    expect(leftPylon.material).toBeInstanceOf(PBRMaterial);
    expect(rightPylon.material).toBeInstanceOf(PBRMaterial);
    expect(cathedralCore.material).not.toBe(sharedPearlMaterial);
    expect(leftPylon.material).not.toBe(sharedPearlMaterial);
    expect(rightPylon.material).not.toBe(sharedPearlMaterial);
    expect(leftPylon.material).toBe(cathedralCore.material);
    expect(rightPylon.material).toBe(cathedralCore.material);

    const shellMaterial = cathedralCore.material as PBRMaterial;
    expect(shellMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(shellMaterial.metadata?.mainStageMaterialOverride).toBe('rear-cathedral-pearl-core');
    expect(shellMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(shellMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(shellMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(shellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shellMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(shellMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(shellMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the rear-cathedral lancet pearl arrays so the skyline reads as carved recesses instead of bright ivory blades', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V16_ArchitecturalPearlControl', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftLancet = MeshBuilder.CreateBox('V88_RearCathedralLancetPearlArray_L', { size: 1 }, scene);
    leftLancet.material = sharedPearlMaterial;

    const rightLancet = MeshBuilder.CreateBox('V88_RearCathedralLancetPearlArray_R', { size: 1 }, scene);
    rightLancet.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftLancet, rightLancet]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftLancet.material).toBeInstanceOf(PBRMaterial);
    expect(rightLancet.material).toBeInstanceOf(PBRMaterial);
    expect(leftLancet.material).not.toBe(sharedPearlMaterial);
    expect(rightLancet.material).not.toBe(sharedPearlMaterial);
    expect(rightLancet.material).toBe(leftLancet.material);

    const lancetMaterial = leftLancet.material as PBRMaterial;
    expect(lancetMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(lancetMaterial.metadata?.mainStageMaterialOverride).toBe('rear-cathedral-lancet-pearl');
    expect(lancetMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(lancetMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(lancetMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(lancetMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(lancetMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(lancetMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(lancetMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('neutralizes the rear-cathedral lancet frames so the skyline reads as structural depth instead of bright cyan inserts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftFrame = MeshBuilder.CreateBox('V88_RearCathedralLancetFrameArray_L', { size: 1 }, scene);
    leftFrame.material = sharedShadowMaterial;

    const rightFrame = MeshBuilder.CreateBox('V88_RearCathedralLancetFrameArray_R', { size: 1 }, scene);
    rightFrame.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, leftFrame, rightFrame]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBeInstanceOf(PBRMaterial);
    expect(leftFrame.material).not.toBe(sharedShadowMaterial);
    expect(rightFrame.material).not.toBe(sharedShadowMaterial);
    expect(rightFrame.material).toBe(leftFrame.material);

    const frameMaterial = leftFrame.material as PBRMaterial;
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('rear-cathedral-lancet-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('tones down the rear-cathedral lancet gold arrays so the skyline keeps shadow depth instead of bright foil tracery', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_L', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V88_RearCathedralLancetGoldArray_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V88_RearCathedralLancetGoldArray_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, leftGold, rightGold]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect(leftGold.material).not.toBe(sharedGoldMaterial);
    expect(rightGold.material).not.toBe(sharedGoldMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('rear-cathedral-lancet-gold');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
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

  it('darkens the spawn canopy pearl vaults so the far reveal reads as authored arrival architecture instead of white proxy shells', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftVault = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_L', { size: 1 }, scene);
    leftVault.material = sharedPearlMaterial;

    const rightVault = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_R', { size: 1 }, scene);
    rightVault.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftVault, rightVault]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftVault.material).toBeInstanceOf(PBRMaterial);
    expect(rightVault.material).toBeInstanceOf(PBRMaterial);
    expect(leftVault.material).not.toBe(sharedPearlMaterial);
    expect(rightVault.material).not.toBe(sharedPearlMaterial);
    expect(rightVault.material).toBe(leftVault.material);

    const vaultMaterial = leftVault.material as PBRMaterial;
    expect(vaultMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(vaultMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-canopy-pearl-vault');
    expect(vaultMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(vaultMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(vaultMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(vaultMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(vaultMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(vaultMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(vaultMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the basin causeway pearl span so the spawn reveal keeps runway depth instead of a white threshold bar', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const causewaySpan = MeshBuilder.CreateBox('V62_BasinCausewayPearlSpan', { size: 1 }, scene);
    causewaySpan.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, causewaySpan]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(causewaySpan.material).toBeInstanceOf(PBRMaterial);
    expect(causewaySpan.material).not.toBe(sharedIvoryMaterial);

    const causewayMaterial = causewaySpan.material as PBRMaterial;
    expect(causewayMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(causewayMaterial.metadata?.mainStageMaterialOverride).toBe('basin-causeway-pearl-span');
    expect(causewayMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(causewayMaterial.albedoColor.g).toBeLessThanOrEqual(0.25);
    expect(causewayMaterial.albedoColor.b).toBeLessThanOrEqual(0.29);
    expect(causewayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(causewayMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(causewayMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(causewayMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the basin garden terraces so the spawn reveal flanks read as grounded architecture instead of bright ivory shelves', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const leftTerrace = MeshBuilder.CreateBox('V63_BasinGardenTerrace_L', { size: 1 }, scene);
    leftTerrace.material = sharedIvoryMaterial;

    const rightTerrace = MeshBuilder.CreateBox('V63_BasinGardenTerrace_R', { size: 1 }, scene);
    rightTerrace.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, leftTerrace, rightTerrace]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(leftTerrace.material).toBeInstanceOf(PBRMaterial);
    expect(rightTerrace.material).toBeInstanceOf(PBRMaterial);
    expect(leftTerrace.material).not.toBe(sharedIvoryMaterial);
    expect(rightTerrace.material).not.toBe(sharedIvoryMaterial);
    expect(rightTerrace.material).toBe(leftTerrace.material);

    const terraceMaterial = leftTerrace.material as PBRMaterial;
    expect(terraceMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(terraceMaterial.metadata?.mainStageMaterialOverride).toBe('basin-garden-terrace');
    expect(terraceMaterial.albedoColor.r).toBeLessThanOrEqual(0.23);
    expect(terraceMaterial.albedoColor.g).toBeLessThanOrEqual(0.25);
    expect(terraceMaterial.albedoColor.b).toBeLessThanOrEqual(0.29);
    expect(terraceMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(terraceMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(terraceMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(terraceMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the spawn-gate sentinel pearl shells so the promenade approach does not collapse into two bright proxy monoliths', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const leftSentinel = MeshBuilder.CreateBox('V60_SpawnGateSentinelPearl_L', { size: 1 }, scene);
    leftSentinel.material = sharedIvoryMaterial;

    const rightSentinel = MeshBuilder.CreateBox('V60_SpawnGateSentinelPearl_R', { size: 1 }, scene);
    rightSentinel.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, leftSentinel, rightSentinel]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(leftSentinel.material).toBeInstanceOf(PBRMaterial);
    expect(rightSentinel.material).toBeInstanceOf(PBRMaterial);
    expect(leftSentinel.material).not.toBe(sharedIvoryMaterial);
    expect(rightSentinel.material).not.toBe(sharedIvoryMaterial);
    expect(rightSentinel.material).toBe(leftSentinel.material);

    const sentinelMaterial = leftSentinel.material as PBRMaterial;
    expect(sentinelMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(sentinelMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gate-sentinel-pearl');
    expect(sentinelMaterial.albedoColor.r).toBeLessThanOrEqual(0.23);
    expect(sentinelMaterial.albedoColor.g).toBeLessThanOrEqual(0.25);
    expect(sentinelMaterial.albedoColor.b).toBeLessThanOrEqual(0.29);
    expect(sentinelMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(sentinelMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(sentinelMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(sentinelMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the spawn-pylon pearl shells so the forward route views stop reading them as bright ivory proxy totems', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const leftPylonShell = MeshBuilder.CreateBox('V55_SpawnPylonPearlShell_L', { size: 1 }, scene);
    leftPylonShell.material = sharedIvoryMaterial;

    const rightPylonShell = MeshBuilder.CreateBox('V55_SpawnPylonPearlShell_R', { size: 1 }, scene);
    rightPylonShell.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, leftPylonShell, rightPylonShell]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(leftPylonShell.material).toBeInstanceOf(PBRMaterial);
    expect(rightPylonShell.material).toBeInstanceOf(PBRMaterial);
    expect(leftPylonShell.material).not.toBe(sharedIvoryMaterial);
    expect(rightPylonShell.material).not.toBe(sharedIvoryMaterial);
    expect(rightPylonShell.material).toBe(leftPylonShell.material);

    const pylonMaterial = leftPylonShell.material as PBRMaterial;
    expect(pylonMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pylonMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-pylon-pearl-shell');
    expect(pylonMaterial.albedoColor.r).toBeLessThanOrEqual(0.25);
    expect(pylonMaterial.albedoColor.g).toBeLessThanOrEqual(0.27);
    expect(pylonMaterial.albedoColor.b).toBeLessThanOrEqual(0.31);
    expect(pylonMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pylonMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(pylonMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(pylonMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the arrival runway pearl bands so the forward route foreground stops reading as repeated bright proxy slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const runwayBands = MeshBuilder.CreateBox('V65_ArrivalRunwayPearlBands', { size: 1 }, scene);
    runwayBands.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, runwayBands]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(runwayBands.material).toBeInstanceOf(PBRMaterial);
    expect(runwayBands.material).not.toBe(sharedIvoryMaterial);

    const runwayMaterial = runwayBands.material as PBRMaterial;
    expect(runwayMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(runwayMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-runway-pearl-bands');
    expect(runwayMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(runwayMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(runwayMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(runwayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(runwayMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(runwayMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(runwayMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the arrival side-plinth pearl dais so the forward reveal flanks stop reading as bright ivory podium slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const leftPlinthDais = MeshBuilder.CreateBox('V58_ArrivalPlinthPearlDais_L', { size: 1 }, scene);
    leftPlinthDais.material = sharedIvoryMaterial;

    const rightPlinthDais = MeshBuilder.CreateBox('V58_ArrivalPlinthPearlDais_R', { size: 1 }, scene);
    rightPlinthDais.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, leftPlinthDais, rightPlinthDais]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(leftPlinthDais.material).toBeInstanceOf(PBRMaterial);
    expect(rightPlinthDais.material).toBeInstanceOf(PBRMaterial);
    expect(leftPlinthDais.material).not.toBe(sharedIvoryMaterial);
    expect(rightPlinthDais.material).not.toBe(sharedIvoryMaterial);
    expect(rightPlinthDais.material).toBe(leftPlinthDais.material);

    const plinthMaterial = leftPlinthDais.material as PBRMaterial;
    expect(plinthMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(plinthMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-plinth-pearl-dais');
    expect(plinthMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(plinthMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(plinthMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(plinthMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(plinthMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(plinthMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(plinthMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the promenade pearl ribbon so the central route reads as authored night inlay instead of a repeated bright ivory strip', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const promenadeRibbon = MeshBuilder.CreateBox('V64_PromenadePearlRibbon', { size: 1 }, scene);
    promenadeRibbon.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, promenadeRibbon]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(promenadeRibbon.material).toBeInstanceOf(PBRMaterial);
    expect(promenadeRibbon.material).not.toBe(sharedIvoryMaterial);

    const ribbonMaterial = promenadeRibbon.material as PBRMaterial;
    expect(ribbonMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(ribbonMaterial.metadata?.mainStageMaterialOverride).toBe('promenade-pearl-ribbon');
    expect(ribbonMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(ribbonMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(ribbonMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(ribbonMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(ribbonMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(ribbonMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(ribbonMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the plaza paver pearl bands so the route approach stops reading as stacked bright ivory bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherIvory.material = sharedIvoryMaterial;

    const plazaBands = MeshBuilder.CreateBox('V69_PlazaPaverPearlBands', { size: 1 }, scene);
    plazaBands.material = sharedIvoryMaterial;

    polishMainStageMaterials([otherIvory, plazaBands]);

    expect(otherIvory.material).toBe(sharedIvoryMaterial);
    expect(plazaBands.material).toBeInstanceOf(PBRMaterial);
    expect(plazaBands.material).not.toBe(sharedIvoryMaterial);

    const plazaMaterial = plazaBands.material as PBRMaterial;
    expect(plazaMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(plazaMaterial.metadata?.mainStageMaterialOverride).toBe('plaza-paver-pearl-bands');
    expect(plazaMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(plazaMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(plazaMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(plazaMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(plazaMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(plazaMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(plazaMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the hero portal pearl arcade family so the first central stage reveal reads as layered architecture instead of bright ivory slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V57_BackPlazaSentinelPearl_L', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const portalArcade = MeshBuilder.CreateBox('V68_PortalArcadePearl_L', { size: 1 }, scene);
    portalArcade.material = sharedIvoryMaterial;

    const colonnade = MeshBuilder.CreateBox('V68_GrandArcadePearlColonnade_L', { size: 1 }, scene);
    colonnade.material = sharedIvoryMaterial;

    const heroApron = MeshBuilder.CreateBox('V68_HeroPortalPearlApron', { size: 1 }, scene);
    heroApron.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, portalArcade, colonnade, heroApron]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(portalArcade.material).toBeInstanceOf(PBRMaterial);
    expect(colonnade.material).toBeInstanceOf(PBRMaterial);
    expect(heroApron.material).toBeInstanceOf(PBRMaterial);
    expect(portalArcade.material).not.toBe(sharedIvoryMaterial);
    expect(colonnade.material).not.toBe(sharedIvoryMaterial);
    expect(heroApron.material).not.toBe(sharedIvoryMaterial);
    expect(colonnade.material).toBe(portalArcade.material);
    expect(heroApron.material).toBe(portalArcade.material);

    const portalMaterial = portalArcade.material as PBRMaterial;
    expect(portalMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(portalMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-pearl-arcade');
    expect(portalMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(portalMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(portalMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(portalMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(portalMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(portalMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(portalMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the rear mass aurora pearl fins so the stage backdrop keeps silhouette depth instead of reading as two bright ivory blades', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V57_BackPlazaSentinelPearl_L', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftAurora = MeshBuilder.CreateBox('V61_RearMassAuroraPearl_L', { size: 1 }, scene);
    leftAurora.material = sharedIvoryMaterial;

    const rightAurora = MeshBuilder.CreateBox('V61_RearMassAuroraPearl_R', { size: 1 }, scene);
    rightAurora.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftAurora, rightAurora]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftAurora.material).toBeInstanceOf(PBRMaterial);
    expect(rightAurora.material).toBeInstanceOf(PBRMaterial);
    expect(leftAurora.material).not.toBe(sharedIvoryMaterial);
    expect(rightAurora.material).not.toBe(sharedIvoryMaterial);
    expect(rightAurora.material).toBe(leftAurora.material);

    const auroraMaterial = leftAurora.material as PBRMaterial;
    expect(auroraMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(auroraMaterial.metadata?.mainStageMaterialOverride).toBe('rear-mass-aurora-pearl');
    expect(auroraMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(auroraMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(auroraMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(auroraMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(auroraMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(auroraMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(auroraMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the back plaza sentinel pearl shells so the approach framing reads as authored entry monuments instead of bright ivory pylons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V67_VipGardenPearlBasin_L', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftSentinel = MeshBuilder.CreateBox('V57_BackPlazaSentinelPearl_L', { size: 1 }, scene);
    leftSentinel.material = sharedIvoryMaterial;

    const rightSentinel = MeshBuilder.CreateBox('V57_BackPlazaSentinelPearl_R', { size: 1 }, scene);
    rightSentinel.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftSentinel, rightSentinel]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftSentinel.material).toBeInstanceOf(PBRMaterial);
    expect(rightSentinel.material).toBeInstanceOf(PBRMaterial);
    expect(leftSentinel.material).not.toBe(sharedIvoryMaterial);
    expect(rightSentinel.material).not.toBe(sharedIvoryMaterial);
    expect(rightSentinel.material).toBe(leftSentinel.material);

    const sentinelMaterial = leftSentinel.material as PBRMaterial;
    expect(sentinelMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(sentinelMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-sentinel-pearl');
    expect(sentinelMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(sentinelMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(sentinelMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(sentinelMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(sentinelMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(sentinelMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(sentinelMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the back plaza sightline pearl posts so the spawn-side framing reads as layered balustrade architecture instead of bright ivory pickets', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V67_VipGardenPearlBasin_L', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftPosts = MeshBuilder.CreateBox('V66_BackPlazaSightlinePearlPostCluster_L', { size: 1 }, scene);
    leftPosts.material = sharedIvoryMaterial;

    const rightPosts = MeshBuilder.CreateBox('V66_BackPlazaSightlinePearlPostCluster_R', { size: 1 }, scene);
    rightPosts.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftPosts, rightPosts]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftPosts.material).toBeInstanceOf(PBRMaterial);
    expect(rightPosts.material).toBeInstanceOf(PBRMaterial);
    expect(leftPosts.material).not.toBe(sharedIvoryMaterial);
    expect(rightPosts.material).not.toBe(sharedIvoryMaterial);
    expect(rightPosts.material).toBe(leftPosts.material);

    const postMaterial = leftPosts.material as PBRMaterial;
    expect(postMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(postMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-sightline-pearl-posts');
    expect(postMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(postMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(postMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(postMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(postMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(postMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(postMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the VIP garden pearl basins so the side gardens read as grounded carved basins instead of bright ivory tubs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V43_WayfindingPylonPearlShell', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftBasin = MeshBuilder.CreateBox('V67_VipGardenPearlBasin_L', { size: 1 }, scene);
    leftBasin.material = sharedIvoryMaterial;

    const rightBasin = MeshBuilder.CreateBox('V67_VipGardenPearlBasin_R', { size: 1 }, scene);
    rightBasin.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftBasin, rightBasin]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftBasin.material).toBeInstanceOf(PBRMaterial);
    expect(rightBasin.material).toBeInstanceOf(PBRMaterial);
    expect(leftBasin.material).not.toBe(sharedIvoryMaterial);
    expect(rightBasin.material).not.toBe(sharedIvoryMaterial);
    expect(rightBasin.material).toBe(leftBasin.material);

    const basinMaterial = leftBasin.material as PBRMaterial;
    expect(basinMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(basinMaterial.metadata?.mainStageMaterialOverride).toBe('vip-garden-pearl-basin');
    expect(basinMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(basinMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(basinMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(basinMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(basinMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(basinMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(basinMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the wayfinding pylon pearl shells so the spawn reveal reads as authored entry markers instead of bright ivory totems', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V34_BackPlazaGatewayPearl_L', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const pylonShell = MeshBuilder.CreateBox('V43_WayfindingPylonPearlShell', { size: 1 }, scene);
    pylonShell.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, pylonShell]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(pylonShell.material).toBeInstanceOf(PBRMaterial);
    expect(pylonShell.material).not.toBe(sharedIvoryMaterial);

    const pylonMaterial = pylonShell.material as PBRMaterial;
    expect(pylonMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pylonMaterial.metadata?.mainStageMaterialOverride).toBe('wayfinding-pylon-pearl-shell');
    expect(pylonMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(pylonMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(pylonMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(pylonMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pylonMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(pylonMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(pylonMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the pyro pod pearl shells so the stage-edge practicals read as finished housings instead of bright pearl bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V80_OvalScreenPedestalShell_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const pyroPod = MeshBuilder.CreateBox('V45_PyroPodPearlShell', { size: 1 }, scene);
    pyroPod.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, pyroPod]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(pyroPod.material).toBeInstanceOf(PBRMaterial);
    expect(pyroPod.material).not.toBe(sharedPearlMaterial);

    const pyroMaterial = pyroPod.material as PBRMaterial;
    expect(pyroMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pyroMaterial.metadata?.mainStageMaterialOverride).toBe('pyro-pod-pearl-shell');
    expect(pyroMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(pyroMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(pyroMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(pyroMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pyroMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(pyroMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(pyroMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the back plaza gateway pearl shells so the arrival frame reads as authored architecture instead of bright ivory slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V43_WayfindingPylonPearlShell', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftGateway = MeshBuilder.CreateBox('V34_BackPlazaGatewayPearl_L', { size: 1 }, scene);
    leftGateway.material = sharedIvoryMaterial;

    const rightGateway = MeshBuilder.CreateBox('V34_BackPlazaGatewayPearl_R', { size: 1 }, scene);
    rightGateway.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftGateway, rightGateway]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftGateway.material).toBeInstanceOf(PBRMaterial);
    expect(rightGateway.material).toBeInstanceOf(PBRMaterial);
    expect(leftGateway.material).not.toBe(sharedIvoryMaterial);
    expect(rightGateway.material).not.toBe(sharedIvoryMaterial);
    expect(rightGateway.material).toBe(leftGateway.material);

    const gatewayMaterial = leftGateway.material as PBRMaterial;
    expect(gatewayMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(gatewayMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-gateway-pearl');
    expect(gatewayMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(gatewayMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(gatewayMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(gatewayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(gatewayMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(gatewayMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(gatewayMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the oval portal glow shells so the arrival-side portals read as carved architecture instead of bright pearl side slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V80_OvalScreenPedestalShell_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftShell = MeshBuilder.CreateBox('V82_OvalPortalGlowShell_L', { size: 1 }, scene);
    leftShell.material = sharedPearlMaterial;

    const rightShell = MeshBuilder.CreateBox('V82_OvalPortalGlowShell_R', { size: 1 }, scene);
    rightShell.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftShell, rightShell]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftShell.material).toBeInstanceOf(PBRMaterial);
    expect(rightShell.material).toBeInstanceOf(PBRMaterial);
    expect(leftShell.material).not.toBe(sharedPearlMaterial);
    expect(rightShell.material).not.toBe(sharedPearlMaterial);
    expect(rightShell.material).toBe(leftShell.material);

    const shellMaterial = leftShell.material as PBRMaterial;
    expect(shellMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(shellMaterial.metadata?.mainStageMaterialOverride).toBe('oval-portal-glow-shell');
    expect(shellMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(shellMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(shellMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(shellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shellMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shellMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(shellMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('darkens the proscenium pearl reveals so the portal surround reads as framed depth instead of bright ivory cheek panels', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V16_ArchitecturalPearlControl', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftReveal = MeshBuilder.CreateBox('V116_ProsceniumPearlRevealArray_L', { size: 1 }, scene);
    leftReveal.material = sharedPearlMaterial;

    const rightReveal = MeshBuilder.CreateBox('V116_ProsceniumPearlRevealArray_R', { size: 1 }, scene);
    rightReveal.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftReveal, rightReveal]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rightReveal.material).toBeInstanceOf(PBRMaterial);
    expect(leftReveal.material).not.toBe(sharedPearlMaterial);
    expect(rightReveal.material).not.toBe(sharedPearlMaterial);
    expect(rightReveal.material).toBe(leftReveal.material);

    const revealMaterial = leftReveal.material as PBRMaterial;
    expect(revealMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(revealMaterial.metadata?.mainStageMaterialOverride).toBe('proscenium-pearl-reveal');
    expect(revealMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(revealMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(revealMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(revealMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(revealMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(revealMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(revealMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the inner portal pearl shell masses so the hero portal reads as carved depth instead of bright ivory pylons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftPylon = MeshBuilder.CreateBox('V50_InnerPortalPylon_L', { size: 1 }, scene);
    leftPylon.material = sharedPearlMaterial;

    const rightPylon = MeshBuilder.CreateBox('V50_InnerPortalPylon_R', { size: 1 }, scene);
    rightPylon.material = sharedPearlMaterial;

    const leftCascade = MeshBuilder.CreateBox('V50_InnerShellCascade_L', { size: 1 }, scene);
    leftCascade.material = sharedPearlMaterial;

    const rightCascade = MeshBuilder.CreateBox('V50_InnerShellCascade_R', { size: 1 }, scene);
    rightCascade.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftPylon, rightPylon, leftCascade, rightCascade]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftPylon.material).toBeInstanceOf(PBRMaterial);
    expect(rightPylon.material).toBeInstanceOf(PBRMaterial);
    expect(leftCascade.material).toBeInstanceOf(PBRMaterial);
    expect(rightCascade.material).toBeInstanceOf(PBRMaterial);
    expect(leftPylon.material).not.toBe(sharedPearlMaterial);
    expect(rightPylon.material).not.toBe(sharedPearlMaterial);
    expect(leftCascade.material).not.toBe(sharedPearlMaterial);
    expect(rightCascade.material).not.toBe(sharedPearlMaterial);
    expect(rightPylon.material).toBe(leftPylon.material);
    expect(leftCascade.material).toBe(leftPylon.material);
    expect(rightCascade.material).toBe(leftPylon.material);

    const shellMaterial = leftPylon.material as PBRMaterial;
    expect(shellMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(shellMaterial.metadata?.mainStageMaterialOverride).toBe('inner-portal-pearl-shell');
    expect(shellMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(shellMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(shellMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(shellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shellMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(shellMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(shellMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the crown obelisk pearl shell masses so the skyline reads as a layered silhouette instead of pale spear proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const obeliskCore = MeshBuilder.CreateBox('V52_CrownObeliskPearlCore', { size: 1 }, scene);
    obeliskCore.material = sharedPearlMaterial;

    const leftBlade = MeshBuilder.CreateBox('V52_CrownSpirePearlBlade_L', { size: 1 }, scene);
    leftBlade.material = sharedPearlMaterial;

    const rightBlade = MeshBuilder.CreateBox('V52_CrownSpirePearlBlade_R', { size: 1 }, scene);
    rightBlade.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, obeliskCore, leftBlade, rightBlade]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(obeliskCore.material).toBeInstanceOf(PBRMaterial);
    expect(leftBlade.material).toBeInstanceOf(PBRMaterial);
    expect(rightBlade.material).toBeInstanceOf(PBRMaterial);
    expect(obeliskCore.material).not.toBe(sharedPearlMaterial);
    expect(leftBlade.material).not.toBe(sharedPearlMaterial);
    expect(rightBlade.material).not.toBe(sharedPearlMaterial);
    expect(leftBlade.material).toBe(obeliskCore.material);
    expect(rightBlade.material).toBe(obeliskCore.material);

    const shellMaterial = obeliskCore.material as PBRMaterial;
    expect(shellMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(shellMaterial.metadata?.mainStageMaterialOverride).toBe('crown-obelisk-pearl-shell');
    expect(shellMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(shellMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(shellMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(shellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shellMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(shellMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(shellMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the crown jewel pearl sockets so the apex framing reads as carved shell work instead of pale gem pedestals', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftSocket = MeshBuilder.CreateBox('V71_CrownBladePearlSocket_L', { size: 1 }, scene);
    leftSocket.material = sharedPearlMaterial;

    const rightSocket = MeshBuilder.CreateBox('V71_CrownBladePearlSocket_R', { size: 1 }, scene);
    rightSocket.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftSocket, rightSocket]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftSocket.material).toBeInstanceOf(PBRMaterial);
    expect(rightSocket.material).toBeInstanceOf(PBRMaterial);
    expect(leftSocket.material).not.toBe(sharedPearlMaterial);
    expect(rightSocket.material).not.toBe(sharedPearlMaterial);
    expect(rightSocket.material).toBe(leftSocket.material);

    const socketMaterial = leftSocket.material as PBRMaterial;
    expect(socketMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(socketMaterial.metadata?.mainStageMaterialOverride).toBe('crown-jewel-pearl-socket');
    expect(socketMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(socketMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(socketMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(socketMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(socketMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(socketMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(socketMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the spawn gallery pier pearl shells so the arrival buttresses read as carved support architecture instead of bright side slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V56_SpawnCanopyPearlVault_L', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftPier = MeshBuilder.CreateBox('V54_SpawnGalleryPierPearl_L', { size: 1 }, scene);
    leftPier.material = sharedPearlMaterial;

    const rightPier = MeshBuilder.CreateBox('V54_SpawnGalleryPierPearl_R', { size: 1 }, scene);
    rightPier.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftPier, rightPier]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftPier.material).toBeInstanceOf(PBRMaterial);
    expect(rightPier.material).toBeInstanceOf(PBRMaterial);
    expect(leftPier.material).not.toBe(sharedPearlMaterial);
    expect(rightPier.material).not.toBe(sharedPearlMaterial);
    expect(rightPier.material).toBe(leftPier.material);

    const pierMaterial = leftPier.material as PBRMaterial;
    expect(pierMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pierMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gallery-pier-pearl');
    expect(pierMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(pierMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(pierMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(pierMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pierMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(pierMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(pierMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the spawn gallery arcade pearl shells so the VIP long view reads as layered arrival architecture instead of a white side slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftArcade = MeshBuilder.CreateBox('V53_SpawnGalleryArcadePearl_L', { size: 1 }, scene);
    leftArcade.material = sharedPearlMaterial;

    const rightArcade = MeshBuilder.CreateBox('V53_SpawnGalleryArcadePearl_R', { size: 1 }, scene);
    rightArcade.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftArcade, rightArcade]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftArcade.material).toBeInstanceOf(PBRMaterial);
    expect(rightArcade.material).toBeInstanceOf(PBRMaterial);
    expect(leftArcade.material).not.toBe(sharedPearlMaterial);
    expect(rightArcade.material).not.toBe(sharedPearlMaterial);
    expect(rightArcade.material).toBe(leftArcade.material);

    const arcadeMaterial = leftArcade.material as PBRMaterial;
    expect(arcadeMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(arcadeMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gallery-arcade-pearl');
    expect(arcadeMaterial.albedoColor.r).toBeLessThanOrEqual(0.23);
    expect(arcadeMaterial.albedoColor.g).toBeLessThanOrEqual(0.25);
    expect(arcadeMaterial.albedoColor.b).toBeLessThanOrEqual(0.29);
    expect(arcadeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(arcadeMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(arcadeMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(arcadeMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('smokes the wing glass balustrades so the promenade side shells stop reading as flat cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanGlass.albedoColor.set(0.44, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.28, 0.36);
    sharedCyanGlass.emissiveIntensity = 0.28;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.roughness = 0.22;

    const otherGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    otherGlass.material = sharedCyanGlass;

    const leftBalustrade = MeshBuilder.CreateBox('V30_WingGlassBalustrade_L', { size: 1 }, scene);
    leftBalustrade.material = sharedCyanGlass;

    const rightBalustrade = MeshBuilder.CreateBox('V30_WingGlassBalustrade_R', { size: 1 }, scene);
    rightBalustrade.material = sharedCyanGlass;

    polishMainStageMaterials([otherGlass, leftBalustrade, rightBalustrade]);

    expect(otherGlass.material).toBe(sharedCyanGlass);
    expect(leftBalustrade.material).toBeInstanceOf(PBRMaterial);
    expect(rightBalustrade.material).toBeInstanceOf(PBRMaterial);
    expect(leftBalustrade.material).not.toBe(sharedCyanGlass);
    expect(rightBalustrade.material).not.toBe(sharedCyanGlass);
    expect(rightBalustrade.material).toBe(leftBalustrade.material);

    const balustradeMaterial = leftBalustrade.material as PBRMaterial;
    expect(balustradeMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(balustradeMaterial.metadata?.mainStageMaterialOverride).toBe('wing-glass-balustrade');
    expect(balustradeMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(balustradeMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(balustradeMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(balustradeMaterial.alpha).toBeLessThanOrEqual(0.24);
    expect(balustradeMaterial.roughness).toBeGreaterThanOrEqual(0.68);
    expect(balustradeMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);
  });
});
