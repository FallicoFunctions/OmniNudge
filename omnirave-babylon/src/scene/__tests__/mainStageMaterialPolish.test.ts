import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { polishMainStageMaterials } from '../mainStageMaterialPolish';

describe('polishMainStageMaterials', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  beforeAll(() => {
    engine = new NullEngine();
  });

  beforeEach(() => {
    scene = new Scene(engine!);
  });

  afterEach(() => {
    scene?.dispose();
    scene = undefined;
  });

  afterAll(() => {
    engine?.dispose();
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

    const frame = MeshBuilder.CreateBox('TestSupportTentPearlControl', { size: 1 }, scene);
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

  it('retones the support-tent frames and crests into subdued practical hardware so the route-edge tents read as working support structures instead of bright truss cubes with gold badges', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V13_BlackStageRigging', scene);
    sharedBlackMaterial.albedoColor.set(0.1, 0.11, 0.13);
    sharedBlackMaterial.emissiveColor.set(0.02, 0.025, 0.03);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.18;
    sharedBlackMaterial.roughness = 0.42;

    const sharedGoldMaterial = new PBRMaterial('V13_BrushedFestivalGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.66, 0.36);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.28;

    const untouchedBlack = MeshBuilder.CreateBox('TestSupportTentBlackControl', { size: 1 }, scene);
    untouchedBlack.material = sharedBlackMaterial;

    const leftFrame = MeshBuilder.CreateBox('V91_SupportTentFrame_L', { size: 1 }, scene);
    leftFrame.material = sharedBlackMaterial;

    const rightFrame = MeshBuilder.CreateBox('V91_SupportTentFrame_R', { size: 1 }, scene);
    rightFrame.material = sharedBlackMaterial;

    const untouchedGold = MeshBuilder.CreateBox('TestSupportTentGoldControl', { size: 1 }, scene);
    untouchedGold.material = sharedGoldMaterial;

    const leftCrest = MeshBuilder.CreateBox('V91_SupportTentCrest_L', { size: 1 }, scene);
    leftCrest.material = sharedGoldMaterial;

    const rightCrest = MeshBuilder.CreateBox('V91_SupportTentCrest_R', { size: 1 }, scene);
    rightCrest.material = sharedGoldMaterial;

    polishMainStageMaterials([untouchedBlack, leftFrame, rightFrame, untouchedGold, leftCrest, rightCrest]);

    expect(untouchedBlack.material).toBe(sharedBlackMaterial);
    expect(leftFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBeInstanceOf(PBRMaterial);
    expect((leftFrame.material as PBRMaterial).name).toContain('support-tent-frame');
    expect(rightFrame.material).toBe(leftFrame.material);

    expect(untouchedGold.material).toBe(sharedGoldMaterial);
    expect(leftCrest.material).toBeInstanceOf(PBRMaterial);
    expect(rightCrest.material).toBeInstanceOf(PBRMaterial);
    expect((leftCrest.material as PBRMaterial).name).toContain('support-tent-crest');
    expect(rightCrest.material).toBe(leftCrest.material);

    const frameMaterial = leftFrame.material as PBRMaterial;
    const crestMaterial = leftCrest.material as PBRMaterial;

    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('support-tent-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.09);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.11);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);

    expect(crestMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(crestMaterial.metadata?.mainStageMaterialOverride).toBe('support-tent-crest');
    expect(crestMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(crestMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(crestMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(crestMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(crestMaterial.metallic).toBeLessThanOrEqual(0.18);
    expect(crestMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(crestMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('retones the service-case banks and toppers into practical road-case hardware so the route-edge utility props stop reading like shared truss cubes with bright gold caps', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V13_BlackStageRigging', scene);
    sharedBlackMaterial.albedoColor.set(0.1, 0.11, 0.13);
    sharedBlackMaterial.emissiveColor.set(0.02, 0.025, 0.03);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.18;
    sharedBlackMaterial.roughness = 0.42;

    const sharedGoldMaterial = new PBRMaterial('V13_BrushedFestivalGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.66, 0.36);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.28;

    const untouchedRigging = MeshBuilder.CreateBox('TestServiceCaseBlackControl', { size: 1 }, scene);
    untouchedRigging.material = sharedBlackMaterial;

    const leftBank = MeshBuilder.CreateBox('V92_ServiceCaseBank_L', { size: 1 }, scene);
    leftBank.material = sharedBlackMaterial;

    const rightBank = MeshBuilder.CreateBox('V92_ServiceCaseBank_R', { size: 1 }, scene);
    rightBank.material = sharedBlackMaterial;

    const untouchedGold = MeshBuilder.CreateBox('TestServiceCaseGoldControl', { size: 1 }, scene);
    untouchedGold.material = sharedGoldMaterial;

    const leftTopper = MeshBuilder.CreateBox('V92_ServiceCaseTopper_L', { size: 1 }, scene);
    leftTopper.material = sharedGoldMaterial;

    const rightTopper = MeshBuilder.CreateBox('V92_ServiceCaseTopper_R', { size: 1 }, scene);
    rightTopper.material = sharedGoldMaterial;

    polishMainStageMaterials([untouchedRigging, leftBank, rightBank, untouchedGold, leftTopper, rightTopper]);

    expect(untouchedRigging.material).toBe(sharedBlackMaterial);
    expect(leftBank.material).toBeInstanceOf(PBRMaterial);
    expect(rightBank.material).toBeInstanceOf(PBRMaterial);
    expect((leftBank.material as PBRMaterial).name).toContain('service-case-bank');
    expect(rightBank.material).toBe(leftBank.material);

    expect(untouchedGold.material).toBe(sharedGoldMaterial);
    expect(leftTopper.material).toBeInstanceOf(PBRMaterial);
    expect(rightTopper.material).toBeInstanceOf(PBRMaterial);
    expect((leftTopper.material as PBRMaterial).name).toContain('service-case-topper');
    expect(rightTopper.material).toBe(leftTopper.material);

    const bankMaterial = leftBank.material as PBRMaterial;
    const topperMaterial = leftTopper.material as PBRMaterial;

    expect(bankMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(bankMaterial.metadata?.mainStageMaterialOverride).toBe('service-case-bank');
    expect(bankMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(bankMaterial.albedoColor.g).toBeLessThanOrEqual(0.09);
    expect(bankMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(bankMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(bankMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(bankMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(bankMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);

    expect(topperMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(topperMaterial.metadata?.mainStageMaterialOverride).toBe('service-case-topper');
    expect(topperMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(topperMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(topperMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(topperMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(topperMaterial.metallic).toBeLessThanOrEqual(0.18);
    expect(topperMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(topperMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);
  });

  it('retones the wing service-case arrays into subdued road-case shells so the side lanes read as practical support gear instead of one long generic rigging band', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V9_BlackRigging', scene);
    sharedBlackMaterial.albedoColor.set(0.1, 0.11, 0.13);
    sharedBlackMaterial.emissiveColor.set(0.02, 0.025, 0.03);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.18;
    sharedBlackMaterial.roughness = 0.42;

    const untouchedRigging = MeshBuilder.CreateBox('TestWingServiceCaseBlackControl', { size: 1 }, scene);
    untouchedRigging.material = sharedBlackMaterial;

    const leftArray = MeshBuilder.CreateBox('V93_ServiceCaseArray_L', { size: 1 }, scene);
    leftArray.material = sharedBlackMaterial;

    const rightArray = MeshBuilder.CreateBox('V93_ServiceCaseArray_R', { size: 1 }, scene);
    rightArray.material = sharedBlackMaterial;

    polishMainStageMaterials([untouchedRigging, leftArray, rightArray]);

    expect(untouchedRigging.material).toBe(sharedBlackMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect((leftArray.material as PBRMaterial).name).toContain('wing-service-case-array');
    expect(rightArray.material).toBe(leftArray.material);

    const arrayMaterial = leftArray.material as PBRMaterial;
    expect(arrayMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(arrayMaterial.metadata?.mainStageMaterialOverride).toBe('wing-service-case-array');
    expect(arrayMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(arrayMaterial.albedoColor.g).toBeLessThanOrEqual(0.09);
    expect(arrayMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(arrayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(arrayMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(arrayMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(arrayMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);
  });

  it('retones the stage-edge pyro pylons and nozzles into practical hardware so the side fire arrays stop reading like pearl totems capped with bright gold badges', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const sharedGoldMaterial = new PBRMaterial('V9_CrownFiligreeGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.66, 0.36);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.28;

    const pearlControl = MeshBuilder.CreateBox('TestPyroPylonPearlControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;

    const leftPylon = MeshBuilder.CreateBox('V95_PyroPylonArray_L', { size: 1 }, scene);
    leftPylon.material = sharedPearlMaterial;

    const rightPylon = MeshBuilder.CreateBox('V95_PyroPylonArray_R', { size: 1 }, scene);
    rightPylon.material = sharedPearlMaterial;

    const goldControl = MeshBuilder.CreateBox('TestPyroNozzleGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftNozzle = MeshBuilder.CreateBox('V95_PyroNozzleArray_L', { size: 1 }, scene);
    leftNozzle.material = sharedGoldMaterial;

    const rightNozzle = MeshBuilder.CreateBox('V95_PyroNozzleArray_R', { size: 1 }, scene);
    rightNozzle.material = sharedGoldMaterial;

    polishMainStageMaterials([pearlControl, leftPylon, rightPylon, goldControl, leftNozzle, rightNozzle]);

    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(leftPylon.material).toBeInstanceOf(PBRMaterial);
    expect(rightPylon.material).toBeInstanceOf(PBRMaterial);
    expect((leftPylon.material as PBRMaterial).name).toContain('pyro-pylon-array');
    expect(rightPylon.material).toBe(leftPylon.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftNozzle.material).toBeInstanceOf(PBRMaterial);
    expect(rightNozzle.material).toBeInstanceOf(PBRMaterial);
    expect((leftNozzle.material as PBRMaterial).name).toContain('pyro-nozzle-array');
    expect(rightNozzle.material).toBe(leftNozzle.material);

    const pylonMaterial = leftPylon.material as PBRMaterial;
    const nozzleMaterial = leftNozzle.material as PBRMaterial;

    expect(pylonMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pylonMaterial.metadata?.mainStageMaterialOverride).toBe('pyro-pylon-array');
    expect(pylonMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(pylonMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(pylonMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(pylonMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pylonMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(pylonMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);

    expect(nozzleMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(nozzleMaterial.metadata?.mainStageMaterialOverride).toBe('pyro-nozzle-array');
    expect(nozzleMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(nozzleMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(nozzleMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(nozzleMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(nozzleMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(nozzleMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(nozzleMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('retones the rear-mass facade bands and shadow channels so the skyline read keeps layered depth instead of bright gold ladders over flat black stripes', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedBlackMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedBlackMaterial.albedoColor.set(0.08, 0.09, 0.11);
    sharedBlackMaterial.emissiveColor.set(0.02, 0.025, 0.03);
    sharedBlackMaterial.emissiveIntensity = 0.1;
    sharedBlackMaterial.metallic = 0.12;
    sharedBlackMaterial.roughness = 0.44;

    const goldControl = MeshBuilder.CreateBox('TestRearMassGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V96_RearMassGoldBandArray_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V96_RearMassGoldBandArray_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const blackControl = MeshBuilder.CreateBox('TestRearMassShadowControl', { size: 1 }, scene);
    blackControl.material = sharedBlackMaterial;

    const leftShadow = MeshBuilder.CreateBox('V96_RearMassShadowChannelArray_L', { size: 1 }, scene);
    leftShadow.material = sharedBlackMaterial;

    const rightShadow = MeshBuilder.CreateBox('V96_RearMassShadowChannelArray_R', { size: 1 }, scene);
    rightShadow.material = sharedBlackMaterial;

    polishMainStageMaterials([goldControl, leftGold, rightGold, blackControl, leftShadow, rightShadow]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect((leftGold.material as PBRMaterial).name).toContain('rear-mass-gold-band');
    expect(rightGold.material).toBe(leftGold.material);

    expect(blackControl.material).toBe(sharedBlackMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBeInstanceOf(PBRMaterial);
    expect((leftShadow.material as PBRMaterial).name).toContain('rear-mass-shadow-channel');
    expect(rightShadow.material).toBe(leftShadow.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;

    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('rear-mass-gold-band');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('rear-mass-shadow-channel');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('regrades the wet route stone bands and gold seams so the central approach reads as authored ceremonial paving instead of repeated glossy proxy strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStoneMaterial = new PBRMaterial('V13_WetPlazaStone', scene);
    sharedStoneMaterial.albedoColor.set(0.26, 0.24, 0.22);
    sharedStoneMaterial.emissiveColor.set(0.02, 0.025, 0.03);
    sharedStoneMaterial.emissiveIntensity = 0.12;
    sharedStoneMaterial.metallic = 0.12;
    sharedStoneMaterial.roughness = 0.42;

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const stoneControl = MeshBuilder.CreateBox('TestWetRouteStoneControl', { size: 1 }, scene);
    stoneControl.material = sharedStoneMaterial;

    const stoneBands = MeshBuilder.CreateBox('V97_WetRouteStoneBandArray', { size: 1 }, scene);
    stoneBands.material = sharedStoneMaterial;

    const goldControl = MeshBuilder.CreateBox('TestWetRouteGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const goldBands = MeshBuilder.CreateBox('V97_WetRouteGoldSeamArray', { size: 1 }, scene);
    goldBands.material = sharedGoldMaterial;

    polishMainStageMaterials([stoneControl, stoneBands, goldControl, goldBands]);

    expect(stoneControl.material).toBe(sharedStoneMaterial);
    expect(stoneBands.material).toBeInstanceOf(PBRMaterial);
    expect((stoneBands.material as PBRMaterial).name).toContain('wet-route-stone-band');

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(goldBands.material).toBeInstanceOf(PBRMaterial);
    expect((goldBands.material as PBRMaterial).name).toContain('wet-route-gold-seam');

    const stoneBandMaterial = stoneBands.material as PBRMaterial;
    const goldBandMaterial = goldBands.material as PBRMaterial;

    expect(stoneBandMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(stoneBandMaterial.metadata?.mainStageMaterialOverride).toBe('wet-route-stone-band');
    expect(stoneBandMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(stoneBandMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(stoneBandMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(stoneBandMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(stoneBandMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(stoneBandMaterial.environmentIntensity).toBeLessThanOrEqual(0.24);

    expect(goldBandMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldBandMaterial.metadata?.mainStageMaterialOverride).toBe('wet-route-gold-seam');
    expect(goldBandMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(goldBandMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(goldBandMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldBandMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldBandMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldBandMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(goldBandMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the oval side-screen shell housings so the promenade checkpoint no longer reads them as giant pale slab proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('regrades the basin water sheets so the side basins read as dark reflective water planes instead of bright flat cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedWaterMaterial = new PBRMaterial('V14_DeepReflectingWater', scene);
    sharedWaterMaterial.albedoColor.set(0.16, 0.22, 0.28);
    sharedWaterMaterial.emissiveColor.set(0.02, 0.04, 0.05);
    sharedWaterMaterial.emissiveIntensity = 0.08;
    sharedWaterMaterial.alpha = 0.98;
    sharedWaterMaterial.metallic = 0.04;
    sharedWaterMaterial.roughness = 0.24;

    const controlWater = MeshBuilder.CreateBox('TestBasinWaterSheetControl', { size: 1 }, scene);
    controlWater.material = sharedWaterMaterial;

    const leftSheet = MeshBuilder.CreateBox('V118_BasinWaterSheet_L', { size: 1 }, scene);
    leftSheet.material = sharedWaterMaterial;

    const rightSheet = MeshBuilder.CreateBox('V118_BasinWaterSheet_R', { size: 1 }, scene);
    rightSheet.material = sharedWaterMaterial;

    polishMainStageMaterials([controlWater, leftSheet, rightSheet]);

    expect(controlWater.material).toBe(sharedWaterMaterial);
    expect(leftSheet.material).toBeInstanceOf(PBRMaterial);
    expect(rightSheet.material).toBeInstanceOf(PBRMaterial);
    expect(rightSheet.material).toBe(leftSheet.material);

    const sheetMaterial = leftSheet.material as PBRMaterial;
    expect(sheetMaterial.name).toContain('basin-water-sheet');
    expect(sheetMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(sheetMaterial.metadata?.mainStageMaterialOverride).toBe('basin-water-sheet');
    expect(sheetMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(sheetMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(sheetMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(sheetMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.06);
    expect(sheetMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.6);
    expect(sheetMaterial.roughness).toBeLessThanOrEqual(0.3);
    expect(sheetMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.8);
  });

  it('rebalances the oval portal glow arrays so the arrival-side portals read as carved frames with subdued emissive insets instead of bright gold rings around flat cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedEmissionMaterial = new PBRMaterial('V14_CosmicScreenEmission', scene);
    sharedEmissionMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedEmissionMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedEmissionMaterial.emissiveIntensity = 0.34;
    sharedEmissionMaterial.alpha = 1;
    sharedEmissionMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestOvalPortalGlowGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V119_OvalPortalGlowGoldArray_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V119_OvalPortalGlowGoldArray_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const emissionControl = MeshBuilder.CreateBox('TestOvalPortalGlowEmissionControl', { size: 1 }, scene);
    emissionControl.material = sharedEmissionMaterial;

    const leftEmission = MeshBuilder.CreateBox('V119_OvalPortalGlowEmissionArray_L', { size: 1 }, scene);
    leftEmission.material = sharedEmissionMaterial;

    const rightEmission = MeshBuilder.CreateBox('V119_OvalPortalGlowEmissionArray_R', { size: 1 }, scene);
    rightEmission.material = sharedEmissionMaterial;

    polishMainStageMaterials([goldControl, leftGold, rightGold, emissionControl, leftEmission, rightEmission]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(emissionControl.material).toBe(sharedEmissionMaterial);
    expect(leftEmission.material).toBeInstanceOf(PBRMaterial);
    expect(rightEmission.material).toBe(leftEmission.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const emissionMaterial = leftEmission.material as PBRMaterial;

    expect(goldMaterial.name).toContain('oval-portal-glow-gold');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('oval-portal-glow-gold');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(emissionMaterial.name).toContain('oval-portal-glow-emission');
    expect(emissionMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(emissionMaterial.metadata?.mainStageMaterialOverride).toBe('oval-portal-glow-emission');
    expect(emissionMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(emissionMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(emissionMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(emissionMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(emissionMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(emissionMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(emissionMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(emissionMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the basin parapet reliefs so the route-edge basin crowns read as carved stonework instead of bright pearl ledges', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('retones the central water-light housings, trim, and lenses into practical in-basin fixtures so the promenade spine reads as embedded lighting instead of bright gold-and-cyan proxy bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V15_MatteProductionBlack', scene);
    sharedBlackMaterial.albedoColor.set(0.05, 0.05, 0.06);
    sharedBlackMaterial.emissiveColor.set(0.02, 0.02, 0.02);
    sharedBlackMaterial.emissiveIntensity = 0.08;
    sharedBlackMaterial.roughness = 0.44;

    const sharedGoldMaterial = new PBRMaterial('V15_EngineeredGoldAnchors', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.63, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.14;
    sharedGoldMaterial.roughness = 0.34;

    const sharedLensMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedLensMaterial.albedoColor.set(0.18, 0.56, 0.7);
    sharedLensMaterial.emissiveColor.set(0.06, 0.4, 0.5);
    sharedLensMaterial.emissiveIntensity = 0.52;
    sharedLensMaterial.alpha = 0.9;
    sharedLensMaterial.roughness = 0.18;

    const blackControl = MeshBuilder.CreateBox('TestCentralWaterLightBlackControl', { size: 1 }, scene);
    blackControl.material = sharedBlackMaterial;

    const goldControl = MeshBuilder.CreateBox('TestCentralWaterLightGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const lensControl = MeshBuilder.CreateBox('TestCentralWaterLightLensControl', { size: 1 }, scene);
    lensControl.material = sharedLensMaterial;

    const housing = MeshBuilder.CreateBox('V100_CentralWaterLightHousingArray', { size: 1 }, scene);
    housing.material = sharedBlackMaterial;

    const trim = MeshBuilder.CreateBox('V100_CentralWaterLightGoldTrimArray', { size: 1 }, scene);
    trim.material = sharedGoldMaterial;

    const lens = MeshBuilder.CreateBox('V100_CentralWaterLightLensArray', { size: 1 }, scene);
    lens.material = sharedLensMaterial;

    polishMainStageMaterials([blackControl, goldControl, lensControl, housing, trim, lens]);

    expect(blackControl.material).toBe(sharedBlackMaterial);
    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(lensControl.material).toBe(sharedLensMaterial);

    expect(housing.material).toBeInstanceOf(PBRMaterial);
    expect(trim.material).toBeInstanceOf(PBRMaterial);
    expect(lens.material).toBeInstanceOf(PBRMaterial);

    const housingMaterial = housing.material as PBRMaterial;
    expect(housingMaterial.name).toContain('central-water-light-housing');
    expect(housingMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(housingMaterial.metadata?.mainStageMaterialOverride).toBe('central-water-light-housing');
    expect(housingMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(housingMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(housingMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(housingMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(housingMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(housingMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);

    const trimMaterial = trim.material as PBRMaterial;
    expect(trimMaterial.name).toContain('central-water-light-gold-trim');
    expect(trimMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(trimMaterial.metadata?.mainStageMaterialOverride).toBe('central-water-light-gold-trim');
    expect(trimMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(trimMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(trimMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(trimMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(trimMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(trimMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    const lensMaterial = lens.material as PBRMaterial;
    expect(lensMaterial.name).toContain('central-water-light-lens');
    expect(lensMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(lensMaterial.metadata?.mainStageMaterialOverride).toBe('central-water-light-lens');
    expect(lensMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(lensMaterial.albedoColor.g).toBeLessThanOrEqual(0.22);
    expect(lensMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(lensMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(lensMaterial.alpha).toBeLessThanOrEqual(0.5);
    expect(lensMaterial.roughness).toBeGreaterThanOrEqual(0.14);
    expect(lensMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
  });

  it('tones down the VIP balustrade lower-chord arrays so the side podium edges read as carved support trim instead of bright gold rails', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.64, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.26;

    const goldControl = MeshBuilder.CreateBox('TestVipBalustradeGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftArray = MeshBuilder.CreateBox('V101_VipBalustradeLowerChordArray_L', { size: 1 }, scene);
    leftArray.material = sharedGoldMaterial;

    const rightArray = MeshBuilder.CreateBox('V101_VipBalustradeLowerChordArray_R', { size: 1 }, scene);
    rightArray.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, leftArray, rightArray]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBe(leftArray.material);

    const chordMaterial = leftArray.material as PBRMaterial;
    expect(chordMaterial.name).toContain('vip-balustrade-lower-chord');
    expect(chordMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(chordMaterial.metadata?.mainStageMaterialOverride).toBe('vip-balustrade-lower-chord');
    expect(chordMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(chordMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(chordMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(chordMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(chordMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(chordMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(chordMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('tones down the VIP balustrade filigree arrays so the side podium edges read as carved ornament instead of bright gold lace bands', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.64, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.26;

    const goldControl = MeshBuilder.CreateBox('TestVipBalustradeFiligreeGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftArray = MeshBuilder.CreateBox('V102_VipBalustradeFiligreeArray_L', { size: 1 }, scene);
    leftArray.material = sharedGoldMaterial;

    const rightArray = MeshBuilder.CreateBox('V102_VipBalustradeFiligreeArray_R', { size: 1 }, scene);
    rightArray.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, leftArray, rightArray]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBe(leftArray.material);

    const filigreeMaterial = leftArray.material as PBRMaterial;
    expect(filigreeMaterial.name).toContain('vip-balustrade-filigree');
    expect(filigreeMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(filigreeMaterial.metadata?.mainStageMaterialOverride).toBe('vip-balustrade-filigree');
    expect(filigreeMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(filigreeMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(filigreeMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(filigreeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(filigreeMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(filigreeMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(filigreeMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the VIP pearl-surface reliefs and cyan insets so the side podium walls read as carved night architecture instead of bright gold tracery over glowing cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.64, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.26;

    const sharedCyanGlass = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanGlass.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanGlass.emissiveIntensity = 0.34;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestVipPearlSurfaceGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestVipPearlSurfaceCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanGlass;

    const leftGold = MeshBuilder.CreateBox('V103_PearlSurfaceGoldRelief_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V103_PearlSurfaceGoldRelief_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const leftCyan = MeshBuilder.CreateBox('V103_PearlSurfaceCyanInset_L', { size: 1 }, scene);
    leftCyan.material = sharedCyanGlass;

    const rightCyan = MeshBuilder.CreateBox('V103_PearlSurfaceCyanInset_R', { size: 1 }, scene);
    rightCyan.material = sharedCyanGlass;

    polishMainStageMaterials([goldControl, cyanControl, leftGold, rightGold, leftCyan, rightCyan]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(cyanControl.material).toBe(sharedCyanGlass);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect(leftCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);
    expect(rightCyan.material).toBe(leftCyan.material);

    const goldReliefMaterial = leftGold.material as PBRMaterial;
    expect(goldReliefMaterial.name).toContain('vip-pearl-surface-gold-relief');
    expect(goldReliefMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldReliefMaterial.metadata?.mainStageMaterialOverride).toBe('vip-pearl-surface-gold-relief');
    expect(goldReliefMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldReliefMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldReliefMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldReliefMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldReliefMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldReliefMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(goldReliefMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    const cyanInsetMaterial = leftCyan.material as PBRMaterial;
    expect(cyanInsetMaterial.name).toContain('vip-pearl-surface-cyan-inset');
    expect(cyanInsetMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanInsetMaterial.metadata?.mainStageMaterialOverride).toBe('vip-pearl-surface-cyan-inset');
    expect(cyanInsetMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanInsetMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanInsetMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanInsetMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanInsetMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanInsetMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanInsetMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
  });

  it('tones down the outer-wing gold spine arrays so the far side masses read as carved support accents instead of bright foil bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.64, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.26;

    const goldControl = MeshBuilder.CreateBox('TestOuterWingGoldSpineControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftArray = MeshBuilder.CreateBox('V104_OuterWingGoldSpineArray_L', { size: 1 }, scene);
    leftArray.material = sharedGoldMaterial;

    const rightArray = MeshBuilder.CreateBox('V104_OuterWingGoldSpineArray_R', { size: 1 }, scene);
    rightArray.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, leftArray, rightArray]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBe(leftArray.material);

    const spineMaterial = leftArray.material as PBRMaterial;
    expect(spineMaterial.name).toContain('outer-wing-gold-spine');
    expect(spineMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(spineMaterial.metadata?.mainStageMaterialOverride).toBe('outer-wing-gold-spine');
    expect(spineMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(spineMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(spineMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(spineMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(spineMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(spineMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(spineMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('tones down the rear-shell gold seam arrays so the skyline shell keeps layered structure instead of bright foil ladders', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.64, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.26;

    const goldControl = MeshBuilder.CreateBox('TestRearShellGoldSeamControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftArray = MeshBuilder.CreateBox('V105_RearShellGoldSeamArray_L', { size: 1 }, scene);
    leftArray.material = sharedGoldMaterial;

    const rightArray = MeshBuilder.CreateBox('V105_RearShellGoldSeamArray_R', { size: 1 }, scene);
    rightArray.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, leftArray, rightArray]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBe(leftArray.material);

    const seamMaterial = leftArray.material as PBRMaterial;
    expect(seamMaterial.name).toContain('rear-shell-gold-seam');
    expect(seamMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(seamMaterial.metadata?.mainStageMaterialOverride).toBe('rear-shell-gold-seam');
    expect(seamMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(seamMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(seamMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(seamMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(seamMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(seamMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(seamMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the foreground barricade gold and pearl runs so the entry sweep reads as authored ceremonial railwork instead of bright trim over pale slab bands', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V18_BrushedGoldTrim', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.68, 0.3);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.76;
    sharedGoldMaterial.roughness = 0.28;

    const sharedPearlMaterial = new PBRMaterial('V18_PearlFacadeInlay', scene);
    sharedPearlMaterial.albedoColor.set(0.84, 0.82, 0.78);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.14;
    sharedPearlMaterial.roughness = 0.34;

    const goldControl = MeshBuilder.CreateBox('TestForegroundBarricadeGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const pearlControl = MeshBuilder.CreateBox('TestForegroundBarricadePearlControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;

    const goldRun = MeshBuilder.CreateBox('V108_ForegroundBarricadeGoldRun', { size: 1 }, scene);
    goldRun.material = sharedGoldMaterial;

    const pearlRun = MeshBuilder.CreateBox('V108_ForegroundBarricadePearlRun', { size: 1 }, scene);
    pearlRun.material = sharedPearlMaterial;

    polishMainStageMaterials([goldControl, pearlControl, goldRun, pearlRun]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(goldRun.material).toBeInstanceOf(PBRMaterial);
    expect(pearlRun.material).toBeInstanceOf(PBRMaterial);

    const goldRunMaterial = goldRun.material as PBRMaterial;
    expect(goldRunMaterial.name).toContain('foreground-barricade-gold-run');
    expect(goldRunMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldRunMaterial.metadata?.mainStageMaterialOverride).toBe('foreground-barricade-gold-run');
    expect(goldRunMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldRunMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldRunMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldRunMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldRunMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldRunMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(goldRunMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    const pearlRunMaterial = pearlRun.material as PBRMaterial;
    expect(pearlRunMaterial.name).toContain('foreground-barricade-pearl-run');
    expect(pearlRunMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pearlRunMaterial.metadata?.mainStageMaterialOverride).toBe('foreground-barricade-pearl-run');
    expect(pearlRunMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(pearlRunMaterial.albedoColor.g).toBeLessThanOrEqual(0.3);
    expect(pearlRunMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(pearlRunMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pearlRunMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(pearlRunMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('smokes the wing-facade inset glow arrays so the side wall insets read as subdued jewel recesses instead of bright cyan slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanMaterial = new PBRMaterial('V18_CyanWaterMistGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const cyanControl = MeshBuilder.CreateBox('TestWingFacadeInsetGlowControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftArray = MeshBuilder.CreateBox('V110_WingFacadeInsetGlowArray_L', { size: 1 }, scene);
    leftArray.material = sharedCyanMaterial;

    const rightArray = MeshBuilder.CreateBox('V110_WingFacadeInsetGlowArray_R', { size: 1 }, scene);
    rightArray.material = sharedCyanMaterial;

    polishMainStageMaterials([cyanControl, leftArray, rightArray]);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBe(leftArray.material);

    const glowMaterial = leftArray.material as PBRMaterial;
    expect(glowMaterial.name).toContain('wing-facade-inset-glow');
    expect(glowMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(glowMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-inset-glow');
    expect(glowMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(glowMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(glowMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(glowMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(glowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(glowMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(glowMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
  });

  it('keeps the rear-shell panel arrays subdued but still legible so the skyline mass reads as carved shell architecture instead of dead-black slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.84, 0.82, 0.78);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.14;
    sharedPearlMaterial.roughness = 0.34;

    const pearlControl = MeshBuilder.CreateBox('TestRearShellPanelPearlControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;

    const leftArray = MeshBuilder.CreateBox('V111_RearShellPanelArray_L', { size: 1 }, scene);
    leftArray.material = sharedPearlMaterial;

    const rightArray = MeshBuilder.CreateBox('V111_RearShellPanelArray_R', { size: 1 }, scene);
    rightArray.material = sharedPearlMaterial;

    polishMainStageMaterials([pearlControl, leftArray, rightArray]);

    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(leftArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBeInstanceOf(PBRMaterial);
    expect(rightArray.material).toBe(leftArray.material);

    const panelMaterial = leftArray.material as PBRMaterial;
    expect(panelMaterial.name).toContain('rear-shell-panel');
    expect(panelMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(panelMaterial.metadata?.mainStageMaterialOverride).toBe('rear-shell-panel');
    expect(panelMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.22);
    expect(panelMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.24);
    expect(panelMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.28);
    expect(panelMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(panelMaterial.albedoColor.g).toBeLessThanOrEqual(0.3);
    expect(panelMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(panelMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.015);
    expect(panelMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(panelMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(panelMaterial.roughness).toBeLessThanOrEqual(0.9);
    expect(panelMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.12);
    expect(panelMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('tones down the crown crystal gold edge array so the halo crown reads as carved metal detail instead of a bright foil comb', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.64, 0.26);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.26;

    const goldControl = MeshBuilder.CreateBox('TestCrownCrystalGoldEdgeControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const goldEdge = MeshBuilder.CreateBox('V112_CrownCrystalGoldEdgeArray', { size: 1 }, scene);
    goldEdge.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, goldEdge]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(goldEdge.material).toBeInstanceOf(PBRMaterial);

    const edgeMaterial = goldEdge.material as PBRMaterial;
    expect(edgeMaterial.name).toContain('crown-crystal-gold-edge');
    expect(edgeMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(edgeMaterial.metadata?.mainStageMaterialOverride).toBe('crown-crystal-gold-edge');
    expect(edgeMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(edgeMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(edgeMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(edgeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(edgeMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(edgeMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(edgeMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('tones down the crown-shell gold seam arrays so the halo shell keeps layered relief instead of bright foil ribbons between the pearl lamellae', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.8, 0.68, 0.28);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.24;

    const goldControl = MeshBuilder.CreateBox('TestCrownShellGoldSeamControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftSeam = MeshBuilder.CreateBox('V113_CrownShellGoldSeamArray_L', { size: 1 }, scene);
    leftSeam.material = sharedGoldMaterial;

    const rightSeam = MeshBuilder.CreateBox('V113_CrownShellGoldSeamArray_R', { size: 1 }, scene);
    rightSeam.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, leftSeam, rightSeam]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftSeam.material).toBeInstanceOf(PBRMaterial);
    expect(rightSeam.material).toBeInstanceOf(PBRMaterial);
    expect(rightSeam.material).toBe(leftSeam.material);

    const seamMaterial = leftSeam.material as PBRMaterial;
    expect(seamMaterial.name).toContain('crown-shell-gold-seam');
    expect(seamMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(seamMaterial.metadata?.mainStageMaterialOverride).toBe('crown-shell-gold-seam');
    expect(seamMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(seamMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(seamMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(seamMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(seamMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(seamMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(seamMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the celestial halo ring arrays so the crown keeps layered carved-metal and smoked-glass separation instead of bright gold hoops wrapped around cyan strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.8, 0.68, 0.28);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.24;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestCelestialHaloGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const outerRing = MeshBuilder.CreateBox('V114_CelestialHaloOuterRingArray', { size: 1 }, scene);
    outerRing.material = sharedGoldMaterial;

    const innerRing = MeshBuilder.CreateBox('V114_CelestialHaloInnerRingArray', { size: 1 }, scene);
    innerRing.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCelestialHaloCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const cyanEdge = MeshBuilder.CreateBox('V114_CelestialHaloCyanEdgeArray', { size: 1 }, scene);
    cyanEdge.material = sharedCyanMaterial;

    polishMainStageMaterials([goldControl, outerRing, innerRing, cyanControl, cyanEdge]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(outerRing.material).toBeInstanceOf(PBRMaterial);
    expect(innerRing.material).toBeInstanceOf(PBRMaterial);
    expect(cyanEdge.material).toBeInstanceOf(PBRMaterial);

    const outerMaterial = outerRing.material as PBRMaterial;
    const innerMaterial = innerRing.material as PBRMaterial;
    const cyanMaterial = cyanEdge.material as PBRMaterial;

    expect(outerMaterial.name).toContain('celestial-halo-outer-ring');
    expect(outerMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(outerMaterial.metadata?.mainStageMaterialOverride).toBe('celestial-halo-outer-ring');
    expect(outerMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(outerMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(outerMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(outerMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(outerMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(outerMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(outerMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(innerMaterial.name).toContain('celestial-halo-inner-ring');
    expect(innerMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(innerMaterial.metadata?.mainStageMaterialOverride).toBe('celestial-halo-inner-ring');
    expect(innerMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(innerMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(innerMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(innerMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(innerMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(innerMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(innerMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(cyanMaterial.name).toContain('celestial-halo-cyan-edge');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('celestial-halo-cyan-edge');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the crown side-rib gold clusters and cyan insets so the upper silhouette reads as carved celestial ribwork instead of bright gold sticks wrapped around flat cyan strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.8, 0.68, 0.28);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.24;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestCrownSideRibGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V39_CrownSideRibGoldCluster_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V39_CrownSideRibGoldCluster_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCrownSideRibCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftCyan = MeshBuilder.CreateBox('V39_CrownSideRibCyanInset_L', { size: 1 }, scene);
    leftCyan.material = sharedCyanMaterial;

    const rightCyan = MeshBuilder.CreateBox('V39_CrownSideRibCyanInset_R', { size: 1 }, scene);
    rightCyan.material = sharedCyanMaterial;

    polishMainStageMaterials([goldControl, leftGold, rightGold, cyanControl, leftCyan, rightCyan]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightCyan.material).toBe(leftCyan.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const cyanMaterial = leftCyan.material as PBRMaterial;

    expect(goldMaterial.name).toContain('crown-side-rib-gold');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('crown-side-rib-gold');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(cyanMaterial.name).toContain('crown-side-rib-cyan');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('crown-side-rib-cyan');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the crown blade lamella clusters so the skyline blades read as layered carved pearl, metal, and smoked-glass forms instead of bright crown strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.86, 0.82, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.18;
    sharedPearlMaterial.roughness = 0.32;
    sharedPearlMaterial.environmentIntensity = 0.64;

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.8, 0.68, 0.28);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.24;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const pearlControl = MeshBuilder.CreateBox('TestCrownBladePearlControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;

    const leftPearl = MeshBuilder.CreateBox('V41_CrownBladePearlLamellaCluster_L', { size: 1 }, scene);
    leftPearl.material = sharedPearlMaterial;

    const rightPearl = MeshBuilder.CreateBox('V41_CrownBladePearlLamellaCluster_R', { size: 1 }, scene);
    rightPearl.material = sharedPearlMaterial;

    const goldControl = MeshBuilder.CreateBox('TestCrownBladeGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V41_CrownBladeGoldRevealCluster_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V41_CrownBladeGoldRevealCluster_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCrownBladeCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftCyan = MeshBuilder.CreateBox('V41_CrownBladeCyanInsetCluster_L', { size: 1 }, scene);
    leftCyan.material = sharedCyanMaterial;

    const rightCyan = MeshBuilder.CreateBox('V41_CrownBladeCyanInsetCluster_R', { size: 1 }, scene);
    rightCyan.material = sharedCyanMaterial;

    polishMainStageMaterials([
      pearlControl,
      leftPearl,
      rightPearl,
      goldControl,
      leftGold,
      rightGold,
      cyanControl,
      leftCyan,
      rightCyan,
    ]);

    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(leftPearl.material).toBeInstanceOf(PBRMaterial);
    expect(rightPearl.material).toBe(leftPearl.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightCyan.material).toBe(leftCyan.material);

    const pearlMaterial = leftPearl.material as PBRMaterial;
    const goldMaterial = leftGold.material as PBRMaterial;
    const cyanMaterial = leftCyan.material as PBRMaterial;

    expect(pearlMaterial.name).toContain('crown-blade-lamella-pearl');
    expect(pearlMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pearlMaterial.metadata?.mainStageMaterialOverride).toBe('crown-blade-lamella-pearl');
    expect(pearlMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(pearlMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(pearlMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(pearlMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pearlMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(pearlMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);

    expect(goldMaterial.name).toContain('crown-blade-gold-reveal');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('crown-blade-gold-reveal');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(cyanMaterial.name).toContain('crown-blade-cyan-inset');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('crown-blade-cyan-inset');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the crown truss diagonal braces so the upper support cage reads as structural depth instead of flat black proxy X bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedRigMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedRigMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedRigMaterial.emissiveColor.set(0, 0, 0);
    sharedRigMaterial.emissiveIntensity = 0;
    sharedRigMaterial.metallic = 0.22;
    sharedRigMaterial.roughness = 0.48;
    sharedRigMaterial.environmentIntensity = 0.56;

    const rigControl = MeshBuilder.CreateBox('TestTrussDiagonalBraceControl', { size: 1 }, scene);
    rigControl.material = sharedRigMaterial;

    const leftBraceA = MeshBuilder.CreateBox('V42_TrussDiagonalBraceA_L', { size: 1 }, scene);
    leftBraceA.material = sharedRigMaterial;

    const leftBraceB = MeshBuilder.CreateBox('V42_TrussDiagonalBraceB_L', { size: 1 }, scene);
    leftBraceB.material = sharedRigMaterial;

    const rightBraceA = MeshBuilder.CreateBox('V42_TrussDiagonalBraceA_R', { size: 1 }, scene);
    rightBraceA.material = sharedRigMaterial;

    const rightBraceB = MeshBuilder.CreateBox('V42_TrussDiagonalBraceB_R', { size: 1 }, scene);
    rightBraceB.material = sharedRigMaterial;

    polishMainStageMaterials([rigControl, leftBraceA, leftBraceB, rightBraceA, rightBraceB]);

    expect(rigControl.material).toBe(sharedRigMaterial);
    expect(leftBraceA.material).toBeInstanceOf(PBRMaterial);
    expect(leftBraceB.material).toBe(leftBraceA.material);
    expect(rightBraceA.material).toBe(leftBraceA.material);
    expect(rightBraceB.material).toBe(leftBraceA.material);

    const braceMaterial = leftBraceA.material as PBRMaterial;
    expect(braceMaterial.name).toContain('truss-diagonal-brace');
    expect(braceMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(braceMaterial.metadata?.mainStageMaterialOverride).toBe('truss-diagonal-brace');
    expect(braceMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(braceMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(braceMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(braceMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(braceMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(braceMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(braceMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the production truss tower arrays so the stage flanks read as integrated support hardware instead of bright ladders and hot cyan beacons on flat proxy towers', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedFrameMaterial = new PBRMaterial('V18_BlackPowderCoatTruss', scene);
    sharedFrameMaterial.albedoColor.set(0.1, 0.11, 0.14);
    sharedFrameMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedFrameMaterial.emissiveIntensity = 0.08;
    sharedFrameMaterial.roughness = 0.34;
    sharedFrameMaterial.environmentIntensity = 0.56;

    const sharedBraceMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedBraceMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedBraceMaterial.emissiveColor.set(0, 0, 0);
    sharedBraceMaterial.emissiveIntensity = 0;
    sharedBraceMaterial.metallic = 0.22;
    sharedBraceMaterial.roughness = 0.48;
    sharedBraceMaterial.environmentIntensity = 0.56;

    const sharedGoldMaterial = new PBRMaterial('V18_BrushedGoldTrim', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.72, 0.34);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;

    const sharedCyanMaterial = new PBRMaterial('V17_CyanEdgeGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const frameControl = MeshBuilder.CreateBox('TestProductionTowerFrameControl', { size: 1 }, scene);
    frameControl.material = sharedFrameMaterial;
    const leftFrame = MeshBuilder.CreateBox('V37_ProductionTrussTowerFrame_L', { size: 1 }, scene);
    leftFrame.material = sharedFrameMaterial;
    const rightFrame = MeshBuilder.CreateBox('V37_ProductionTrussTowerFrame_R', { size: 1 }, scene);
    rightFrame.material = sharedFrameMaterial;

    const braceControl = MeshBuilder.CreateBox('TestProductionTowerBraceControl', { size: 1 }, scene);
    braceControl.material = sharedBraceMaterial;
    const leftBrace = MeshBuilder.CreateBox('V37_ProductionTrussCrossBrace_L', { size: 1 }, scene);
    leftBrace.material = sharedBraceMaterial;
    const rightBrace = MeshBuilder.CreateBox('V37_ProductionTrussCrossBrace_R', { size: 1 }, scene);
    rightBrace.material = sharedBraceMaterial;

    const goldControl = MeshBuilder.CreateBox('TestProductionTowerGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;
    const leftLadder = MeshBuilder.CreateBox('V37_ProductionTowerServiceLadder_L', { size: 1 }, scene);
    leftLadder.material = sharedGoldMaterial;
    const rightLadder = MeshBuilder.CreateBox('V37_ProductionTowerServiceLadder_R', { size: 1 }, scene);
    rightLadder.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestProductionTowerBeaconControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;
    const leftBeacon = MeshBuilder.CreateBox('V37_ProductionTowerBeaconArray_L', { size: 1 }, scene);
    leftBeacon.material = sharedCyanMaterial;
    const rightBeacon = MeshBuilder.CreateBox('V37_ProductionTowerBeaconArray_R', { size: 1 }, scene);
    rightBeacon.material = sharedCyanMaterial;

    polishMainStageMaterials([
      frameControl,
      leftFrame,
      rightFrame,
      braceControl,
      leftBrace,
      rightBrace,
      goldControl,
      leftLadder,
      rightLadder,
      cyanControl,
      leftBeacon,
      rightBeacon,
    ]);

    expect(frameControl.material).toBe(sharedFrameMaterial);
    expect(leftFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBe(leftFrame.material);

    expect(braceControl.material).toBe(sharedBraceMaterial);
    expect(leftBrace.material).toBeInstanceOf(PBRMaterial);
    expect(rightBrace.material).toBe(leftBrace.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftLadder.material).toBeInstanceOf(PBRMaterial);
    expect(rightLadder.material).toBe(leftLadder.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftBeacon.material).toBeInstanceOf(PBRMaterial);
    expect(rightBeacon.material).toBe(leftBeacon.material);

    const frameMaterial = leftFrame.material as PBRMaterial;
    const braceMaterial = leftBrace.material as PBRMaterial;
    const ladderMaterial = leftLadder.material as PBRMaterial;
    const beaconMaterial = leftBeacon.material as PBRMaterial;

    expect(frameMaterial.name).toContain('production-truss-tower-frame');
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('production-truss-tower-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(braceMaterial.name).toContain('production-truss-cross-brace');
    expect(braceMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(braceMaterial.metadata?.mainStageMaterialOverride).toBe('production-truss-cross-brace');
    expect(braceMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(braceMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(braceMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(braceMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(braceMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(braceMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(braceMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);

    expect(ladderMaterial.name).toContain('production-tower-service-ladder');
    expect(ladderMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(ladderMaterial.metadata?.mainStageMaterialOverride).toBe('production-tower-service-ladder');
    expect(ladderMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(ladderMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(ladderMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(ladderMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(ladderMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(ladderMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(ladderMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(beaconMaterial.name).toContain('production-tower-beacon');
    expect(beaconMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(beaconMaterial.metadata?.mainStageMaterialOverride).toBe('production-tower-beacon');
    expect(beaconMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(beaconMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(beaconMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(beaconMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(beaconMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(beaconMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(beaconMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(beaconMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the wing-facade arcade piers, capitals, and shadow reveals so the side portal masses read as carved architecture instead of bright pearl sticks capped with foil and cyan recesses', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.86, 0.82, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.18;
    sharedPearlMaterial.roughness = 0.32;
    sharedPearlMaterial.environmentIntensity = 0.64;

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;
    sharedShadowMaterial.environmentIntensity = 0.72;

    const pearlControl = MeshBuilder.CreateBox('TestWingFacadePearlControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;
    const leftPier = MeshBuilder.CreateBox('V38_WingFacadeArcadePierCluster_L', { size: 1 }, scene);
    leftPier.material = sharedPearlMaterial;
    const rightPier = MeshBuilder.CreateBox('V38_WingFacadeArcadePierCluster_R', { size: 1 }, scene);
    rightPier.material = sharedPearlMaterial;

    const goldControl = MeshBuilder.CreateBox('TestWingFacadeGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;
    const leftCapital = MeshBuilder.CreateBox('V38_WingFacadeGoldCapital_L', { size: 1 }, scene);
    leftCapital.material = sharedGoldMaterial;
    const rightCapital = MeshBuilder.CreateBox('V38_WingFacadeGoldCapital_R', { size: 1 }, scene);
    rightCapital.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestWingFacadeShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;
    const leftShadow = MeshBuilder.CreateBox('V38_WingFacadeShadowReveal_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;
    const rightShadow = MeshBuilder.CreateBox('V38_WingFacadeShadowReveal_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    polishMainStageMaterials([
      pearlControl,
      leftPier,
      rightPier,
      goldControl,
      leftCapital,
      rightCapital,
      shadowControl,
      leftShadow,
      rightShadow,
    ]);

    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(leftPier.material).toBeInstanceOf(PBRMaterial);
    expect(rightPier.material).toBe(leftPier.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCapital.material).toBeInstanceOf(PBRMaterial);
    expect(rightCapital.material).toBe(leftCapital.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    const pierMaterial = leftPier.material as PBRMaterial;
    const capitalMaterial = leftCapital.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;

    expect(pierMaterial.name).toContain('wing-facade-arcade-pier');
    expect(pierMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pierMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-arcade-pier');
    expect(pierMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(pierMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(pierMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(pierMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pierMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(pierMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(pierMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);

    expect(capitalMaterial.name).toContain('wing-facade-gold-capital');
    expect(capitalMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(capitalMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-gold-capital');
    expect(capitalMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(capitalMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(capitalMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(capitalMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(capitalMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(capitalMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(capitalMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(shadowMaterial.name).toContain('wing-facade-shadow-reveal');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-shadow-reveal');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('keeps the main line-array and front-sub assemblies dark but readable so the stage flanks read as finished show audio hardware instead of dead-black boxes with bright gold hang bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGraphiteMaterial = new PBRMaterial('V18_LineArrayGraphite', scene);
    sharedGraphiteMaterial.albedoColor.set(0.34, 0.36, 0.4);
    sharedGraphiteMaterial.emissiveColor.set(0.04, 0.05, 0.06);
    sharedGraphiteMaterial.emissiveIntensity = 0.12;
    sharedGraphiteMaterial.metallic = 0.16;
    sharedGraphiteMaterial.roughness = 0.42;
    sharedGraphiteMaterial.environmentIntensity = 0.52;

    const sharedBlackMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedBlackMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedBlackMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.14;
    sharedBlackMaterial.roughness = 0.42;
    sharedBlackMaterial.environmentIntensity = 0.56;

    const sharedHardwareMaterial = new PBRMaterial('V18_BlackPowderCoatTruss', scene);
    sharedHardwareMaterial.albedoColor.set(0.1, 0.11, 0.14);
    sharedHardwareMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedHardwareMaterial.emissiveIntensity = 0.08;
    sharedHardwareMaterial.roughness = 0.34;
    sharedHardwareMaterial.environmentIntensity = 0.56;

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const graphiteControl = MeshBuilder.CreateBox('TestLineArrayGraphiteControl', { size: 1 }, scene);
    graphiteControl.material = sharedGraphiteMaterial;
    const leftCabinet = MeshBuilder.CreateBox('V29_MainLineArrayCabinet_L_00', { size: 1 }, scene);
    leftCabinet.material = sharedGraphiteMaterial;
    const rightCabinet = MeshBuilder.CreateBox('V29_MainLineArrayCabinet_R_00', { size: 1 }, scene);
    rightCabinet.material = sharedGraphiteMaterial;
    const leftDriver = MeshBuilder.CreateBox('V29_MainLineArrayDriver_L_00', { size: 1 }, scene);
    leftDriver.material = sharedGraphiteMaterial;
    const rightDriver = MeshBuilder.CreateBox('V29_MainLineArrayDriver_R_00', { size: 1 }, scene);
    rightDriver.material = sharedGraphiteMaterial;
    const leftSub = MeshBuilder.CreateBox('V29_FrontSubCabinet_L_00', { size: 1 }, scene);
    leftSub.material = sharedGraphiteMaterial;
    const rightSub = MeshBuilder.CreateBox('V29_FrontSubCabinet_R_00', { size: 1 }, scene);
    rightSub.material = sharedGraphiteMaterial;

    const blackControl = MeshBuilder.CreateBox('TestLineArrayBlackControl', { size: 1 }, scene);
    blackControl.material = sharedBlackMaterial;
    const leftGrille = MeshBuilder.CreateBox('V29_MainLineArrayGrille_L_00', { size: 1 }, scene);
    leftGrille.material = sharedBlackMaterial;
    const rightGrille = MeshBuilder.CreateBox('V29_MainLineArrayGrille_R_00', { size: 1 }, scene);
    rightGrille.material = sharedBlackMaterial;
    const leftHorn = MeshBuilder.CreateBox('V29_MainLineArrayHorn_L_00', { size: 1 }, scene);
    leftHorn.material = sharedBlackMaterial;
    const rightHorn = MeshBuilder.CreateBox('V29_MainLineArrayHorn_R_00', { size: 1 }, scene);
    rightHorn.material = sharedBlackMaterial;
    const leftPort = MeshBuilder.CreateBox('V29_FrontSubPort_L_00', { size: 1 }, scene);
    leftPort.material = sharedBlackMaterial;
    const rightPort = MeshBuilder.CreateBox('V29_FrontSubPort_R_00', { size: 1 }, scene);
    rightPort.material = sharedBlackMaterial;

    const hardwareControl = MeshBuilder.CreateBox('TestLineArrayHardwareControl', { size: 1 }, scene);
    hardwareControl.material = sharedHardwareMaterial;
    const leftYoke = MeshBuilder.CreateBox('V29_MainLineArrayYoke_L', { size: 1 }, scene);
    leftYoke.material = sharedHardwareMaterial;
    const rightYoke = MeshBuilder.CreateBox('V29_MainLineArrayYoke_R', { size: 1 }, scene);
    rightYoke.material = sharedHardwareMaterial;
    const leftRail = MeshBuilder.CreateBox('V29_MainLineArraySideRail_L', { size: 1 }, scene);
    leftRail.material = sharedHardwareMaterial;
    const rightRail = MeshBuilder.CreateBox('V29_MainLineArraySideRail_R', { size: 1 }, scene);
    rightRail.material = sharedHardwareMaterial;

    const goldControl = MeshBuilder.CreateBox('TestLineArrayGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;
    const leftPin = MeshBuilder.CreateBox('V29_MainLineArrayPinBars_L', { size: 1 }, scene);
    leftPin.material = sharedGoldMaterial;
    const rightPin = MeshBuilder.CreateBox('V29_MainLineArrayPinBars_R', { size: 1 }, scene);
    rightPin.material = sharedGoldMaterial;

    polishMainStageMaterials([
      graphiteControl,
      leftCabinet,
      rightCabinet,
      leftDriver,
      rightDriver,
      leftSub,
      rightSub,
      blackControl,
      leftGrille,
      rightGrille,
      leftHorn,
      rightHorn,
      leftPort,
      rightPort,
      hardwareControl,
      leftYoke,
      rightYoke,
      leftRail,
      rightRail,
      goldControl,
      leftPin,
      rightPin,
    ]);

    expect(graphiteControl.material).toBe(sharedGraphiteMaterial);
    expect(leftCabinet.material).toBeInstanceOf(PBRMaterial);
    expect(rightCabinet.material).toBe(leftCabinet.material);
    expect(leftDriver.material).toBe(leftCabinet.material);
    expect(rightDriver.material).toBe(leftCabinet.material);
    expect(leftSub.material).toBe(leftCabinet.material);
    expect(rightSub.material).toBe(leftCabinet.material);

    expect(blackControl.material).toBe(sharedBlackMaterial);
    expect(leftGrille.material).toBeInstanceOf(PBRMaterial);
    expect(rightGrille.material).toBe(leftGrille.material);
    expect(leftHorn.material).toBe(leftGrille.material);
    expect(rightHorn.material).toBe(leftGrille.material);
    expect(leftPort.material).toBe(leftGrille.material);
    expect(rightPort.material).toBe(leftGrille.material);

    expect(hardwareControl.material).toBe(sharedHardwareMaterial);
    expect(leftYoke.material).toBeInstanceOf(PBRMaterial);
    expect(rightYoke.material).toBe(leftYoke.material);
    expect(leftRail.material).toBe(leftYoke.material);
    expect(rightRail.material).toBe(leftYoke.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftPin.material).toBeInstanceOf(PBRMaterial);
    expect(rightPin.material).toBe(leftPin.material);

    const graphiteMaterial = leftCabinet.material as PBRMaterial;
    const blackMaterial = leftGrille.material as PBRMaterial;
    const hardwareMaterial = leftYoke.material as PBRMaterial;
    const goldMaterial = leftPin.material as PBRMaterial;

    expect(graphiteMaterial.name).toContain('line-array-graphite');
    expect(graphiteMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(graphiteMaterial.metadata?.mainStageMaterialOverride).toBe('line-array-graphite');
    expect(graphiteMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.18);
    expect(graphiteMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.2);
    expect(graphiteMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.24);
    expect(graphiteMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(graphiteMaterial.albedoColor.g).toBeLessThanOrEqual(0.22);
    expect(graphiteMaterial.albedoColor.b).toBeLessThanOrEqual(0.26);
    expect(graphiteMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.02);
    expect(graphiteMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(graphiteMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(graphiteMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(graphiteMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.18);
    expect(graphiteMaterial.environmentIntensity).toBeLessThanOrEqual(0.22);

    expect(blackMaterial.name).toContain('line-array-acoustic-black');
    expect(blackMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(blackMaterial.metadata?.mainStageMaterialOverride).toBe('line-array-acoustic-black');
    expect(blackMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.05);
    expect(blackMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.07);
    expect(blackMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.09);
    expect(blackMaterial.albedoColor.r).toBeLessThanOrEqual(0.09);
    expect(blackMaterial.albedoColor.g).toBeLessThanOrEqual(0.11);
    expect(blackMaterial.albedoColor.b).toBeLessThanOrEqual(0.13);
    expect(blackMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.08);
    expect(blackMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(blackMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(blackMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(blackMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.2);
    expect(blackMaterial.environmentIntensity).toBeLessThanOrEqual(0.24);

    expect(hardwareMaterial.name).toContain('line-array-suspension-hardware');
    expect(hardwareMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(hardwareMaterial.metadata?.mainStageMaterialOverride).toBe('line-array-suspension-hardware');
    expect(hardwareMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(hardwareMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(hardwareMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(hardwareMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(hardwareMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(hardwareMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(goldMaterial.name).toContain('line-array-pin-bars');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('line-array-pin-bars');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the basin fountain mist, nozzles, and island rims so the side basins read as grounded water practicals instead of hot cyan plumes over bright gold and pearl proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedMistMaterial = new PBRMaterial('V18_CyanWaterMistGlow', scene);
    sharedMistMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedMistMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedMistMaterial.emissiveIntensity = 0.34;
    sharedMistMaterial.alpha = 1;
    sharedMistMaterial.environmentIntensity = 0.82;

    const sharedGoldMaterial = new PBRMaterial('V18_BrushedGoldTrim', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.68, 0.3);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.76;
    sharedGoldMaterial.roughness = 0.28;

    const sharedPearlMaterial = new PBRMaterial('V18_PearlFacadeInlay', scene);
    sharedPearlMaterial.albedoColor.set(0.84, 0.82, 0.78);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.14;
    sharedPearlMaterial.roughness = 0.34;

    const mistControl = MeshBuilder.CreateBox('TestBasinFountainMistControl', { size: 1 }, scene);
    mistControl.material = sharedMistMaterial;
    const leftMist = MeshBuilder.CreateBox('V35_BasinFountainMist_L', { size: 1 }, scene);
    leftMist.material = sharedMistMaterial;
    const rightMist = MeshBuilder.CreateBox('V35_BasinFountainMist_R', { size: 1 }, scene);
    rightMist.material = sharedMistMaterial;

    const goldControl = MeshBuilder.CreateBox('TestBasinFountainNozzleControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;
    const leftNozzles = MeshBuilder.CreateBox('V35_BasinFountainNozzleArray_L', { size: 1 }, scene);
    leftNozzles.material = sharedGoldMaterial;
    const rightNozzles = MeshBuilder.CreateBox('V35_BasinFountainNozzleArray_R', { size: 1 }, scene);
    rightNozzles.material = sharedGoldMaterial;

    const pearlControl = MeshBuilder.CreateBox('TestBasinPlantingIslandRimControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;
    const leftIsland = MeshBuilder.CreateBox('V35_BasinPlantingIslandRim_L', { size: 1 }, scene);
    leftIsland.material = sharedPearlMaterial;
    const rightIsland = MeshBuilder.CreateBox('V35_BasinPlantingIslandRim_R', { size: 1 }, scene);
    rightIsland.material = sharedPearlMaterial;

    polishMainStageMaterials([
      mistControl,
      leftMist,
      rightMist,
      goldControl,
      leftNozzles,
      rightNozzles,
      pearlControl,
      leftIsland,
      rightIsland,
    ]);

    expect(mistControl.material).toBe(sharedMistMaterial);
    expect(leftMist.material).toBeInstanceOf(PBRMaterial);
    expect(rightMist.material).toBe(leftMist.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftNozzles.material).toBeInstanceOf(PBRMaterial);
    expect(rightNozzles.material).toBe(leftNozzles.material);

    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(leftIsland.material).toBeInstanceOf(PBRMaterial);
    expect(rightIsland.material).toBe(leftIsland.material);

    const mistMaterial = leftMist.material as PBRMaterial;
    const nozzleMaterial = leftNozzles.material as PBRMaterial;
    const islandMaterial = leftIsland.material as PBRMaterial;

    expect(mistMaterial.name).toContain('basin-fountain-mist');
    expect(mistMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(mistMaterial.metadata?.mainStageMaterialOverride).toBe('basin-fountain-mist');
    expect(mistMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(mistMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(mistMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(mistMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.06);
    expect(mistMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.6);
    expect(mistMaterial.roughness).toBeLessThanOrEqual(0.3);
    expect(mistMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.8);

    expect(nozzleMaterial.name).toContain('basin-fountain-nozzle-array');
    expect(nozzleMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(nozzleMaterial.metadata?.mainStageMaterialOverride).toBe('basin-fountain-nozzle-array');
    expect(nozzleMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(nozzleMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(nozzleMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(nozzleMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(nozzleMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(nozzleMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(nozzleMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(islandMaterial.name).toContain('basin-planting-island-rim');
    expect(islandMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(islandMaterial.metadata?.mainStageMaterialOverride).toBe('basin-planting-island-rim');
    expect(islandMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(islandMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(islandMaterial.albedoColor.b).toBeLessThanOrEqual(0.32);
    expect(islandMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(islandMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(islandMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('rebalances the basin lantern stems, housings, and warm cores so the garden edge reads as grounded practical lighting instead of bright gold proxies with hot flat bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStemMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedStemMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedStemMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedStemMaterial.emissiveIntensity = 0.12;
    sharedStemMaterial.metallic = 0.14;
    sharedStemMaterial.roughness = 0.42;
    sharedStemMaterial.environmentIntensity = 0.56;

    const sharedHousingMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedHousingMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedHousingMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedHousingMaterial.emissiveIntensity = 0.26;
    sharedHousingMaterial.metallic = 0.9;
    sharedHousingMaterial.roughness = 0.22;

    const sharedCoreMaterial = new PBRMaterial('V14_WarmBasinPractical', scene);
    sharedCoreMaterial.albedoColor.set(0.9, 0.72, 0.42);
    sharedCoreMaterial.emissiveColor.set(1, 0.72, 0.28);
    sharedCoreMaterial.emissiveIntensity = 1.1;
    sharedCoreMaterial.roughness = 0.18;

    const stemControl = MeshBuilder.CreateBox('TestBasinLanternStemControl', { size: 1 }, scene);
    stemControl.material = sharedStemMaterial;
    const leftStem = MeshBuilder.CreateBox('V33_BasinLanternStem_L', { size: 1 }, scene);
    leftStem.material = sharedStemMaterial;
    const rightStem = MeshBuilder.CreateBox('V33_BasinLanternStem_R', { size: 1 }, scene);
    rightStem.material = sharedStemMaterial;

    const housingControl = MeshBuilder.CreateBox('TestBasinLanternHousingControl', { size: 1 }, scene);
    housingControl.material = sharedHousingMaterial;
    const leftHousing = MeshBuilder.CreateBox('V33_BasinLanternHousing_L', { size: 1 }, scene);
    leftHousing.material = sharedHousingMaterial;
    const rightHousing = MeshBuilder.CreateBox('V33_BasinLanternHousing_R', { size: 1 }, scene);
    rightHousing.material = sharedHousingMaterial;

    const coreControl = MeshBuilder.CreateBox('TestBasinLanternCoreControl', { size: 1 }, scene);
    coreControl.material = sharedCoreMaterial;
    const leftCore = MeshBuilder.CreateBox('V33_BasinLanternCore_L', { size: 1 }, scene);
    leftCore.material = sharedCoreMaterial;
    const rightCore = MeshBuilder.CreateBox('V33_BasinLanternCore_R', { size: 1 }, scene);
    rightCore.material = sharedCoreMaterial;

    polishMainStageMaterials([
      stemControl,
      leftStem,
      rightStem,
      housingControl,
      leftHousing,
      rightHousing,
      coreControl,
      leftCore,
      rightCore,
    ]);

    expect(stemControl.material).toBe(sharedStemMaterial);
    expect(leftStem.material).toBeInstanceOf(PBRMaterial);
    expect(rightStem.material).toBe(leftStem.material);

    expect(housingControl.material).toBe(sharedHousingMaterial);
    expect(leftHousing.material).toBeInstanceOf(PBRMaterial);
    expect(rightHousing.material).toBe(leftHousing.material);

    expect(coreControl.material).toBe(sharedCoreMaterial);
    expect(leftCore.material).toBeInstanceOf(PBRMaterial);
    expect(rightCore.material).toBe(leftCore.material);

    const stemMaterial = leftStem.material as PBRMaterial;
    const housingMaterial = leftHousing.material as PBRMaterial;
    const coreMaterial = leftCore.material as PBRMaterial;

    expect(stemMaterial.name).toContain('basin-lantern-stem');
    expect(stemMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(stemMaterial.metadata?.mainStageMaterialOverride).toBe('basin-lantern-stem');
    expect(stemMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(stemMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(stemMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(stemMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(stemMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(stemMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);

    expect(housingMaterial.name).toContain('basin-lantern-housing');
    expect(housingMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(housingMaterial.metadata?.mainStageMaterialOverride).toBe('basin-lantern-housing');
    expect(housingMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(housingMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(housingMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(housingMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(housingMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(housingMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(housingMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(coreMaterial.name).toContain('basin-lantern-warm-core');
    expect(coreMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(coreMaterial.metadata?.mainStageMaterialOverride).toBe('basin-lantern-warm-core');
    expect(coreMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.7);
    expect(coreMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.48);
    expect(coreMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.18);
    expect(coreMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.55);
    expect(coreMaterial.roughness).toBeLessThanOrEqual(0.36);
    expect(coreMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.36);
  });

  it('rebalances the crowd clusters and wearable glows so the arrival lanes read as grounded silhouettes with subdued festival accents instead of flat black figures wrapped in hot cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCrowdMaterial = new PBRMaterial('V19_FestivalCrowdGraphite', scene);
    sharedCrowdMaterial.albedoColor.set(0.32, 0.34, 0.38);
    sharedCrowdMaterial.emissiveColor.set(0.04, 0.05, 0.06);
    sharedCrowdMaterial.emissiveIntensity = 0.12;
    sharedCrowdMaterial.metallic = 0.14;
    sharedCrowdMaterial.roughness = 0.42;
    sharedCrowdMaterial.environmentIntensity = 0.54;

    const sharedGlowMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedGlowMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedGlowMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedGlowMaterial.emissiveIntensity = 0.34;
    sharedGlowMaterial.alpha = 1;
    sharedGlowMaterial.environmentIntensity = 0.82;

    const crowdControl = MeshBuilder.CreateBox('TestCrowdClusterControl', { size: 1 }, scene);
    crowdControl.material = sharedCrowdMaterial;
    const leftNear = MeshBuilder.CreateBox('V32_CrowdCluster_L_Near', { size: 1 }, scene);
    leftNear.material = sharedCrowdMaterial;
    const rightNear = MeshBuilder.CreateBox('V32_CrowdCluster_R_Near', { size: 1 }, scene);
    rightNear.material = sharedCrowdMaterial;
    const leftMid = MeshBuilder.CreateBox('V32_CrowdCluster_L_Mid', { size: 1 }, scene);
    leftMid.material = sharedCrowdMaterial;
    const rightMid = MeshBuilder.CreateBox('V32_CrowdCluster_R_Mid', { size: 1 }, scene);
    rightMid.material = sharedCrowdMaterial;

    const glowControl = MeshBuilder.CreateBox('TestCrowdWearableGlowControl', { size: 1 }, scene);
    glowControl.material = sharedGlowMaterial;
    const glowLeftNear = MeshBuilder.CreateBox('V32_CrowdWearableGlow_L_Near', { size: 1 }, scene);
    glowLeftNear.material = sharedGlowMaterial;
    const glowRightNear = MeshBuilder.CreateBox('V32_CrowdWearableGlow_R_Near', { size: 1 }, scene);
    glowRightNear.material = sharedGlowMaterial;
    const glowLeftMid = MeshBuilder.CreateBox('V32_CrowdWearableGlow_L_Mid', { size: 1 }, scene);
    glowLeftMid.material = sharedGlowMaterial;
    const glowRightMid = MeshBuilder.CreateBox('V32_CrowdWearableGlow_R_Mid', { size: 1 }, scene);
    glowRightMid.material = sharedGlowMaterial;

    polishMainStageMaterials([
      crowdControl,
      leftNear,
      rightNear,
      leftMid,
      rightMid,
      glowControl,
      glowLeftNear,
      glowRightNear,
      glowLeftMid,
      glowRightMid,
    ]);

    expect(crowdControl.material).toBe(sharedCrowdMaterial);
    expect(leftNear.material).toBeInstanceOf(PBRMaterial);
    expect(rightNear.material).toBe(leftNear.material);
    expect(leftMid.material).toBe(leftNear.material);
    expect(rightMid.material).toBe(leftNear.material);

    expect(glowControl.material).toBe(sharedGlowMaterial);
    expect(glowLeftNear.material).toBeInstanceOf(PBRMaterial);
    expect(glowRightNear.material).toBe(glowLeftNear.material);
    expect(glowLeftMid.material).toBe(glowLeftNear.material);
    expect(glowRightMid.material).toBe(glowLeftNear.material);

    const crowdMaterial = leftNear.material as PBRMaterial;
    const glowMaterial = glowLeftNear.material as PBRMaterial;

    expect(crowdMaterial.name).toContain('crowd-cluster-graphite');
    expect(crowdMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(crowdMaterial.metadata?.mainStageMaterialOverride).toBe('crowd-cluster-graphite');
    expect(crowdMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(crowdMaterial.albedoColor.g).toBeLessThanOrEqual(0.22);
    expect(crowdMaterial.albedoColor.b).toBeLessThanOrEqual(0.26);
    expect(crowdMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(crowdMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(crowdMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(crowdMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);

    expect(glowMaterial.name).toContain('crowd-wearable-glow');
    expect(glowMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(glowMaterial.metadata?.mainStageMaterialOverride).toBe('crowd-wearable-glow');
    expect(glowMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(glowMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(glowMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(glowMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(glowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(glowMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(glowMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(glowMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the crown moving-light cables, housings, and cyan lenses so the upper rig reads as practical show hardware instead of black proxy drops with hot cyan bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V16_MatteBlackStageHardware', scene);
    sharedBlackMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedBlackMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.14;
    sharedBlackMaterial.roughness = 0.42;
    sharedBlackMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V16_CyanLensGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const blackControl = MeshBuilder.CreateBox('TestCrownLightBlackControl', { size: 1 }, scene);
    blackControl.material = sharedBlackMaterial;

    const drops = MeshBuilder.CreateBox('V46_CrownLightDropCableCluster', { size: 1 }, scene);
    drops.material = sharedBlackMaterial;

    const housings = MeshBuilder.CreateBox('V46_CrownMovingLightHousingCluster', { size: 1 }, scene);
    housings.material = sharedBlackMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCrownLightCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const lenses = MeshBuilder.CreateBox('V46_CrownCyanLensCluster', { size: 1 }, scene);
    lenses.material = sharedCyanMaterial;

    polishMainStageMaterials([blackControl, drops, housings, cyanControl, lenses]);

    expect(blackControl.material).toBe(sharedBlackMaterial);
    expect(drops.material).toBeInstanceOf(PBRMaterial);
    expect(housings.material).toBe(drops.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(lenses.material).toBeInstanceOf(PBRMaterial);

    const hardwareMaterial = drops.material as PBRMaterial;
    const lensMaterial = lenses.material as PBRMaterial;

    expect(hardwareMaterial.name).toContain('crown-moving-light-hardware');
    expect(hardwareMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(hardwareMaterial.metadata?.mainStageMaterialOverride).toBe('crown-moving-light-hardware');
    expect(hardwareMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(hardwareMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(hardwareMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(hardwareMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(hardwareMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(hardwareMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(lensMaterial.name).toContain('crown-moving-light-lens');
    expect(lensMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(lensMaterial.metadata?.mainStageMaterialOverride).toBe('crown-moving-light-lens');
    expect(lensMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(lensMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(lensMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(lensMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(lensMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(lensMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(lensMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(lensMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the crown gold lattice braces so the skyline rig reads as structural gilded lattice instead of bright gold X sticks', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V16_BrushedProductionGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const goldControl = MeshBuilder.CreateBox('TestCrownGoldLatticeControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const braceA = MeshBuilder.CreateBox('V47_CrownGoldLatticeBraceA', { size: 1 }, scene);
    braceA.material = sharedGoldMaterial;

    const braceB = MeshBuilder.CreateBox('V47_CrownGoldLatticeBraceB', { size: 1 }, scene);
    braceB.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, braceA, braceB]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(braceA.material).toBeInstanceOf(PBRMaterial);
    expect(braceB.material).toBe(braceA.material);

    const latticeMaterial = braceA.material as PBRMaterial;
    expect(latticeMaterial.name).toContain('crown-gold-lattice');
    expect(latticeMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(latticeMaterial.metadata?.mainStageMaterialOverride).toBe('crown-gold-lattice');
    expect(latticeMaterial.albedoColor.r).toBeLessThanOrEqual(0.18);
    expect(latticeMaterial.albedoColor.g).toBeLessThanOrEqual(0.14);
    expect(latticeMaterial.albedoColor.b).toBeLessThanOrEqual(0.07);
    expect(latticeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(latticeMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(latticeMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(latticeMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);
  });

  it('rebalances the foreground barricade frames and gold rails so the entry flanks read as authored ceremonial barriers instead of flat black strips capped with bright foil', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedFrameMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedFrameMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedFrameMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedFrameMaterial.emissiveIntensity = 0.12;
    sharedFrameMaterial.metallic = 0.14;
    sharedFrameMaterial.roughness = 0.42;
    sharedFrameMaterial.environmentIntensity = 0.56;

    const sharedRailMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedRailMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedRailMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedRailMaterial.emissiveIntensity = 0.16;
    sharedRailMaterial.metallic = 0.78;
    sharedRailMaterial.roughness = 0.24;

    const frameControl = MeshBuilder.CreateBox('TestForegroundBarricadeFrameControl', { size: 1 }, scene);
    frameControl.material = sharedFrameMaterial;
    const leftFrame = MeshBuilder.CreateBox('V36_ForegroundBarricadeFrame_L', { size: 1 }, scene);
    leftFrame.material = sharedFrameMaterial;
    const rightFrame = MeshBuilder.CreateBox('V36_ForegroundBarricadeFrame_R', { size: 1 }, scene);
    rightFrame.material = sharedFrameMaterial;

    const railControl = MeshBuilder.CreateBox('TestForegroundBarricadeRailControl', { size: 1 }, scene);
    railControl.material = sharedRailMaterial;
    const leftRail = MeshBuilder.CreateBox('V36_ForegroundBarricadeGoldRail_L', { size: 1 }, scene);
    leftRail.material = sharedRailMaterial;
    const rightRail = MeshBuilder.CreateBox('V36_ForegroundBarricadeGoldRail_R', { size: 1 }, scene);
    rightRail.material = sharedRailMaterial;

    polishMainStageMaterials([frameControl, leftFrame, rightFrame, railControl, leftRail, rightRail]);

    expect(frameControl.material).toBe(sharedFrameMaterial);
    expect(leftFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBe(leftFrame.material);

    expect(railControl.material).toBe(sharedRailMaterial);
    expect(leftRail.material).toBeInstanceOf(PBRMaterial);
    expect(rightRail.material).toBe(leftRail.material);

    const frameMaterial = leftFrame.material as PBRMaterial;
    const railMaterial = leftRail.material as PBRMaterial;

    expect(frameMaterial.name).toContain('foreground-barricade-frame');
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('foreground-barricade-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);

    expect(railMaterial.name).toContain('foreground-barricade-gold-rail');
    expect(railMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(railMaterial.metadata?.mainStageMaterialOverride).toBe('foreground-barricade-gold-rail');
    expect(railMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(railMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(railMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(railMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(railMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(railMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(railMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the V24 celestial crown front-arch and buttress assemblies so the hero crest reads as carved pearl shells with gilded structural ribbing instead of bright library stand-ins', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const pearlControl = MeshBuilder.CreateBox('TestV24PearlControl', { size: 1 }, scene);
    pearlControl.material = sharedPearlMaterial;
    const leftArch = MeshBuilder.CreateBox('V24_CelestialCrownFrontArch_L', { size: 1 }, scene);
    leftArch.material = sharedPearlMaterial;
    const leftButtress = MeshBuilder.CreateBox('V24_ProsceniumFlyingButtress_L', { size: 1 }, scene);
    leftButtress.material = sharedPearlMaterial;

    const goldControl = MeshBuilder.CreateBox('TestV24GoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;
    const leftReveal = MeshBuilder.CreateBox('V24_CelestialCrownGoldReveal_L', { size: 1 }, scene);
    leftReveal.material = sharedGoldMaterial;
    const rib0 = MeshBuilder.CreateBox('V24_CrownSpireDepthRib_0', { size: 1 }, scene);
    rib0.material = sharedGoldMaterial;
    const leftButtressReveal = MeshBuilder.CreateBox('V24_ProsceniumButtressGoldReveal_L', { size: 1 }, scene);
    leftButtressReveal.material = sharedGoldMaterial;

    polishMainStageMaterials([
      pearlControl,
      leftArch,
      leftButtress,
      goldControl,
      leftReveal,
      rib0,
      leftButtressReveal,
    ]);

    expect(pearlControl.material).toBe(sharedPearlMaterial);
    expect(leftArch.material).toBeInstanceOf(PBRMaterial);
    expect(leftButtress.material).toBe(leftArch.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rib0.material).toBe(leftReveal.material);
    expect(leftButtressReveal.material).toBe(leftReveal.material);

    const pearlMaterial = leftArch.material as PBRMaterial;
    const goldMaterial = leftReveal.material as PBRMaterial;

    expect(pearlMaterial.name).toContain('v24-crown-pearl-shell');
    expect(pearlMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pearlMaterial.metadata?.mainStageMaterialOverride).toBe('v24-crown-pearl-shell');
    expect(pearlMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(pearlMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(pearlMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(pearlMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pearlMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(pearlMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);

    expect(goldMaterial.name).toContain('v24-crown-gold-reveal');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('v24-crown-gold-reveal');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the center-screen mullion and cyan-edge arrays so the hero wall crown reads as framed depth instead of bright gold slats wrapped around cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.8, 0.68, 0.28);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.24;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestCenterScreenMullionGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const mullion = MeshBuilder.CreateBox('V115_CenterScreenMullionArray', { size: 1 }, scene);
    mullion.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCenterScreenCyanEdgeControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const cyanEdge = MeshBuilder.CreateBox('V115_CenterScreenCyanEdgeArray', { size: 1 }, scene);
    cyanEdge.material = sharedCyanMaterial;

    polishMainStageMaterials([goldControl, mullion, cyanControl, cyanEdge]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(mullion.material).toBeInstanceOf(PBRMaterial);
    expect(cyanEdge.material).toBeInstanceOf(PBRMaterial);

    const mullionMaterial = mullion.material as PBRMaterial;
    const cyanMaterial = cyanEdge.material as PBRMaterial;

    expect(mullionMaterial.name).toContain('center-screen-mullion');
    expect(mullionMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(mullionMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-mullion');
    expect(mullionMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(mullionMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(mullionMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(mullionMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(mullionMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(mullionMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(mullionMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(cyanMaterial.name).toContain('center-screen-cyan-edge');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-cyan-edge');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the stage-front portal apron and shoulder relief shells so the spawn reveal does not collapse into giant white pearl slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the processional stair nosing, route gold edges, and wet center inlay so the spawn approach reads as carved ceremonial paving instead of bright gold rails around a flat glossy strip', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V15_EngineeredGoldAnchors', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.74, 0.4);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.22;

    const sharedWetMaterial = new PBRMaterial('V15_WetPlazaInlay', scene);
    sharedWetMaterial.albedoColor.set(0.18, 0.26, 0.32);
    sharedWetMaterial.emissiveColor.set(0.03, 0.06, 0.08);
    sharedWetMaterial.emissiveIntensity = 0.14;
    sharedWetMaterial.alpha = 1;
    sharedWetMaterial.metallic = 0.06;
    sharedWetMaterial.roughness = 0.2;
    sharedWetMaterial.environmentIntensity = 0.78;

    const goldControl = MeshBuilder.CreateBox('TestProcessionalGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const stairNosing = MeshBuilder.CreateBox('V123_CentralStairGoldNosingArray', { size: 1 }, scene);
    stairNosing.material = sharedGoldMaterial;

    const routeGoldL = MeshBuilder.CreateBox('V123_SpawnRouteGoldEdgeArray_L', { size: 1 }, scene);
    routeGoldL.material = sharedGoldMaterial;

    const routeGoldR = MeshBuilder.CreateBox('V123_SpawnRouteGoldEdgeArray_R', { size: 1 }, scene);
    routeGoldR.material = sharedGoldMaterial;

    const wetControl = MeshBuilder.CreateBox('TestProcessionalWetInlayControl', { size: 1 }, scene);
    wetControl.material = sharedWetMaterial;

    const wetInlay = MeshBuilder.CreateBox('V123_SpawnRouteWetCenterInlayArray', { size: 1 }, scene);
    wetInlay.material = sharedWetMaterial;

    polishMainStageMaterials([goldControl, stairNosing, routeGoldL, routeGoldR, wetControl, wetInlay]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(stairNosing.material).toBeInstanceOf(PBRMaterial);
    expect(routeGoldL.material).toBeInstanceOf(PBRMaterial);
    expect(routeGoldR.material).toBeInstanceOf(PBRMaterial);
    expect(routeGoldL.material).toBe(stairNosing.material);
    expect(routeGoldR.material).toBe(stairNosing.material);

    expect(wetControl.material).toBe(sharedWetMaterial);
    expect(wetInlay.material).toBeInstanceOf(PBRMaterial);

    const goldMaterial = stairNosing.material as PBRMaterial;
    const wetMaterial = wetInlay.material as PBRMaterial;

    expect(goldMaterial.name).toContain('processional-route-gold-trim');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('processional-route-gold-trim');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(wetMaterial.name).toContain('spawn-route-wet-center-inlay');
    expect(wetMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(wetMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-route-wet-center-inlay');
    expect(wetMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(wetMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(wetMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(wetMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.06);
    expect(wetMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.6);
    expect(wetMaterial.roughness).toBeLessThanOrEqual(0.3);
    expect(wetMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.8);
  });

  it('rebalances the crowd-control frame and rail arrays so the spawn-lane barriers read as authored ceremonial hardware instead of glossy black cages with bright gold bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedFrameMaterial = new PBRMaterial('V13_BlackStageRigging', scene);
    sharedFrameMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedFrameMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedFrameMaterial.emissiveIntensity = 0.12;
    sharedFrameMaterial.metallic = 0.14;
    sharedFrameMaterial.roughness = 0.42;
    sharedFrameMaterial.environmentIntensity = 0.56;

    const sharedRailMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedRailMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedRailMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedRailMaterial.emissiveIntensity = 0.16;
    sharedRailMaterial.metallic = 0.78;
    sharedRailMaterial.roughness = 0.24;

    const frameControl = MeshBuilder.CreateBox('TestCrowdControlFrameControl', { size: 1 }, scene);
    frameControl.material = sharedFrameMaterial;

    const leftFrame = MeshBuilder.CreateBox('V124_CrowdControlFrameArray_L', { size: 1 }, scene);
    leftFrame.material = sharedFrameMaterial;

    const rightFrame = MeshBuilder.CreateBox('V124_CrowdControlFrameArray_R', { size: 1 }, scene);
    rightFrame.material = sharedFrameMaterial;

    const railControl = MeshBuilder.CreateBox('TestCrowdControlRailControl', { size: 1 }, scene);
    railControl.material = sharedRailMaterial;

    const leftRail = MeshBuilder.CreateBox('V124_CrowdControlRailArray_L', { size: 1 }, scene);
    leftRail.material = sharedRailMaterial;

    const rightRail = MeshBuilder.CreateBox('V124_CrowdControlRailArray_R', { size: 1 }, scene);
    rightRail.material = sharedRailMaterial;

    polishMainStageMaterials([frameControl, leftFrame, rightFrame, railControl, leftRail, rightRail]);

    expect(frameControl.material).toBe(sharedFrameMaterial);
    expect(leftFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBe(leftFrame.material);

    expect(railControl.material).toBe(sharedRailMaterial);
    expect(leftRail.material).toBeInstanceOf(PBRMaterial);
    expect(rightRail.material).toBe(leftRail.material);

    const frameMaterial = leftFrame.material as PBRMaterial;
    const railMaterial = leftRail.material as PBRMaterial;

    expect(frameMaterial.name).toContain('crowd-control-frame');
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('crowd-control-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);

    expect(railMaterial.name).toContain('crowd-control-rail');
    expect(railMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(railMaterial.metadata?.mainStageMaterialOverride).toBe('crowd-control-rail');
    expect(railMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(railMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(railMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(railMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(railMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(railMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(railMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the crowd-barrier base and rail arrays so the route-edge barriers read as grounded ceremonial hardware instead of low black slabs capped with bright gold ribbons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBaseMaterial = new PBRMaterial('V9_BlackRigging', scene);
    sharedBaseMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedBaseMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedBaseMaterial.emissiveIntensity = 0.12;
    sharedBaseMaterial.metallic = 0.14;
    sharedBaseMaterial.roughness = 0.42;
    sharedBaseMaterial.environmentIntensity = 0.56;

    const sharedRailMaterial = new PBRMaterial('V9_CrownFiligreeGold', scene);
    sharedRailMaterial.albedoColor.set(0.82, 0.72, 0.38);
    sharedRailMaterial.emissiveColor.set(0.1, 0.07, 0.02);
    sharedRailMaterial.emissiveIntensity = 0.18;
    sharedRailMaterial.metallic = 0.82;
    sharedRailMaterial.roughness = 0.22;

    const baseControl = MeshBuilder.CreateBox('TestCrowdBarrierBaseControl', { size: 1 }, scene);
    baseControl.material = sharedBaseMaterial;

    const leftBase = MeshBuilder.CreateBox('V125_CrowdBarrierBaseArray_L', { size: 1 }, scene);
    leftBase.material = sharedBaseMaterial;

    const rightBase = MeshBuilder.CreateBox('V125_CrowdBarrierBaseArray_R', { size: 1 }, scene);
    rightBase.material = sharedBaseMaterial;

    const railControl = MeshBuilder.CreateBox('TestCrowdBarrierRailControl', { size: 1 }, scene);
    railControl.material = sharedRailMaterial;

    const leftRail = MeshBuilder.CreateBox('V125_CrowdBarrierRailArray_L', { size: 1 }, scene);
    leftRail.material = sharedRailMaterial;

    const rightRail = MeshBuilder.CreateBox('V125_CrowdBarrierRailArray_R', { size: 1 }, scene);
    rightRail.material = sharedRailMaterial;

    polishMainStageMaterials([baseControl, leftBase, rightBase, railControl, leftRail, rightRail]);

    expect(baseControl.material).toBe(sharedBaseMaterial);
    expect(leftBase.material).toBeInstanceOf(PBRMaterial);
    expect(rightBase.material).toBe(leftBase.material);

    expect(railControl.material).toBe(sharedRailMaterial);
    expect(leftRail.material).toBeInstanceOf(PBRMaterial);
    expect(rightRail.material).toBe(leftRail.material);

    const baseMaterial = leftBase.material as PBRMaterial;
    const railMaterial = leftRail.material as PBRMaterial;

    expect(baseMaterial.name).toContain('crowd-barrier-base');
    expect(baseMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(baseMaterial.metadata?.mainStageMaterialOverride).toBe('crowd-barrier-base');
    expect(baseMaterial.albedoColor.r).toBeLessThanOrEqual(0.18);
    expect(baseMaterial.albedoColor.g).toBeLessThanOrEqual(0.22);
    expect(baseMaterial.albedoColor.b).toBeLessThanOrEqual(0.26);
    expect(baseMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(baseMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(baseMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(railMaterial.name).toContain('crowd-barrier-rail');
    expect(railMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(railMaterial.metadata?.mainStageMaterialOverride).toBe('crowd-barrier-rail');
    expect(railMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(railMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(railMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(railMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(railMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(railMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(railMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the spawn cable trough shells, collars, and wet insets so the route approach reads as authored service paving instead of black proxy boxes capped with bright gold trim and flat glossy strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShellMaterial = new PBRMaterial('V15_MatteProductionBlack', scene);
    sharedShellMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedShellMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShellMaterial.emissiveIntensity = 0.12;
    sharedShellMaterial.metallic = 0.14;
    sharedShellMaterial.roughness = 0.42;
    sharedShellMaterial.environmentIntensity = 0.56;

    const sharedGoldMaterial = new PBRMaterial('V15_EngineeredGoldAnchors', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.74, 0.4);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.22;

    const sharedWetMaterial = new PBRMaterial('V15_WetPlazaInlay', scene);
    sharedWetMaterial.albedoColor.set(0.18, 0.26, 0.32);
    sharedWetMaterial.emissiveColor.set(0.03, 0.06, 0.08);
    sharedWetMaterial.emissiveIntensity = 0.14;
    sharedWetMaterial.alpha = 1;
    sharedWetMaterial.metallic = 0.06;
    sharedWetMaterial.roughness = 0.2;
    sharedWetMaterial.environmentIntensity = 0.78;

    const shellControl = MeshBuilder.CreateBox('TestSpawnCableTroughShellControl', { size: 1 }, scene);
    shellControl.material = sharedShellMaterial;

    const shell = MeshBuilder.CreateBox('V48_SpawnCableTroughBlackShell', { size: 1 }, scene);
    shell.material = sharedShellMaterial;

    const goldControl = MeshBuilder.CreateBox('TestSpawnCableTroughGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const collar = MeshBuilder.CreateBox('V48_SpawnCableTroughGoldCollar', { size: 1 }, scene);
    collar.material = sharedGoldMaterial;

    const wetControl = MeshBuilder.CreateBox('TestSpawnCableTroughWetControl', { size: 1 }, scene);
    wetControl.material = sharedWetMaterial;

    const inset = MeshBuilder.CreateBox('V48_SpawnCableTroughWetInset', { size: 1 }, scene);
    inset.material = sharedWetMaterial;

    polishMainStageMaterials([shellControl, shell, goldControl, collar, wetControl, inset]);

    expect(shellControl.material).toBe(sharedShellMaterial);
    expect(shell.material).toBeInstanceOf(PBRMaterial);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(collar.material).toBeInstanceOf(PBRMaterial);

    expect(wetControl.material).toBe(sharedWetMaterial);
    expect(inset.material).toBeInstanceOf(PBRMaterial);

    const shellMaterial = shell.material as PBRMaterial;
    const collarMaterial = collar.material as PBRMaterial;
    const insetMaterial = inset.material as PBRMaterial;

    expect(shellMaterial.name).toContain('spawn-cable-trough-shell');
    expect(shellMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shellMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-cable-trough-shell');
    expect(shellMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(shellMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(shellMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(shellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shellMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(shellMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(collarMaterial.name).toContain('spawn-cable-trough-collar');
    expect(collarMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(collarMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-cable-trough-collar');
    expect(collarMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(collarMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(collarMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(collarMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(collarMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(collarMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(collarMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(insetMaterial.name).toContain('spawn-cable-trough-wet-inset');
    expect(insetMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(insetMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-cable-trough-wet-inset');
    expect(insetMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(insetMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(insetMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(insetMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.06);
    expect(insetMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.6);
    expect(insetMaterial.roughness).toBeLessThanOrEqual(0.3);
    expect(insetMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.8);
  });

  it('rebalances the screen service catwalk frame, guardrail, cable loom, and practicals so the hero-screen service band reads as integrated production hardware instead of bright gold rails over flat black bars with hot cyan bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V16_MatteBlackStageHardware', scene);
    sharedBlackMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedBlackMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.14;
    sharedBlackMaterial.roughness = 0.42;
    sharedBlackMaterial.environmentIntensity = 0.56;

    const sharedGoldMaterial = new PBRMaterial('V16_BrushedProductionGold', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.74, 0.4);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.22;

    const sharedCyanMaterial = new PBRMaterial('V16_CyanLensGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const blackControl = MeshBuilder.CreateBox('TestScreenServiceCatwalkBlackControl', { size: 1 }, scene);
    blackControl.material = sharedBlackMaterial;

    const frame = MeshBuilder.CreateBox('V49_ScreenServiceCatwalkBlackFrame', { size: 1 }, scene);
    frame.material = sharedBlackMaterial;

    const loom = MeshBuilder.CreateBox('V49_ScreenServiceCatwalkCableLoom', { size: 1 }, scene);
    loom.material = sharedBlackMaterial;

    const goldControl = MeshBuilder.CreateBox('TestScreenServiceCatwalkGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const guardrail = MeshBuilder.CreateBox('V49_ScreenServiceCatwalkGoldGuardrail', { size: 1 }, scene);
    guardrail.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestScreenServiceCatwalkCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const practicals = MeshBuilder.CreateBox('V49_ScreenServiceCatwalkCyanPracticals', { size: 1 }, scene);
    practicals.material = sharedCyanMaterial;

    polishMainStageMaterials([
      blackControl,
      frame,
      loom,
      goldControl,
      guardrail,
      cyanControl,
      practicals,
    ]);

    expect(blackControl.material).toBe(sharedBlackMaterial);
    expect(frame.material).toBeInstanceOf(PBRMaterial);
    expect(loom.material).toBe(frame.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(guardrail.material).toBeInstanceOf(PBRMaterial);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(practicals.material).toBeInstanceOf(PBRMaterial);

    const frameMaterial = frame.material as PBRMaterial;
    const guardrailMaterial = guardrail.material as PBRMaterial;
    const practicalMaterial = practicals.material as PBRMaterial;

    expect(frameMaterial.name).toContain('screen-service-catwalk-frame');
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('screen-service-catwalk-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(guardrailMaterial.name).toContain('screen-service-catwalk-guardrail');
    expect(guardrailMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(guardrailMaterial.metadata?.mainStageMaterialOverride).toBe('screen-service-catwalk-guardrail');
    expect(guardrailMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(guardrailMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(guardrailMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(guardrailMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(guardrailMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(guardrailMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(guardrailMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(practicalMaterial.name).toContain('screen-service-catwalk-practicals');
    expect(practicalMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(practicalMaterial.metadata?.mainStageMaterialOverride).toBe('screen-service-catwalk-practicals');
    expect(practicalMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(practicalMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(practicalMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(practicalMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(practicalMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(practicalMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(practicalMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(practicalMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the back-plaza lantern clusters so the arrival frame reads as grounded night practicals instead of bright gold cages around hot flat bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStemMaterial = new PBRMaterial('V16_MatteBlackStageHardware', scene);
    sharedStemMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedStemMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedStemMaterial.emissiveIntensity = 0.12;
    sharedStemMaterial.metallic = 0.14;
    sharedStemMaterial.roughness = 0.42;
    sharedStemMaterial.environmentIntensity = 0.56;

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.72, 0.38);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.22;

    const sharedCoreMaterial = new PBRMaterial('V13_WarmPracticalLight', scene);
    sharedCoreMaterial.albedoColor.set(0.9, 0.72, 0.42);
    sharedCoreMaterial.emissiveColor.set(1, 0.72, 0.28);
    sharedCoreMaterial.emissiveIntensity = 1.1;
    sharedCoreMaterial.roughness = 0.18;

    const stemControl = MeshBuilder.CreateBox('TestBackPlazaLanternStemControl', { size: 1 }, scene);
    stemControl.material = sharedStemMaterial;

    const leftStem = MeshBuilder.CreateBox('V59_BackPlazaLanternStemCluster_L', { size: 1 }, scene);
    leftStem.material = sharedStemMaterial;

    const rightStem = MeshBuilder.CreateBox('V59_BackPlazaLanternStemCluster_R', { size: 1 }, scene);
    rightStem.material = sharedStemMaterial;

    const goldControl = MeshBuilder.CreateBox('TestBackPlazaLanternGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftCage = MeshBuilder.CreateBox('V59_BackPlazaLanternGoldCage_L', { size: 1 }, scene);
    leftCage.material = sharedGoldMaterial;

    const rightCage = MeshBuilder.CreateBox('V59_BackPlazaLanternGoldCage_R', { size: 1 }, scene);
    rightCage.material = sharedGoldMaterial;

    const leftHalo = MeshBuilder.CreateBox('V59_BackPlazaLanternHaloRim_L', { size: 1 }, scene);
    leftHalo.material = sharedGoldMaterial;

    const rightHalo = MeshBuilder.CreateBox('V59_BackPlazaLanternHaloRim_R', { size: 1 }, scene);
    rightHalo.material = sharedGoldMaterial;

    const coreControl = MeshBuilder.CreateBox('TestBackPlazaLanternCoreControl', { size: 1 }, scene);
    coreControl.material = sharedCoreMaterial;

    const leftCore = MeshBuilder.CreateBox('V59_BackPlazaLanternWarmCore_L', { size: 1 }, scene);
    leftCore.material = sharedCoreMaterial;

    const rightCore = MeshBuilder.CreateBox('V59_BackPlazaLanternWarmCore_R', { size: 1 }, scene);
    rightCore.material = sharedCoreMaterial;

    polishMainStageMaterials([
      stemControl,
      leftStem,
      rightStem,
      goldControl,
      leftCage,
      rightCage,
      leftHalo,
      rightHalo,
      coreControl,
      leftCore,
      rightCore,
    ]);

    expect(stemControl.material).toBe(sharedStemMaterial);
    expect(leftStem.material).toBeInstanceOf(PBRMaterial);
    expect(rightStem.material).toBe(leftStem.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCage.material).toBeInstanceOf(PBRMaterial);
    expect(rightCage.material).toBe(leftCage.material);
    expect(leftHalo.material).toBeInstanceOf(PBRMaterial);
    expect(rightHalo.material).toBe(leftHalo.material);

    expect(coreControl.material).toBe(sharedCoreMaterial);
    expect(leftCore.material).toBeInstanceOf(PBRMaterial);
    expect(rightCore.material).toBe(leftCore.material);

    const stemMaterial = leftStem.material as PBRMaterial;
    const cageMaterial = leftCage.material as PBRMaterial;
    const haloMaterial = leftHalo.material as PBRMaterial;
    const coreMaterial = leftCore.material as PBRMaterial;

    expect(stemMaterial.name).toContain('back-plaza-lantern-stem');
    expect(stemMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(stemMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-lantern-stem');
    expect(stemMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(stemMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(stemMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(stemMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(stemMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(stemMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(cageMaterial.name).toContain('back-plaza-lantern-gold-cage');
    expect(cageMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(cageMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-lantern-gold-cage');
    expect(cageMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(cageMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(cageMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(cageMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(cageMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(cageMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(cageMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(haloMaterial.name).toContain('back-plaza-lantern-halo-rim');
    expect(haloMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(haloMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-lantern-halo-rim');
    expect(haloMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(haloMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(haloMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(haloMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(haloMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(haloMaterial.environmentIntensity).toBeLessThanOrEqual(0.24);

    expect(coreMaterial.name).toContain('back-plaza-lantern-warm-core');
    expect(coreMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(coreMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-lantern-warm-core');
    expect(coreMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.7);
    expect(coreMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.45);
    expect(coreMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.4);
    expect(coreMaterial.emissiveIntensity).toBeLessThanOrEqual(0.9);
    expect(coreMaterial.roughness).toBeLessThanOrEqual(0.4);
    expect(coreMaterial.environmentIntensity).toBeLessThanOrEqual(0.5);
  });

  it('neutralizes the V87 wing-facade shadow frames so they do not inherit the bright cyan shadow texture read in the VIP terrace view', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const frame = MeshBuilder.CreateBox('V87_WingFacadeShadowFrameArray_L', { size: 1 }, scene);
    frame.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, frame]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(frame.material).toBeInstanceOf(PBRMaterial);
    expect(frame.material).not.toBe(sharedShadowMaterial);

    const frameMaterial = frame.material as PBRMaterial;
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-shadow-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.19);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.23);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);
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
    expect(vaultMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(vaultMaterial.albedoColor.g).toBeLessThanOrEqual(0.19);
    expect(vaultMaterial.albedoColor.b).toBeLessThanOrEqual(0.23);
    expect(vaultMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(vaultMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(vaultMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);
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

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('smokes the side led tile fields so the basin-edge and VIP terrace views keep the side screens as dim scenic reflections instead of broad cyan slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedLedMaterial = new PBRMaterial('V14_CosmicScreenEmission', scene);
    sharedLedMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedLedMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedLedMaterial.emissiveIntensity = 0.34;
    sharedLedMaterial.alpha = 1;
    sharedLedMaterial.environmentIntensity = 0.82;

    const centerLed = MeshBuilder.CreateBox('V31_CenterLedTileField', { size: 1 }, scene);
    centerLed.material = sharedLedMaterial;

    const leftLed = MeshBuilder.CreateBox('V31_SideLedTileField_L', { size: 1 }, scene);
    leftLed.material = sharedLedMaterial;

    const rightLed = MeshBuilder.CreateBox('V31_SideLedTileField_R', { size: 1 }, scene);
    rightLed.material = sharedLedMaterial;

    polishMainStageMaterials([centerLed, leftLed, rightLed]);

    expect(centerLed.material).toBe(sharedLedMaterial);
    expect(leftLed.material).toBeInstanceOf(PBRMaterial);
    expect(rightLed.material).toBe(leftLed.material);

    const sideLedMaterial = leftLed.material as PBRMaterial;
    expect(sideLedMaterial.name).toContain('side-led-tile-field');
    expect(sideLedMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(sideLedMaterial.metadata?.mainStageMaterialOverride).toBe('side-led-tile-field');
    expect(sideLedMaterial.albedoColor.r).toBeLessThanOrEqual(0.05);
    expect(sideLedMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(sideLedMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(sideLedMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(sideLedMaterial.alpha).toBeLessThanOrEqual(0.14);
    expect(sideLedMaterial.roughness).toBeGreaterThanOrEqual(0.2);
    expect(sideLedMaterial.environmentIntensity).toBeLessThanOrEqual(0.08);
    expect(sideLedMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
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

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
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

  it('darkens the outer wing buttress shells so the side skyline reads as carved depth instead of bright pearl fins', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.72, 0.6);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.18;
    sharedPearlMaterial.roughness = 0.36;

    const controlPearl = MeshBuilder.CreateBox('V16_ArchitecturalPearlControl', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const leftButtress = MeshBuilder.CreateBox('V107_OuterWingButtressArray_L', { size: 1 }, scene);
    leftButtress.material = sharedPearlMaterial;

    const rightButtress = MeshBuilder.CreateBox('V107_OuterWingButtressArray_R', { size: 1 }, scene);
    rightButtress.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, leftButtress, rightButtress]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(leftButtress.material).toBeInstanceOf(PBRMaterial);
    expect(rightButtress.material).toBeInstanceOf(PBRMaterial);
    expect(leftButtress.material).not.toBe(sharedPearlMaterial);
    expect(rightButtress.material).not.toBe(sharedPearlMaterial);
    expect(rightButtress.material).toBe(leftButtress.material);

    const buttressMaterial = leftButtress.material as PBRMaterial;
    expect(buttressMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(buttressMaterial.metadata?.mainStageMaterialOverride).toBe('outer-wing-buttress-shell');
    expect(buttressMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(buttressMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(buttressMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(buttressMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(buttressMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(buttressMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(buttressMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('tones down the wing-facade arch inlays so the terrace arches keep shadow depth instead of bright gold ribbons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V18_BrushedGoldTrim', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftInlay = MeshBuilder.CreateBox('V109_WingFacadeArchInlayArray_L', { size: 1 }, scene);
    leftInlay.material = sharedGoldMaterial;

    const rightInlay = MeshBuilder.CreateBox('V109_WingFacadeArchInlayArray_R', { size: 1 }, scene);
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
    expect(inlayMaterial.metadata?.mainStageMaterialOverride).toBe('wing-facade-arch-inlay');
    expect(inlayMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(inlayMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(inlayMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(inlayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(inlayMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(inlayMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(inlayMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('keeps the crown screen coffer smoky but readable so the basin-view hero wall reads as layered shadow architecture instead of a dead-black cap', () => {
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

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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
    expect(screenCofferMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.05);
    expect(screenCofferMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.07);
    expect(screenCofferMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.09);
    expect(screenCofferMaterial.albedoColor.r).toBeLessThanOrEqual(0.09);
    expect(screenCofferMaterial.albedoColor.g).toBeLessThanOrEqual(0.11);
    expect(screenCofferMaterial.albedoColor.b).toBeLessThanOrEqual(0.13);
    expect(screenCofferMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(screenCofferMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(screenCofferMaterial.roughness).toBeGreaterThanOrEqual(0.7);
    expect(screenCofferMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.2);
    expect(screenCofferMaterial.environmentIntensity).toBeLessThanOrEqual(0.26);

    expect(promenadeRunwayMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(promenadeRunwayMaterial.metadata?.mainStageMaterialOverride).toBe('promenade-pearl-runway');
    expect(promenadeRunwayMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(promenadeRunwayMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(promenadeRunwayMaterial.albedoColor.b).toBeLessThanOrEqual(0.22);
    expect(promenadeRunwayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(promenadeRunwayMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(promenadeRunwayMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);
  });

  it('darkens the promenade gold shoulders so the central route reads as embedded ceremonial metal instead of bright runway rails', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const promenadeShoulders = MeshBuilder.CreateBox('V70_PromenadeGoldShoulders', { size: 1 }, scene);
    promenadeShoulders.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, promenadeShoulders]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(promenadeShoulders.material).toBeInstanceOf(PBRMaterial);
    expect(promenadeShoulders.material).not.toBe(sharedGoldMaterial);

    const shoulderMaterial = promenadeShoulders.material as PBRMaterial;
    expect(shoulderMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(shoulderMaterial.metadata?.mainStageMaterialOverride).toBe('promenade-gold-shoulders');
    expect(shoulderMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(shoulderMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(shoulderMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(shoulderMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shoulderMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(shoulderMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(shoulderMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('smokes the promenade cyan spine so the central route reads as inset jewel glass instead of a bright runway stripe', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V7_AccentGlow', scene);
    sharedCyanGlass.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanGlass.emissiveIntensity = 0.34;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.environmentIntensity = 0.82;

    const controlGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlGlass.material = sharedCyanGlass;

    const promenadeSpine = MeshBuilder.CreateBox('V70_PromenadeCyanSpine', { size: 1 }, scene);
    promenadeSpine.material = sharedCyanGlass;

    polishMainStageMaterials([controlGlass, promenadeSpine]);

    expect(controlGlass.material).toBe(sharedCyanGlass);
    expect(promenadeSpine.material).toBeInstanceOf(PBRMaterial);
    expect(promenadeSpine.material).not.toBe(sharedCyanGlass);

    const spineMaterial = promenadeSpine.material as PBRMaterial;
    expect(spineMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(spineMaterial.metadata?.mainStageMaterialOverride).toBe('promenade-cyan-spine');
    expect(spineMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(spineMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(spineMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(spineMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(spineMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(spineMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(spineMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
  });

  it('darkens the promenade shadow keel so the central route keeps a grounded undercut instead of glowing cyan underneath the runway', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const promenadeKeel = MeshBuilder.CreateBox('V70_PromenadeShadowKeel', { size: 1 }, scene);
    promenadeKeel.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, promenadeKeel]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(promenadeKeel.material).toBeInstanceOf(PBRMaterial);
    expect(promenadeKeel.material).not.toBe(sharedShadowMaterial);

    const keelMaterial = promenadeKeel.material as PBRMaterial;
    expect(keelMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(keelMaterial.metadata?.mainStageMaterialOverride).toBe('promenade-shadow-keel');
    expect(keelMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(keelMaterial.albedoColor.g).toBeLessThanOrEqual(0.19);
    expect(keelMaterial.albedoColor.b).toBeLessThanOrEqual(0.23);
    expect(keelMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(keelMaterial.roughness).toBeGreaterThanOrEqual(0.82);
    expect(keelMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);
  });

  it('darkens the crown screen keystone so the crest reads as a recessed accent instead of a hot gold beacon over the coffer', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const keystone = MeshBuilder.CreateBox('V127_CrownScreenVerticalKeystone', { size: 1 }, scene);
    keystone.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, keystone]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(keystone.material).toBeInstanceOf(PBRMaterial);
    expect(keystone.material).not.toBe(sharedGoldMaterial);

    const keystoneMaterial = keystone.material as PBRMaterial;
    expect(keystoneMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(keystoneMaterial.metadata?.mainStageMaterialOverride).toBe('crown-screen-vertical-keystone');
    expect(keystoneMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(keystoneMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(keystoneMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(keystoneMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(keystoneMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(keystoneMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(keystoneMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(keystoneMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('rebalances the center-screen side pier clusters so the hero wall reads as framed depth instead of bright gold bars wrapped around cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedCyanMaterial = new PBRMaterial('V13_CelestialScreenGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const controlGold = MeshBuilder.CreateBox('TestCenterPierGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V78_CenterScreenSidePierGoldFrame_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V78_CenterScreenSidePierGoldFrame_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const controlCyan = MeshBuilder.CreateBox('TestCenterPierCyanControl', { size: 1 }, scene);
    controlCyan.material = sharedCyanMaterial;

    const leftCyan = MeshBuilder.CreateBox('V78_CenterScreenSidePierCyanCore_L', { size: 1 }, scene);
    leftCyan.material = sharedCyanMaterial;

    const rightCyan = MeshBuilder.CreateBox('V78_CenterScreenSidePierCyanCore_R', { size: 1 }, scene);
    rightCyan.material = sharedCyanMaterial;

    polishMainStageMaterials([controlGold, leftGold, rightGold, controlCyan, leftCyan, rightCyan]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(controlCyan.material).toBe(sharedCyanMaterial);
    expect(leftCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightCyan.material).toBe(leftCyan.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const cyanMaterial = leftCyan.material as PBRMaterial;

    expect(goldMaterial.name).toContain('center-screen-side-pier-gold-frame');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-side-pier-gold-frame');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(cyanMaterial.name).toContain('center-screen-side-pier-cyan-core');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-side-pier-cyan-core');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the center screen interrupt rails so the hero wall reads with layered depth instead of three bright gold bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.7, 0.44);
    sharedGoldMaterial.emissiveColor.set(0.09, 0.07, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.22;

    const otherGold = MeshBuilder.CreateBox('TestCenterScreenInterruptRailGoldControl', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const rails = MeshBuilder.CreateBox('V128_CenterScreenGoldInterruptRailArray', { size: 1 }, scene);
    rails.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, rails]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(rails.material).toBeInstanceOf(PBRMaterial);
    expect(rails.material).not.toBe(sharedGoldMaterial);

    const railMaterial = rails.material as PBRMaterial;
    expect(railMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(railMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-gold-interrupt-rail');
    expect(railMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(railMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(railMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(railMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(railMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(railMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(railMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(railMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('keeps the center screen shadow coffer array smoky but still readable so the hero wall frame reads as depth instead of a dead-black border', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V15_ShadowedInsetSeams', scene);
    sharedShadowMaterial.albedoColor.set(0.12, 0.12, 0.12);
    sharedShadowMaterial.emissiveColor.set(0, 0, 0);
    sharedShadowMaterial.emissiveIntensity = 0;
    sharedShadowMaterial.metallic = 0.24;
    sharedShadowMaterial.roughness = 0.42;

    const otherShadow = MeshBuilder.CreateBox('V88_WingScreenShadowFrame_L', { size: 1 }, scene);
    otherShadow.material = sharedShadowMaterial;

    const coffer = MeshBuilder.CreateBox('V130_CenterScreenShadowCofferArray', { size: 1 }, scene);
    coffer.material = sharedShadowMaterial;

    polishMainStageMaterials([otherShadow, coffer]);

    expect(otherShadow.material).toBe(sharedShadowMaterial);
    expect(coffer.material).toBeInstanceOf(PBRMaterial);
    expect(coffer.material).not.toBe(sharedShadowMaterial);

    const cofferMaterial = coffer.material as PBRMaterial;
    expect(cofferMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(cofferMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-shadow-coffer-array');
    expect(cofferMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.06);
    expect(cofferMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.08);
    expect(cofferMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.1);
    expect(cofferMaterial.albedoColor.r).toBeLessThanOrEqual(0.1);
    expect(cofferMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(cofferMaterial.albedoColor.b).toBeLessThanOrEqual(0.14);
    expect(cofferMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(cofferMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cofferMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(cofferMaterial.roughness).toBeGreaterThanOrEqual(0.7);
    expect(cofferMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.22);
    expect(cofferMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);
  });

  it('keeps the center screen depth baffles smoky but readable so the hero wall keeps layered shadow blades instead of dead-black slats', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedBlackMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedBlackMaterial.emissiveColor.set(0, 0, 0);
    sharedBlackMaterial.emissiveIntensity = 0;
    sharedBlackMaterial.metallic = 0.22;
    sharedBlackMaterial.roughness = 0.48;

    const otherRig = MeshBuilder.CreateBox('V24_CrownHaloBackplate', { size: 1 }, scene);
    otherRig.material = sharedBlackMaterial;

    const baffles = MeshBuilder.CreateBox('V129_CenterScreenDepthBaffleArray', { size: 1 }, scene);
    baffles.material = sharedBlackMaterial;

    polishMainStageMaterials([otherRig, baffles]);

    expect(otherRig.material).toBe(sharedBlackMaterial);
    expect(baffles.material).toBeInstanceOf(PBRMaterial);
    expect(baffles.material).not.toBe(sharedBlackMaterial);

    const baffleMaterial = baffles.material as PBRMaterial;
    expect(baffleMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(baffleMaterial.metadata?.mainStageMaterialOverride).toBe('center-screen-depth-baffle-array');
    expect(baffleMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.05);
    expect(baffleMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.07);
    expect(baffleMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.09);
    expect(baffleMaterial.albedoColor.r).toBeLessThanOrEqual(0.09);
    expect(baffleMaterial.albedoColor.g).toBeLessThanOrEqual(0.11);
    expect(baffleMaterial.albedoColor.b).toBeLessThanOrEqual(0.13);
    expect(baffleMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(baffleMaterial.emissiveIntensity).toBeLessThanOrEqual(0.09);
    expect(baffleMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(baffleMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(baffleMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.2);
    expect(baffleMaterial.environmentIntensity).toBeLessThanOrEqual(0.26);
  });

  it('darkens the wing screen depth baffles so the side screens keep carved shadow blades instead of glossy black ribs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedBlackMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedBlackMaterial.emissiveColor.set(0, 0, 0);
    sharedBlackMaterial.emissiveIntensity = 0;
    sharedBlackMaterial.metallic = 0.22;
    sharedBlackMaterial.roughness = 0.48;

    const otherRig = MeshBuilder.CreateBox('V24_CrownHaloBackplate', { size: 1 }, scene);
    otherRig.material = sharedBlackMaterial;

    const leftBaffles = MeshBuilder.CreateBox('V131_WingScreenDepthBaffleArray_L', { size: 1 }, scene);
    leftBaffles.material = sharedBlackMaterial;

    const rightBaffles = MeshBuilder.CreateBox('V131_WingScreenDepthBaffleArray_R', { size: 1 }, scene);
    rightBaffles.material = sharedBlackMaterial;

    polishMainStageMaterials([otherRig, leftBaffles, rightBaffles]);

    expect(otherRig.material).toBe(sharedBlackMaterial);
    expect(leftBaffles.material).toBeInstanceOf(PBRMaterial);
    expect(rightBaffles.material).toBeInstanceOf(PBRMaterial);
    expect(leftBaffles.material).not.toBe(sharedBlackMaterial);
    expect(rightBaffles.material).not.toBe(sharedBlackMaterial);
    expect(rightBaffles.material).toBe(leftBaffles.material);

    const baffleMaterial = leftBaffles.material as PBRMaterial;
    expect(baffleMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(baffleMaterial.metadata?.mainStageMaterialOverride).toBe('wing-screen-depth-baffle-array');
    expect(baffleMaterial.albedoColor.r).toBeLessThanOrEqual(0.05);
    expect(baffleMaterial.albedoColor.g).toBeLessThanOrEqual(0.07);
    expect(baffleMaterial.albedoColor.b).toBeLessThanOrEqual(0.09);
    expect(baffleMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(baffleMaterial.emissiveIntensity).toBeLessThanOrEqual(0.09);
    expect(baffleMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(baffleMaterial.roughness).toBeGreaterThanOrEqual(0.76);
    expect(baffleMaterial.environmentIntensity).toBeLessThanOrEqual(0.18);
  });

  it('darkens the wing screen shadow coffer arrays so the side-screen frames read as shadow pockets instead of glossy seam bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V15_ShadowedInsetSeams', scene);
    sharedShadowMaterial.albedoColor.set(0.12, 0.12, 0.12);
    sharedShadowMaterial.emissiveColor.set(0, 0, 0);
    sharedShadowMaterial.emissiveIntensity = 0;
    sharedShadowMaterial.metallic = 0.24;
    sharedShadowMaterial.roughness = 0.42;

    const otherShadow = MeshBuilder.CreateBox('V88_WingScreenShadowFrame_L', { size: 1 }, scene);
    otherShadow.material = sharedShadowMaterial;

    const leftCoffer = MeshBuilder.CreateBox('V132_WingScreenShadowCofferArray_L', { size: 1 }, scene);
    leftCoffer.material = sharedShadowMaterial;

    const rightCoffer = MeshBuilder.CreateBox('V132_WingScreenShadowCofferArray_R', { size: 1 }, scene);
    rightCoffer.material = sharedShadowMaterial;

    polishMainStageMaterials([otherShadow, leftCoffer, rightCoffer]);

    expect(otherShadow.material).toBe(sharedShadowMaterial);
    expect(leftCoffer.material).toBeInstanceOf(PBRMaterial);
    expect(rightCoffer.material).toBeInstanceOf(PBRMaterial);
    expect(leftCoffer.material).not.toBe(sharedShadowMaterial);
    expect(rightCoffer.material).not.toBe(sharedShadowMaterial);
    expect(rightCoffer.material).toBe(leftCoffer.material);

    const cofferMaterial = leftCoffer.material as PBRMaterial;
    expect(cofferMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(cofferMaterial.metadata?.mainStageMaterialOverride).toBe('wing-screen-shadow-coffer-array');
    expect(cofferMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(cofferMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(cofferMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(cofferMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(cofferMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cofferMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(cofferMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(cofferMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the repeated arc anchor crest clusters so the side silhouette reads as integrated support architecture instead of bright gold chips over flat shadow sockets', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V15_EngineeredGoldAnchors', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedShadowMaterial = new PBRMaterial('V15_MatteProductionBlack', scene);
    sharedShadowMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedShadowMaterial.emissiveColor.set(0, 0, 0);
    sharedShadowMaterial.emissiveIntensity = 0;
    sharedShadowMaterial.metallic = 0.22;
    sharedShadowMaterial.roughness = 0.48;

    const controlGold = MeshBuilder.CreateBox('TestArcAnchorGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V75_ArcAnchorGoldCluster_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V75_ArcAnchorGoldCluster_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const controlShadow = MeshBuilder.CreateBox('TestArcAnchorShadowControl', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V75_ArcAnchorShadowCluster_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V75_ArcAnchorShadowCluster_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    polishMainStageMaterials([controlGold, leftGold, rightGold, controlShadow, leftShadow, rightShadow]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;

    expect(goldMaterial.name).toContain('arc-anchor-gold-cluster');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('arc-anchor-gold-cluster');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(shadowMaterial.name).toContain('arc-anchor-shadow-cluster');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('arc-anchor-shadow-cluster');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the sweep anchor crown assemblies so the outer silhouette reads as integrated support architecture instead of bright gold collars wrapped around flat shadow plugs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.78, 0.7, 0.44);
    sharedGoldMaterial.emissiveColor.set(0.09, 0.07, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.8;
    sharedGoldMaterial.roughness = 0.22;

    const sharedShadowMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedShadowMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedShadowMaterial.emissiveColor.set(0, 0, 0);
    sharedShadowMaterial.emissiveIntensity = 0;
    sharedShadowMaterial.metallic = 0.22;
    sharedShadowMaterial.roughness = 0.48;

    const controlGold = MeshBuilder.CreateBox('TestSweepAnchorGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const outerLeftGold = MeshBuilder.CreateBox('V74_SweepOuterAnchorGoldCrown_L', { size: 1 }, scene);
    outerLeftGold.material = sharedGoldMaterial;

    const outerRightGold = MeshBuilder.CreateBox('V74_SweepOuterAnchorGoldCrown_R', { size: 1 }, scene);
    outerRightGold.material = sharedGoldMaterial;

    const innerLeftGold = MeshBuilder.CreateBox('V74_SweepInnerAnchorGoldCrown_L', { size: 1 }, scene);
    innerLeftGold.material = sharedGoldMaterial;

    const innerRightGold = MeshBuilder.CreateBox('V74_SweepInnerAnchorGoldCrown_R', { size: 1 }, scene);
    innerRightGold.material = sharedGoldMaterial;

    const controlShadow = MeshBuilder.CreateBox('TestSweepAnchorShadowControl', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const outerLeftShadow = MeshBuilder.CreateBox('V74_SweepOuterAnchorShadowCore_L', { size: 1 }, scene);
    outerLeftShadow.material = sharedShadowMaterial;

    const outerRightShadow = MeshBuilder.CreateBox('V74_SweepOuterAnchorShadowCore_R', { size: 1 }, scene);
    outerRightShadow.material = sharedShadowMaterial;

    const innerLeftShadow = MeshBuilder.CreateBox('V74_SweepInnerAnchorShadowCore_L', { size: 1 }, scene);
    innerLeftShadow.material = sharedShadowMaterial;

    const innerRightShadow = MeshBuilder.CreateBox('V74_SweepInnerAnchorShadowCore_R', { size: 1 }, scene);
    innerRightShadow.material = sharedShadowMaterial;

    polishMainStageMaterials([
      controlGold,
      outerLeftGold,
      outerRightGold,
      innerLeftGold,
      innerRightGold,
      controlShadow,
      outerLeftShadow,
      outerRightShadow,
      innerLeftShadow,
      innerRightShadow,
    ]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(outerLeftGold.material).toBeInstanceOf(PBRMaterial);
    expect(outerRightGold.material).toBe(outerLeftGold.material);
    expect(innerLeftGold.material).toBe(outerLeftGold.material);
    expect(innerRightGold.material).toBe(outerLeftGold.material);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(outerLeftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(outerRightShadow.material).toBe(outerLeftShadow.material);
    expect(innerLeftShadow.material).toBe(outerLeftShadow.material);
    expect(innerRightShadow.material).toBe(outerLeftShadow.material);

    const goldMaterial = outerLeftGold.material as PBRMaterial;
    const shadowMaterial = outerLeftShadow.material as PBRMaterial;

    expect(goldMaterial.name).toContain('sweep-anchor-gold-crown');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('sweep-anchor-gold-crown');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(shadowMaterial.name).toContain('sweep-anchor-shadow-core');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('sweep-anchor-shadow-core');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the hero-portal service door clusters so the side access reads as integrated architecture instead of bright gold trims around flat black leaves', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedFrameMaterial = new PBRMaterial('V16_BrushedProductionGold', scene);
    sharedFrameMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedFrameMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedFrameMaterial.emissiveIntensity = 0.16;
    sharedFrameMaterial.metallic = 0.78;
    sharedFrameMaterial.roughness = 0.24;

    const sharedLeafMaterial = new PBRMaterial('V16_MatteBlackStageHardware', scene);
    sharedLeafMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedLeafMaterial.emissiveColor.set(0, 0, 0);
    sharedLeafMaterial.emissiveIntensity = 0;
    sharedLeafMaterial.metallic = 0.22;
    sharedLeafMaterial.roughness = 0.48;

    const controlFrame = MeshBuilder.CreateBox('TestServiceDoorFrameControl', { size: 1 }, scene);
    controlFrame.material = sharedFrameMaterial;

    const leftFrame = MeshBuilder.CreateBox('V73_HeroPortalServiceDoorFrameCluster_L', { size: 1 }, scene);
    leftFrame.material = sharedFrameMaterial;

    const rightFrame = MeshBuilder.CreateBox('V73_HeroPortalServiceDoorFrameCluster_R', { size: 1 }, scene);
    rightFrame.material = sharedFrameMaterial;

    const controlLeaf = MeshBuilder.CreateBox('TestServiceDoorLeafControl', { size: 1 }, scene);
    controlLeaf.material = sharedLeafMaterial;

    const leftLeaf = MeshBuilder.CreateBox('V73_HeroPortalServiceDoorLeafCluster_L', { size: 1 }, scene);
    leftLeaf.material = sharedLeafMaterial;

    const rightLeaf = MeshBuilder.CreateBox('V73_HeroPortalServiceDoorLeafCluster_R', { size: 1 }, scene);
    rightLeaf.material = sharedLeafMaterial;

    polishMainStageMaterials([controlFrame, leftFrame, rightFrame, controlLeaf, leftLeaf, rightLeaf]);

    expect(controlFrame.material).toBe(sharedFrameMaterial);
    expect(leftFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBeInstanceOf(PBRMaterial);
    expect(rightFrame.material).toBe(leftFrame.material);

    expect(controlLeaf.material).toBe(sharedLeafMaterial);
    expect(leftLeaf.material).toBeInstanceOf(PBRMaterial);
    expect(rightLeaf.material).toBeInstanceOf(PBRMaterial);
    expect(rightLeaf.material).toBe(leftLeaf.material);

    const frameMaterial = leftFrame.material as PBRMaterial;
    const leafMaterial = leftLeaf.material as PBRMaterial;

    expect(frameMaterial.name).toContain('hero-portal-service-door-frame');
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-service-door-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(leafMaterial.name).toContain('hero-portal-service-door-leaf');
    expect(leafMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(leafMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-service-door-leaf');
    expect(leafMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(leafMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(leafMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(leafMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(leafMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(leafMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(leafMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(leafMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the crown rigging assemblies so the skyline support read stays structural instead of bright gold bosses floating on flat black truss proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V16_BrushedProductionGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedRigMaterial = new PBRMaterial('V16_MatteBlackStageHardware', scene);
    sharedRigMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedRigMaterial.emissiveColor.set(0, 0, 0);
    sharedRigMaterial.emissiveIntensity = 0;
    sharedRigMaterial.metallic = 0.22;
    sharedRigMaterial.roughness = 0.48;

    const controlGold = MeshBuilder.CreateBox('TestCrownRiggingGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const goldBosses = MeshBuilder.CreateBox('V72_CrownRiggingGoldBosses', { size: 1 }, scene);
    goldBosses.material = sharedGoldMaterial;

    const controlRig = MeshBuilder.CreateBox('TestCrownRiggingStructureControl', { size: 1 }, scene);
    controlRig.material = sharedRigMaterial;

    const frontTruss = MeshBuilder.CreateBox('V72_CrownRiggingFrontTruss', { size: 1 }, scene);
    frontTruss.material = sharedRigMaterial;

    const rearTruss = MeshBuilder.CreateBox('V72_CrownRiggingRearTruss', { size: 1 }, scene);
    rearTruss.material = sharedRigMaterial;

    const centerSpine = MeshBuilder.CreateBox('V72_CrownRiggingCenterSpine', { size: 1 }, scene);
    centerSpine.material = sharedRigMaterial;

    polishMainStageMaterials([controlGold, goldBosses, controlRig, frontTruss, rearTruss, centerSpine]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(goldBosses.material).toBeInstanceOf(PBRMaterial);

    expect(controlRig.material).toBe(sharedRigMaterial);
    expect(frontTruss.material).toBeInstanceOf(PBRMaterial);
    expect(rearTruss.material).toBe(frontTruss.material);
    expect(centerSpine.material).toBe(frontTruss.material);

    const goldMaterial = goldBosses.material as PBRMaterial;
    const rigMaterial = frontTruss.material as PBRMaterial;

    expect(goldMaterial.name).toContain('crown-rigging-gold-boss');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('crown-rigging-gold-boss');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(rigMaterial.name).toContain('crown-rigging-structure');
    expect(rigMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(rigMaterial.metadata?.mainStageMaterialOverride).toBe('crown-rigging-structure');
    expect(rigMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(rigMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(rigMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(rigMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(rigMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(rigMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(rigMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(rigMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the main truss tower arrays so the stage flanks read as structural support instead of bright gold bars over flat black proxy posts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V13_BrushedFestivalGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedRigMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedRigMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedRigMaterial.emissiveColor.set(0, 0, 0);
    sharedRigMaterial.emissiveIntensity = 0;
    sharedRigMaterial.metallic = 0.22;
    sharedRigMaterial.roughness = 0.48;

    const controlGold = MeshBuilder.CreateBox('TestMainTrussTowerGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V83_MainTrussTowerGoldCrossbarArray_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V83_MainTrussTowerGoldCrossbarArray_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const controlRig = MeshBuilder.CreateBox('TestMainTrussTowerRigControl', { size: 1 }, scene);
    controlRig.material = sharedRigMaterial;

    const leftShell = MeshBuilder.CreateBox('V83_MainTrussTowerShellArray_L', { size: 1 }, scene);
    leftShell.material = sharedRigMaterial;

    const rightShell = MeshBuilder.CreateBox('V83_MainTrussTowerShellArray_R', { size: 1 }, scene);
    rightShell.material = sharedRigMaterial;

    const leftDiagonal = MeshBuilder.CreateBox('V83_MainTrussTowerDiagonalArray_L', { size: 1 }, scene);
    leftDiagonal.material = sharedRigMaterial;

    const rightDiagonal = MeshBuilder.CreateBox('V83_MainTrussTowerDiagonalArray_R', { size: 1 }, scene);
    rightDiagonal.material = sharedRigMaterial;

    polishMainStageMaterials([
      controlGold,
      leftGold,
      rightGold,
      controlRig,
      leftShell,
      rightShell,
      leftDiagonal,
      rightDiagonal,
    ]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(controlRig.material).toBe(sharedRigMaterial);
    expect(leftShell.material).toBeInstanceOf(PBRMaterial);
    expect(rightShell.material).toBe(leftShell.material);
    expect(leftDiagonal.material).toBe(leftShell.material);
    expect(rightDiagonal.material).toBe(leftShell.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const rigMaterial = leftShell.material as PBRMaterial;

    expect(goldMaterial.name).toContain('main-truss-tower-gold-crossbar');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('main-truss-tower-gold-crossbar');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(rigMaterial.name).toContain('main-truss-tower-rig');
    expect(rigMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(rigMaterial.metadata?.mainStageMaterialOverride).toBe('main-truss-tower-rig');
    expect(rigMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(rigMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(rigMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(rigMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(rigMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(rigMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(rigMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(rigMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('regrades the wet paver bands so the spawn approach reads as grounded night stone instead of bright gold seams over flat proxy slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStoneMaterial = new PBRMaterial('V13_WetPlazaStone', scene);
    sharedStoneMaterial.albedoColor.set(0.42, 0.44, 0.46);
    sharedStoneMaterial.emissiveColor.set(0.02, 0.02, 0.02);
    sharedStoneMaterial.emissiveIntensity = 0.04;
    sharedStoneMaterial.metallic = 0.08;
    sharedStoneMaterial.roughness = 0.4;

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const controlStone = MeshBuilder.CreateBox('TestWetPaverStoneControl', { size: 1 }, scene);
    controlStone.material = sharedStoneMaterial;

    const stoneBands = MeshBuilder.CreateBox('V85_WetPaverStoneBands', { size: 1 }, scene);
    stoneBands.material = sharedStoneMaterial;

    const controlGold = MeshBuilder.CreateBox('TestWetPaverGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const goldBands = MeshBuilder.CreateBox('V85_WetPaverGoldSeamBands', { size: 1 }, scene);
    goldBands.material = sharedGoldMaterial;

    polishMainStageMaterials([controlStone, stoneBands, controlGold, goldBands]);

    expect(controlStone.material).toBe(sharedStoneMaterial);
    expect(stoneBands.material).toBeInstanceOf(PBRMaterial);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(goldBands.material).toBeInstanceOf(PBRMaterial);

    const stoneMaterial = stoneBands.material as PBRMaterial;
    const goldMaterial = goldBands.material as PBRMaterial;

    expect(stoneMaterial.name).toContain('wet-paver-stone-band');
    expect(stoneMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(stoneMaterial.metadata?.mainStageMaterialOverride).toBe('wet-paver-stone-band');
    expect(stoneMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(stoneMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(stoneMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(stoneMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(stoneMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(stoneMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(stoneMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);

    expect(goldMaterial.name).toContain('wet-paver-gold-seam');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('wet-paver-gold-seam');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('regrades the foreground wet inset pools and garden edges so the spawn flanks read as grounded architecture instead of bright water trays beside pearl coping proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedWaterMaterial = new PBRMaterial('V14_DeepReflectingWater', scene);
    sharedWaterMaterial.albedoColor.set(0.16, 0.22, 0.28);
    sharedWaterMaterial.emissiveColor.set(0.02, 0.04, 0.05);
    sharedWaterMaterial.emissiveIntensity = 0.08;
    sharedWaterMaterial.alpha = 0.98;
    sharedWaterMaterial.metallic = 0.04;
    sharedWaterMaterial.roughness = 0.24;

    const sharedEdgeMaterial = new PBRMaterial('V14_PolishedMoonstoneShell', scene);
    sharedEdgeMaterial.albedoColor.set(0.78, 0.76, 0.72);
    sharedEdgeMaterial.emissiveColor.set(0.04, 0.04, 0.04);
    sharedEdgeMaterial.emissiveIntensity = 0.08;
    sharedEdgeMaterial.metallic = 0.06;
    sharedEdgeMaterial.roughness = 0.34;

    const controlWater = MeshBuilder.CreateBox('TestSpawnWetInsetPoolControl', { size: 1 }, scene);
    controlWater.material = sharedWaterMaterial;

    const leftPool = MeshBuilder.CreateBox('V86_SpawnWetInsetPoolArray_L', { size: 1 }, scene);
    leftPool.material = sharedWaterMaterial;

    const rightPool = MeshBuilder.CreateBox('V86_SpawnWetInsetPoolArray_R', { size: 1 }, scene);
    rightPool.material = sharedWaterMaterial;

    const controlEdge = MeshBuilder.CreateBox('TestGardenStoneEdgeControl', { size: 1 }, scene);
    controlEdge.material = sharedEdgeMaterial;

    const leftEdge = MeshBuilder.CreateBox('V86_GardenStoneEdgeArray_L', { size: 1 }, scene);
    leftEdge.material = sharedEdgeMaterial;

    const rightEdge = MeshBuilder.CreateBox('V86_GardenStoneEdgeArray_R', { size: 1 }, scene);
    rightEdge.material = sharedEdgeMaterial;

    polishMainStageMaterials([controlWater, leftPool, rightPool, controlEdge, leftEdge, rightEdge]);

    expect(controlWater.material).toBe(sharedWaterMaterial);
    expect(leftPool.material).toBeInstanceOf(PBRMaterial);
    expect(rightPool.material).toBe(leftPool.material);

    expect(controlEdge.material).toBe(sharedEdgeMaterial);
    expect(leftEdge.material).toBeInstanceOf(PBRMaterial);
    expect(rightEdge.material).toBe(leftEdge.material);

    const poolMaterial = leftPool.material as PBRMaterial;
    const edgeMaterial = leftEdge.material as PBRMaterial;

    expect(poolMaterial.name).toContain('spawn-wet-inset-pool');
    expect(poolMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(poolMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-wet-inset-pool');
    expect(poolMaterial.albedoColor.r).toBeLessThanOrEqual(0.08);
    expect(poolMaterial.albedoColor.g).toBeLessThanOrEqual(0.1);
    expect(poolMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(poolMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.06);
    expect(poolMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.6);
    expect(poolMaterial.roughness).toBeLessThanOrEqual(0.3);
    expect(poolMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.8);

    expect(edgeMaterial.name).toContain('garden-stone-edge');
    expect(edgeMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(edgeMaterial.metadata?.mainStageMaterialOverride).toBe('garden-stone-edge');
    expect(edgeMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(edgeMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(edgeMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(edgeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(edgeMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(edgeMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(edgeMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);
  });

  it('rebalances the basin fountain arrays so the side basins read as carved practicals instead of bright pearl pedestals with hot emissive spray cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPedestalMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPedestalMaterial.albedoColor.set(0.8, 0.78, 0.74);
    sharedPedestalMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPedestalMaterial.emissiveIntensity = 0.16;
    sharedPedestalMaterial.roughness = 0.34;

    const sharedLightMaterial = new PBRMaterial('V13_WarmPracticalLight', scene);
    sharedLightMaterial.albedoColor.set(0.9, 0.72, 0.42);
    sharedLightMaterial.emissiveColor.set(1, 0.72, 0.28);
    sharedLightMaterial.emissiveIntensity = 1.1;
    sharedLightMaterial.roughness = 0.18;

    const sharedJetMaterial = new PBRMaterial('V14_CosmicScreenEmission', scene);
    sharedJetMaterial.albedoColor.set(0.18, 0.28, 0.34);
    sharedJetMaterial.emissiveColor.set(0.12, 0.48, 0.62);
    sharedJetMaterial.emissiveIntensity = 1.2;
    sharedJetMaterial.roughness = 0.28;

    const controlPedestal = MeshBuilder.CreateBox('TestBasinFountainPedestalControl', { size: 1 }, scene);
    controlPedestal.material = sharedPedestalMaterial;

    const leftPedestal = MeshBuilder.CreateBox('V89_BasinFountainPedestalArray_L', { size: 1 }, scene);
    leftPedestal.material = sharedPedestalMaterial;

    const rightPedestal = MeshBuilder.CreateBox('V89_BasinFountainPedestalArray_R', { size: 1 }, scene);
    rightPedestal.material = sharedPedestalMaterial;

    const controlLight = MeshBuilder.CreateBox('TestBasinFountainLightControl', { size: 1 }, scene);
    controlLight.material = sharedLightMaterial;

    const leftLight = MeshBuilder.CreateBox('V89_BasinFountainLightArray_L', { size: 1 }, scene);
    leftLight.material = sharedLightMaterial;

    const rightLight = MeshBuilder.CreateBox('V89_BasinFountainLightArray_R', { size: 1 }, scene);
    rightLight.material = sharedLightMaterial;

    const controlJet = MeshBuilder.CreateBox('TestBasinFountainJetControl', { size: 1 }, scene);
    controlJet.material = sharedJetMaterial;

    const leftJet = MeshBuilder.CreateBox('V89_BasinFountainJetArray_L', { size: 1 }, scene);
    leftJet.material = sharedJetMaterial;

    const rightJet = MeshBuilder.CreateBox('V89_BasinFountainJetArray_R', { size: 1 }, scene);
    rightJet.material = sharedJetMaterial;

    polishMainStageMaterials([
      controlPedestal,
      leftPedestal,
      rightPedestal,
      controlLight,
      leftLight,
      rightLight,
      controlJet,
      leftJet,
      rightJet,
    ]);

    expect(controlPedestal.material).toBe(sharedPedestalMaterial);
    expect(leftPedestal.material).toBeInstanceOf(PBRMaterial);
    expect(rightPedestal.material).toBe(leftPedestal.material);

    expect(controlLight.material).toBe(sharedLightMaterial);
    expect(leftLight.material).toBeInstanceOf(PBRMaterial);
    expect(rightLight.material).toBe(leftLight.material);

    expect(controlJet.material).toBe(sharedJetMaterial);
    expect(leftJet.material).toBeInstanceOf(PBRMaterial);
    expect(rightJet.material).toBe(leftJet.material);

    const pedestalMaterial = leftPedestal.material as PBRMaterial;
    const lightMaterial = leftLight.material as PBRMaterial;
    const jetMaterial = leftJet.material as PBRMaterial;

    expect(pedestalMaterial.name).toContain('basin-fountain-pedestal');
    expect(pedestalMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(pedestalMaterial.metadata?.mainStageMaterialOverride).toBe('basin-fountain-pedestal');
    expect(pedestalMaterial.albedoColor.r).toBeLessThanOrEqual(0.24);
    expect(pedestalMaterial.albedoColor.g).toBeLessThanOrEqual(0.26);
    expect(pedestalMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(pedestalMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(pedestalMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(pedestalMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(pedestalMaterial.environmentIntensity).toBeLessThanOrEqual(0.16);

    expect(lightMaterial.name).toContain('basin-fountain-light');
    expect(lightMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(lightMaterial.metadata?.mainStageMaterialOverride).toBe('basin-fountain-light');
    expect(lightMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.7);
    expect(lightMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.45);
    expect(lightMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.4);
    expect(lightMaterial.emissiveIntensity).toBeLessThanOrEqual(0.9);
    expect(lightMaterial.roughness).toBeLessThanOrEqual(0.4);

    expect(jetMaterial.name).toContain('basin-fountain-jet');
    expect(jetMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(jetMaterial.metadata?.mainStageMaterialOverride).toBe('basin-fountain-jet');
    expect(jetMaterial.albedoColor.b).toBeLessThanOrEqual(0.22);
    expect(jetMaterial.emissiveColor.b).toBeGreaterThan(jetMaterial.emissiveColor.r);
    expect(jetMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.2);
    expect(jetMaterial.emissiveIntensity).toBeLessThanOrEqual(0.55);
    expect(jetMaterial.roughness).toBeGreaterThanOrEqual(0.34);
    expect(jetMaterial.environmentIntensity).toBeLessThanOrEqual(0.8);
  });

  it('rebalances the side-screen anchor clusters so the side screens read as integrated architecture instead of bright gold pins over flat black braces', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedShadowMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedShadowMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedShadowMaterial.emissiveColor.set(0, 0, 0);
    sharedShadowMaterial.emissiveIntensity = 0;
    sharedShadowMaterial.metallic = 0.22;
    sharedShadowMaterial.roughness = 0.48;

    const controlGold = MeshBuilder.CreateBox('TestSideScreenAnchorGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V76_SideScreenAnchorGoldSpine_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V76_SideScreenAnchorGoldSpine_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const controlShadow = MeshBuilder.CreateBox('TestSideScreenAnchorShadowControl', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V76_SideScreenAnchorShadowBrace_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V76_SideScreenAnchorShadowBrace_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    polishMainStageMaterials([controlGold, leftGold, rightGold, controlShadow, leftShadow, rightShadow]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;

    expect(goldMaterial.name).toContain('side-screen-anchor-gold-spine');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('side-screen-anchor-gold-spine');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(shadowMaterial.name).toContain('side-screen-anchor-shadow-brace');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('side-screen-anchor-shadow-brace');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('rebalances the oval-screen recess clusters so the side-screen wells read as framed depth instead of bright gold outlines wrapped around flat black cutouts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const sharedShadowMaterial = new PBRMaterial('V14_MatteBlackProductionRig', scene);
    sharedShadowMaterial.albedoColor.set(0.01, 0.01, 0.01);
    sharedShadowMaterial.emissiveColor.set(0, 0, 0);
    sharedShadowMaterial.emissiveIntensity = 0;
    sharedShadowMaterial.metallic = 0.22;
    sharedShadowMaterial.roughness = 0.48;

    const controlGold = MeshBuilder.CreateBox('TestOvalRecessGoldControl', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V77_OvalScreenRecessGoldFrame_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V77_OvalScreenRecessGoldFrame_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const controlShadow = MeshBuilder.CreateBox('TestOvalRecessShadowControl', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V77_OvalScreenRecessShadowPocket_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V77_OvalScreenRecessShadowPocket_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    polishMainStageMaterials([controlGold, leftGold, rightGold, controlShadow, leftShadow, rightShadow]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    const goldMaterial = leftGold.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;

    expect(goldMaterial.name).toContain('oval-screen-recess-gold-frame');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('oval-screen-recess-gold-frame');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(shadowMaterial.name).toContain('oval-screen-recess-shadow-pocket');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('oval-screen-recess-shadow-pocket');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.04);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.74);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('tones down the wide hero screen gold frame cluster so the stage face keeps depth instead of bright metallic rails', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V14_BurnishedCelestialGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.68, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.16;
    sharedGoldMaterial.metallic = 0.78;
    sharedGoldMaterial.roughness = 0.24;

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const frame = MeshBuilder.CreateBox('V126_WideHeroScreenGoldFrame', { size: 1 }, scene);
    frame.material = sharedGoldMaterial;

    const mullions = MeshBuilder.CreateBox('V126_WideHeroScreenGoldMullionArray', { size: 1 }, scene);
    mullions.material = sharedGoldMaterial;

    const crossbars = MeshBuilder.CreateBox('V126_WideHeroScreenGoldCrossbarArray', { size: 1 }, scene);
    crossbars.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, frame, mullions, crossbars]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(frame.material).toBeInstanceOf(PBRMaterial);
    expect(mullions.material).toBeInstanceOf(PBRMaterial);
    expect(crossbars.material).toBeInstanceOf(PBRMaterial);
    expect(frame.material).not.toBe(sharedGoldMaterial);
    expect(mullions.material).not.toBe(sharedGoldMaterial);
    expect(crossbars.material).not.toBe(sharedGoldMaterial);
    expect(mullions.material).toBe(frame.material);
    expect(crossbars.material).toBe(frame.material);

    const frameMaterial = frame.material as PBRMaterial;
    expect(frameMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(frameMaterial.metadata?.mainStageMaterialOverride).toBe('wide-hero-screen-gold-frame');
    expect(frameMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(frameMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(frameMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(frameMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(frameMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(frameMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the wide hero screen ivory shells so the stage face reads as framed depth instead of bright moonstone caps', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V14_PolishedMoonstoneShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V16_ArchitecturalPearlControl', { size: 1 }, scene);
    controlPearl.material = sharedPearlMaterial;

    const header = MeshBuilder.CreateBox('V126_WideHeroScreenIvoryHeader', { size: 1 }, scene);
    header.material = sharedPearlMaterial;

    const footer = MeshBuilder.CreateBox('V126_WideHeroScreenIvoryFooter', { size: 1 }, scene);
    footer.material = sharedPearlMaterial;

    polishMainStageMaterials([controlPearl, header, footer]);

    expect(controlPearl.material).toBe(sharedPearlMaterial);
    expect(header.material).toBeInstanceOf(PBRMaterial);
    expect(footer.material).toBeInstanceOf(PBRMaterial);
    expect(header.material).not.toBe(sharedPearlMaterial);
    expect(footer.material).not.toBe(sharedPearlMaterial);
    expect(footer.material).toBe(header.material);

    const shellMaterial = header.material as PBRMaterial;
    expect(shellMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(shellMaterial.metadata?.mainStageMaterialOverride).toBe('wide-hero-screen-ivory-shell');
    expect(shellMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(shellMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(shellMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(shellMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(shellMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(shellMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(shellMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
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

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
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
    expect(oculusCanopyMaterial.albedoColor.r).toBeLessThanOrEqual(0.15);
    expect(oculusCanopyMaterial.albedoColor.g).toBeLessThanOrEqual(0.11);
    expect(oculusCanopyMaterial.albedoColor.b).toBeLessThanOrEqual(0.05);
    expect(oculusCanopyMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(oculusCanopyMaterial.environmentIntensity).toBeLessThanOrEqual(0.08);

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

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
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

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
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

  it('tones down the VIP terrace gold arrays so the near promenade edges read as support detailing instead of bright foil ribbons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.62, 0.24);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.28;

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftVipTerrace = MeshBuilder.CreateBox('V133_VipTerraceGoldArray_L', { size: 1 }, scene);
    leftVipTerrace.material = sharedGoldMaterial;

    const rightVipTerrace = MeshBuilder.CreateBox('V133_VipTerraceGoldArray_R', { size: 1 }, scene);
    rightVipTerrace.material = sharedGoldMaterial;

    polishMainStageMaterials([otherGold, leftVipTerrace, rightVipTerrace]);

    expect(otherGold.material).toBe(sharedGoldMaterial);
    expect(leftVipTerrace.material).toBeInstanceOf(PBRMaterial);
    expect(rightVipTerrace.material).toBeInstanceOf(PBRMaterial);
    expect(leftVipTerrace.material).not.toBe(sharedGoldMaterial);
    expect(rightVipTerrace.material).not.toBe(sharedGoldMaterial);
    expect(rightVipTerrace.material).toBe(leftVipTerrace.material);

    const terraceGoldMaterial = leftVipTerrace.material as PBRMaterial;
    expect(terraceGoldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(terraceGoldMaterial.metadata?.mainStageMaterialOverride).toBe('vip-terrace-gold');
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the spawn-canopy gold crests, cyan lanterns, and shadow soffits so the far reveal reads as carved night shelter architecture instead of bright foil trim around flat cyan inserts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestSpawnCanopyGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftCrest = MeshBuilder.CreateBox('V56_SpawnCanopyGoldCrest_L', { size: 1 }, scene);
    leftCrest.material = sharedGoldMaterial;

    const rightCrest = MeshBuilder.CreateBox('V56_SpawnCanopyGoldCrest_R', { size: 1 }, scene);
    rightCrest.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestSpawnCanopyShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftSoffit = MeshBuilder.CreateBox('V56_SpawnCanopyShadowSoffit_L', { size: 1 }, scene);
    leftSoffit.material = sharedShadowMaterial;

    const rightSoffit = MeshBuilder.CreateBox('V56_SpawnCanopyShadowSoffit_R', { size: 1 }, scene);
    rightSoffit.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestSpawnCanopyCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftLantern = MeshBuilder.CreateBox('V56_SpawnCanopyCyanLantern_L', { size: 1 }, scene);
    leftLantern.material = sharedCyanMaterial;

    const rightLantern = MeshBuilder.CreateBox('V56_SpawnCanopyCyanLantern_R', { size: 1 }, scene);
    rightLantern.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftCrest,
      rightCrest,
      shadowControl,
      leftSoffit,
      rightSoffit,
      cyanControl,
      leftLantern,
      rightLantern,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCrest.material).toBeInstanceOf(PBRMaterial);
    expect(rightCrest.material).toBe(leftCrest.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftSoffit.material).toBeInstanceOf(PBRMaterial);
    expect(rightSoffit.material).toBe(leftSoffit.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftLantern.material).toBeInstanceOf(PBRMaterial);
    expect(rightLantern.material).toBe(leftLantern.material);

    const goldMaterial = leftCrest.material as PBRMaterial;
    const shadowMaterial = leftSoffit.material as PBRMaterial;
    const cyanMaterial = leftLantern.material as PBRMaterial;

    expect(goldMaterial.name).toContain('spawn-canopy-gold-crest');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-canopy-gold-crest');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('spawn-canopy-shadow-soffit');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-canopy-shadow-soffit');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('spawn-canopy-cyan-lantern');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-canopy-cyan-lantern');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the basin causeway pearl span so the spawn reveal keeps runway depth instead of a white threshold bar', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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
    expect(causewayMaterial.albedoColor.r).toBeLessThanOrEqual(0.19);
    expect(causewayMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(causewayMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(causewayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(causewayMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(causewayMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(causewayMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);
  });

  it('darkens the basin garden terraces so the spawn reveal flanks read as grounded architecture instead of bright ivory shelves', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('smokes the basin water parterre so the basin-edge view reads as a dark reflective pool instead of a giant cyan slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedWaterMaterial = new PBRMaterial('V14_DeepReflectingWater', scene);
    sharedWaterMaterial.albedoColor.set(0.16, 0.22, 0.28);
    sharedWaterMaterial.emissiveColor.set(0.02, 0.04, 0.05);
    sharedWaterMaterial.emissiveIntensity = 0.08;
    sharedWaterMaterial.alpha = 0.98;
    sharedWaterMaterial.metallic = 0.04;
    sharedWaterMaterial.roughness = 0.24;
    sharedWaterMaterial.environmentIntensity = 0.82;

    const controlWater = MeshBuilder.CreateBox('TestBasinWaterParterreControl', { size: 1 }, scene);
    controlWater.material = sharedWaterMaterial;

    const parterre = MeshBuilder.CreateBox('V63_BasinWaterParterre', { size: 1 }, scene);
    parterre.material = sharedWaterMaterial;

    polishMainStageMaterials([controlWater, parterre]);

    expect(controlWater.material).toBe(sharedWaterMaterial);
    expect(parterre.material).toBeInstanceOf(PBRMaterial);
    expect(parterre.material).not.toBe(sharedWaterMaterial);

    const parterreMaterial = parterre.material as PBRMaterial;
    expect(parterreMaterial.name).toContain('basin-water-parterre');
    expect(parterreMaterial.metadata?.mainStageMaterialPolish).toBe('wet');
    expect(parterreMaterial.metadata?.mainStageMaterialOverride).toBe('basin-water-parterre');
    expect(parterreMaterial.albedoColor.r).toBeLessThanOrEqual(0.04);
    expect(parterreMaterial.albedoColor.g).toBeLessThanOrEqual(0.06);
    expect(parterreMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(parterreMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(parterreMaterial.alpha).toBeLessThanOrEqual(0.78);
    expect(parterreMaterial.clearCoat.intensity).toBeGreaterThanOrEqual(0.5);
    expect(parterreMaterial.roughness).toBeLessThanOrEqual(0.2);
    expect(parterreMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('smokes the basin screen reflection veil so the basin-edge view keeps a dim reflected sheen instead of a bright cyan lid', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedEmissionMaterial = new PBRMaterial('V14_CosmicScreenEmission', scene);
    sharedEmissionMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedEmissionMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedEmissionMaterial.emissiveIntensity = 0.34;
    sharedEmissionMaterial.alpha = 1;
    sharedEmissionMaterial.environmentIntensity = 0.82;

    const controlEmission = MeshBuilder.CreateBox('TestBasinReflectionVeilControl', { size: 1 }, scene);
    controlEmission.material = sharedEmissionMaterial;

    const reflectionVeil = MeshBuilder.CreateBox('V63_BasinScreenReflectionVeil', { size: 1 }, scene);
    reflectionVeil.material = sharedEmissionMaterial;

    polishMainStageMaterials([controlEmission, reflectionVeil]);

    expect(controlEmission.material).toBe(sharedEmissionMaterial);
    expect(reflectionVeil.material).toBeInstanceOf(PBRMaterial);
    expect(reflectionVeil.material).not.toBe(sharedEmissionMaterial);

    const veilMaterial = reflectionVeil.material as PBRMaterial;
    expect(veilMaterial.name).toContain('basin-screen-reflection-veil');
    expect(veilMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(veilMaterial.metadata?.mainStageMaterialOverride).toBe('basin-screen-reflection-veil');
    expect(veilMaterial.albedoColor.r).toBeLessThanOrEqual(0.06);
    expect(veilMaterial.albedoColor.g).toBeLessThanOrEqual(0.09);
    expect(veilMaterial.albedoColor.b).toBeLessThanOrEqual(0.12);
    expect(veilMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(veilMaterial.alpha).toBeLessThanOrEqual(0.16);
    expect(veilMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(veilMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);
    expect(veilMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the spawn-gate sentinel pearl shells so the promenade approach does not collapse into two bright proxy monoliths', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the spawn-gate sentinel crowns, cyan cores, and shadow keels so the promenade threshold reads as carved night markers instead of bright foil fins around flat cyan glow bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestSpawnGateSentinelGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftCrown = MeshBuilder.CreateBox('V60_SpawnGateSentinelGoldCrown_L', { size: 1 }, scene);
    leftCrown.material = sharedGoldMaterial;

    const rightCrown = MeshBuilder.CreateBox('V60_SpawnGateSentinelGoldCrown_R', { size: 1 }, scene);
    rightCrown.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestSpawnGateSentinelShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftKeel = MeshBuilder.CreateBox('V60_SpawnGateSentinelShadowKeel_L', { size: 1 }, scene);
    leftKeel.material = sharedShadowMaterial;

    const rightKeel = MeshBuilder.CreateBox('V60_SpawnGateSentinelShadowKeel_R', { size: 1 }, scene);
    rightKeel.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestSpawnGateSentinelCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftCore = MeshBuilder.CreateBox('V60_SpawnGateSentinelCyanCore_L', { size: 1 }, scene);
    leftCore.material = sharedCyanMaterial;

    const rightCore = MeshBuilder.CreateBox('V60_SpawnGateSentinelCyanCore_R', { size: 1 }, scene);
    rightCore.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftCrown,
      rightCrown,
      shadowControl,
      leftKeel,
      rightKeel,
      cyanControl,
      leftCore,
      rightCore,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCrown.material).toBeInstanceOf(PBRMaterial);
    expect(rightCrown.material).toBe(leftCrown.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftKeel.material).toBeInstanceOf(PBRMaterial);
    expect(rightKeel.material).toBe(leftKeel.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftCore.material).toBeInstanceOf(PBRMaterial);
    expect(rightCore.material).toBe(leftCore.material);

    const goldMaterial = leftCrown.material as PBRMaterial;
    const shadowMaterial = leftKeel.material as PBRMaterial;
    const cyanMaterial = leftCore.material as PBRMaterial;

    expect(goldMaterial.name).toContain('spawn-gate-sentinel-gold-crown');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gate-sentinel-gold-crown');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('spawn-gate-sentinel-shadow-keel');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gate-sentinel-shadow-keel');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('spawn-gate-sentinel-cyan-core');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gate-sentinel-cyan-core');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the spawn-pylon pearl shells so the forward route views stop reading them as bright ivory proxy totems', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the spawn-pylon crowns, cyan cores, and shadow spines so the route sentinels read as carved night markers instead of bright foil shells around flat cyan glow bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestSpawnPylonGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftCrown = MeshBuilder.CreateBox('V55_SpawnPylonGoldCrown_L', { size: 1 }, scene);
    leftCrown.material = sharedGoldMaterial;

    const rightCrown = MeshBuilder.CreateBox('V55_SpawnPylonGoldCrown_R', { size: 1 }, scene);
    rightCrown.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestSpawnPylonShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V55_SpawnPylonShadowSpine_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V55_SpawnPylonShadowSpine_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestSpawnPylonCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftCore = MeshBuilder.CreateBox('V55_SpawnPylonCyanCore_L', { size: 1 }, scene);
    leftCore.material = sharedCyanMaterial;

    const rightCore = MeshBuilder.CreateBox('V55_SpawnPylonCyanCore_R', { size: 1 }, scene);
    rightCore.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftCrown,
      rightCrown,
      shadowControl,
      leftShadow,
      rightShadow,
      cyanControl,
      leftCore,
      rightCore,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCrown.material).toBeInstanceOf(PBRMaterial);
    expect(rightCrown.material).toBe(leftCrown.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftCore.material).toBeInstanceOf(PBRMaterial);
    expect(rightCore.material).toBe(leftCore.material);

    const goldMaterial = leftCrown.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;
    const cyanMaterial = leftCore.material as PBRMaterial;

    expect(goldMaterial.name).toContain('spawn-pylon-gold-crown');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-pylon-gold-crown');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('spawn-pylon-shadow-spine');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-pylon-shadow-spine');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('spawn-pylon-cyan-core');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-pylon-cyan-core');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the arrival runway pearl bands so the forward route foreground stops reading as repeated bright proxy slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the arrival runway gold, cyan, and threshold shadow trims so the forward route reads as carved ceremonial inlay instead of bright rails wrapped around flat glow strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.72, 0.38);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.22;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const goldControl = MeshBuilder.CreateBox('TestArrivalRunwayGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const runwayGold = MeshBuilder.CreateBox('V65_ArrivalRunwayGoldBands', { size: 1 }, scene);
    runwayGold.material = sharedGoldMaterial;

    const thresholdGold = MeshBuilder.CreateBox('V65_ArrivalThresholdGoldBands', { size: 1 }, scene);
    thresholdGold.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestArrivalRunwayCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const runwayCyan = MeshBuilder.CreateBox('V65_ArrivalRunwayCyanThreads', { size: 1 }, scene);
    runwayCyan.material = sharedCyanMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestArrivalThresholdShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const thresholdShadow = MeshBuilder.CreateBox('V65_ArrivalThresholdShadowGrooves', { size: 1 }, scene);
    thresholdShadow.material = sharedShadowMaterial;

    polishMainStageMaterials([
      goldControl,
      runwayGold,
      thresholdGold,
      cyanControl,
      runwayCyan,
      shadowControl,
      thresholdShadow,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(runwayGold.material).toBeInstanceOf(PBRMaterial);
    expect(thresholdGold.material).toBe(runwayGold.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(runwayCyan.material).toBeInstanceOf(PBRMaterial);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(thresholdShadow.material).toBeInstanceOf(PBRMaterial);

    const goldMaterial = runwayGold.material as PBRMaterial;
    const cyanMaterial = runwayCyan.material as PBRMaterial;
    const shadowMaterial = thresholdShadow.material as PBRMaterial;

    expect(goldMaterial.name).toContain('arrival-runway-gold-bands');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-runway-gold-bands');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(cyanMaterial.name).toContain('arrival-runway-cyan-threads');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-runway-cyan-threads');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);

    expect(shadowMaterial.name).toContain('arrival-threshold-shadow-grooves');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-threshold-shadow-grooves');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('darkens the arrival side-plinth pearl dais so the forward reveal flanks stop reading as bright ivory podium slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the arrival side-plinth gold inlays, cyan spines, and shadow reveals so the forward flanks read as carved ceremonial markers instead of bright foil bands wrapped around flat cyan strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestArrivalPlinthGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftInlay = MeshBuilder.CreateBox('V58_ArrivalPlinthGoldInlay_L', { size: 1 }, scene);
    leftInlay.material = sharedGoldMaterial;

    const rightInlay = MeshBuilder.CreateBox('V58_ArrivalPlinthGoldInlay_R', { size: 1 }, scene);
    rightInlay.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestArrivalPlinthShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftReveal = MeshBuilder.CreateBox('V58_ArrivalPlinthShadowReveal_L', { size: 1 }, scene);
    leftReveal.material = sharedShadowMaterial;

    const rightReveal = MeshBuilder.CreateBox('V58_ArrivalPlinthShadowReveal_R', { size: 1 }, scene);
    rightReveal.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestArrivalPlinthCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftSpine = MeshBuilder.CreateBox('V58_ArrivalPlinthCyanSpine_L', { size: 1 }, scene);
    leftSpine.material = sharedCyanMaterial;

    const rightSpine = MeshBuilder.CreateBox('V58_ArrivalPlinthCyanSpine_R', { size: 1 }, scene);
    rightSpine.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftInlay,
      rightInlay,
      shadowControl,
      leftReveal,
      rightReveal,
      cyanControl,
      leftSpine,
      rightSpine,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftInlay.material).toBeInstanceOf(PBRMaterial);
    expect(rightInlay.material).toBe(leftInlay.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rightReveal.material).toBe(leftReveal.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftSpine.material).toBeInstanceOf(PBRMaterial);
    expect(rightSpine.material).toBe(leftSpine.material);

    const goldMaterial = leftInlay.material as PBRMaterial;
    const shadowMaterial = leftReveal.material as PBRMaterial;
    const cyanMaterial = leftSpine.material as PBRMaterial;

    expect(goldMaterial.name).toContain('arrival-plinth-gold-inlay');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-plinth-gold-inlay');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('arrival-plinth-shadow-reveal');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-plinth-shadow-reveal');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('arrival-plinth-cyan-spine');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('arrival-plinth-cyan-spine');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the wing arcade pearl arches so the side portals read as carved support shells instead of bright ivory frames', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('TestPearlControlMesh', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftArch = MeshBuilder.CreateBox('V28_WingArcadePearlArch_L', { size: 1 }, scene);
    leftArch.material = sharedIvoryMaterial;

    const rightArch = MeshBuilder.CreateBox('V28_WingArcadePearlArch_R', { size: 1 }, scene);
    rightArch.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftArch, rightArch]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftArch.material).toBeInstanceOf(PBRMaterial);
    expect(rightArch.material).toBeInstanceOf(PBRMaterial);
    expect(leftArch.material).not.toBe(sharedIvoryMaterial);
    expect(rightArch.material).not.toBe(sharedIvoryMaterial);
    expect(rightArch.material).toBe(leftArch.material);

    const archMaterial = leftArch.material as PBRMaterial;
    expect(archMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(archMaterial.metadata?.mainStageMaterialOverride).toBe('wing-arcade-pearl-arch');
    expect(archMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(archMaterial.albedoColor.g).toBeLessThanOrEqual(0.22);
    expect(archMaterial.albedoColor.b).toBeLessThanOrEqual(0.26);
    expect(archMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(archMaterial.roughness).toBeGreaterThanOrEqual(0.88);
    expect(archMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(archMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);
  });

  it('tones down the wing arcade gold reveals so the side portals read as carved metal detailing instead of bright foil seams', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftReveal = MeshBuilder.CreateBox('V28_WingArcadeGoldReveal_L', { size: 1 }, scene);
    leftReveal.material = sharedGoldMaterial;

    const rightReveal = MeshBuilder.CreateBox('V28_WingArcadeGoldReveal_R', { size: 1 }, scene);
    rightReveal.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, leftReveal, rightReveal]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rightReveal.material).toBeInstanceOf(PBRMaterial);
    expect(leftReveal.material).not.toBe(sharedGoldMaterial);
    expect(rightReveal.material).not.toBe(sharedGoldMaterial);
    expect(rightReveal.material).toBe(leftReveal.material);

    const revealMaterial = leftReveal.material as PBRMaterial;
    expect(revealMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(revealMaterial.metadata?.mainStageMaterialOverride).toBe('wing-arcade-gold-reveal');
    expect(revealMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(revealMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(revealMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(revealMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(revealMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(revealMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(revealMaterial.environmentIntensity).toBeLessThanOrEqual(0.1);
  });

  it('smokes the wing arcade cyan inlays so the side portals read as inset jewel glass instead of bright cyan cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanGlass.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanGlass.emissiveIntensity = 0.34;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.environmentIntensity = 0.82;

    const controlGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlGlass.material = sharedCyanGlass;

    const leftInlay = MeshBuilder.CreateBox('V28_WingArcadeCyanInlay_L', { size: 1 }, scene);
    leftInlay.material = sharedCyanGlass;

    const rightInlay = MeshBuilder.CreateBox('V28_WingArcadeCyanInlay_R', { size: 1 }, scene);
    rightInlay.material = sharedCyanGlass;

    polishMainStageMaterials([controlGlass, leftInlay, rightInlay]);

    expect(controlGlass.material).toBe(sharedCyanGlass);
    expect(leftInlay.material).toBeInstanceOf(PBRMaterial);
    expect(rightInlay.material).toBeInstanceOf(PBRMaterial);
    expect(leftInlay.material).not.toBe(sharedCyanGlass);
    expect(rightInlay.material).not.toBe(sharedCyanGlass);
    expect(rightInlay.material).toBe(leftInlay.material);

    const inlayMaterial = leftInlay.material as PBRMaterial;
    expect(inlayMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(inlayMaterial.metadata?.mainStageMaterialOverride).toBe('wing-arcade-cyan-inlay');
    expect(inlayMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(inlayMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(inlayMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(inlayMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(inlayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(inlayMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(inlayMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
  });

  it('tones down the portal arcade gold crests so the celestial colonnade reads as carved metal detailing instead of bright foil seams', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftCrest = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_L', { size: 1 }, scene);
    leftCrest.material = sharedGoldMaterial;

    const rightCrest = MeshBuilder.CreateBox('V68_PortalArcadeGoldCrest_R', { size: 1 }, scene);
    rightCrest.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, leftCrest, rightCrest]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftCrest.material).toBeInstanceOf(PBRMaterial);
    expect(rightCrest.material).toBeInstanceOf(PBRMaterial);
    expect(leftCrest.material).not.toBe(sharedGoldMaterial);
    expect(rightCrest.material).not.toBe(sharedGoldMaterial);
    expect(rightCrest.material).toBe(leftCrest.material);

    const crestMaterial = leftCrest.material as PBRMaterial;
    expect(crestMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(crestMaterial.metadata?.mainStageMaterialOverride).toBe('portal-arcade-gold-crest');
    expect(crestMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(crestMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(crestMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(crestMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(crestMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(crestMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(crestMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('smokes the portal arcade cyan spines so the celestial colonnade reads as inset jewel glass instead of bright cyan strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanGlass.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanGlass.emissiveIntensity = 0.34;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.environmentIntensity = 0.82;

    const controlGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlGlass.material = sharedCyanGlass;

    const leftSpine = MeshBuilder.CreateBox('V68_PortalArcadeCyanSpine_L', { size: 1 }, scene);
    leftSpine.material = sharedCyanGlass;

    const rightSpine = MeshBuilder.CreateBox('V68_PortalArcadeCyanSpine_R', { size: 1 }, scene);
    rightSpine.material = sharedCyanGlass;

    polishMainStageMaterials([controlGlass, leftSpine, rightSpine]);

    expect(controlGlass.material).toBe(sharedCyanGlass);
    expect(leftSpine.material).toBeInstanceOf(PBRMaterial);
    expect(rightSpine.material).toBeInstanceOf(PBRMaterial);
    expect(leftSpine.material).not.toBe(sharedCyanGlass);
    expect(rightSpine.material).not.toBe(sharedCyanGlass);
    expect(rightSpine.material).toBe(leftSpine.material);

    const spineMaterial = leftSpine.material as PBRMaterial;
    expect(spineMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(spineMaterial.metadata?.mainStageMaterialOverride).toBe('portal-arcade-cyan-spine');
    expect(spineMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(spineMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(spineMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(spineMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(spineMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(spineMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(spineMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
  });

  it('neutralizes the portal arcade shadow cores so the celestial colonnade reads as recessed depth instead of bright cyan inserts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const leftCore = MeshBuilder.CreateBox('V68_PortalArcadeShadowCore_L', { size: 1 }, scene);
    leftCore.material = sharedShadowMaterial;

    const rightCore = MeshBuilder.CreateBox('V68_PortalArcadeShadowCore_R', { size: 1 }, scene);
    rightCore.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, leftCore, rightCore]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(leftCore.material).toBeInstanceOf(PBRMaterial);
    expect(rightCore.material).toBeInstanceOf(PBRMaterial);
    expect(leftCore.material).not.toBe(sharedShadowMaterial);
    expect(rightCore.material).not.toBe(sharedShadowMaterial);
    expect(rightCore.material).toBe(leftCore.material);

    const coreMaterial = leftCore.material as PBRMaterial;
    expect(coreMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(coreMaterial.metadata?.mainStageMaterialOverride).toBe('portal-arcade-shadow-core');
    expect(coreMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(coreMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(coreMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(coreMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(coreMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(coreMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('tones down the hero portal gold cap so the celestial colonnade terminus reads as carved metal detailing instead of a bright foil crown', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const heroCap = MeshBuilder.CreateBox('V68_HeroPortalGoldCap', { size: 1 }, scene);
    heroCap.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, heroCap]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(heroCap.material).toBeInstanceOf(PBRMaterial);
    expect(heroCap.material).not.toBe(sharedGoldMaterial);

    const capMaterial = heroCap.material as PBRMaterial;
    expect(capMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(capMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-gold-cap');
    expect(capMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(capMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(capMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(capMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(capMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(capMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(capMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('smokes the hero portal cyan plinth so the celestial colonnade terminus reads as inset jewel glass instead of a bright cyan slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanGlass.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanGlass.emissiveIntensity = 0.34;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.environmentIntensity = 0.82;

    const controlGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlGlass.material = sharedCyanGlass;

    const heroPlinth = MeshBuilder.CreateBox('V68_HeroPortalCyanPlinth', { size: 1 }, scene);
    heroPlinth.material = sharedCyanGlass;

    polishMainStageMaterials([controlGlass, heroPlinth]);

    expect(controlGlass.material).toBe(sharedCyanGlass);
    expect(heroPlinth.material).toBeInstanceOf(PBRMaterial);
    expect(heroPlinth.material).not.toBe(sharedCyanGlass);

    const plinthMaterial = heroPlinth.material as PBRMaterial;
    expect(plinthMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(plinthMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-cyan-plinth');
    expect(plinthMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(plinthMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(plinthMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(plinthMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(plinthMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(plinthMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(plinthMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
  });

  it('neutralizes the hero portal shadow dais so the celestial colonnade terminus reads as recessed depth instead of a bright cyan insert', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const heroDais = MeshBuilder.CreateBox('V68_HeroPortalShadowDais', { size: 1 }, scene);
    heroDais.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, heroDais]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(heroDais.material).toBeInstanceOf(PBRMaterial);
    expect(heroDais.material).not.toBe(sharedShadowMaterial);

    const daisMaterial = heroDais.material as PBRMaterial;
    expect(daisMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(daisMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-shadow-dais');
    expect(daisMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(daisMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(daisMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(daisMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(daisMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(daisMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('tones down the grand arcade gold bands so the celestial colonnade flanks read as carved metal detailing instead of bright foil seams', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftBands = MeshBuilder.CreateBox('V68_GrandArcadeGoldBands_L', { size: 1 }, scene);
    leftBands.material = sharedGoldMaterial;

    const rightBands = MeshBuilder.CreateBox('V68_GrandArcadeGoldBands_R', { size: 1 }, scene);
    rightBands.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, leftBands, rightBands]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftBands.material).toBeInstanceOf(PBRMaterial);
    expect(rightBands.material).toBeInstanceOf(PBRMaterial);
    expect(leftBands.material).not.toBe(sharedGoldMaterial);
    expect(rightBands.material).not.toBe(sharedGoldMaterial);
    expect(rightBands.material).toBe(leftBands.material);

    const bandsMaterial = leftBands.material as PBRMaterial;
    expect(bandsMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(bandsMaterial.metadata?.mainStageMaterialOverride).toBe('grand-arcade-gold-bands');
    expect(bandsMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(bandsMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(bandsMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(bandsMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(bandsMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(bandsMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(bandsMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the promenade pearl ribbon so the central route reads as authored night inlay instead of a repeated bright ivory strip', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('tones down the plaza paver gold filigree so the route approach reads as carved metal detailing instead of bright foil strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const goldFiligree = MeshBuilder.CreateBox('V69_PlazaPaverGoldFiligree', { size: 1 }, scene);
    goldFiligree.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, goldFiligree]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(goldFiligree.material).toBeInstanceOf(PBRMaterial);
    expect(goldFiligree.material).not.toBe(sharedGoldMaterial);

    const filigreeMaterial = goldFiligree.material as PBRMaterial;
    expect(filigreeMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(filigreeMaterial.metadata?.mainStageMaterialOverride).toBe('plaza-paver-gold-filigree');
    expect(filigreeMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(filigreeMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(filigreeMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(filigreeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(filigreeMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(filigreeMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(filigreeMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the hero portal pearl arcade family so the first central stage reveal reads as layered architecture instead of bright ivory slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('TestPearlControlMesh', { size: 1 }, scene);
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

    const controlIvory = MeshBuilder.CreateBox('TestPearlControlMesh', { size: 1 }, scene);
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

  it('rebalances the rear mass aurora gold spines, cyan cores, and shadow ribbons so the backdrop reads as carved cathedral lightwork instead of bright metallic fins framing flat neon bars', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestRearMassAuroraGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftGold = MeshBuilder.CreateBox('V61_RearMassAuroraGoldSpine_L', { size: 1 }, scene);
    leftGold.material = sharedGoldMaterial;

    const rightGold = MeshBuilder.CreateBox('V61_RearMassAuroraGoldSpine_R', { size: 1 }, scene);
    rightGold.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestRearMassAuroraShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V61_RearMassAuroraShadowRibbon_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V61_RearMassAuroraShadowRibbon_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestRearMassAuroraCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftCyan = MeshBuilder.CreateBox('V61_RearMassAuroraCyanCore_L', { size: 1 }, scene);
    leftCyan.material = sharedCyanMaterial;

    const rightCyan = MeshBuilder.CreateBox('V61_RearMassAuroraCyanCore_R', { size: 1 }, scene);
    rightCyan.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftGold,
      rightGold,
      shadowControl,
      leftShadow,
      rightShadow,
      cyanControl,
      leftCyan,
      rightCyan,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftGold.material).toBeInstanceOf(PBRMaterial);
    expect(rightGold.material).toBe(leftGold.material);
    expect(leftGold.material === sharedGoldMaterial).toBe(false);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);
    expect(leftShadow.material === sharedShadowMaterial).toBe(false);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightCyan.material).toBe(leftCyan.material);
    expect(leftCyan.material === sharedCyanMaterial).toBe(false);

    const goldMaterial = leftGold.material as PBRMaterial;
    expect(goldMaterial.name).toContain('rear-mass-aurora-gold-spine');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('rear-mass-aurora-gold-spine');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    const shadowMaterial = leftShadow.material as PBRMaterial;
    expect(shadowMaterial.name).toContain('rear-mass-aurora-shadow-ribbon');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('rear-mass-aurora-shadow-ribbon');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    const cyanMaterial = leftCyan.material as PBRMaterial;
    expect(cyanMaterial.name).toContain('rear-mass-aurora-cyan-core');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('rear-mass-aurora-cyan-core');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the back plaza sentinel pearl shells so the approach framing reads as authored entry monuments instead of bright ivory pylons', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the back plaza sentinel crowns, cyan spines, and shadow cores so the arrival frame reads as carved night markers instead of bright foil fins wrapped around flat cyan strips', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestBackPlazaSentinelGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftCrown = MeshBuilder.CreateBox('V57_BackPlazaSentinelGoldCrown_L', { size: 1 }, scene);
    leftCrown.material = sharedGoldMaterial;

    const rightCrown = MeshBuilder.CreateBox('V57_BackPlazaSentinelGoldCrown_R', { size: 1 }, scene);
    rightCrown.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestBackPlazaSentinelShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V57_BackPlazaSentinelShadowCore_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V57_BackPlazaSentinelShadowCore_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestBackPlazaSentinelCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftSpine = MeshBuilder.CreateBox('V57_BackPlazaSentinelCyanSpine_L', { size: 1 }, scene);
    leftSpine.material = sharedCyanMaterial;

    const rightSpine = MeshBuilder.CreateBox('V57_BackPlazaSentinelCyanSpine_R', { size: 1 }, scene);
    rightSpine.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftCrown,
      rightCrown,
      shadowControl,
      leftShadow,
      rightShadow,
      cyanControl,
      leftSpine,
      rightSpine,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCrown.material).toBeInstanceOf(PBRMaterial);
    expect(rightCrown.material).toBe(leftCrown.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftSpine.material).toBeInstanceOf(PBRMaterial);
    expect(rightSpine.material).toBe(leftSpine.material);

    const goldMaterial = leftCrown.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;
    const cyanMaterial = leftSpine.material as PBRMaterial;

    expect(goldMaterial.name).toContain('back-plaza-sentinel-gold-crown');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-sentinel-gold-crown');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('back-plaza-sentinel-shadow-core');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-sentinel-shadow-core');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('back-plaza-sentinel-cyan-spine');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-sentinel-cyan-spine');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the back plaza sightline pearl posts so the spawn-side framing reads as layered balustrade architecture instead of bright ivory pickets', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const controlIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const controlIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the wayfinding pylon crown and glyph so the spawn reveal reads as carved night signage instead of a bright gold cap over a flat cyan strip', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.72, 0.34);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.48;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestWayfindingPylonGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const goldCrown = MeshBuilder.CreateBox('V43_WayfindingPylonGoldCrown', { size: 1 }, scene);
    goldCrown.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestWayfindingPylonCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const cyanGlyph = MeshBuilder.CreateBox('V43_WayfindingPylonCyanGlyph', { size: 1 }, scene);
    cyanGlyph.material = sharedCyanMaterial;

    polishMainStageMaterials([goldControl, goldCrown, cyanControl, cyanGlyph]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(goldCrown.material).toBeInstanceOf(PBRMaterial);
    expect(goldCrown.material).not.toBe(sharedGoldMaterial);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(cyanGlyph.material).toBeInstanceOf(PBRMaterial);
    expect(cyanGlyph.material).not.toBe(sharedCyanMaterial);

    const goldMaterial = goldCrown.material as PBRMaterial;
    const cyanMaterial = cyanGlyph.material as PBRMaterial;

    expect(goldMaterial.name).toContain('wayfinding-pylon-gold-crown');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('wayfinding-pylon-gold-crown');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(cyanMaterial.name).toContain('wayfinding-pylon-cyan-glyph');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('wayfinding-pylon-cyan-glyph');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.36);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.08);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('rebalances the plaza lantern cluster so the route approach reads as grounded practical hardware instead of a bright gold cage around a hot bulb', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStemMaterial = new PBRMaterial('V13_BlackStageRigging', scene);
    sharedStemMaterial.albedoColor.set(0.06, 0.06, 0.08);
    sharedStemMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedStemMaterial.emissiveIntensity = 0.08;
    sharedStemMaterial.roughness = 0.36;

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.72, 0.34);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;

    const sharedCoreMaterial = new PBRMaterial('V13_WarmPracticalLight', scene);
    sharedCoreMaterial.albedoColor.set(1, 0.84, 0.52);
    sharedCoreMaterial.emissiveColor.set(1, 0.82, 0.44);
    sharedCoreMaterial.emissiveIntensity = 1.4;
    sharedCoreMaterial.roughness = 0.14;
    sharedCoreMaterial.environmentIntensity = 0.9;

    const stemControl = MeshBuilder.CreateBox('TestPlazaLanternStemControl', { size: 1 }, scene);
    stemControl.material = sharedStemMaterial;

    const stem = MeshBuilder.CreateBox('V44_PlazaLanternStemCluster', { size: 1 }, scene);
    stem.material = sharedStemMaterial;

    const goldControl = MeshBuilder.CreateBox('TestPlazaLanternGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const gold = MeshBuilder.CreateBox('V44_PlazaLanternGoldHardware', { size: 1 }, scene);
    gold.material = sharedGoldMaterial;

    const halo = MeshBuilder.CreateBox('V44_PlazaLanternHaloRim', { size: 1 }, scene);
    halo.material = sharedGoldMaterial;

    const coreControl = MeshBuilder.CreateBox('TestPlazaLanternCoreControl', { size: 1 }, scene);
    coreControl.material = sharedCoreMaterial;

    const core = MeshBuilder.CreateBox('V44_PlazaLanternWarmCore', { size: 1 }, scene);
    core.material = sharedCoreMaterial;

    polishMainStageMaterials([stemControl, stem, goldControl, gold, halo, coreControl, core]);

    expect(stemControl.material).toBe(sharedStemMaterial);
    expect(stem.material).toBeInstanceOf(PBRMaterial);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(gold.material).toBeInstanceOf(PBRMaterial);
    expect(halo.material).toBeInstanceOf(PBRMaterial);

    expect(coreControl.material).toBe(sharedCoreMaterial);
    expect(core.material).toBeInstanceOf(PBRMaterial);

    const stemMaterial = stem.material as PBRMaterial;
    const goldMaterial = gold.material as PBRMaterial;
    const haloMaterial = halo.material as PBRMaterial;
    const coreMaterial = core.material as PBRMaterial;

    expect(stemMaterial.name).toContain('plaza-lantern-stem');
    expect(stemMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(stemMaterial.metadata?.mainStageMaterialOverride).toBe('plaza-lantern-stem');
    expect(stemMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(stemMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(stemMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(stemMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(stemMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(stemMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(goldMaterial.name).toContain('plaza-lantern-gold-hardware');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('plaza-lantern-gold-hardware');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(haloMaterial.name).toContain('plaza-lantern-halo-rim');
    expect(haloMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(haloMaterial.metadata?.mainStageMaterialOverride).toBe('plaza-lantern-halo-rim');
    expect(haloMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(haloMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(haloMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(haloMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(haloMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(haloMaterial.environmentIntensity).toBeLessThanOrEqual(0.24);

    expect(coreMaterial.name).toContain('plaza-lantern-warm-core');
    expect(coreMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(coreMaterial.metadata?.mainStageMaterialOverride).toBe('plaza-lantern-warm-core');
    expect(coreMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.7);
    expect(coreMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.45);
    expect(coreMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.4);
    expect(coreMaterial.emissiveIntensity).toBeLessThanOrEqual(0.9);
    expect(coreMaterial.roughness).toBeLessThanOrEqual(0.4);
    expect(coreMaterial.environmentIntensity).toBeLessThanOrEqual(0.5);
  });

  it('rebalances the approach-light stems, housings, cores, and halos so the route edge reads as authored practical lighting instead of bright gold beacons with flat cyan bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedStemMaterial = new PBRMaterial('V19_FestivalCrowdGraphite', scene);
    sharedStemMaterial.albedoColor.set(0.1, 0.11, 0.14);
    sharedStemMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedStemMaterial.emissiveIntensity = 0.08;
    sharedStemMaterial.roughness = 0.34;

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.72, 0.34);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const stemControl = MeshBuilder.CreateBox('TestApproachLightStemControl', { size: 1 }, scene);
    stemControl.material = sharedStemMaterial;
    const leftStem = MeshBuilder.CreateBox('V40_ApproachLightStem_L', { size: 1 }, scene);
    leftStem.material = sharedStemMaterial;
    const rightStem = MeshBuilder.CreateBox('V40_ApproachLightStem_R', { size: 1 }, scene);
    rightStem.material = sharedStemMaterial;

    const goldControl = MeshBuilder.CreateBox('TestApproachLightGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;
    const leftHousing = MeshBuilder.CreateBox('V40_ApproachLightHousing_L', { size: 1 }, scene);
    leftHousing.material = sharedGoldMaterial;
    const rightHousing = MeshBuilder.CreateBox('V40_ApproachLightHousing_R', { size: 1 }, scene);
    rightHousing.material = sharedGoldMaterial;
    const leftHalo = MeshBuilder.CreateBox('V40_ApproachLightHalo_L', { size: 1 }, scene);
    leftHalo.material = sharedGoldMaterial;
    const rightHalo = MeshBuilder.CreateBox('V40_ApproachLightHalo_R', { size: 1 }, scene);
    rightHalo.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestApproachLightCoreControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;
    const leftCore = MeshBuilder.CreateBox('V40_ApproachLightCore_L', { size: 1 }, scene);
    leftCore.material = sharedCyanMaterial;
    const rightCore = MeshBuilder.CreateBox('V40_ApproachLightCore_R', { size: 1 }, scene);
    rightCore.material = sharedCyanMaterial;

    polishMainStageMaterials([
      stemControl,
      leftStem,
      rightStem,
      goldControl,
      leftHousing,
      rightHousing,
      leftHalo,
      rightHalo,
      cyanControl,
      leftCore,
      rightCore,
    ]);

    expect(stemControl.material).toBe(sharedStemMaterial);
    expect(leftStem.material).toBeInstanceOf(PBRMaterial);
    expect(rightStem.material).toBe(leftStem.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftHousing.material).toBeInstanceOf(PBRMaterial);
    expect(rightHousing.material).toBe(leftHousing.material);
    expect(leftHalo.material).toBeInstanceOf(PBRMaterial);
    expect(rightHalo.material).toBe(leftHalo.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftCore.material).toBeInstanceOf(PBRMaterial);
    expect(rightCore.material).toBe(leftCore.material);

    const stemMaterial = leftStem.material as PBRMaterial;
    const housingMaterial = leftHousing.material as PBRMaterial;
    const haloMaterial = leftHalo.material as PBRMaterial;
    const coreMaterial = leftCore.material as PBRMaterial;

    expect(stemMaterial.name).toContain('approach-light-stem');
    expect(stemMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(stemMaterial.metadata?.mainStageMaterialOverride).toBe('approach-light-stem');
    expect(stemMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(stemMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(stemMaterial.albedoColor.b).toBeLessThanOrEqual(0.24);
    expect(stemMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(stemMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(stemMaterial.environmentIntensity).toBeLessThanOrEqual(0.32);

    expect(housingMaterial.name).toContain('approach-light-housing');
    expect(housingMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(housingMaterial.metadata?.mainStageMaterialOverride).toBe('approach-light-housing');
    expect(housingMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(housingMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(housingMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(housingMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(housingMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(housingMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(housingMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(haloMaterial.name).toContain('approach-light-halo');
    expect(haloMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(haloMaterial.metadata?.mainStageMaterialOverride).toBe('approach-light-halo');
    expect(haloMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(haloMaterial.albedoColor.g).toBeLessThanOrEqual(0.2);
    expect(haloMaterial.albedoColor.b).toBeLessThanOrEqual(0.1);
    expect(haloMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(haloMaterial.roughness).toBeGreaterThanOrEqual(0.72);
    expect(haloMaterial.environmentIntensity).toBeLessThanOrEqual(0.24);

    expect(coreMaterial.name).toContain('approach-light-core');
    expect(coreMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(coreMaterial.metadata?.mainStageMaterialOverride).toBe('approach-light-core');
    expect(coreMaterial.alpha).toBeLessThanOrEqual(0.4);
    expect(coreMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(coreMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(coreMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(coreMaterial.emissiveIntensity).toBeLessThanOrEqual(0.12);
    expect(coreMaterial.roughness).toBeGreaterThanOrEqual(0.16);
    expect(coreMaterial.environmentIntensity).toBeLessThanOrEqual(0.38);
    expect(coreMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the pyro pod pearl shells so the stage-edge practicals read as finished housings instead of bright pearl bulbs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the pyro pod nozzle and ember glass so the stage-edge practicals read as controlled show hardware instead of bright gold fittings with hot flat red cards', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V13_BrushedFestivalGold', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.66, 0.36);
    sharedGoldMaterial.emissiveColor.set(0.08, 0.06, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.28;
    sharedGoldMaterial.environmentIntensity = 0.46;

    const sharedRedMaterial = new PBRMaterial('V13_PyroRedGlass', scene);
    sharedRedMaterial.albedoColor.set(0.96, 0.18, 0.12);
    sharedRedMaterial.emissiveColor.set(0.8, 0.12, 0.08);
    sharedRedMaterial.emissiveIntensity = 0.72;
    sharedRedMaterial.alpha = 1;
    sharedRedMaterial.metallic = 0.04;
    sharedRedMaterial.roughness = 0.16;
    sharedRedMaterial.environmentIntensity = 0.74;

    const goldControl = MeshBuilder.CreateBox('TestPyroPodGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const nozzle = MeshBuilder.CreateBox('V45_PyroPodGoldNozzle', { size: 1 }, scene);
    nozzle.material = sharedGoldMaterial;

    const redControl = MeshBuilder.CreateBox('TestPyroPodRedControl', { size: 1 }, scene);
    redControl.material = sharedRedMaterial;

    const emberGlass = MeshBuilder.CreateBox('V45_PyroPodRedGlass', { size: 1 }, scene);
    emberGlass.material = sharedRedMaterial;

    polishMainStageMaterials([goldControl, nozzle, redControl, emberGlass]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(nozzle.material).toBeInstanceOf(PBRMaterial);
    expect(nozzle.material).not.toBe(sharedGoldMaterial);

    expect(redControl.material).toBe(sharedRedMaterial);
    expect(emberGlass.material).toBeInstanceOf(PBRMaterial);
    expect(emberGlass.material).not.toBe(sharedRedMaterial);

    const nozzleMaterial = nozzle.material as PBRMaterial;
    const emberMaterial = emberGlass.material as PBRMaterial;

    expect(nozzleMaterial.name).toContain('pyro-pod-gold-nozzle');
    expect(nozzleMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(nozzleMaterial.metadata?.mainStageMaterialOverride).toBe('pyro-pod-gold-nozzle');
    expect(nozzleMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(nozzleMaterial.albedoColor.g).toBeLessThanOrEqual(0.18);
    expect(nozzleMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(nozzleMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(nozzleMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(nozzleMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(nozzleMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);

    expect(emberMaterial.name).toContain('pyro-pod-red-glass');
    expect(emberMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(emberMaterial.metadata?.mainStageMaterialOverride).toBe('pyro-pod-red-glass');
    expect(emberMaterial.alpha).toBeLessThanOrEqual(0.5);
    expect(emberMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(emberMaterial.albedoColor.g).toBeLessThanOrEqual(0.08);
    expect(emberMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(emberMaterial.emissiveColor.r).toBeLessThanOrEqual(0.24);
    expect(emberMaterial.emissiveColor.g).toBeLessThanOrEqual(0.05);
    expect(emberMaterial.emissiveColor.b).toBeLessThanOrEqual(0.04);
    expect(emberMaterial.emissiveIntensity).toBeLessThanOrEqual(0.18);
    expect(emberMaterial.roughness).toBeGreaterThanOrEqual(0.2);
    expect(emberMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);
    expect(emberMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the back plaza gateway pearl shells so the arrival frame reads as authored architecture instead of bright ivory slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the V34 arrival-frame inlays, rails, barricades, and gateway accents so the back-plaza approach reads as authored night hardware instead of bright gold strips, flat cyan cards, and proxy-black guard runs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedBlackMaterial = new PBRMaterial('V18_BlackPowderCoatTruss', scene);
    sharedBlackMaterial.albedoColor.set(0.18, 0.2, 0.24);
    sharedBlackMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedBlackMaterial.emissiveIntensity = 0.12;
    sharedBlackMaterial.metallic = 0.14;
    sharedBlackMaterial.roughness = 0.42;
    sharedBlackMaterial.environmentIntensity = 0.56;

    const sharedGoldMaterial = new PBRMaterial('V19_ArrivalBrushedGold', scene);
    sharedGoldMaterial.albedoColor.set(0.84, 0.74, 0.4);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.2;
    sharedGoldMaterial.metallic = 0.82;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.48;

    const sharedCyanMaterial = new PBRMaterial('V19_ArrivalCyanGlow', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const blackControl = MeshBuilder.CreateBox('TestV34BarricadeControl', { size: 1 }, scene);
    blackControl.material = sharedBlackMaterial;

    const leftBarricade = MeshBuilder.CreateBox('V34_BarricadeAssembly_L', { size: 1 }, scene);
    leftBarricade.material = sharedBlackMaterial;

    const rightBarricade = MeshBuilder.CreateBox('V34_BarricadeAssembly_R', { size: 1 }, scene);
    rightBarricade.material = sharedBlackMaterial;

    const goldControl = MeshBuilder.CreateBox('TestV34ArrivalGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const goldInlay = MeshBuilder.CreateBox('V34_ApproachGoldInlayNetwork', { size: 1 }, scene);
    goldInlay.material = sharedGoldMaterial;

    const leftEdgeRail = MeshBuilder.CreateBox('V34_ApproachEdgeRail_L', { size: 1 }, scene);
    leftEdgeRail.material = sharedGoldMaterial;

    const rightEdgeRail = MeshBuilder.CreateBox('V34_ApproachEdgeRail_R', { size: 1 }, scene);
    rightEdgeRail.material = sharedGoldMaterial;

    const leftGatewayCrown = MeshBuilder.CreateBox('V34_BackPlazaGatewayGoldCrown_L', { size: 1 }, scene);
    leftGatewayCrown.material = sharedGoldMaterial;

    const rightGatewayCrown = MeshBuilder.CreateBox('V34_BackPlazaGatewayGoldCrown_R', { size: 1 }, scene);
    rightGatewayCrown.material = sharedGoldMaterial;

    const leftBannerRail = MeshBuilder.CreateBox('V34_BackPlazaBannerRail_L', { size: 1 }, scene);
    leftBannerRail.material = sharedGoldMaterial;

    const rightBannerRail = MeshBuilder.CreateBox('V34_BackPlazaBannerRail_R', { size: 1 }, scene);
    rightBannerRail.material = sharedGoldMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestV34ArrivalCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftGatewayCyan = MeshBuilder.CreateBox('V34_BackPlazaGatewayCyanInlay_L', { size: 1 }, scene);
    leftGatewayCyan.material = sharedCyanMaterial;

    const rightGatewayCyan = MeshBuilder.CreateBox('V34_BackPlazaGatewayCyanInlay_R', { size: 1 }, scene);
    rightGatewayCyan.material = sharedCyanMaterial;

    polishMainStageMaterials([
      blackControl,
      leftBarricade,
      rightBarricade,
      goldControl,
      goldInlay,
      leftEdgeRail,
      rightEdgeRail,
      leftGatewayCrown,
      rightGatewayCrown,
      leftBannerRail,
      rightBannerRail,
      cyanControl,
      leftGatewayCyan,
      rightGatewayCyan,
    ]);

    expect(blackControl.material).toBe(sharedBlackMaterial);
    expect(leftBarricade.material).toBeInstanceOf(PBRMaterial);
    expect(rightBarricade.material).toBe(leftBarricade.material);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(goldInlay.material).toBeInstanceOf(PBRMaterial);
    expect(leftEdgeRail.material).toBe(goldInlay.material);
    expect(rightEdgeRail.material).toBe(goldInlay.material);
    expect(leftGatewayCrown.material).toBe(goldInlay.material);
    expect(rightGatewayCrown.material).toBe(goldInlay.material);
    expect(leftBannerRail.material).toBe(goldInlay.material);
    expect(rightBannerRail.material).toBe(goldInlay.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftGatewayCyan.material).toBeInstanceOf(PBRMaterial);
    expect(rightGatewayCyan.material).toBe(leftGatewayCyan.material);

    const barricadeMaterial = leftBarricade.material as PBRMaterial;
    const goldMaterial = goldInlay.material as PBRMaterial;
    const cyanMaterial = leftGatewayCyan.material as PBRMaterial;

    expect(barricadeMaterial.name).toContain('approach-barricade-assembly');
    expect(barricadeMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(barricadeMaterial.metadata?.mainStageMaterialOverride).toBe('approach-barricade-assembly');
    expect(barricadeMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(barricadeMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(barricadeMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(barricadeMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(barricadeMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(barricadeMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(barricadeMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(goldMaterial.name).toContain('approach-gold-inlay-network');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('approach-gold-inlay-network');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.05);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.14);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.08);

    expect(cyanMaterial.name).toContain('back-plaza-gateway-cyan-inlay');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('back-plaza-gateway-cyan-inlay');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.36);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.08);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the oval portal glow shells so the arrival-side portals read as carved architecture instead of bright pearl side slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V15_PearlShellBeveled', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the inner portal gold reveals and outer sweep spires so the hero portal shoulders read as carved metal structure instead of bright foil braces', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const goldControl = MeshBuilder.CreateBox('TestInnerPortalGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftReveal = MeshBuilder.CreateBox('V50_InnerPortalGoldReveal_L', { size: 1 }, scene);
    leftReveal.material = sharedGoldMaterial;

    const rightReveal = MeshBuilder.CreateBox('V50_InnerPortalGoldReveal_R', { size: 1 }, scene);
    rightReveal.material = sharedGoldMaterial;

    const leftSpire = MeshBuilder.CreateBox('V50_OuterSweepSpire_L', { size: 1 }, scene);
    leftSpire.material = sharedGoldMaterial;

    const rightSpire = MeshBuilder.CreateBox('V50_OuterSweepSpire_R', { size: 1 }, scene);
    rightSpire.material = sharedGoldMaterial;

    polishMainStageMaterials([goldControl, leftReveal, rightReveal, leftSpire, rightSpire]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rightReveal.material).toBe(leftReveal.material);
    expect(leftSpire.material).toBe(leftReveal.material);
    expect(rightSpire.material).toBe(leftReveal.material);

    const goldMaterial = leftReveal.material as PBRMaterial;
    expect(goldMaterial.name).toContain('inner-portal-gold-reveal');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('inner-portal-gold-reveal');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);
  });

  it('darkens the crown obelisk pearl shell masses so the skyline reads as a layered silhouette instead of pale spear proxies', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the crown obelisk tracery, shadow spine, and apex jewel so the skyline crest reads as carved metal and smoked crystal instead of bright gold strips around a flat cyan spike', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestCrownObeliskGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const goldTracery = MeshBuilder.CreateBox('V52_CrownObeliskGoldTracery', { size: 1 }, scene);
    goldTracery.material = sharedGoldMaterial;

    const leftGoldFin = MeshBuilder.CreateBox('V52_CrownSpireGoldFin_L', { size: 1 }, scene);
    leftGoldFin.material = sharedGoldMaterial;

    const rightGoldFin = MeshBuilder.CreateBox('V52_CrownSpireGoldFin_R', { size: 1 }, scene);
    rightGoldFin.material = sharedGoldMaterial;

    const apexPedestal = MeshBuilder.CreateBox('V52_CrownApexPedestal', { size: 1 }, scene);
    apexPedestal.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestCrownObeliskShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const shadowSpine = MeshBuilder.CreateBox('V52_CrownObeliskShadowSpine', { size: 1 }, scene);
    shadowSpine.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCrownObeliskCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const apexCrystal = MeshBuilder.CreateBox('V52_CrownApexCrystal', { size: 1 }, scene);
    apexCrystal.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      goldTracery,
      leftGoldFin,
      rightGoldFin,
      apexPedestal,
      shadowControl,
      shadowSpine,
      cyanControl,
      apexCrystal,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(goldTracery.material).toBeInstanceOf(PBRMaterial);
    expect(leftGoldFin.material).toBe(goldTracery.material);
    expect(rightGoldFin.material).toBe(goldTracery.material);
    expect(apexPedestal.material).toBe(goldTracery.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(shadowSpine.material).toBeInstanceOf(PBRMaterial);
    expect(shadowSpine.material).not.toBe(sharedShadowMaterial);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(apexCrystal.material).toBeInstanceOf(PBRMaterial);
    expect(apexCrystal.material).not.toBe(sharedCyanMaterial);

    const goldMaterial = goldTracery.material as PBRMaterial;
    const shadowMaterial = shadowSpine.material as PBRMaterial;
    const cyanMaterial = apexCrystal.material as PBRMaterial;

    expect(goldMaterial.name).toContain('crown-obelisk-gold-tracery');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('crown-obelisk-gold-tracery');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('crown-obelisk-shadow-spine');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('crown-obelisk-shadow-spine');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('crown-obelisk-apex-crystal');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('crown-obelisk-apex-crystal');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the crown jewel pearl sockets so the apex framing reads as carved shell work instead of pale gem pedestals', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the crown jewel cradle, shadow core, and cyan jewel so the apex reads as a controlled celestial focal point instead of bright foil around a flat cyan gem', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestCrownJewelGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const goldCradle = MeshBuilder.CreateBox('V71_CrownJewelGoldCradle', { size: 1 }, scene);
    goldCradle.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestCrownJewelShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const shadowCore = MeshBuilder.CreateBox('V71_CrownJewelShadowCore', { size: 1 }, scene);
    shadowCore.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestCrownJewelCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const cyanJewel = MeshBuilder.CreateBox('V71_CrownTopCyanJewel', { size: 1 }, scene);
    cyanJewel.material = sharedCyanMaterial;

    polishMainStageMaterials([goldControl, goldCradle, shadowControl, shadowCore, cyanControl, cyanJewel]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(goldCradle.material).toBeInstanceOf(PBRMaterial);
    expect(goldCradle.material).not.toBe(sharedGoldMaterial);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(shadowCore.material).toBeInstanceOf(PBRMaterial);
    expect(shadowCore.material).not.toBe(sharedShadowMaterial);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(cyanJewel.material).toBeInstanceOf(PBRMaterial);
    expect(cyanJewel.material).not.toBe(sharedCyanMaterial);

    const goldMaterial = goldCradle.material as PBRMaterial;
    const shadowMaterial = shadowCore.material as PBRMaterial;
    const cyanMaterial = cyanJewel.material as PBRMaterial;

    expect(goldMaterial.name).toContain('crown-jewel-gold-cradle');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('crown-jewel-gold-cradle');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('crown-jewel-shadow-core');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('crown-jewel-shadow-core');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('crown-jewel-cyan');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('crown-jewel-cyan');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('darkens the spawn gallery pier pearl shells so the arrival buttresses read as carved support architecture instead of bright side slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V16_PearlArchitecturalShell', scene);
    sharedPearlMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.34;

    const controlPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
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

  it('rebalances the spawn gallery cornice gold, shadow spines, and cyan lancets so the arrival arcade reads as carved night architecture instead of bright foil bands around flat cyan inserts', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.82, 0.74, 0.42);
    sharedGoldMaterial.emissiveColor.set(0.1, 0.07, 0.03);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.84;
    sharedGoldMaterial.roughness = 0.22;
    sharedGoldMaterial.environmentIntensity = 0.5;

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.18, 0.22, 0.26);
    sharedShadowMaterial.emissiveColor.set(0.03, 0.04, 0.05);
    sharedShadowMaterial.emissiveIntensity = 0.1;
    sharedShadowMaterial.metallic = 0.12;
    sharedShadowMaterial.roughness = 0.42;
    sharedShadowMaterial.environmentIntensity = 0.56;

    const sharedCyanMaterial = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanMaterial.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanMaterial.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanMaterial.emissiveIntensity = 0.34;
    sharedCyanMaterial.alpha = 1;
    sharedCyanMaterial.environmentIntensity = 0.82;

    const goldControl = MeshBuilder.CreateBox('TestSpawnGalleryGoldControl', { size: 1 }, scene);
    goldControl.material = sharedGoldMaterial;

    const leftCornice = MeshBuilder.CreateBox('V53_SpawnGalleryCorniceGold_L', { size: 1 }, scene);
    leftCornice.material = sharedGoldMaterial;

    const rightCornice = MeshBuilder.CreateBox('V53_SpawnGalleryCorniceGold_R', { size: 1 }, scene);
    rightCornice.material = sharedGoldMaterial;

    const leftHalo = MeshBuilder.CreateBox('V53_SpawnGalleryHaloGold_L', { size: 1 }, scene);
    leftHalo.material = sharedGoldMaterial;

    const rightHalo = MeshBuilder.CreateBox('V53_SpawnGalleryHaloGold_R', { size: 1 }, scene);
    rightHalo.material = sharedGoldMaterial;

    const shadowControl = MeshBuilder.CreateBox('TestSpawnGalleryShadowControl', { size: 1 }, scene);
    shadowControl.material = sharedShadowMaterial;

    const leftShadow = MeshBuilder.CreateBox('V53_SpawnGalleryShadowSpine_L', { size: 1 }, scene);
    leftShadow.material = sharedShadowMaterial;

    const rightShadow = MeshBuilder.CreateBox('V53_SpawnGalleryShadowSpine_R', { size: 1 }, scene);
    rightShadow.material = sharedShadowMaterial;

    const cyanControl = MeshBuilder.CreateBox('TestSpawnGalleryCyanControl', { size: 1 }, scene);
    cyanControl.material = sharedCyanMaterial;

    const leftLancet = MeshBuilder.CreateBox('V53_SpawnGalleryCyanLancets_L', { size: 1 }, scene);
    leftLancet.material = sharedCyanMaterial;

    const rightLancet = MeshBuilder.CreateBox('V53_SpawnGalleryCyanLancets_R', { size: 1 }, scene);
    rightLancet.material = sharedCyanMaterial;

    polishMainStageMaterials([
      goldControl,
      leftCornice,
      rightCornice,
      leftHalo,
      rightHalo,
      shadowControl,
      leftShadow,
      rightShadow,
      cyanControl,
      leftLancet,
      rightLancet,
    ]);

    expect(goldControl.material).toBe(sharedGoldMaterial);
    expect(leftCornice.material).toBeInstanceOf(PBRMaterial);
    expect(rightCornice.material).toBe(leftCornice.material);
    expect(leftHalo.material).toBe(leftCornice.material);
    expect(rightHalo.material).toBe(leftCornice.material);

    expect(shadowControl.material).toBe(sharedShadowMaterial);
    expect(leftShadow.material).toBeInstanceOf(PBRMaterial);
    expect(rightShadow.material).toBe(leftShadow.material);

    expect(cyanControl.material).toBe(sharedCyanMaterial);
    expect(leftLancet.material).toBeInstanceOf(PBRMaterial);
    expect(rightLancet.material).toBe(leftLancet.material);

    const goldMaterial = leftCornice.material as PBRMaterial;
    const shadowMaterial = leftShadow.material as PBRMaterial;
    const cyanMaterial = leftLancet.material as PBRMaterial;

    expect(goldMaterial.name).toContain('spawn-gallery-arcade-gold');
    expect(goldMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(goldMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gallery-arcade-gold');
    expect(goldMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.albedoColor.g).toBeLessThanOrEqual(0.12);
    expect(goldMaterial.albedoColor.b).toBeLessThanOrEqual(0.06);
    expect(goldMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(goldMaterial.metallic).toBeLessThanOrEqual(0.16);
    expect(goldMaterial.roughness).toBeGreaterThanOrEqual(0.9);
    expect(goldMaterial.environmentIntensity).toBeLessThanOrEqual(0.12);

    expect(shadowMaterial.name).toContain('spawn-gallery-arcade-shadow');
    expect(shadowMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(shadowMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gallery-arcade-shadow');
    expect(shadowMaterial.albedoColor.r).toBeLessThanOrEqual(0.14);
    expect(shadowMaterial.albedoColor.g).toBeLessThanOrEqual(0.17);
    expect(shadowMaterial.albedoColor.b).toBeLessThanOrEqual(0.21);
    expect(shadowMaterial.emissiveIntensity).toBeLessThanOrEqual(0.02);
    expect(shadowMaterial.metallic).toBeLessThanOrEqual(0.08);
    expect(shadowMaterial.roughness).toBeGreaterThanOrEqual(0.84);
    expect(shadowMaterial.environmentIntensity).toBeLessThanOrEqual(0.28);

    expect(cyanMaterial.name).toContain('spawn-gallery-arcade-cyan');
    expect(cyanMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(cyanMaterial.metadata?.mainStageMaterialOverride).toBe('spawn-gallery-arcade-cyan');
    expect(cyanMaterial.alpha).toBeLessThanOrEqual(0.38);
    expect(cyanMaterial.albedoColor.r).toBeLessThanOrEqual(0.12);
    expect(cyanMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(cyanMaterial.albedoColor.b).toBeLessThanOrEqual(0.3);
    expect(cyanMaterial.emissiveIntensity).toBeLessThanOrEqual(0.1);
    expect(cyanMaterial.roughness).toBeGreaterThanOrEqual(0.18);
    expect(cyanMaterial.environmentIntensity).toBeLessThanOrEqual(0.34);
    expect(cyanMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
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

  it('darkens the hero portal outer ogives so the stage mouth reads as carved shell architecture instead of bright pearl walls', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.74, 0.68);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.36;

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftOgive = MeshBuilder.CreateBox('V25_HeroPortalOuterOgive_L', { size: 1 }, scene);
    leftOgive.material = sharedPearlMaterial;

    const rightOgive = MeshBuilder.CreateBox('V25_HeroPortalOuterOgive_R', { size: 1 }, scene);
    rightOgive.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftOgive, rightOgive]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftOgive.material).toBeInstanceOf(PBRMaterial);
    expect(rightOgive.material).toBeInstanceOf(PBRMaterial);
    expect(leftOgive.material).not.toBe(sharedPearlMaterial);
    expect(rightOgive.material).not.toBe(sharedPearlMaterial);
    expect(rightOgive.material).toBe(leftOgive.material);

    const ogiveMaterial = leftOgive.material as PBRMaterial;
    expect(ogiveMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(ogiveMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-outer-ogive');
    expect(ogiveMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(ogiveMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(ogiveMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(ogiveMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(ogiveMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(ogiveMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(ogiveMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('tones down the hero portal gold reveals so the stage mouth reads as carved metal detailing instead of bright foil seams', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const leftReveal = MeshBuilder.CreateBox('V25_HeroPortalGoldReveal_L', { size: 1 }, scene);
    leftReveal.material = sharedGoldMaterial;

    const rightReveal = MeshBuilder.CreateBox('V25_HeroPortalGoldReveal_R', { size: 1 }, scene);
    rightReveal.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, leftReveal, rightReveal]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(leftReveal.material).toBeInstanceOf(PBRMaterial);
    expect(rightReveal.material).toBeInstanceOf(PBRMaterial);
    expect(leftReveal.material).not.toBe(sharedGoldMaterial);
    expect(rightReveal.material).not.toBe(sharedGoldMaterial);
    expect(rightReveal.material).toBe(leftReveal.material);

    const revealMaterial = leftReveal.material as PBRMaterial;
    expect(revealMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(revealMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-gold-reveal');
    expect(revealMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(revealMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(revealMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(revealMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(revealMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(revealMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(revealMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the hero portal pearl aprons so the stage mouth base reads as carved shell architecture instead of a bright ivory ledge', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('TestPearlControlMesh', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const leftApron = MeshBuilder.CreateBox('V25_HeroPortalPearlApron_L', { size: 1 }, scene);
    leftApron.material = sharedIvoryMaterial;

    const rightApron = MeshBuilder.CreateBox('V25_HeroPortalPearlApron_R', { size: 1 }, scene);
    rightApron.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, leftApron, rightApron]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(leftApron.material).toBeInstanceOf(PBRMaterial);
    expect(rightApron.material).toBeInstanceOf(PBRMaterial);
    expect(leftApron.material).not.toBe(sharedIvoryMaterial);
    expect(rightApron.material).not.toBe(sharedIvoryMaterial);
    expect(rightApron.material).toBe(leftApron.material);

    const apronMaterial = leftApron.material as PBRMaterial;
    expect(apronMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(apronMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-pearl-apron');
    expect(apronMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(apronMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(apronMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(apronMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(apronMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(apronMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(apronMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('neutralizes the hero portal shadow vault so the stage mouth reads as recessed depth instead of a bright cyan insert', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const shadowVault = MeshBuilder.CreateBox('V25_HeroPortalShadowVault', { size: 1 }, scene);
    shadowVault.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, shadowVault]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(shadowVault.material).toBeInstanceOf(PBRMaterial);
    expect(shadowVault.material).not.toBe(sharedShadowMaterial);

    const vaultMaterial = shadowVault.material as PBRMaterial;
    expect(vaultMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(vaultMaterial.metadata?.mainStageMaterialOverride).toBe('hero-portal-shadow-vault');
    expect(vaultMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(vaultMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(vaultMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(vaultMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(vaultMaterial.roughness).toBeGreaterThanOrEqual(0.78);
    expect(vaultMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('smokes the crown apex crystal so the portal crest reads as a subdued jewel instead of a bright cyan card', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedCyanGlass = new PBRMaterial('V20_CelestialCyanGlass', scene);
    sharedCyanGlass.albedoColor.set(0.42, 0.86, 0.98);
    sharedCyanGlass.emissiveColor.set(0.08, 0.3, 0.4);
    sharedCyanGlass.emissiveIntensity = 0.34;
    sharedCyanGlass.alpha = 1;
    sharedCyanGlass.environmentIntensity = 0.82;

    const controlGlass = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlGlass.material = sharedCyanGlass;

    const apexCrystal = MeshBuilder.CreateBox('V25_CrownApexCrystal', { size: 1 }, scene);
    apexCrystal.material = sharedCyanGlass;

    polishMainStageMaterials([controlGlass, apexCrystal]);

    expect(controlGlass.material).toBe(sharedCyanGlass);
    expect(apexCrystal.material).toBeInstanceOf(PBRMaterial);
    expect(apexCrystal.material).not.toBe(sharedCyanGlass);

    const crystalMaterial = apexCrystal.material as PBRMaterial;
    expect(crystalMaterial.metadata?.mainStageMaterialPolish).toBe('emissive');
    expect(crystalMaterial.metadata?.mainStageMaterialOverride).toBe('crown-apex-crystal');
    expect(crystalMaterial.alpha).toBeLessThanOrEqual(0.42);
    expect(crystalMaterial.albedoColor.r).toBeLessThanOrEqual(0.16);
    expect(crystalMaterial.albedoColor.g).toBeLessThanOrEqual(0.28);
    expect(crystalMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(crystalMaterial.emissiveIntensity).toBeLessThanOrEqual(0.14);
    expect(crystalMaterial.roughness).toBeGreaterThanOrEqual(0.12);
    expect(crystalMaterial.environmentIntensity).toBeLessThanOrEqual(0.44);
    expect(crystalMaterial.transparencyMode).toBe(PBRMaterial.PBRMATERIAL_ALPHABLEND);
  });

  it('keeps the performance dais lower tier grounded but readable so the stage base reads as recessed support mass instead of a dead-black cyan slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedShadowMaterial = new PBRMaterial('V20_RecessedWarmShadow', scene);
    sharedShadowMaterial.albedoColor.set(0.46, 0.84, 0.98);
    sharedShadowMaterial.emissiveColor.set(0.18, 0.36, 0.44);
    sharedShadowMaterial.emissiveIntensity = 0.32;

    const controlShadow = MeshBuilder.CreateBox('V31_CenterGlassLens', { size: 1 }, scene);
    controlShadow.material = sharedShadowMaterial;

    const lowerDais = MeshBuilder.CreateBox('V27_PerformanceDaisLower', { size: 1 }, scene);
    lowerDais.material = sharedShadowMaterial;

    polishMainStageMaterials([controlShadow, lowerDais]);

    expect(controlShadow.material).toBe(sharedShadowMaterial);
    expect(lowerDais.material).toBeInstanceOf(PBRMaterial);
    expect(lowerDais.material).not.toBe(sharedShadowMaterial);

    const daisMaterial = lowerDais.material as PBRMaterial;
    expect(daisMaterial.metadata?.mainStageMaterialPolish).toBe('black');
    expect(daisMaterial.metadata?.mainStageMaterialOverride).toBe('performance-dais-lower');
    expect(daisMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.16);
    expect(daisMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.19);
    expect(daisMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.23);
    expect(daisMaterial.albedoColor.r).toBeLessThanOrEqual(0.28);
    expect(daisMaterial.albedoColor.g).toBeLessThanOrEqual(0.32);
    expect(daisMaterial.albedoColor.b).toBeLessThanOrEqual(0.38);
    expect(daisMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.02);
    expect(daisMaterial.emissiveIntensity).toBeLessThanOrEqual(0.04);
    expect(daisMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(daisMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.3);
    expect(daisMaterial.environmentIntensity).toBeLessThanOrEqual(0.42);
  });

  it('keeps the performance dais mid tier shaded but readable so the stage body reads as carved support mass instead of a dead-black ivory slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedIvoryMaterial = new PBRMaterial('V19_GatewayPearlIvory', scene);
    sharedIvoryMaterial.albedoColor.set(0.82, 0.8, 0.76);
    sharedIvoryMaterial.emissiveColor.set(0.08, 0.07, 0.06);
    sharedIvoryMaterial.emissiveIntensity = 0.16;
    sharedIvoryMaterial.roughness = 0.34;

    const controlIvory = MeshBuilder.CreateBox('TestPearlControlMesh', { size: 1 }, scene);
    controlIvory.material = sharedIvoryMaterial;

    const midDais = MeshBuilder.CreateBox('V27_PerformanceDaisMid', { size: 1 }, scene);
    midDais.material = sharedIvoryMaterial;

    polishMainStageMaterials([controlIvory, midDais]);

    expect(controlIvory.material).toBe(sharedIvoryMaterial);
    expect(midDais.material).toBeInstanceOf(PBRMaterial);
    expect(midDais.material).not.toBe(sharedIvoryMaterial);

    const daisMaterial = midDais.material as PBRMaterial;
    expect(daisMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(daisMaterial.metadata?.mainStageMaterialOverride).toBe('performance-dais-mid');
    expect(daisMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.26);
    expect(daisMaterial.albedoColor.g).toBeGreaterThanOrEqual(0.28);
    expect(daisMaterial.albedoColor.b).toBeGreaterThanOrEqual(0.32);
    expect(daisMaterial.albedoColor.r).toBeLessThanOrEqual(0.26);
    expect(daisMaterial.albedoColor.g).toBeLessThanOrEqual(0.3);
    expect(daisMaterial.albedoColor.b).toBeLessThanOrEqual(0.34);
    expect(daisMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.02);
    expect(daisMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(daisMaterial.roughness).toBeGreaterThanOrEqual(0.8);
    expect(daisMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(daisMaterial.environmentIntensity).toBeGreaterThanOrEqual(0.16);
    expect(daisMaterial.environmentIntensity).toBeLessThanOrEqual(0.2);
  });

  it('tones down the performance dais upper tier so the stage crown reads as carved metal detail instead of a bright foil slab', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.92, 0.76, 0.32);
    sharedGoldMaterial.emissiveColor.set(0.24, 0.16, 0.06);
    sharedGoldMaterial.emissiveIntensity = 0.26;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.22;

    const controlGold = MeshBuilder.CreateBox('TestGoldControlMesh', { size: 1 }, scene);
    controlGold.material = sharedGoldMaterial;

    const upperDais = MeshBuilder.CreateBox('V27_PerformanceDaisUpper', { size: 1 }, scene);
    upperDais.material = sharedGoldMaterial;

    polishMainStageMaterials([controlGold, upperDais]);

    expect(controlGold.material).toBe(sharedGoldMaterial);
    expect(upperDais.material).toBeInstanceOf(PBRMaterial);
    expect(upperDais.material).not.toBe(sharedGoldMaterial);

    const daisMaterial = upperDais.material as PBRMaterial;
    expect(daisMaterial.metadata?.mainStageMaterialPolish).toBe('gold');
    expect(daisMaterial.metadata?.mainStageMaterialOverride).toBe('performance-dais-upper');
    expect(daisMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(daisMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(daisMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(daisMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(daisMaterial.metallic).toBeLessThanOrEqual(0.2);
    expect(daisMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(daisMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('tones down the VIP terrace gold inlays so the podium edge reads as carved support detail instead of bright foil seams', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedGoldMaterial = new PBRMaterial('V20_ChasedGoldFiligree', scene);
    sharedGoldMaterial.albedoColor.set(0.76, 0.62, 0.24);
    sharedGoldMaterial.emissiveColor.set(0.12, 0.08, 0.02);
    sharedGoldMaterial.emissiveIntensity = 0.18;
    sharedGoldMaterial.metallic = 0.9;
    sharedGoldMaterial.roughness = 0.28;

    const otherGold = MeshBuilder.CreateBox('TestCrowdControlRailGoldControl', { size: 1 }, scene);
    otherGold.material = sharedGoldMaterial;

    const leftInlay = MeshBuilder.CreateBox('V26_VipTerraceGoldInlay_L', { size: 1 }, scene);
    leftInlay.material = sharedGoldMaterial;

    const rightInlay = MeshBuilder.CreateBox('V26_VipTerraceGoldInlay_R', { size: 1 }, scene);
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
    expect(inlayMaterial.metadata?.mainStageMaterialOverride).toBe('vip-terrace-gold-inlay');
    expect(inlayMaterial.albedoColor.r).toBeLessThanOrEqual(0.2);
    expect(inlayMaterial.albedoColor.g).toBeLessThanOrEqual(0.16);
    expect(inlayMaterial.albedoColor.b).toBeLessThanOrEqual(0.08);
    expect(inlayMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(inlayMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(inlayMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });

  it('darkens the VIP terrace outer sweeps so the podium flanks read as carved support shells instead of bright pearl slabs', () => {
    engine ??= new NullEngine();
    scene ??= new Scene(engine);

    const sharedPearlMaterial = new PBRMaterial('V20_LayeredPearlShell', scene);
    sharedPearlMaterial.albedoColor.set(0.78, 0.74, 0.68);
    sharedPearlMaterial.emissiveColor.set(0.08, 0.07, 0.05);
    sharedPearlMaterial.emissiveIntensity = 0.16;
    sharedPearlMaterial.roughness = 0.36;

    const otherPearl = MeshBuilder.CreateBox('V24_OuterCrownLamella_L', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const leftSweep = MeshBuilder.CreateBox('V26_VipTerraceOuterSweep_L', { size: 1 }, scene);
    leftSweep.material = sharedPearlMaterial;

    const rightSweep = MeshBuilder.CreateBox('V26_VipTerraceOuterSweep_R', { size: 1 }, scene);
    rightSweep.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, leftSweep, rightSweep]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(leftSweep.material).toBeInstanceOf(PBRMaterial);
    expect(rightSweep.material).toBeInstanceOf(PBRMaterial);
    expect(leftSweep.material).not.toBe(sharedPearlMaterial);
    expect(rightSweep.material).not.toBe(sharedPearlMaterial);
    expect(rightSweep.material).toBe(leftSweep.material);

    const sweepMaterial = leftSweep.material as PBRMaterial;
    expect(sweepMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(sweepMaterial.metadata?.mainStageMaterialOverride).toBe('vip-terrace-outer-sweep');
    expect(sweepMaterial.albedoColor.r).toBeLessThanOrEqual(0.22);
    expect(sweepMaterial.albedoColor.g).toBeLessThanOrEqual(0.24);
    expect(sweepMaterial.albedoColor.b).toBeLessThanOrEqual(0.28);
    expect(sweepMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(sweepMaterial.roughness).toBeGreaterThanOrEqual(0.86);
    expect(sweepMaterial.clearCoat.intensity).toBeLessThanOrEqual(0.06);
    expect(sweepMaterial.environmentIntensity).toBeLessThanOrEqual(0.14);
  });
});
