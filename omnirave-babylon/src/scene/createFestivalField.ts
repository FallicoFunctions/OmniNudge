// Side-effect import: augments Mesh.prototype with thinInstance* methods.
// Without it the app's tree-shaken subpath-import bundle has no
// thinInstanceSetBuffer and the whole scene fails to load (black screen).
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { Scene } from '@babylonjs/core/scene';

import { VENUE_WALKABLE_X_MAX, VENUE_WALKABLE_X_MIN } from './mainStageVenueBounds';

export interface FestivalFieldSummary {
  fieldMesh: Mesh | null;
}

const FIELD_MESH_NAME = 'FestivalField';
const GRASS_TEXTURE_SIZE = 256;
const GRASS_TILE_SCALE = 40;

// Player-flagged (2026-08-04, with a screenshot): this module also used to
// scatter ~320 low-poly grass TUFTS in a ring around the venue - two crossed
// 3-sided discs each, dark green. They read as "little green triangles
// scattered across the FestivalField", including where the ring's edge poked
// up through the plaza paving, and the owner asked for them gone. Removed
// outright rather than hidden or thinned out: nothing else referenced the
// scatter, so keeping a disabled mesh around would only be dead geometry.
// The field's own grass ALBEDO below is untouched - the ground still reads as
// grass, it just has no props standing in it.

// Small deterministic PRNG (mulberry32), same pattern as
// createMainStagePresentationRig's createSeededRandom - keeps the field's
// generated noise identical across every load.
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

// Value noise summed over a few integer frequencies. Integer frequencies
// wrap cleanly at the tile boundary (same trick as the cascade water normal
// map), so tiling this texture across the 240-unit field shows no seams.
function tileableValueNoise(x: number, y: number, size: number, random: () => number) {
  // Precompute a small lattice of pseudo-random values per octave so the
  // noise wraps exactly at `size`.
  let total = 0;
  let amplitude = 0.6;
  let maxAmp = 0;
  const octaves = [2, 4, 8];
  for (const freq of octaves) {
    const lattice = octaveLattice(freq, random);
    const u = ((x / size) * freq) % freq;
    const v = ((y / size) * freq) % freq;
    total += amplitude * sampleLattice(lattice, freq, u, v);
    maxAmp += amplitude;
    amplitude *= 0.5;
  }
  return total / maxAmp;
}

const latticeCache = new Map<number, Float32Array>();
function octaveLattice(freq: number, random: () => number) {
  const cached = latticeCache.get(freq);
  if (cached) return cached;
  const lattice = new Float32Array(freq * freq);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  latticeCache.set(freq, lattice);
  return lattice;
}

function sampleLattice(lattice: Float32Array, freq: number, u: number, v: number) {
  const x0 = Math.floor(u) % freq;
  const y0 = Math.floor(v) % freq;
  const x1 = (x0 + 1) % freq;
  const y1 = (y0 + 1) % freq;
  const fx = u - Math.floor(u);
  const fy = v - Math.floor(v);
  const smoothX = fx * fx * (3 - 2 * fx);
  const smoothY = fy * fy * (3 - 2 * fy);
  const v00 = lattice[y0 * freq + x0];
  const v10 = lattice[y0 * freq + x1];
  const v01 = lattice[y1 * freq + x0];
  const v11 = lattice[y1 * freq + x1];
  const top = v00 + (v10 - v00) * smoothX;
  const bottom = v01 + (v11 - v01) * smoothX;
  return top + (bottom - top) * smoothY;
}

// Raw-pixel grass albedo, generated at runtime (no binary asset), following
// the exact pattern of createMainStagePresentationRig's
// createStarfieldTexture: build a Uint8Array by pure math, wrap in
// try/catch, return null on failure so callers can fall back gracefully.
function createGrassTexture(scene: Scene) {
  try {
    latticeCache.clear();
    const size = GRASS_TEXTURE_SIZE;
    const data = new Uint8Array(size * size * 4);
    const random = createSeededRandom(0x6a55f1);

    // Deep desaturated night-grass green base.
    const baseR = 0.05;
    const baseG = 0.08;
    const baseB = 0.04;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const noise = tileableValueNoise(x, y, size, random); // ~0..1
        const shade = 0.7 + noise * 0.6; // modulate brightness, stay dark

        // Faint blade streaks: thin, mostly-vertical bright/dark slivers
        // built from a second wrapped noise sampled at a stretched
        // vertical frequency, so they read as elongated blades rather than
        // blobs.
        const streakNoise = tileableValueNoise(x * 0.35, y * 3, size, random);
        const streak = (streakNoise - 0.5) * 0.18;

        const r = Math.min(1, Math.max(0, baseR * shade + streak * 0.3));
        const g = Math.min(1, Math.max(0, baseG * shade + streak * 0.5));
        const b = Math.min(1, Math.max(0, baseB * shade + streak * 0.2));

        const i = (y * size + x) * 4;
        data[i] = Math.round(r * 255);
        data[i + 1] = Math.round(g * 255);
        data[i + 2] = Math.round(b * 255);
        data[i + 3] = 255;
      }
    }

    // Tiled ground viewed at grazing angles aliases badly without mipmaps
    // (unlike the sparse single-dot starfield, which needed them off) - so
    // generateMipMaps is true here with trilinear sampling.
    const texture = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = 'festival-field-grass-albedo';
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.uScale = GRASS_TILE_SCALE;
    texture.vScale = GRASS_TILE_SCALE;
    return texture;
  } catch (error) {
    console.warn('festival field: grass texture unavailable', error);
    return null;
  }
}

export function createFestivalField(scene: Scene): FestivalFieldSummary {
  const fieldMesh = scene.meshes.find(
    (m) => m.name === FIELD_MESH_NAME || /FestivalField/.test(m.name),
  ) as Mesh | undefined;

  if (fieldMesh) {
    const sourceMaterial = fieldMesh.material;
    if (sourceMaterial instanceof PBRMaterial) {
      // Only mutate a material exclusively owned by this mesh. The polish
      // system clones a per-rule override named `${source}__${ruleKey}`; if
      // the current material still carries the bare shared name (no `__`
      // suffix), clone it here before touching anything.
      let material = sourceMaterial;
      const isSharedSource = !sourceMaterial.name.includes('__');
      if (isSharedSource) {
        const clone = sourceMaterial.clone('FestivalField-grass');
        if (clone instanceof PBRMaterial) {
          fieldMesh.material = clone;
          material = clone;
        }
      }

      // The static-scene freeze runs before this module; unfreeze before
      // editing, same as createCascadeCourtWaterMotion does for its water
      // materials.
      material.unfreeze();

      const grassTexture = createGrassTexture(scene);
      if (grassTexture) {
        material.albedoTexture = grassTexture;
        material.albedoColor = new Color3(0.9, 0.9, 0.9);
      }
      material.metallic = 0;
      material.roughness = 0.9;
    }
  }

  return {
    fieldMesh: fieldMesh ?? null,
  };
}
