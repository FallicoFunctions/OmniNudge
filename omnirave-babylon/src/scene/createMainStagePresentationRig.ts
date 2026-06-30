import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

const ENVIRONMENT_TEXTURE_SIZE = 1;
const rgb = (red: number, green: number, blue: number) => new Uint8Array([red, green, blue]);

export function createMainStagePresentationRig(scene: Scene, camera: Camera) {
  const environmentTexture = createEnvironmentTexture(scene);
  environmentTexture.name = 'main-stage-night-reflection-env';
  environmentTexture.level = 0.9;
  scene.environmentTexture = environmentTexture;
  scene.environmentIntensity = 0.9;
  const backdropRoot = createPresentationBackdrop(scene);

  const pipeline = new DefaultRenderingPipeline(
    'main-stage-presentation-pipeline',
    true,
    scene,
    [camera],
  );
  pipeline.imageProcessingEnabled = true;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.86;
  pipeline.bloomWeight = 0.09;
  pipeline.bloomKernel = 26;
  pipeline.bloomScale = 0.5;
  pipeline.depthOfFieldEnabled = false;
  pipeline.chromaticAberrationEnabled = false;
  pipeline.grainEnabled = false;
  pipeline.sharpenEnabled = true;

  return {
    backdropRoot,
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

function createPresentationBackdrop(scene: Scene) {
  const root = new TransformNode('main-stage-presentation-backdrop', scene);

  const celestialVault = MeshBuilder.CreateSphere(
    'main-stage-celestial-vault',
    {
      diameter: 520,
      segments: 24,
      sideOrientation: Mesh.BACKSIDE,
    },
    scene,
  );
  celestialVault.parent = root;
  celestialVault.isPickable = false;
  celestialVault.infiniteDistance = true;
  celestialVault.material = createCelestialVaultMaterial(scene);

  const horizonShroud = MeshBuilder.CreateCylinder(
    'main-stage-horizon-shroud',
    {
      height: 96,
      diameterTop: 340,
      diameterBottom: 430,
      tessellation: 64,
      sideOrientation: Mesh.BACKSIDE,
    },
    scene,
  );
  horizonShroud.parent = root;
  horizonShroud.position.y = 18;
  horizonShroud.isPickable = false;
  horizonShroud.material = createHorizonShroudMaterial(scene);

  const arrivalVoidVeil = MeshBuilder.CreateGround(
    'main-stage-arrival-void-veil',
    {
      width: 360,
      height: 360,
      subdivisions: 2,
    },
    scene,
  );
  arrivalVoidVeil.parent = root;
  arrivalVoidVeil.position.y = -0.14;
  arrivalVoidVeil.isPickable = false;
  arrivalVoidVeil.material = createArrivalVoidVeilMaterial(scene);

  const crownHalo = MeshBuilder.CreateCylinder(
    'main-stage-crown-halo',
    {
      height: 0.4,
      diameter: 128,
      tessellation: 64,
      subdivisions: 1,
    },
    scene,
  );
  crownHalo.parent = root;
  crownHalo.position.y = 40;
  crownHalo.position.z = 58;
  crownHalo.rotation.x = Math.PI / 2;
  crownHalo.isPickable = false;
  crownHalo.material = createCrownHaloMaterial(scene);

  const horizonAura = MeshBuilder.CreatePlane(
    'main-stage-horizon-aura',
    {
      width: 320,
      height: 116,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  horizonAura.parent = root;
  horizonAura.position.y = 26;
  horizonAura.position.z = 122;
  horizonAura.isPickable = false;
  horizonAura.material = createHorizonAuraMaterial(scene);

  const sideAuraLeft = MeshBuilder.CreatePlane(
    'main-stage-side-aura-left',
    {
      width: 128,
      height: 92,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  sideAuraLeft.parent = root;
  sideAuraLeft.position.x = -116;
  sideAuraLeft.position.y = 30;
  sideAuraLeft.position.z = 52;
  sideAuraLeft.rotation.y = 0.82;
  sideAuraLeft.isPickable = false;
  sideAuraLeft.material = createSideAuraMaterial(scene);

  const sideAuraRight = sideAuraLeft.clone('main-stage-side-aura-right');
  sideAuraRight.position.x = 116;
  sideAuraRight.rotation.y = -0.82;

  const arrivalMistBand = MeshBuilder.CreatePlane(
    'main-stage-arrival-mist-band',
    {
      width: 228,
      height: 34,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  arrivalMistBand.parent = root;
  arrivalMistBand.position.y = 9;
  arrivalMistBand.position.z = 54;
  arrivalMistBand.isPickable = false;
  arrivalMistBand.material = createArrivalMistBandMaterial(scene);

  return root;
}

function createCelestialVaultMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-celestial-vault-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.022, 0.038, 0.072);
  material.emissiveColor = new Color3(0.016, 0.03, 0.054);
  material.emissiveIntensity = 0.38;
  material.reflectivityColor = new Color3(0, 0, 0);

  return material;
}

function createHorizonShroudMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-horizon-shroud-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.016, 0.024, 0.044);
  material.emissiveColor = new Color3(0.01, 0.02, 0.04);
  material.emissiveIntensity = 0.18;
  material.alpha = 0.88;

  return material;
}

function createArrivalVoidVeilMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-arrival-void-veil-material', scene);
  material.albedoColor = new Color3(0.018, 0.022, 0.03);
  material.metallic = 0.08;
  material.roughness = 0.26;
  material.alpha = 0.96;
  material.environmentIntensity = 1.12;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.38;
  material.clearCoat.roughness = 0.08;

  return material;
}

function createCrownHaloMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-crown-halo-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.024, 0.08, 0.11);
  material.emissiveColor = new Color3(0.1, 0.48, 0.64);
  material.emissiveIntensity = 0.46;
  material.alpha = 0.3;

  return material;
}

function createHorizonAuraMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-horizon-aura-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.022, 0.038, 0.066);
  material.emissiveColor = new Color3(0.08, 0.24, 0.34);
  material.emissiveIntensity = 0.34;
  material.alpha = 0.42;

  return material;
}

function createSideAuraMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-side-aura-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.018, 0.032, 0.058);
  material.emissiveColor = new Color3(0.06, 0.2, 0.32);
  material.emissiveIntensity = 0.32;
  material.alpha = 0.18;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  return material;
}

function createArrivalMistBandMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-arrival-mist-band-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.022, 0.04, 0.07);
  material.emissiveColor = new Color3(0.08, 0.22, 0.3);
  material.emissiveIntensity = 0.28;
  material.alpha = 0.24;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;

  return material;
}
