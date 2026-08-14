import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene';

export interface CascadeWaterMotionSummary {
  pools: number;
  streams: number;
  mists: number;
  jets: number;
  underlays: number;
  stillWaters: number;
}

// Static water was the cascade court's strongest fake tell (player: "they
// look like placeholders vs actual water flowing... looks like paint").
// Water is never still. This module makes it move:
//  - pools ripple: a tiling procedural water-normal map scrolls slowly
//  - spill ribbons and the summit jet stream: the same map scrolls fast
//    along the fall direction
//  - base mist breathes: a slow alpha pulse
//  - the summit jet sprays: a real particle fountain arcing outward
// The touched materials are polish-table clones scoped to the cascade
// families, so nothing else in the venue changes.
export function createCascadeCourtWaterMotion(scene: Scene): CascadeWaterMotionSummary {
  const poolMeshes = scene.meshes.filter((m) => /^V150_CascadeCourtWater_[LR]$/.test(m.name));
  const streamMeshes = scene.meshes.filter((m) => /^V150_CascadeCourt(Spill|Jet)_[LR]$/.test(m.name));
  const mistMeshes = scene.meshes.filter((m) => /^V150_CascadeCourtMist_[LR]$/.test(m.name));
  // The arrival approach's reflection underlay is the same "still water"
  // idea at venue scale - and it read as static paint (player-flagged on
  // the V65 walkup). It drifts with its own ripple map, scaled for a
  // ~300-unit-long strip.
  const underlayMeshes = scene.meshes.filter((m) => m.name === 'V34_ApproachReflectionUnderlay');
  // Every remaining water surface in the venue: basin parterre, basin
  // sheets, VIP garden pools, spawn inset pools. Same slow drift - "none of
  // the water looks real, looks like paint" applied venue-wide. (The older
  // meshes carry box UVs added by scripts/add-still-water-uvs.py.)
  // Opaque water (the VIP pools) gets static-merged, so match the merged
  // name too - the merged mesh keeps the family's cloned material.
  const stillWaterMeshes = scene.meshes.filter((m) =>
    /^(merged:)?(V63_BasinWaterParterre|V118_BasinWaterSheet_[LR]|V67_VipGardenReflectingPool|V86_SpawnWetInsetPoolArray)/.test(
      m.name,
    ),
  );
  const jetMeshes = scene.meshes.filter((m) => /^V150_CascadeCourtJet_[LR]$/.test(m.name));

  const summary: CascadeWaterMotionSummary = {
    pools: poolMeshes.length,
    streams: streamMeshes.length,
    mists: mistMeshes.length,
    jets: 0,
    underlays: underlayMeshes.length,
    stillWaters: stillWaterMeshes.length,
  };
  if (
    summary.pools === 0 &&
    summary.streams === 0 &&
    summary.mists === 0 &&
    summary.underlays === 0 &&
    summary.stillWaters === 0
  ) {
    return summary;
  }

  const hasPbrMaterial = (meshes: { material: unknown }[]) =>
    meshes.some((mesh) => mesh.material instanceof PBRMaterial);
  const hasPoolMaterial = hasPbrMaterial(poolMeshes);
  const hasStreamMaterial = hasPbrMaterial(streamMeshes);
  const hasUnderlayMaterial = hasPbrMaterial(underlayMeshes);
  const hasStillMaterial = hasPbrMaterial(stillWaterMeshes);
  const normalData = hasPoolMaterial || hasStreamMaterial || hasUnderlayMaterial || hasStillMaterial
    ? tryCreateWaterNormalData()
    : null;
  const poolNormals = hasPoolMaterial && normalData
    ? tryCreateWaterNormalTexture(scene, 'cascade-pool-ripple', normalData)
    : null;
  const streamNormals = hasStreamMaterial && normalData
    ? tryCreateWaterNormalTexture(scene, 'cascade-stream-flow', normalData)
    : null;
  const underlayNormals = hasUnderlayMaterial && normalData
    ? tryCreateWaterNormalTexture(scene, 'approach-underlay-ripple', normalData)
    : null;
  const stillNormals = hasStillMaterial && normalData
    ? tryCreateWaterNormalTexture(scene, 'venue-still-water-ripple', normalData)
    : null;

  const touched = new Set<PBRMaterial>();
  const bind = (meshes: { material: unknown }[], texture: RawTexture | null, uScale: number, vScale: number) => {
    for (const mesh of meshes) {
      const material = mesh.material;
      if (!(material instanceof PBRMaterial)) continue;
      touched.add(material);
      if (texture) {
        // These are family-scoped polish clones. Always replace the authored
        // static normal so the texture being animated below is the one bound.
        material.bumpTexture = texture;
        texture.uScale = uScale;
        texture.vScale = vScale;
        texture.level = 0.85;
      }
    }
  };
  bind(poolMeshes, poolNormals, 5, 5);
  bind(streamMeshes, streamNormals, 1.5, 3);
  bind(underlayMeshes, underlayNormals, 6, 64);
  // box UVs are already world-proportional, so one modest tiling works
  // across every still-water surface regardless of mesh size
  bind(stillWaterMeshes, stillNormals, 2, 2);
  for (const mesh of mistMeshes) {
    if (mesh.material instanceof PBRMaterial) touched.add(mesh.material);
  }

  // The venue freezes every material (static-scene CPU saving); animated
  // water must stay live so per-frame offset/alpha changes reach the GPU.
  for (const material of touched) {
    material.unfreeze();
  }

  const mistMaterials = [
    ...new Set(
      mistMeshes
        .map((m) => m.material)
        .filter((m): m is PBRMaterial => m instanceof PBRMaterial),
    ),
  ];
  const mistBaseAlpha = mistMaterials.map((m) => m.alpha);

  let elapsed = 0;
  if (poolNormals || streamNormals || underlayNormals || stillNormals || mistMaterials.length > 0) {
    // The observer and every resource it closes over belong to this scene;
    // Scene.dispose() clears the observer and disposes all RawTextures.
    scene.onBeforeRenderObservable.add(() => {
      // getDeltaTime() is 0 on the very first frame (and under NullEngine);
      // fall back to a nominal 60fps step so motion never stalls.
      const dt = (scene.getEngine().getDeltaTime() || 16.7) / 1000;
      elapsed += dt;
      if (poolNormals) {
        // two slow drift axes so the ripple field never reads as a conveyor
        poolNormals.uOffset = (poolNormals.uOffset + dt * 0.018) % 1;
        poolNormals.vOffset = (poolNormals.vOffset + dt * 0.011) % 1;
      }
      if (streamNormals) {
        // fast fall-direction scroll: the spill sheets visibly stream downward
        streamNormals.vOffset = (streamNormals.vOffset - dt * 0.55 + 1) % 1;
      }
      if (underlayNormals) {
        // barely-moving drift: arrival water is still, not flowing
        underlayNormals.uOffset = (underlayNormals.uOffset + dt * 0.012) % 1;
        underlayNormals.vOffset = (underlayNormals.vOffset + dt * 0.007) % 1;
      }
      if (stillNormals) {
        stillNormals.uOffset = (stillNormals.uOffset + dt * 0.014) % 1;
        stillNormals.vOffset = (stillNormals.vOffset + dt * 0.009) % 1;
      }
      for (let i = 0; i < mistMaterials.length; i++) {
        mistMaterials[i].alpha = mistBaseAlpha[i] * (0.78 + 0.22 * Math.sin(elapsed * 1.7 + i));
      }
    });
  }

  // Summit spray: a particle fountain rising from each jet and arcing out.
  const spriteTexture = jetMeshes.length > 0 ? tryCreateSpraySprite(scene) : null;
  for (const jetMesh of jetMeshes) {
    const bounds = jetMesh.getBoundingInfo().boundingBox;
    const emitterPosition = new Vector3(
      bounds.centerWorld.x,
      bounds.minimumWorld.y + 0.1,
      bounds.centerWorld.z,
    );
    const spray = new ParticleSystem(`cascade-spray-${jetMesh.name}`, 140, scene);
    spray.particleTexture = spriteTexture;
    spray.emitter = emitterPosition;
    spray.minEmitBox = new Vector3(-0.12, 0, -0.12);
    spray.maxEmitBox = new Vector3(0.12, 0.1, 0.12);
    spray.direction1 = new Vector3(-0.35, 1, -0.35);
    spray.direction2 = new Vector3(0.35, 1, 0.35);
    spray.minEmitPower = 2.4;
    spray.maxEmitPower = 3.3;
    spray.gravity = new Vector3(0, -7.2, 0);
    spray.minLifeTime = 0.55;
    spray.maxLifeTime = 0.95;
    spray.minSize = 0.06;
    spray.maxSize = 0.2;
    spray.emitRate = 55;
    spray.blendMode = ParticleSystem.BLENDMODE_ADD;
    spray.color1 = new Color4(0.5, 0.85, 1.0, 0.55);
    spray.color2 = new Color4(0.75, 0.95, 1.0, 0.4);
    spray.colorDead = new Color4(0.3, 0.55, 0.75, 0);
    spray.start();
    summary.jets += 1;
  }

  return summary;
}

