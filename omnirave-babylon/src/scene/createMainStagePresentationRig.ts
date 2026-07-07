// Post-process fragment shaders are not pulled in transitively by the ESM
// pipeline modules; without these side-effect imports Babylon falls back to
// fetching raw .fx files over HTTP, Vite answers with index.html, the GLSL
// compile fails, and the whole post chain silently detaches.
// Eagerly register every shader the pipeline needs: a lazily fetched
// shader can 404 into Vite's index.html fallback, and one failed GLSL
// compile silently detaches the camera's entire post chain.
import '@babylonjs/core/Shaders/bloomMerge.fragment.js';
import '@babylonjs/core/Shaders/extractHighlights.fragment.js';
import '@babylonjs/core/Shaders/fxaa.fragment.js';
import '@babylonjs/core/Shaders/fxaa.vertex.js';
import '@babylonjs/core/Shaders/grain.fragment.js';
import '@babylonjs/core/Shaders/imageProcessing.fragment.js';
import '@babylonjs/core/Shaders/kernelBlur.fragment.js';
import '@babylonjs/core/Shaders/kernelBlur.vertex.js';
import '@babylonjs/core/Shaders/postprocess.vertex.js';
import '@babylonjs/core/Shaders/sharpen.fragment.js';
import '@babylonjs/core/Shaders/volumetricLightScattering.fragment.js';
import '@babylonjs/core/Shaders/volumetricLightScatteringPass.fragment.js';
import '@babylonjs/core/Shaders/volumetricLightScatteringPass.vertex.js';

import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { VolumetricLightScatteringPostProcess } from '@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

const ENVIRONMENT_TEXTURE_SIZE = 16;

export function createMainStagePresentationRig(scene: Scene, camera: Camera) {
  const environmentTexture = createEnvironmentTexture(scene);
  environmentTexture.name = 'main-stage-night-reflection-env';
  environmentTexture.level = 0.9;
  scene.environmentTexture = environmentTexture;
  scene.environmentIntensity = 0.9;
  const backdropRoot = createPresentationBackdrop(scene);
  const heroScreenPanels = createHeroScreenPanels(scene);
  const emissiveSpillLights = createEmissiveSpillLights(scene, heroScreenPanels);
  const screenScattering = createScreenLightScattering(scene, camera, heroScreenPanels);

  const pipeline = new DefaultRenderingPipeline(
    'main-stage-presentation-pipeline',
    true,
    scene,
    [camera],
  );
  pipeline.imageProcessingEnabled = true;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.5;
  pipeline.bloomWeight = 0.62;
  // Bloom kernel is in pixels: normalise to render height so halos keep
  // the same angular size on any viewport instead of shrinking on large
  // windows (reviews from bigger tabs kept reporting 'no bloom').
  pipeline.bloomKernel = Math.max(48, Math.round((84 * scene.getEngine().getRenderHeight()) / 825));
  pipeline.bloomScale = 0.5;
  pipeline.depthOfFieldEnabled = false;
  pipeline.chromaticAberrationEnabled = false;
  pipeline.sharpenEnabled = true;
  // High-DPI rendering already suppresses most edge aliasing, so 4x MSAA on
  // top of it is largely redundant and expensive; FXAA handles the remainder.
  pipeline.samples = 1;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 1.5;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 9;
  pipeline.grain.animated = true;

  return {
    backdropRoot,
    emissiveSpillLights,
    environmentTexture,
    heroScreenPanels,
    pipeline,
    screenScattering,
  };
}

// Festival air scatters screen light into visible haze; volumetric
// scattering from each LED panel puts that glow in the air itself
// instead of only on emitter surfaces.
function createScreenLightScattering(scene: Scene, camera: Camera, panels: Mesh[]) {
  const effects: VolumetricLightScatteringPostProcess[] = [];
  // Disabled for performance: the occlusion pass re-renders scene geometry
  // every frame, and the haze it adds is marginal against the emitter-hugging
  // glow billboards. Kept as a code path in case a lighter budget allows it.
  const SCATTERING_SOURCES = 0;
  for (const panel of panels.slice(0, SCATTERING_SOURCES)) {
    try {
      const scattering = new VolumetricLightScatteringPostProcess(
        `${panel.name}-scattering`,
        { postProcessRatio: 0.5, passRatio: 0.2 },
        camera,
        panel,
        32,
        Texture.BILINEAR_SAMPLINGMODE,
        scene.getEngine(),
        false,
      );
      scattering.exposure = 0.24;
      scattering.decay = 0.955;
      scattering.weight = 0.5;
      effects.push(scattering);
    } catch {
      // Engines without the required caps simply skip the haze.
    }
  }
  return effects;
}

