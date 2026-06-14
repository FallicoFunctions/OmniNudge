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
        'main-stage-approach-light-ribbon-left',
        'main-stage-approach-light-ribbon-right',
      ]),
    );
    expect(rig.surfaces.every((surface) => surface.parent === rig.root)).toBe(true);
    expect(rig.surfaces.every((surface) => surface.checkCollisions === false)).toBe(true);

    const centerMaterial = rig.surfaces[0].material as PBRMaterial;
    expect(centerMaterial.name).toBe('main-stage-celestial-screen-material');
    expect(centerMaterial.emissiveIntensity).toBeGreaterThan(2);
    expect(centerMaterial.backFaceCulling).toBe(false);
  });
});
