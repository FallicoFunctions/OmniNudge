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
  CASCADE_BAY_X_MAX,
  CASCADE_BAY_Z_MAX,
  CASCADE_BAY_Z_MIN,
  VENUE_ENVELOPE_BACK_Z,
  VENUE_ENVELOPE_BLOCKER_THICKNESS,
  VENUE_ENVELOPE_FRONT_Z,
  VENUE_WALKABLE_X_MAX,
  VENUE_WALKABLE_X_MIN,
} from './mainStageVenueBounds';
import { createPlateMaterial, GOLD_PLATE_MATERIAL, PEARL_PLATE_MATERIAL } from './venuePlateFamily';

// A VISIBLE venue boundary. The walkable field is closed by the envelope
// blockers in createMainStageCollisionBlockers.ts, which are invisible boxes -
// so players walk into nothing and stop ("right now the boundary is an
// invisible wall"). This module stands an ornate pearl-and-gold fence exactly
// where those blockers bite, repurposing the venue's own crown-shell plate
// family (pearl lamella + gold seam) so it reads as part of the architecture.
//
// It adds NO collision: the blockers already stop the player. This is only
// the picture of that boundary, and every piece stays isPickable = false.
//
// The stage side is deliberately left open - the stage structure itself
// already reads as the front wall.

const FENCE_INSET = 0.6;
const BLOCKER_HALF = VENUE_ENVELOPE_BLOCKER_THICKNESS / 2;

// The line the fence follows. A blocker CENTRED on the walkable bound is
// THICKNESS wide, so its walkable-side face - where the player actually stops
// - sits half a thickness inside; the fence stands FENCE_INSET further in
// again, which puts the post faces essentially at the capsule's stopping
// plane. The visual and the collision therefore coincide instead of leaving a
// gap the player can walk into.
export const PERIMETER_LEFT_X = VENUE_WALKABLE_X_MIN + BLOCKER_HALF + FENCE_INSET;
export const PERIMETER_RIGHT_X = VENUE_WALKABLE_X_MAX - BLOCKER_HALF - FENCE_INSET;
export const PERIMETER_BACK_Z = VENUE_ENVELOPE_BACK_Z + BLOCKER_HALF + FENCE_INSET;
export const PERIMETER_FRONT_Z = VENUE_ENVELOPE_FRONT_Z - BLOCKER_HALF - FENCE_INSET;

// The Cascade Court bay. The side fence used to run dead straight and BREAK
// twice on each flank - once around the tiered water (which straddles the old
// line) and once for the skydeck ramp mouth, whose foot lands right on it.
// Owner request (2026-08-04): fence both of those IN instead, so the boundary
// steps out around the fountain and the ramp entrance and the enclosed ground
// becomes real, paved, walkable court. Two holes in the fence became one
// enclosed bay.
//
// The bay's blocker lines live in mainStageVenueBounds.ts (CASCADE_BAY_*,
// which is also what the invisible walls are built from); the fence stands
// FENCE_INSET inside the walkable face of those, exactly like the straight
// runs do, so the picture and the collision still coincide.
export const BAY_FENCE_X = CASCADE_BAY_X_MAX - BLOCKER_HALF - FENCE_INSET;
export const BAY_FENCE_Z_MIN = CASCADE_BAY_Z_MIN + BLOCKER_HALF + FENCE_INSET;
export const BAY_FENCE_Z_MAX = CASCADE_BAY_Z_MAX - BLOCKER_HALF - FENCE_INSET;

const NOMINAL_SPACING = 6;
const POST_SIZE = 0.35;
const POST_HEIGHT = 2.6;
const NOMINAL_SPAN = NOMINAL_SPACING - POST_SIZE;
const PANEL_HEIGHT = 1.2;
const PANEL_THICKNESS = 0.12;
const PANEL_CENTER_Y = 0.78;
const RAIL_HEIGHT = 0.16;
const RAIL_THICKNESS = 0.22;
const RAIL_Y = POST_HEIGHT - 0.18;

export interface PerimeterPost {
  x: number;
  z: number;
}

