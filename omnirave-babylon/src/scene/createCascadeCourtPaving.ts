// Side-effect import: augments Mesh.prototype with thinInstance* methods.
// Without it the app's tree-shaken subpath-import bundle has no
// thinInstanceSetBuffer and the whole scene fails to load (black screen).
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import {
  CASCADE_BAY_WALKABLE_X_MAX,
  CASCADE_BAY_WALKABLE_Z_MAX,
  CASCADE_BAY_WALKABLE_Z_MIN,
  VENUE_ENVELOPE_BLOCKER_THICKNESS,
  VENUE_WALKABLE_X_MAX,
} from './mainStageVenueBounds';
import { createPlateMaterial, GOLD_PLATE_MATERIAL, PEARL_PLATE_MATERIAL } from './venuePlateFamily';

// Decorative paving for the two Cascade Court flank plazas, which read "a bit
// bare underfoot" - a flat expanse of the venue's default ground either side
// of the tiered water features. Same repurposed plate family as the perimeter
// fence (pearl lamella tiles, gold seam bands), laid flat just above the
// existing ground so the plazas read as finished stonework.
//
// It is flooring ON existing floor: no collision, isPickable = false.

// Ground sits at y 0 across the flanks, and the player's ground ray lands the
// avatar's feet ON that ground (these tiles are thin-instanced and
// isPickable = false, so they are never a walkable surface in their own
// right - see resolveGroundHeight in playerController.ts).
//
// Player-flagged (2026-08-03, in-engine, with a screenshot): the slab used to
// be CENTRED at y 0.06, which put its underside at 0.04 and its top face at
// 0.08 - the tiles floated a clear 4cm off the ground on nothing, and their
// top face stood 8cm PROUD of the feet resting at y 0, so the avatar waded
// through the paving at ankle height instead of walking on it. "Clears
// z-fighting" only ever needed millimetres; 0.06 was orders of magnitude more
// clearance than the problem called for.
//
// Bed the stone instead, the way real paving is laid: the slab sits mostly
// BELOW grade with its top face just proud of it. Nothing floats (there is no
// underside gap to see), and the surface the avatar's feet rest on is the tile
// face itself, to within a hair that is sub-pixel at avatar scale.
const PAVING_THICKNESS = 0.04;
// How far the finished stone stands proud of grade. Big enough that the top
// face never z-fights the ground plane and the gold seams still catch grazing
// light on their edges, small enough to read as flush underfoot.
export const PAVING_TOP_Y = 0.01;
const PAVING_Y = PAVING_TOP_Y - PAVING_THICKNESS / 2;

// The plaza ring. The outer edge stops at the envelope blocker's walkable
// face - paving past that is behind the boundary fence and unreachable.
export const PLAZA_X_MIN = 30;
export const PLAZA_X_MAX = VENUE_WALKABLE_X_MAX - VENUE_ENVELOPE_BLOCKER_THICKNESS / 2;
export const PLAZA_Z_MIN = -50;
export const PLAZA_Z_MAX = -10;

// The Cascade Court BAY: the ground the boundary now encloses around the
// fountain and the skydeck ramp entrance (owner request, 2026-08-04 - see
// CASCADE_BAY_* in mainStageVenueBounds.ts). It was unreachable dark ground
// outside the old straight fence line; now that players can walk it, it is
// paved and lit like the rest of the court - "fill the space with the LED
// tiles". Its inner edge is the old plaza's outer edge, so the two regions
// meet with no seam, and every edge stops at a walkable face for the same
// reason PLAZA_X_MAX does.
export const BAY_PLAZA_X_MIN = PLAZA_X_MAX;
export const BAY_PLAZA_X_MAX = CASCADE_BAY_WALKABLE_X_MAX;
export const BAY_PLAZA_Z_MIN = CASCADE_BAY_WALKABLE_Z_MIN;
export const BAY_PLAZA_Z_MAX = CASCADE_BAY_WALKABLE_Z_MAX;

