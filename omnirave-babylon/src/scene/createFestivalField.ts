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
  scatterCount: number;
}

const FIELD_MESH_NAME = 'FestivalField';
const GRASS_TEXTURE_SIZE = 256;
const GRASS_TILE_SCALE = 40;
const TUFT_SOURCE_NAME = 'festival-field-tuft-source';

// The plaza/venue footprint the field must NOT scatter tufts into (runtime
// coordinates - the field itself is a flat 240x180 plane at local X +-120,
// Z +-90, so anything outside this box but inside the field bounds is the
// "outer ring" the field's grass is actually visible as, once fog eats the
// far distance).
// X extent matches the venue's shared walkable/envelope bounds (see
// mainStageVenueBounds.ts). The Z extent below is a narrower, distinct
// concept - the visible plaza footprint the grass ring must clear, not the
// full walkable rectangle - so it stays local to this module.
const VENUE_X_MIN = VENUE_WALKABLE_X_MIN;
const VENUE_X_MAX = VENUE_WALKABLE_X_MAX;
const VENUE_Z_MIN = -60;
const VENUE_Z_MAX = 16;
const FIELD_X_EXTENT = 118;
const FIELD_Z_MIN = -88;
const FIELD_Z_MAX = 88;
const TUFT_COUNT_TARGET = 320;

// Small deterministic PRNG (mulberry32), same pattern as
// createMainStagePresentationRig's createSeededRandom - keeps the field's
// noise and tuft placement identical across every load.
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

// Tiny low-poly tuft: two crossed quads (4 triangles), cheap enough for a
// few hundred thin instances in one draw call.
function createTuftSourceMesh(scene: Scene) {
  try {
    const tuft = MeshBuilder.CreateDisc(
      TUFT_SOURCE_NAME,
      { radius: 0.35, tessellation: 3, sideOrientation: 2 },
      scene,
    );
    // A second blade crossed 90 degrees, merged in, so the tuft reads from
    // any angle instead of vanishing edge-on.
    const crossBlade = MeshBuilder.CreateDisc(
      `${TUFT_SOURCE_NAME}-cross`,
      { radius: 0.35, tessellation: 3, sideOrientation: 2 },
      scene,
    );
    crossBlade.rotation.y = Math.PI / 2;
    crossBlade.bakeCurrentTransformIntoVertices();
    const merged = Mesh.MergeMeshes([tuft, crossBlade], true, true, undefined, false, false);
    const finalMesh = merged ?? tuft;
    finalMesh.name = TUFT_SOURCE_NAME;
    finalMesh.rotation.x = Math.PI / 2; // stand the disc up off the ground plane
    finalMesh.bakeCurrentTransformIntoVertices();
    finalMesh.position.y = 0.18;

    const tuftMaterial = new PBRMaterial(`${TUFT_SOURCE_NAME}-material`, scene);
    tuftMaterial.albedoColor = new Color3(0.05, 0.09, 0.04);
    tuftMaterial.emissiveColor = new Color3(0.002, 0.004, 0.002);
    tuftMaterial.metallic = 0;
    tuftMaterial.roughness = 0.95;
    tuftMaterial.backFaceCulling = false;
    finalMesh.material = tuftMaterial;
    // Must stay visible: a thin-instanced mesh renders ONLY when its source
    // mesh isVisible is true - the instances inherit it. Hiding the source
    // (to suppress a phantom instance-0) hides every tuft (verified live:
    // scatter vanished entirely).
    finalMesh.isVisible = true;
    finalMesh.isPickable = false;

    return finalMesh;
  } catch (error) {
    console.warn('festival field: tuft source mesh unavailable', error);
    return null;
  }
}

function inPerimeterRing(x: number, z: number) {
  const outsideVenue = x < VENUE_X_MIN || x > VENUE_X_MAX || z < VENUE_Z_MIN || z > VENUE_Z_MAX;
  const insideField = Math.abs(x) <= FIELD_X_EXTENT && z >= FIELD_Z_MIN && z <= FIELD_Z_MAX;
  return outsideVenue && insideField;
}

function scatterTufts(tuftMesh: Mesh) {
  const random = createSeededRandom(0x9f2c11);
  const matrices: number[] = [];
  let placed = 0;
  let attempts = 0;
  const maxAttempts = TUFT_COUNT_TARGET * 20;

  while (placed < TUFT_COUNT_TARGET && attempts < maxAttempts) {
    attempts++;
    const x = (random() * 2 - 1) * FIELD_X_EXTENT;
    const z = FIELD_Z_MIN + random() * (FIELD_Z_MAX - FIELD_Z_MIN);
    if (!inPerimeterRing(x, z)) continue;

    const scale = 0.7 + random() * 0.8;
    const rotationY = random() * Math.PI * 2;
    placed++;
    matrices.push(x, z, scale, rotationY);
  }

  return { placed, matrices };
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

  const tuftMesh = createTuftSourceMesh(scene);
  let scatterCount = 0;
  if (tuftMesh) {
    const { placed, matrices } = scatterTufts(tuftMesh);
    scatterCount = placed;
    const buffer = new Float32Array(placed * 16);
    for (let i = 0; i < placed; i++) {
      const x = matrices[i * 4];
      const z = matrices[i * 4 + 1];
      const scale = matrices[i * 4 + 2];
      const rotationY = matrices[i * 4 + 3];
      const cos = Math.cos(rotationY);
      const sin = Math.sin(rotationY);
      const offset = i * 16;
      // Column-major 4x4: scaled Y-rotation * translation, Y left at 0
      // (tuft mesh already sits at its own local y offset).
      buffer[offset + 0] = cos * scale;
      buffer[offset + 1] = 0;
      buffer[offset + 2] = -sin * scale;
      buffer[offset + 3] = 0;
      buffer[offset + 4] = 0;
      buffer[offset + 5] = scale;
      buffer[offset + 6] = 0;
      buffer[offset + 7] = 0;
      buffer[offset + 8] = sin * scale;
      buffer[offset + 9] = 0;
      buffer[offset + 10] = cos * scale;
      buffer[offset + 11] = 0;
      buffer[offset + 12] = x;
      buffer[offset + 13] = 0;
      buffer[offset + 14] = z;
      buffer[offset + 15] = 1;
    }
    if (placed > 0) {
      tuftMesh.thinInstanceSetBuffer('matrix', buffer, 16, true);
    }
  }

  return {
    fieldMesh: fieldMesh ?? null,
    scatterCount,
  };
}
