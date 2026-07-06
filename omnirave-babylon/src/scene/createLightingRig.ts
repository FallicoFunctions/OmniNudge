import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { Scene } from '@babylonjs/core/scene.js';

import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';

export function createLightingRig(scene: Scene) {
  const hemi = new HemisphericLight('main-stage-hemi-light', new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(0.36, 0.41, 0.52);
  hemi.groundColor = new Color3(0.05, 0.06, 0.08);
  hemi.intensity = 0.58;

  const key = new DirectionalLight(
    'main-stage-key-light',
    new Vector3(-0.48, -1, -0.4),
    scene,
  );
  key.diffuse = new Color3(1, 0.95, 0.88);
  key.specular = new Color3(1, 0.92, 0.8);
  key.intensity = 2.35;
  key.position = new Vector3(22, 32, 18);

  const rim = new DirectionalLight(
    'main-stage-rim-light',
    new Vector3(0.16, -0.82, 0.54),
    scene,
  );
  rim.diffuse = new Color3(0.28, 0.52, 0.9);
  rim.specular = new Color3(0.18, 0.44, 0.86);
  rim.intensity = 1.05;
  rim.position = new Vector3(-30, 26, -72);

  const fill = new DirectionalLight(
    'main-stage-front-fill-light',
    new Vector3(0, -0.72, 0.96),
    scene,
  );
  fill.diffuse = new Color3(0.22, 0.34, 0.58);
  fill.specular = new Color3(0.1, 0.18, 0.34);
  fill.intensity = 0.72;
  fill.position = new Vector3(0, 24, -84);

  const shadowGenerator = createKeyShadowGenerator(scene, key);
  const practicalPools = createPracticalPoolLights(scene);

  return { hemi, key, rim, fill, shadowGenerator, practicalPools };
}

// Discrete practical cores that should visibly light their surroundings.
const PRACTICAL_POOL_SOURCE = /LanternCore|LanternWarmCore|FountainLightArray/;
const POOL_RANGE = 18;

function hashUnit(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 1000) / 999;
}

function createPracticalPoolLights(scene: Scene) {
  const sources = scene.meshes.filter((mesh) => PRACTICAL_POOL_SOURCE.test(mesh.name));
  const pools: PointLight[] = [];

  for (const source of sources) {
    const center = source.getBoundingInfo().boundingBox.centerWorld;
    const pool = new PointLight(`practical-pool-${source.name}`, center.clone(), scene);
    // No two real lamps burn identically: deterministic per-lamp variance
    // in brightness and warmth so mirrored pairs stop reading as clones.
    const jitter = hashUnit(source.name);
    pool.diffuse = new Color3(1, 0.58 + jitter * 0.09, 0.21 + jitter * 0.07);
    pool.specular = new Color3(1, 0.5, 0.2);
    pool.intensity = 180 + jitter * 90;
    pool.range = POOL_RANGE;

    // Scope each pool to nearby meshes: keeps every mesh within the
    // per-material light-slot budget and off-loads distant geometry.
    pool.includedOnlyMeshes = scene.meshes.filter((mesh) => {
      // Bounding-sphere distance, not centre distance: the mega-mesh floors
      // span the whole venue, so their centres sit far from every lamp even
      // where the surface passes directly beneath one.
      const bounds = mesh.getBoundingInfo();
      const centerDistance = bounds.boundingBox.centerWorld.subtract(center).length();
      return centerDistance - bounds.boundingSphere.radiusWorld <= POOL_RANGE * 1.2;
    });

    pools.push(pool);
  }

  if (pools.length > 0) {
    for (const material of scene.materials) {
      if ('maxSimultaneousLights' in material) {
        material.maxSimultaneousLights = 12;
      }
    }
  }

  return pools;
}

function createKeyShadowGenerator(scene: Scene, key: DirectionalLight) {
  key.autoCalcShadowZBounds = true;

  const shadowGenerator = new ShadowGenerator(4096, key);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGenerator.bias = 0.0022;
  shadowGenerator.normalBias = 0.012;

  for (const mesh of scene.meshes) {
    if (!mesh.isVisible) {
      continue;
    }

    mesh.receiveShadows = true;

    const material = mesh.material;
    const isBlended =
      material !== null &&
      (material.alpha < 1 || (material.transparencyMode !== null && material.transparencyMode !== 0));
    if (isBlended) {
      continue;
    }

    shadowGenerator.addShadowCaster(mesh, false);
  }

  // The stage set is static, so the map should bake once - but not on the
  // first frame: material depth-effects compile asynchronously, and baking
  // before they are ready captures an almost-empty map (the scene then
  // renders shadowless forever). Render every frame until the scene reports
  // ready, then bake one final time and freeze.
  const shadowMap = shadowGenerator.getShadowMap();
  if (shadowMap) {
    scene.executeWhenReady(() => {
      shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      shadowMap.resetRefreshCounter();
    });
  }

  return shadowGenerator;
}