// Player-flagged (2026-07-31): earlier passes here tried to CUT the paving
// around the fountain's footprint - first as a rectangle (left the octagon's
// corners bare), then as an ellipse fit (over-culled several rows at the
// flat edges), then as the real measured octagon radius (correct, but still
// left a couple of tiles right at the true edge inside the module's own
// keep-out margin). The owner's actual intent turned out to be simpler than
// any of that: pave the WHOLE plaza uniformly, as if the tile floor were
// laid first and the fountain built on top of it - exactly what a real
// tiled plaza with a fountain centrepiece looks like. There is no keep-out
// at all now; the fountain's own solid geometry simply sits over/hides the
// tiles beneath it, and its collision (createMainStageCollisionBlockers.ts's
// fountainCollisionColumns, still using the real octagon radius) is what
// actually stops a player from walking through the stone - the paving layer
// no longer needs to know the fountain's shape at all.

const TILE_SIZE = 1.8;
const SEAM_WIDTH = 0.14;
const TILE_PITCH = TILE_SIZE + SEAM_WIDTH;
// Tile bands are three tiles wide; the gold seam strips sit on the band
// boundaries rather than every joint, so the field reads as coursed stone
// instead of graph paper.
const BAND_SIZE = 3;
const TONE_COUNT = 3;

export interface PavingTile {
  /** 0..TONE_COUNT-1: which pearl tone batch this tile belongs to. */
  tone: number;
  x: number;
  z: number;
}

export interface PavingSeam {
  length: number;
  /** 0 runs along x, PI/2 runs along z. */
  yaw: number;
  x: number;
  z: number;
}

export interface PavingPlan {
  seams: PavingSeam[];
  tiles: PavingTile[];
}

// Deterministic per-cell tone pick - no PRNG state, so the pattern is
// identical on every load and in every test run.
function toneFor(column: number, row: number) {
  const hash = (column * 73856093) ^ (row * 19349663);
  return ((hash % TONE_COUNT) + TONE_COUNT) % TONE_COUNT;
}

