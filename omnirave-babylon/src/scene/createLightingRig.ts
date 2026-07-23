import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { Scene } from '@babylonjs/core/scene.js';

import '@babylonjs/core/Materials/standardMaterial.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/Shaders/shadowMap.fragment.js';
import '@babylonjs/core/Shaders/shadowMap.vertex.js';

import type { PerfFlags } from '../app/perfFlags';

const PERF_DEFAULTS: PerfFlags = { noShadows: false, noPost: false, minimalLights: false, webgl: false, debug: false, worldUrl: null, worldToken: null };

export function createLightingRig(scene: Scene, perfFlags: PerfFlags = PERF_DEFAULTS) {
  const hemi = new HemisphericLight('main-stage-hemi-light', new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(0.36, 0.41, 0.52);
  hemi.groundColor = new Color3(0.05, 0.06, 0.08);
  hemi.intensity = 0.72;

  const key = new DirectionalLight(
    'main-stage-key-light',
    new Vector3(-0.48, -1, -0.4),
    scene,
  );
  key.diffuse = new Color3(1, 0.95, 0.88);
  key.specular = new Color3(1, 0.92, 0.8);
  key.intensity = 3.2;
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
  fill.intensity = 0.82;
  fill.position = new Vector3(0, 24, -84);

  const isWebGPU = scene.getEngine().isWebGPU;
  if (perfFlags.minimalLights || isWebGPU) {
    // WebGPU: each light costs a per-stage uniform buffer and the device
    // limit is 12; dropping the two subtle shaping lights keeps the warm
    // practical pools - the defining night-look element - within budget.
    rim.setEnabled(false);
    fill.setEnabled(false);
  }

  // Interim: no runtime shadow map under WebGPU - the hard 1-tap map reads
  // blocky at player range and still shows residual acne there. The venue
  // is fully static, so the permanent plan is offline-baked lightmaps
  // (soft GI-quality shadows at zero runtime cost), replacing the runtime
  // generator on every engine.
  const skipShadows = perfFlags.noShadows || isWebGPU;
  const shadowGenerator = skipShadows ? null : createKeyShadowGenerator(scene, key);
  const practicalPools = perfFlags.minimalLights ? [] : createPracticalPoolLights(scene, perfFlags);

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

function createPracticalPoolLights(scene: Scene, perfFlags: PerfFlags) {
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
    applyPracticalPoolLightBudget(scene);
  }

  return pools;
}

// Every material evaluates this many lights per fragment. 12 was the top of
// the budget; 6 (four rig lights + the two nearest scoped pools/spills)
// roughly halves the lighting shader cost with little visible loss, since
// distant pools contribute almost nothing. WebGPU: each effect light costs a
// vertex-stage uniform buffer and the device limit is 12 total (3 base + 5
// fixed + N lights), so the budget there is 4 - which still covers hemi +
// key + the two nearest pools since rim/fill are disabled under WebGPU.
//
// Exported so callers can re-run it after any rig that creates lit materials
// AFTER this rig ran (e.g. the production-surface screens) - those materials
// are created holding Babylon's default of 4, which is below the WebGL
// budget of 6 and would otherwise starve the practical pools that
// trimMeshLightBudget scopes to them.
export function applyPracticalPoolLightBudget(scene: Scene) {
  const budget = scene.getEngine().isWebGPU ? 4 : 6;
  for (const material of scene.materials) {
    if ('maxSimultaneousLights' in material) {
      material.maxSimultaneousLights = budget;
    }
  }
}

function createKeyShadowGenerator(scene: Scene, key: DirectionalLight) {
  key.autoCalcShadowZBounds = true;

  // Hard 1-tap shadows: PCF filtering was the single largest per-pixel cost
  // in the whole frame (measured 11 -> 28 fps switching it off; even
  // QUALITY_LOW halves the frame rate). At night, crisp edges read as clean
  // moonlight and the soft ambient fill hides the hardness. The larger map
  // keeps those hard edges clean, and it bakes once for the static set.
  const shadowGenerator = new ShadowGenerator(4096, key);
  shadowGenerator.usePercentageCloserFiltering = false;
  shadowGenerator.usePoissonSampling = false;
  // Hard 1-tap shadows show acne that PCF's blur used to hide: banded
  // dashes on surfaces grazing the raked key (stage rear face, canopy
  // lips). The normal-offset bias is the grazing-angle acne killer and
  // needs to be meaningful in world units at this venue's scale.
  shadowGenerator.bias = 0.0015;
  shadowGenerator.normalBias = 0.05;
  // Store back-face depths in the map: lit front faces then never compare
  // against their own surface, which kills self-shadow acne structurally
  // instead of chasing it with ever-larger biases (bias raises alone left
  // residual banding on the curved awnings and the stage rear face). The
  // venue's solids are closed, so the classic thin-wall light-leak
  // trade-off of this technique does not apply.
  shadowGenerator.forceBackFacesOnly = true;

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

  // The stage set is static. Limit the initial compile pass to one frame,
  // then request exactly one final bake when every depth effect is ready.
  // Leaving the default EVERY_FRAME rate active until scene readiness makes
  // hundreds of static casters render continuously and can hold WebGL near
  // 3 FPS during startup.
  const shadowMap = shadowGenerator.getShadowMap();
  if (shadowMap) {
    shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    shadowMap.resetRefreshCounter();
    scene.executeWhenReady(() => {
      shadowMap.resetRefreshCounter();
    });
  }

  return shadowGenerator;
}