// Real LED surfaces wash their surroundings with colored light; the
// emissive materials alone cannot, so pair each major emissive cluster
// with a scoped point light matched to its content colour.
function createEmissiveSpillLights(scene: Scene, heroScreenPanels: Mesh[]) {
  const lights: PointLight[] = [];

  const addSpill = (name: string, position: Vector3, color: Color3, intensity: number, range: number) => {
    const light = new PointLight(name, position, scene);
    light.diffuse = color;
    light.specular = color;
    light.intensity = intensity;
    light.range = range;
    light.includedOnlyMeshes = scene.meshes.filter((mesh) => {
      const bounds = mesh.getBoundingInfo();
      const centerDistance = bounds.boundingBox.centerWorld.subtract(position).length();
      return centerDistance - bounds.boundingSphere.radiusWorld <= range * 1.2;
    });
    lights.push(light);
  };

  for (const panel of heroScreenPanels) {
    addSpill(
      `${panel.name}-spill`,
      panel.position.add(new Vector3(0, -1.5, -2.5)),
      new Color3(0.72, 0.3, 0.85),
      560,
      40,
    );
  }

  for (const side of ['L', 'R']) {
    const platter = scene.getMeshByName(`V31_SideLedTileField_${side}`);
    if (!platter) {
      continue;
    }
    const center = platter.getBoundingInfo().boundingBox.centerWorld;
    addSpill(
      `led-deck-spill-${side}`,
      new Vector3(center.x, center.y + 2.2, center.z),
      new Color3(0.16, 0.6, 0.95),
      140,
      22,
    );
    // The deck is the emitter: lighting it with its own spill on top of
    // emissive + bloom blows it out to a white slab.
    const spill = lights[lights.length - 1];
    spill.includedOnlyMeshes = spill.includedOnlyMeshes.filter((mesh) => !mesh.name.startsWith('V31_SideLedTileField_') && !mesh.name.startsWith('V31_SideGlassLens_') && !mesh.name.startsWith('V31_SideParallaxOrbitalContent_'));
  }

  return lights;
}

