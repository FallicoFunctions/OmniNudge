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
      ]),
    );
    expect(rig.surfaces.every((surface) => surface.parent === rig.root)).toBe(true);
    expect(rig.surfaces.every((surface) => surface.checkCollisions === false)).toBe(true);

    const centerMaterial = rig.surfaces[0].material as PBRMaterial;
    expect(centerMaterial.name).toBe('main-stage-celestial-screen-material');
    expect(centerMaterial.emissiveIntensity).toBeGreaterThanOrEqual(0.18);
    expect(centerMaterial.emissiveIntensity).toBeLessThanOrEqual(0.42);
    expect(centerMaterial.alpha).toBeLessThanOrEqual(0.24);
    expect(centerMaterial.backFaceCulling).toBe(false);

    const accentSurface = rig.surfaces.find(
      (surface) => surface.name === 'main-stage-center-celestial-horizon-line',
    );
    expect(accentSurface).toBeDefined();
    const accentMaterial = accentSurface?.material as PBRMaterial | undefined;
    expect(accentMaterial?.name).toBe('main-stage-celestial-accent-material');
    expect(accentMaterial?.emissiveIntensity).toBeGreaterThan(centerMaterial.emissiveIntensity);
    expect(accentMaterial?.emissiveIntensity).toBeLessThanOrEqual(1.75);

    const screenBaseSurfaces = rig.surfaces.filter(
      (surface) => surface.metadata?.productionRole === 'screen-base',
    );
    expect(screenBaseSurfaces).toHaveLength(4);

    const weightedScreenGlow = screenBaseSurfaces.reduce((total, surface) => {
      if (typeof surface.metadata?.productionArea !== 'number') {
        return total;
      }
      const material = surface.material as PBRMaterial;
      return total + surface.metadata.productionArea * material.emissiveIntensity * material.alpha;
    }, 0);
    expect(weightedScreenGlow).toBeLessThanOrEqual(18);
  });
});
