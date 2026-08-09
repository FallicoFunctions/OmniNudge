import { ImageProcessingConfiguration, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createAtmosphereRig } from '../createAtmosphereRig';

describe('createAtmosphereRig', () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
  });

  it('keeps the night grade bright enough to read the distant Crown without crushing its pale structure', () => {
    engine = new NullEngine();
    scene = new Scene(engine);

    const { imageProcessing } = createAtmosphereRig(scene);

    expect(imageProcessing.toneMappingEnabled).toBe(true);
    expect(imageProcessing.toneMappingType).toBe(ImageProcessingConfiguration.TONEMAPPING_ACES);
    expect(imageProcessing.exposure).toBeGreaterThanOrEqual(2.1);
    expect(imageProcessing.exposure).toBeLessThanOrEqual(2.4);
    expect(imageProcessing.contrast).toBeGreaterThanOrEqual(1.15);
    expect(imageProcessing.contrast).toBeLessThanOrEqual(1.3);
  });
});
