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

    const otherPearl = MeshBuilder.CreateBox('V68_HeroPortalPearlApron', { size: 1 }, scene);
    otherPearl.material = sharedPearlMaterial;

    const vipFascia = MeshBuilder.CreateBox('V30_VipShellFascia_L', { size: 1 }, scene);
    vipFascia.material = sharedPearlMaterial;

    polishMainStageMaterials([otherPearl, vipFascia]);

    expect(otherPearl.material).toBe(sharedPearlMaterial);
    expect(vipFascia.material).toBeInstanceOf(PBRMaterial);
    expect(vipFascia.material).not.toBe(sharedPearlMaterial);

    const fasciaMaterial = vipFascia.material as PBRMaterial;
    expect(fasciaMaterial.metadata?.mainStageMaterialPolish).toBe('pearl');
    expect(fasciaMaterial.metadata?.mainStageMaterialOverride).toBe('vip-shell-fascia');
    expect(fasciaMaterial.albedoColor.r).toBeGreaterThanOrEqual(0.36);
    expect(fasciaMaterial.albedoColor.g).toBeLessThanOrEqual(0.46);
    expect(fasciaMaterial.albedoColor.b).toBeLessThanOrEqual(0.54);
    expect(fasciaMaterial.emissiveIntensity).toBeLessThanOrEqual(0.03);
    expect(fasciaMaterial.roughness).toBeGreaterThanOrEqual(0.68);
    expect(fasciaMaterial.environmentIntensity).toBeLessThanOrEqual(0.5);
  });
});
