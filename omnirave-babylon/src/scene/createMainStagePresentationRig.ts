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

import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

const ENVIRONMENT_TEXTURE_SIZE = 16;

import type { PerfFlags } from '../app/perfFlags';

const PERF_DEFAULTS: PerfFlags = { noShadows: false, noPost: false, minimalLights: false, webgpu: false, webgl: false, debug: false };

export function createMainStagePresentationRig(scene: Scene, camera: Camera, perfFlags: PerfFlags = PERF_DEFAULTS) {
  const environmentTexture = createEnvironmentTexture(scene);
  environmentTexture.name = 'main-stage-night-reflection-env';
  environmentTexture.level = 0.9;
  scene.environmentTexture = environmentTexture;
  scene.environmentIntensity = 0.9;
  const backdropRoot = createPresentationBackdrop(scene);
  const heroScreenPanels = createHeroScreenPanels(scene);
  const emissiveSpillLights = createEmissiveSpillLights(scene, heroScreenPanels);

  const pipeline = new DefaultRenderingPipeline(
    'main-stage-presentation-pipeline',
    true,
    scene,
    perfFlags.noPost ? [] : [camera],
  );
  pipeline.imageProcessingEnabled = true;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.5;
  pipeline.bloomWeight = 0.7;
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
  pipeline.imageProcessing.vignetteWeight = 1.08;
  // A faint, static film grain breaks up flat gradients; the previous
  // intensity (9, animated) overlaid shimmering noise that read as TV static
  // across every surface once the image rendered at full crisp density.
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 1.5;
  pipeline.grain.animated = false;

  return {
    backdropRoot,
    emissiveSpillLights,
    environmentTexture,
    heroScreenPanels,
    pipeline,
  };
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
    const data = new Uint8Array(size * size * 4);
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

        const i = (y * size + x) * 4;
        data[i] = Math.min(255, Math.round(r * 255));
        data[i + 1] = Math.min(255, Math.round(g * 255));
        data[i + 2] = Math.min(255, Math.round(b * 255));
        data[i + 3] = 255;
      }
    }
    return data;
  });

  try {
    return new RawCubeTexture(
      scene,
      faceData,
      ENVIRONMENT_TEXTURE_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
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
  // Critical: EXP2 fog fully saturates infinite-distance geometry, painting
  // the whole dome flat fog-colour and erasing every star. The sky must be
  // fog-exempt.
  celestialVault.applyFog = false;
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

  const crownSilhouetteAura = MeshBuilder.CreatePlane(
    'main-stage-crown-silhouette-aura',
    {
      width: 132,
      height: 118,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  crownSilhouetteAura.parent = root;
  crownSilhouetteAura.position.y = 44;
  crownSilhouetteAura.position.z = 42;
  crownSilhouetteAura.isPickable = false;
  crownSilhouetteAura.material = createCrownSilhouetteAuraMaterial(scene);

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

  // Moon: high, off to one side, out toward +z where the stage faces and
  // where players are mostly looking from the review checkpoints. A SPHERE,
  // not a billboarded disc: freezeStaticScene (which runs after this rig)
  // freezes world matrices, so a billboard's per-frame facing update never
  // runs and the disc sits edge-on and invisible. A sphere reads identically
  // from every angle with no per-frame work. Placed at a large finite
  // distance so it renders in front of the infinite-distance vault.
  const moon = MeshBuilder.CreateSphere(
    'main-stage-moon',
    {
      diameter: 24,
      segments: 24,
    },
    scene,
  );
  moon.parent = root;
  // High over the stage, slightly right of the main sightline and well above
  // the crown silhouette (y~44) so it is plainly visible when looking toward
  // the stage and tilting up. Within the camera far plane.
  moon.position.set(95, 360, 330);
  moon.isPickable = false;
  moon.applyFog = false;
  moon.material = createMoonMaterial(scene);

  return root;
}

function createCelestialVaultMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-celestial-vault-material', scene);
  material.backFaceCulling = false;
  // unlit shows the ALBEDO channel and ignores emissive entirely (verified
  // live: forcing emissive did nothing, forcing albedo flooded the sky). The
  // starfield therefore goes on albedoTexture, not emissiveTexture. The map
  // already carries the dark sky + bright stars, so albedoColor is white to
  // pass it through untinted.
  material.unlit = true;
  material.albedoColor = new Color3(1, 1, 1);
  material.reflectivityColor = new Color3(0, 0, 0);

  const starfield = createStarfieldTexture(scene);
  if (starfield) {
    material.albedoTexture = starfield;
  } else {
    // No texture (eg. NullEngine test runs): fall back to a flat night-sky
    // colour rather than a white dome.
    material.albedoColor = new Color3(0.024, 0.042, 0.075);
  }

  return material;
}

// Small deterministic PRNG (mulberry32) so the starfield renders identically
// on every load - a re-randomised sky each session read as a bug during
// review ("why did the stars move").
function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value-noise sampler over a seeded lattice, wrapping in U so it tiles
// around the equirectangular sphere. Used for nebulosity and the Milky Way.
function makeValueNoise(cells: number, random: () => number) {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  return (u: number, v: number) => {
    const gx = ((u % 1) + 1) % 1 * cells;
    const gy = Math.min(0.9999, Math.max(0, v)) * cells;
    const x0 = Math.floor(gx) % cells;
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % cells;
    const y1 = Math.min(cells, y0 + 1);
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * (cells + 1) + x0];
    const b = grid[y0 * (cells + 1) + x1];
    const c = grid[y1 * (cells + 1) + x0];
    const d = grid[y1 * (cells + 1) + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

// Realistic equirectangular night-sky map painted as raw pixel data (pure
// math, no canvas). Pinpoint stars with a power-law brightness range, star
// colour temperature, a tilted Milky Way band that also clusters the stars,
// and faint nebulosity - so the sky reads as photographed, not drawn.
function createStarfieldTexture(scene: Scene) {
  try {
    const width = 2048;
    const height = 1024;
    const data = new Uint8Array(width * height * 4);
    const random = createSeededRandom(0x51a37);
    const nebula = makeValueNoise(12, random);
    const milkNoise = makeValueNoise(40, random);

    // Milky Way: a band tilted across the sky. bandAt() returns 0..1 density.
    const bandAt = (u: number, v: number, softness: number) => {
      const centre = 0.5 + 0.22 * Math.sin(u * Math.PI * 2 + 0.6);
      return Math.exp(-((v - centre) * (v - centre)) / (softness * softness));
    };

    // --- background: near-black zenith, faint deep-blue lift, nebulosity,
    //     and a milky glow along the galactic band ---
    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      const horizonness = Math.sin(v * Math.PI);
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1);
        let r = 0.005 + 0.011 * horizonness;
        let g = 0.008 + 0.017 * horizonness;
        let b = 0.02 + 0.04 * horizonness;
        // sparse faint nebulosity (thresholded so most sky stays black)
        const neb = Math.max(0, nebula(u * 1.3, v * 1.3) - 0.62) * 1.4;
        r += neb * 0.03;
        g += neb * 0.022;
        b += neb * 0.055;
        // milky glow along the band, mottled by noise
        const milk = bandAt(u, v, 0.11) * (0.35 + 0.65 * milkNoise(u * 3, v * 3));
        r += milk * 0.018;
        g += milk * 0.02;
        b += milk * 0.028;
        const i = (y * width + x) * 4;
        data[i] = Math.min(255, Math.round(r * 255));
        data[i + 1] = Math.min(255, Math.round(g * 255));
        data[i + 2] = Math.min(255, Math.round(b * 255));
        data[i + 3] = 255;
      }
    }

    const plot = (px: number, py: number, r: number, g: number, b: number) => {
      const wx = ((px % width) + width) % width; // wrap in U
      if (py < 0 || py >= height) return;
      const i = (py * width + wx) * 4;
      data[i] = Math.min(255, Math.max(data[i], Math.round(r * 255)));
      data[i + 1] = Math.min(255, Math.max(data[i + 1], Math.round(g * 255)));
      data[i + 2] = Math.min(255, Math.max(data[i + 2], Math.round(b * 255)));
    };

    // Stars baked as sharp small cores (a bright centre with a tight 1px
    // falloff, brilliant ones a hair larger) - crisp rather than the soft
    // blobs that read as "drawn". Power-law magnitude, colour temperature,
    // and Milky Way clustering.
    const starCount = 9000;
    for (let s = 0; s < starCount; s++) {
      const u = random();
      const v = random() * 0.95;
      if (random() > 0.7 + 0.3 * bandAt(u, v, 0.2)) continue;
      const x = Math.floor(u * width);
      const y = Math.floor(v * height);
      const t = random();
      const mag = t * t;
      const ct = random();
      let cr = 1;
      let cg = 1;
      let cb = 1;
      if (ct < 0.12) {
        cr = 0.72; cg = 0.82; cb = 1;
      } else if (ct < 0.3) {
        cr = 0.88; cg = 0.92; cb = 1;
      } else if (ct > 0.92) {
        cr = 1; cg = 0.74; cb = 0.52;
      } else if (ct > 0.76) {
        cr = 1; cg = 0.9; cb = 0.7;
      }

      if (mag > 0.9) {
        // brilliant: bright core + tight halo + faint glint
        plot(x, y, cr, cg, cb);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          plot(x + dx, y + dy, cr * 0.5, cg * 0.5, cb * 0.5);
        }
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
          plot(x + dx, y + dy, cr * 0.22, cg * 0.22, cb * 0.22);
        }
      } else if (mag > 0.6) {
        const b0 = 0.85 + 0.15 * random();
        plot(x, y, cr * b0, cg * b0, cb * b0);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          plot(x + dx, y + dy, cr * b0 * 0.28, cg * b0 * 0.28, cb * b0 * 0.28);
        }
      } else {
        // faint majority: a single crisp pixel, floor raised so the ACES
        // contrast curve doesn't crush them on the sphere.
        const b0 = 0.5 + 0.4 * mag;
        plot(x, y, cr * b0, cg * b0, cb * b0);
      }
    }

    // No mipmaps (they average the sharp stars away); bilinear keeps the tiny
    // cores crisp at every viewing distance.
    const texture = RawTexture.CreateRGBATexture(
      data,
      width,
      height,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.name = 'main-stage-celestial-vault-starfield';
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  } catch (error) {
    console.warn('celestial vault: starfield texture unavailable', error);
    return null;
  }
}