// A small tiling water-normal map, generated at load: layered integer-
// frequency sine waves (so the texture tiles seamlessly) converted to a
// tangent-space normal encoding. Raw pixel data keeps generation identical
// across browser, WebGPU, WebGL, and NullEngine environments.
function tryCreateWaterNormalData(): Uint8Array | null {
  try {
    const size = 256;
    const height = new Float32Array(size * size);
    const waves: Array<[number, number, number, number]> = [
      // [freqX, freqY, amplitude, phase] - integer frequencies tile cleanly
      [2, 3, 1.0, 0.0],
      [5, 2, 0.55, 1.7],
      [3, 7, 0.35, 3.9],
      [8, 5, 0.22, 2.3],
      [11, 9, 0.14, 5.1],
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let h = 0;
        for (const [fx, fy, amp, phase] of waves) {
          h += amp * Math.sin((2 * Math.PI * (fx * x + fy * y)) / size + phase);
        }
        height[y * size + x] = h;
      }
    }

    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xp = (x + 1) % size;
        const yp = (y + 1) % size;
        const dx = height[y * size + xp] - height[y * size + x];
        const dy = height[yp * size + x] - height[y * size + x];
        const inverseLength = 1 / Math.hypot(dx * 2.2, dy * 2.2, 1);
        const idx = (y * size + x) * 4;
        data[idx] = Math.round(((-dx * 2.2 * inverseLength) * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round(((-dy * 2.2 * inverseLength) * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }
    return data;
  } catch (error) {
    console.warn('cascade water: ripple normal data unavailable', error);
    return null;
  }
}

function tryCreateWaterNormalTexture(scene: Scene, name: string, data: Uint8Array): RawTexture | null {
  let texture: RawTexture | null = null;
  try {
    texture = RawTexture.CreateRGBATexture(
      data,
      256,
      256,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = name;
    texture.gammaSpace = false;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    return texture;
  } catch (error) {
    texture?.dispose();
    // Water still renders (static) without the ripple map - but say why.
    console.warn('cascade water: ripple normal map unavailable', error);
    return null;
  }
}

// Soft radial droplet sprite for the spray particles.
function tryCreateSpraySprite(scene: Scene): RawTexture | null {
  let texture: RawTexture | null = null;
  try {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    const radius = size / 2;
    const inner = [255, 255, 255, 255] as const;
    const middle = [210, 240, 255, 140] as const;
    const outer = [180, 220, 255, 0] as const;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance = Math.min(1, Math.hypot(x - center, y - center) / radius);
        const start = distance <= 0.4 ? inner : middle;
        const end = distance <= 0.4 ? middle : outer;
        const amount = distance <= 0.4 ? distance / 0.4 : (distance - 0.4) / 0.6;
        const idx = (y * size + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          data[idx + channel] = Math.round(start[channel] + (end[channel] - start[channel]) * amount);
        }
      }
    }

    texture = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = 'cascade-spray-sprite';
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  } catch (error) {
    texture?.dispose();
    console.warn('cascade water: spray sprite unavailable', error);
    return null;
  }
}