// The GLB's screen faces are dark backer geometry merged into neighbouring
// mega-meshes, so the visible proscenium rectangles cannot emit. Mount a
// pair of LED content panels just route-side of those faces instead.
function createHeroScreenPanels(scene: Scene) {
  const contentTexture = createLedWallContentTexture(scene);

  const panels: Mesh[] = [];
  for (const side of [-1, 1]) {
    const panel = MeshBuilder.CreatePlane(
      side < 0 ? 'main-stage-hero-screen-panel-l' : 'main-stage-hero-screen-panel-r',
      {
        width: 8,
        height: 6.5,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
    );
    panel.position.set(side * 6.8, 17.9, -3.2);
    panel.rotation.y = Math.PI;
    panel.isPickable = false;

    const material = new PBRMaterial(
      side < 0 ? 'main-stage-hero-screen-material-l' : 'main-stage-hero-screen-material-r',
      scene,
    );
    material.unlit = true;
    material.albedoColor = new Color3(0.01, 0.015, 0.02);
    material.emissiveColor = new Color3(1, 1, 1);
    material.emissiveTexture = contentTexture;
    material.emissiveIntensity = 8;
    panel.material = material;

    panels.push(panel);
  }

  for (const panel of panels) {
    const haze = MeshBuilder.CreatePlane(
      `${panel.name}-haze`,
      { width: 17, height: 13, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    haze.position.copyFrom(panel.position);
    haze.position.z -= 1.4;
    haze.isPickable = false;
    // Always face the camera: seen edge-on from side checkpoints the flat
    // glow sheet reads as a pink glass pane instead of air.
    haze.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const hazeMaterial = new PBRMaterial(`${panel.name}-haze-material`, scene);
    hazeMaterial.unlit = true;
    hazeMaterial.albedoColor = new Color3(0, 0, 0);
    hazeMaterial.emissiveColor = new Color3(0.5, 0.22, 0.62);
    hazeMaterial.emissiveIntensity = 0.5;
    hazeMaterial.alpha = 0.2;
    hazeMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    haze.material = hazeMaterial;
  }

  return panels;
}

// Procedural LED-wall still: cyan-to-magenta energy gradient with scanline
// structure so the panels read as a video surface rather than a flat glow.
function createLedWallContentTexture(scene: Scene) {
  const width = 256;
  const height = 192;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const v = y / (height - 1);

      // Diagonal energy sweep: cyan lower-left rising into magenta upper-right.
      const sweep = Math.min(1, Math.max(0, u * 0.7 + (1 - v) * 0.55));
      const pulse = 0.55 + 0.45 * Math.sin(u * Math.PI * 3 + v * Math.PI * 1.5);
      let r = 30 + sweep * 190 * pulse;
      let g = 60 + (1 - sweep) * 165 * pulse;
      let b = 150 + 105 * pulse * (0.4 + 0.6 * sweep);

      // LED module structure: dark gutters between 4px modules both ways,
      // with per-module brightness variance so the wall reads as discrete
      // emitters instead of a smooth gradient.
      if (x % 4 === 0 || y % 4 === 0) {
        r *= 0.35;
        g *= 0.35;
        b *= 0.35;
      } else {
        const moduleSeed = Math.sin((Math.floor(x / 4) * 73 + Math.floor(y / 4) * 149) * 12.9898) * 43758.5453;
        const moduleJitter = 0.75 + 0.45 * (moduleSeed - Math.floor(moduleSeed));
        r *= moduleJitter;
        g *= moduleJitter;
        b *= moduleJitter;
      }
      // Panel seams every 16px.
      if (x % 16 === 0 || y % 16 === 0) {
        r *= 0.55;
        g *= 0.55;
        b *= 0.55;
      }

      const i = (y * width + x) * 4;
      data[i] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }

  try {
    const texture = RawTexture.CreateRGBATexture(data, width, height, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = 'main-stage-hero-screen-content';
    return texture;
  } catch {
    return null;
  }
}

// Night-sky gradient cube: deep zenith blue falling to a lifted horizon
// band, a warm amber lobe toward the stage (+z), and a dark floor, so
// specular surfaces reflect a structured environment instead of six
// flat colours.
function createEnvironmentTexture(scene: Scene) {
  const size = ENVIRONMENT_TEXTURE_SIZE;
  const faceDirs: Array<(u: number, v: number) => [number, number, number]> = [
    (u, v) => [1, -v, -u],
    (u, v) => [-1, -v, u],
    (u, v) => [u, 1, v],
    (u, v) => [u, -1, -v],
    (u, v) => [u, -v, 1],
    (u, v) => [-u, -v, -1],
  ];

  const faceData = faceDirs.map((toDir) => {
    const data = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (2 * (x + 0.5)) / size - 1;
        const v = (2 * (y + 0.5)) / size - 1;
        const [dx, dy, dz] = toDir(u, v);
        const len = Math.hypot(dx, dy, dz);
        const ny = dy / len;
        const nz = dz / len;

        // Vertical gradient: zenith -> horizon -> floor.
        let r: number;
        let g: number;
        let b: number;
        if (ny >= 0) {
          const t = Math.pow(ny, 0.6);
          r = 0.1 * (1 - t) + 0.02 * t;
          g = 0.13 * (1 - t) + 0.04 * t;
          b = 0.22 * (1 - t) + 0.09 * t;
        } else {
          const t = Math.pow(-ny, 0.7);
          r = 0.1 * (1 - t) + 0.015 * t;
          g = 0.13 * (1 - t) + 0.02 * t;
          b = 0.22 * (1 - t) + 0.03 * t;
        }

        // Warm stage-glow lobe toward +z, hugging the horizon.
        const lobe = Math.pow(Math.max(0, nz), 2) * Math.pow(1 - Math.abs(ny), 1.5);
        r += 0.35 * lobe;
        g += 0.22 * lobe;
        b += 0.08 * lobe;

        const i = (y * size + x) * 3;
        data[i] = Math.min(255, Math.round(r * 255));
        data[i + 1] = Math.min(255, Math.round(g * 255));
        data[i + 2] = Math.min(255, Math.round(b * 255));
      }
    }
    return data;
  });

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
  material.emissiveColor = new Color3(0.024, 0.042, 0.075);
  material.emissiveIntensity = 0.6;
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
