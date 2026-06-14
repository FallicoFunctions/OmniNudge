import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene.js';

const ENVIRONMENT_TEXTURE_SIZE = 1;
const rgb = (red: number, green: number, blue: number) => new Uint8Array([red, green, blue]);

export function createMainStagePresentationRig(scene: Scene, camera: Camera) {
  const environmentTexture = createEnvironmentTexture(scene);
  environmentTexture.name = 'main-stage-night-reflection-env';
  environmentTexture.level = 0.92;
  scene.environmentTexture = environmentTexture;
  scene.environmentIntensity = 0.92;

  const pipeline = new DefaultRenderingPipeline(
    'main-stage-presentation-pipeline',
    true,
    scene,
    [camera],
  );
  pipeline.imageProcessingEnabled = true;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.58;
  pipeline.bloomWeight = 0.32;
  pipeline.bloomKernel = 72;
  pipeline.bloomScale = 0.5;
  pipeline.depthOfFieldEnabled = false;
  pipeline.chromaticAberrationEnabled = false;
  pipeline.grainEnabled = false;
  pipeline.sharpenEnabled = true;

  return {
    environmentTexture,
    pipeline,
  };
}

function createEnvironmentTexture(scene: Scene) {
  const faceData = [
    rgb(34, 44, 70),
    rgb(10, 16, 30),
    rgb(28, 42, 74),
    rgb(5, 8, 15),
    rgb(17, 30, 54),
    rgb(54, 42, 24),
  ];

  try {
    return new RawCubeTexture(
      scene,
      faceData,
      ENVIRONMENT_TEXTURE_SIZE,
      Constants.TEXTUREFORMAT_RGB,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
  } catch {
    return new BaseTexture(scene);
  }
}