export interface PerimeterSpan {
  /** Span length along its own run, in metres. */
  length: number;
  /** Y rotation of the span: 0 runs along x, PI/2 runs along z. */
  yaw: number;
  x: number;
  z: number;
}

export interface PerimeterPlan {
  posts: PerimeterPost[];
  spans: PerimeterSpan[];
}

interface FenceRun {
  axis: 'x' | 'z';
  /** The run's other (constant) coordinate. */
  fixed: number;
  /** May be greater than `to`: runs are walked in order around the outline. */
  from: number;
  to: number;
  /** Skip the first post - a previous run already placed one there. */
  skipFirstPost: boolean;
}

/**
 * Each flank's boundary as a POLYLINE walked corner to corner, rather than a
 * list of independent straight runs: with the Cascade Court bay stepping out
 * around the fountain and the ramp entrance, the outline turns four times per
 * flank, and consecutive segments have to share their corner posts. Walking
 * it in order means every segment after the first simply skips the post its
 * predecessor already stood there - and the -x flank is the exact mirror, no
 * special-casing which end of a segment holds the shared corner.
 */
function flankOutline(side: 1 | -1): { x: number; z: number }[] {
  const sideX = side > 0 ? PERIMETER_RIGHT_X : PERIMETER_LEFT_X;
  const bayX = side * BAY_FENCE_X;
  return [
    { x: sideX, z: PERIMETER_BACK_Z },
    { x: sideX, z: BAY_FENCE_Z_MIN },
    { x: bayX, z: BAY_FENCE_Z_MIN },
    { x: bayX, z: BAY_FENCE_Z_MAX },
    { x: sideX, z: BAY_FENCE_Z_MAX },
    { x: sideX, z: PERIMETER_FRONT_Z },
  ];
}

function fenceRuns(): FenceRun[] {
  const runs: FenceRun[] = [
    // Back edge first, so it owns both back corners.
    { axis: 'x', fixed: PERIMETER_BACK_Z, from: PERIMETER_LEFT_X, to: PERIMETER_RIGHT_X, skipFirstPost: false },
  ];
  for (const side of [1, -1] as const) {
    const points = flankOutline(side);
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1];
      const to = points[index];
      runs.push(
        from.x === to.x
          ? { axis: 'z', fixed: from.x, from: from.z, to: to.z, skipFirstPost: true }
          : { axis: 'x', fixed: from.z, from: from.x, to: to.x, skipFirstPost: true },
      );
    }
  }
  return runs;
}

