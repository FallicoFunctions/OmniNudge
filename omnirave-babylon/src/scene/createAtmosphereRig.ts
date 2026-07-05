import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import type { Scene } from '@babylonjs/core/scene.js';

export function createAtmosphereRig(scene: Scene) {
  const imageProcessing = scene.imageProcessingConfiguration;
  imageProcessing.toneMappingEnabled = true;
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  imageProcessing.exposure = 1.12;
  imageProcessing.contrast = 1.52;

  return {
    imageProcessing,
  };
}