// Pure placement pass for ONE flank (the +x side); the -x side is this
// mirrored. Exported so the footprint can be asserted on directly rather than
// read back out of thin-instance buffers.
export function planCascadeCourtPaving(): PavingPlan {
  const tiles: PavingTile[] = [];
  const seams: PavingSeam[] = [];

  const columns = Math.floor((PLAZA_X_MAX - PLAZA_X_MIN) / TILE_PITCH);
  const rows = Math.floor((PLAZA_Z_MAX - PLAZA_Z_MIN) / TILE_PITCH);
  // Centre the grid in the plaza so the leftover fraction splits evenly. Both
  // regions are laid on THIS one lattice - the bay's courses continue the
  // plaza's rather than starting a second grid at its own corner, so the
  // stone runs through unbroken where the two meet and every tone/seam index
  // below stays global.
  const originX = PLAZA_X_MIN + (PLAZA_X_MAX - PLAZA_X_MIN - columns * TILE_PITCH) / 2;
  const originZ = PLAZA_Z_MIN + (PLAZA_Z_MAX - PLAZA_Z_MIN - rows * TILE_PITCH) / 2;

  // Lattice index range whose FULL tile footprint (not just its centre) fits
  // between `min` and `max` - the edge discipline the plaza has always had,
  // now applied to each region.
  const indexRange = (min: number, max: number, origin: number) => ({
    first: Math.ceil((min - origin - (TILE_PITCH - TILE_SIZE) / 2) / TILE_PITCH),
    last: Math.floor((max - origin + (TILE_PITCH - TILE_SIZE) / 2) / TILE_PITCH) - 1,
  });

  const regions = [
    { xMin: PLAZA_X_MIN, xMax: PLAZA_X_MAX, zMin: PLAZA_Z_MIN, zMax: PLAZA_Z_MAX },
    // The bay's inner edge is the plaza's outer edge: an INTERIOR joint now,
    // not a boundary, so the column straddling it is laid instead of dropped.
    // Without that the lattice's own centring fraction left a ~1.5m strip of
    // bare ground running right along the old fence line - the seam the two
    // fields are meant not to have. `seen` keeps that shared column from
    // being emitted twice.
    {
      xMin: BAY_PLAZA_X_MIN - TILE_PITCH,
      xMax: BAY_PLAZA_X_MAX,
      zMin: BAY_PLAZA_Z_MIN,
      zMax: BAY_PLAZA_Z_MAX,
    },
  ];
  const seen = new Set<string>();

  for (const region of regions) {
    const columnRange = indexRange(region.xMin, region.xMax, originX);
    const rowRange = indexRange(region.zMin, region.zMax, originZ);
    for (let column = columnRange.first; column <= columnRange.last; column++) {
      for (let row = rowRange.first; row <= rowRange.last; row++) {
        const key = `${column}:${row}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const x = originX + (column + 0.5) * TILE_PITCH;
        const z = originZ + (row + 0.5) * TILE_PITCH;
        // No fountain keep-out: the whole court paves uniformly, fountain and
        // all - see the module comment above.
        tiles.push({ tone: toneFor(column, row), x, z });

        // Band seams: on the +x edge of every BAND_SIZE-th column and the +z
        // edge of every BAND_SIZE-th row.
        if (column % BAND_SIZE === BAND_SIZE - 1) {
          seams.push({ length: TILE_PITCH, yaw: Math.PI / 2, x: x + TILE_PITCH / 2, z });
        }
        if (row % BAND_SIZE === BAND_SIZE - 1) {
          seams.push({ length: TILE_PITCH, yaw: 0, x, z: z + TILE_PITCH / 2 });
        }
      }
    }
  }

  return { seams, tiles };
}

// Column-major 4x4 of: scale along local X, rotate about Y, translate.
// Written straight into the thin-instance buffer - no Matrix allocation.
function writeInstance(
  buffer: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scaleX: number,
) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const offset = index * 16;
  buffer[offset + 0] = cos * scaleX;
  buffer[offset + 1] = 0;
  buffer[offset + 2] = -sin * scaleX;
  buffer[offset + 3] = 0;
  buffer[offset + 4] = 0;
  buffer[offset + 5] = 1;
  buffer[offset + 6] = 0;
  buffer[offset + 7] = 0;
  buffer[offset + 8] = sin;
  buffer[offset + 9] = 0;
  buffer[offset + 10] = cos;
  buffer[offset + 11] = 0;
  buffer[offset + 12] = x;
  buffer[offset + 13] = y;
  buffer[offset + 14] = z;
  buffer[offset + 15] = 1;
}

export interface CascadeCourtPavingHandle {
  dispose(): void;
  /** Name of the gold family material reused, or null if we fell back. */
  goldSourceMaterial: string | null;
  /** Name of the pearl family material reused, or null if we fell back. */
  pearlSourceMaterial: string | null;
  root: TransformNode;
  /** Total seam strips across both flanks. */
  seams: number;
  /** Total tiles across both flanks. */
  tiles: number;
}

export function createCascadeCourtPaving(scene: Scene): CascadeCourtPavingHandle {
  const root = new TransformNode('cascade-court-paving', scene);
  const plan = planCascadeCourtPaving();

  const meshes: Mesh[] = [];
  const materials: Material[] = [];

  // Three pearl tone batches instead of a per-instance colour buffer: this
  // venue's instance-colour path needs an unlit material (see the venue
  // notes), and unlit paving would ignore the plaza's own lighting entirely.
  // Three lit clones cost three draw calls and keep the field from reading as
  // one flat decal.
  const tones = [0.88, 1, 1.12].map((scale, index) => {
    const plate = createPlateMaterial(scene, {
      name: `cascade-court-paving-pearl-${index}`,
      sourceName: PEARL_PLATE_MATERIAL,
      albedoColor: new Color3(0.34 * scale, 0.325 * scale, 0.305 * scale),
      emissiveColor: new Color3(0.012, 0.011, 0.01),
      emissiveIntensity: 0.25,
      fallbackMetallic: 0.14,
      fallbackRoughness: 0.78,
    });
    materials.push(plate.material);
    return plate;
  });

  const goldSeam = createPlateMaterial(scene, {
    name: 'cascade-court-paving-gold-seam',
    sourceName: GOLD_PLATE_MATERIAL,
    albedoColor: new Color3(0.5, 0.38, 0.16),
    emissiveColor: new Color3(0.5, 0.38, 0.15),
    emissiveIntensity: 0.22,
    fallbackMetallic: 0.85,
    fallbackRoughness: 0.5,
  });
  materials.push(goldSeam.material);

  const source = (name: string, width: number, depth: number, material: Material) => {
    // Flat slab rather than a plane: a box needs no rotation to lie down and
    // its side faces catch the plaza's grazing light at the tile edges.
    const mesh = MeshBuilder.CreateBox(name, { width, height: PAVING_THICKNESS, depth }, scene);
    mesh.parent = root;
    mesh.material = material;
    mesh.isPickable = false;
    // A thin-instanced mesh renders ONLY when its source mesh isVisible is
    // true - the instances inherit it (see createFestivalField).
    mesh.isVisible = true;
    meshes.push(mesh);
    return mesh;
  };

  // Both flanks come from one buffer per mesh: the -x side is the +x plan
  // mirrored, so instances are written twice with x negated.
  const toneMeshes = tones.map((tone, index) =>
    source(`cascade-court-paving-tile-${index}`, TILE_SIZE, TILE_SIZE, tone.material),
  );
  const seamMesh = source('cascade-court-paving-seam', TILE_PITCH, SEAM_WIDTH, goldSeam.material);

  const toneCounts = tones.map(() => 0);
  for (const tile of plan.tiles) toneCounts[tile.tone] += 2;
  const toneBuffers = toneCounts.map((count) => new Float32Array(count * 16));
  const toneCursors = tones.map(() => 0);
  for (const tile of plan.tiles) {
    const buffer = toneBuffers[tile.tone];
    for (const side of [1, -1]) {
      writeInstance(buffer, toneCursors[tile.tone], side * tile.x, PAVING_Y, tile.z, 0, 1);
      toneCursors[tile.tone] += 1;
    }
  }

  const seamBuffer = new Float32Array(plan.seams.length * 2 * 16);
  let seamCursor = 0;
  for (const seam of plan.seams) {
    const scaleX = seam.length / TILE_PITCH;
    for (const side of [1, -1]) {
      writeInstance(seamBuffer, seamCursor, side * seam.x, PAVING_Y + 0.005, seam.z, seam.yaw, scaleX);
      seamCursor += 1;
    }
  }

  toneMeshes.forEach((mesh, index) => {
    if (toneCounts[index] === 0) return;
    mesh.thinInstanceSetBuffer('matrix', toneBuffers[index], 16, true);
    mesh.thinInstanceRefreshBoundingInfo(true);
  });
  if (seamCursor > 0) {
    seamMesh.thinInstanceSetBuffer('matrix', seamBuffer, 16, true);
    seamMesh.thinInstanceRefreshBoundingInfo(true);
  }

  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const mesh of meshes) {
      mesh.material = null;
      mesh.dispose();
    }
    meshes.length = 0;
    for (const material of materials) {
      material.dispose();
    }
    materials.length = 0;
    root.dispose();
  };

  return {
    dispose,
    goldSourceMaterial: goldSeam.sourceName,
    pearlSourceMaterial: tones[0].sourceName,
    root,
    seams: seamCursor,
    tiles: plan.tiles.length * 2,
  };
}
