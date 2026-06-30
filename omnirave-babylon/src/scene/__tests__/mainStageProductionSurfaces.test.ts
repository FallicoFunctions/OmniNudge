import { NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createMainStageProductionSurfaces } from '../createMainStageProductionSurfaces';

describe('createMainStageProductionSurfaces', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
    scene = undefined;
    engine = undefined;
  });

  it('adds named lightweight emissive screen and approach surfaces for the Main Stage', () => {
    engine = new NullEngine();
    scene = new Scene(engine);

    const rig = createMainStageProductionSurfaces(scene);

    expect(rig.root.name).toBe('main-stage-production-surfaces');
    expect(rig.surfaces.map((surface) => surface.name)).toEqual(
      expect.arrayContaining([
        'main-stage-center-celestial-screen',
        'main-stage-crown-oracle-screen',
        'main-stage-wing-screen-left',
        'main-stage-wing-screen-right',
        'main-stage-center-celestial-horizon-line',
        'main-stage-center-celestial-meridian-line',
        'main-stage-crown-oracle-core',
        'main-stage-wing-screen-left-keyline',
        'main-stage-wing-screen-right-keyline',
        'main-stage-approach-light-ribbon-left',
        'main-stage-approach-light-ribbon-right',
        'main-stage-center-beacon-left-outer',
        'main-stage-center-beacon-right-outer',
        'main-stage-crown-lattice-tracer-left',
        'main-stage-crown-lattice-tracer-right',
        'main-stage-center-portal-jamb-left',
        'main-stage-center-portal-jamb-right',
      ]),
    );
    expect(rig.surfaces.every((surface) => surface.parent === rig.root)).toBe(true);
    expect(rig.surfaces.every((surface) => surface.checkCollisions === false)).toBe(true);

    const centerMaterial = rig.surfaces[0].material as PBRMaterial;
    expect(centerMaterial.name).toBe('main-stage-celestial-screen-material');
    expect(centerMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.18);
    expect(centerMaterial.emissiveIntensity).toBeLessThanOrEqual(0.26);
    expect(centerMaterial.alpha).toBeLessThanOrEqual(0.16);
    expect(centerMaterial.backFaceCulling).toBe(false);
    expect(centerMaterial.metallic).toBeGreaterThanOrEqual(0.1);
    expect(centerMaterial.roughness).toBeLessThanOrEqual(0.26);

    const accentSurface = rig.surfaces.find(
      (surface) => surface.name === 'main-stage-center-celestial-horizon-line',
    );
    expect(accentSurface).toBeDefined();
    const accentMaterial = accentSurface?.material as PBRMaterial | undefined;
    expect(accentMaterial?.name).toBe('main-stage-celestial-accent-material');
    expect(accentMaterial?.emissiveIntensity).toBeGreaterThan(centerMaterial.emissiveIntensity);
    expect(accentMaterial?.emissiveIntensity).toBeLessThanOrEqual(1.15);
    expect(accentMaterial?.alpha).toBeLessThanOrEqual(0.38);

    const screenBaseSurfaces = rig.surfaces.filter(
      (surface) => surface.metadata?.productionRole === 'screen-base',
    );
    expect(screenBaseSurfaces).toHaveLength(4);
    expect(scene?.getMeshByName('main-stage-center-celestial-screen-housing')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-oracle-screen-housing')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-housing')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-housing')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-frame-top')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-frame-top')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-mullion-01')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-mullion-02')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-mullion-01')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-mullion-02')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-screen-crossbar')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-inset')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-halo')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-portal-ring')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-latitude-north')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-latitude-south')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-spine-left')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-celestial-spine-right')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-oracle-inset')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-oracle-halo')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-oracle-sigil-ring')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-oracle-pillar-left')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-oracle-pillar-right')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-inset')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-inner-frame')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-scanline-01')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-scanline-06')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-rail-left')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-left-rail-right')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-inset')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-inner-frame')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-scanline-01')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-scanline-06')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-rail-left')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-wing-screen-right-rail-right')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-beacon-left-outer')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-beacon-left-inner')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-beacon-right-inner')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-beacon-right-outer')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-beacon-left-outer-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-beacon-right-outer-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-lattice-tracer-left')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-lattice-tracer-right')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-lattice-tracer-left-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-crown-lattice-tracer-right-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-jamb-left')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-jamb-right')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-jamb-left-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-jamb-right-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-header')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-header-glow')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-sill')).not.toBeNull();
    expect(scene?.getMeshByName('main-stage-center-portal-sill-glow')).not.toBeNull();

    const wingHousing = scene?.getMeshByName('main-stage-wing-screen-right-housing');
    expect(wingHousing?.metadata).toMatchObject({
      productionRole: 'screen-housing',
      screenTarget: 'main-stage-wing-screen-right',
    });

    const wingMullion = scene?.getMeshByName('main-stage-wing-screen-right-mullion-01');
    expect(wingMullion?.metadata).toMatchObject({
      productionRole: 'screen-mullion',
      screenTarget: 'main-stage-wing-screen-right',
    });

    const weightedScreenGlow = screenBaseSurfaces.reduce((total, surface) => {
      if (typeof surface.metadata?.productionArea !== 'number') {
        return total;
      }
      const material = surface.material as PBRMaterial;
      return total + surface.metadata.productionArea * material.emissiveIntensity * material.alpha;
    }, 0);
    expect(weightedScreenGlow).toBeLessThanOrEqual(7);

    const housingMaterial = scene?.getMaterialByName('main-stage-screen-housing-material') as
      | PBRMaterial
      | undefined;
    expect(housingMaterial?.alpha).toBe(1);
    expect(housingMaterial?.metallic).toBeGreaterThanOrEqual(0.4);
    expect(housingMaterial?.roughness).toBeLessThanOrEqual(0.42);

    const focalMaterial = scene?.getMaterialByName('main-stage-screen-focal-material') as
      | PBRMaterial
      | undefined;
    expect(focalMaterial?.emissiveIntensity).toBeGreaterThanOrEqual(0.48);
    expect(focalMaterial?.alpha).toBeLessThanOrEqual(0.38);

    const haloMaterial = scene?.getMaterialByName('main-stage-screen-halo-material') as
      | PBRMaterial
      | undefined;
    expect(haloMaterial?.emissiveIntensity).toBeGreaterThanOrEqual(0.9);
    expect(haloMaterial?.alpha).toBeLessThanOrEqual(0.18);

    const scanlineCount = scene?.meshes.filter(
      (mesh) => mesh.metadata?.productionRole === 'screen-scanline',
    ).length;
    expect(scanlineCount).toBeGreaterThanOrEqual(12);

    const focalMeshCount = scene?.meshes.filter(
      (mesh) => mesh.metadata?.productionRole === 'screen-focal',
    ).length;
    expect(focalMeshCount).toBeGreaterThanOrEqual(8);

    const stageBeaconCount = scene?.meshes.filter(
      (mesh) => mesh.metadata?.productionRole === 'stage-beacon',
    ).length;
    expect(stageBeaconCount).toBeGreaterThanOrEqual(18);

    const mullionCount = scene?.meshes.filter((mesh) => mesh.metadata?.productionRole === 'screen-mullion').length;
    expect(mullionCount).toBeGreaterThanOrEqual(7);
  });
});
