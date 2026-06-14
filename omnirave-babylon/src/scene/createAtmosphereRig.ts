import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import type { Scene } from '@babylonjs/core/scene.js';

export function createAtmosphereRig(scene: Scene) {
  const imageProcessing = scene.imageProcessingConfiguration;
  imageProcessing.toneMappingEnabled = true;
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  imageProcessing.exposure = 1.18;
  imageProcessing.contrast = 1.24;

  const glow = new GlowLayer('main-stage-emissive-glow', scene, {
    blurKernelSize: 42,
    mainTextureFixedSize: 1024,
  });
  glow.intensity = 0.72;

  return {
    glow,
    imageProcessing,
  };
}