// Pure placement pass: every post station and every panel/rail span, in
// runtime metres. Exported so the geometry can be asserted on directly
// without reading thin-instance buffers back out of the engine.
export function planVenuePerimeter(): PerimeterPlan {
  const posts: PerimeterPost[] = [];
  const spans: PerimeterSpan[] = [];

  for (const run of fenceRuns()) {
    // Runs are walked in outline order, so a segment can travel in either
    // direction along its axis - the LENGTH is the absolute distance and the
    // per-post step carries the sign.
    const length = Math.abs(run.to - run.from);
    if (length <= NOMINAL_SPACING) continue;
    const spanCount = Math.max(1, Math.round(length / NOMINAL_SPACING));
    const step = (run.to - run.from) / spanCount;
    const spacing = Math.abs(step);
    const yaw = run.axis === 'x' ? 0 : Math.PI / 2;

    for (let index = run.skipFirstPost ? 1 : 0; index <= spanCount; index++) {
      const along = run.from + index * step;
      posts.push(
        run.axis === 'x' ? { x: along, z: run.fixed } : { x: run.fixed, z: along },
      );
    }
    for (let index = 0; index < spanCount; index++) {
      const along = run.from + (index + 0.5) * step;
      spans.push({
        length: spacing - POST_SIZE,
        yaw,
        x: run.axis === 'x' ? along : run.fixed,
        z: run.axis === 'x' ? run.fixed : along,
      });
    }
  }

  return { posts, spans };
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

export interface VenuePerimeterHandle {
  dispose(): void;
  /** Name of the gold family material reused, or null if we fell back. */
  goldSourceMaterial: string | null;
  panels: number;
  /** Name of the pearl family material reused, or null if we fell back. */
  pearlSourceMaterial: string | null;
  posts: number;
  rails: number;
  root: TransformNode;
}

export function createVenuePerimeter(scene: Scene): VenuePerimeterHandle {
  const root = new TransformNode('venue-perimeter', scene);
  const plan = planVenuePerimeter();

  // Pearl pilasters and infill panels. Lifted well clear of the crown
  // plates' near-black tuning: this geometry is at eye level in an unlit
  // field and has to be SEEN.
  const pearl = createPlateMaterial(scene, {
    name: 'venue-perimeter-pearl-material',
    sourceName: PEARL_PLATE_MATERIAL,
    albedoColor: new Color3(0.46, 0.43, 0.4),
    emissiveColor: new Color3(0.028, 0.026, 0.024),
    emissiveIntensity: 0.35,
    fallbackMetallic: 0.18,
    fallbackRoughness: 0.72,
  });

  // Gold cap rail with a low emissive glint so the LINE reads at night. It is
  // deliberately not a light source - no scene light is attached, and the
  // intensity stays under the stage's own output.
  const gold = createPlateMaterial(scene, {
    name: 'venue-perimeter-gold-rail-material',
    sourceName: GOLD_PLATE_MATERIAL,
    albedoColor: new Color3(0.52, 0.4, 0.17),
    emissiveColor: new Color3(0.85, 0.66, 0.28),
    emissiveIntensity: 0.5,
    fallbackMetallic: 0.85,
    fallbackRoughness: 0.42,
  });

  const meshes: Mesh[] = [];
  const materials: Material[] = [pearl.material, gold.material];

  const source = (
    name: string,
    width: number,
    height: number,
    depth: number,
    material: Material,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.parent = root;
    mesh.material = material;
    mesh.isPickable = false;
    // A thin-instanced mesh renders ONLY when its source mesh isVisible is
    // true - the instances inherit it (see createFestivalField).
    mesh.isVisible = true;
    meshes.push(mesh);
    return mesh;
  };

  const postMesh = source('venue-perimeter-post', POST_SIZE, POST_HEIGHT, POST_SIZE, pearl.material);
  const panelMesh = source('venue-perimeter-panel', NOMINAL_SPAN, PANEL_HEIGHT, PANEL_THICKNESS, pearl.material);
  const railMesh = source('venue-perimeter-cap-rail', NOMINAL_SPAN, RAIL_HEIGHT, RAIL_THICKNESS, gold.material);

  const postBuffer = new Float32Array(plan.posts.length * 16);
  plan.posts.forEach((post, index) => {
    writeInstance(postBuffer, index, post.x, POST_HEIGHT / 2, post.z, 0, 1);
  });

  const panelBuffer = new Float32Array(plan.spans.length * 16);
  const railBuffer = new Float32Array(plan.spans.length * 16);
  plan.spans.forEach((span, index) => {
    const scaleX = span.length / NOMINAL_SPAN;
    writeInstance(panelBuffer, index, span.x, PANEL_CENTER_Y, span.z, span.yaw, scaleX);
    writeInstance(railBuffer, index, span.x, RAIL_Y, span.z, span.yaw, scaleX);
  });

  if (plan.posts.length > 0) {
    postMesh.thinInstanceSetBuffer('matrix', postBuffer, 16, true);
    postMesh.thinInstanceRefreshBoundingInfo(true);
  }
  if (plan.spans.length > 0) {
    panelMesh.thinInstanceSetBuffer('matrix', panelBuffer, 16, true);
    panelMesh.thinInstanceRefreshBoundingInfo(true);
    railMesh.thinInstanceSetBuffer('matrix', railBuffer, 16, true);
    railMesh.thinInstanceRefreshBoundingInfo(true);
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
    goldSourceMaterial: gold.sourceName,
    panels: plan.spans.length,
    pearlSourceMaterial: pearl.sourceName,
    posts: plan.posts.length,
    rails: plan.spans.length,
    root,
  };
}