// Procedural lunar surface: warm-white base darkened by maria (the grey
// "seas") and a scatter of craters, with limb darkening toward the edge, so
// the moon reads as a body with a surface rather than a flat glowing disc.
function createMoonTexture(scene: Scene) {
  try {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    const random = createSeededRandom(0x1055aa);
    const maria = makeValueNoise(6, random);
    const speckle = makeValueNoise(48, random);

    // a few large maria centres and small craters
    const craters: Array<[number, number, number, number]> = [];
    for (let c = 0; c < 26; c++) {
      craters.push([random(), random(), 0.015 + random() * 0.05, 0.4 + random() * 0.5]);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1);
        const v = y / (size - 1);
        // limb darkening: the disc texture maps onto a sphere; darken toward
        // the texture's edges so the rim falls off like a lit sphere.
        const dx = u - 0.5;
        const dy = v - 0.5;
        const rr = Math.min(1, Math.hypot(dx, dy) / 0.5);
        const limb = 0.55 + 0.45 * Math.cos(rr * 1.3);
        // base tone + maria darkening + fine speckle
        let tone = 0.82;
        tone -= Math.max(0, maria(u, v) - 0.5) * 0.7; // maria seas
        tone += (speckle(u, v) - 0.5) * 0.08; // regolith grain
        for (const [cx, cy, cr, depth] of craters) {
          const cd = Math.hypot(u - cx, v - cy);
          if (cd < cr) tone -= depth * (1 - cd / cr) * 0.5;
        }
        tone = Math.max(0.15, Math.min(1, tone)) * limb;
        const i = (y * size + x) * 4;
        data[i] = Math.round(tone * 255);
        data[i + 1] = Math.round(tone * 0.97 * 255);
        data[i + 2] = Math.round(tone * 0.9 * 255);
        data[i + 3] = 255;
      }
    }

    const texture = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = 'main-stage-moon-surface';
    return texture;
  } catch (error) {
    console.warn('celestial vault: moon texture unavailable', error);
    return null;
  }
}

function createMoonMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-moon-material', scene);
  material.backFaceCulling = false;
  // unlit shows albedo, so the moon's warm-white disc colour must live on
  // albedo (emissive is kept too as a bloom seed but does nothing in unlit).
  material.unlit = true;
  // Keep it below bloom saturation so the surface reads: emissive at 2.4 +
  // the bloom pass blew the whole disc to featureless white. unlit shows
  // albedo, so the moon's brightness and its maria/craters both live there;
  // a slight sub-1 albedo lets the bright highlands glow without clipping.
  material.albedoColor = new Color3(0.86, 0.83, 0.75);
  material.emissiveColor = new Color3(0, 0, 0);
  material.emissiveIntensity = 0;
  material.reflectivityColor = new Color3(0, 0, 0);

  const surface = createMoonTexture(scene);
  if (surface) {
    material.albedoTexture = surface;
    material.albedoColor = new Color3(0.95, 0.92, 0.85);
  }

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

function createCrownSilhouetteAuraMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-crown-silhouette-aura-material', scene);
  material.backFaceCulling = false;
  material.unlit = true;
  material.albedoColor = new Color3(0.018, 0.04, 0.064);
  material.emissiveColor = new Color3(0.1, 0.34, 0.5);
  material.emissiveIntensity = 0.78;
  material.alpha = 0.3;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;

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
