import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import {
  SKYDECK_DECK_Y,
  SKYDECK_LANDING_X_MAX,
  SKYDECK_LANDING_X_MIN,
  SKYDECK_LANDING_Z_MIN,
  SKYDECK_PIERS,
  SKYDECK_PIER_SIZE,
  SKYDECK_RAIL_HEIGHT,
  SKYDECK_RAIL_RUNS,
  SKYDECK_RAMP_FOOT_X,
  SKYDECK_RAMP_HEAD_X,
  SKYDECK_RAMP_Z_MAX,
  SKYDECK_RAMP_Z_MIN,
  SKYDECK_SLAB_THICKNESS,
  SKYDECK_TERRACE_TOP_Y,
  SKYDECK_X_MAX,
  SKYDECK_X_MIN,
  SKYDECK_Z_MAX,
  SKYDECK_Z_MIN,
} from './mainStageVenueBounds';
import { createPlateMaterial, GOLD_PLATE_MATERIAL, PEARL_PLATE_MATERIAL } from './venuePlateFamily';

// An elevated, WALKABLE VIP viewing platform over each VIP forecourt - built
// twice, mirrored about x.
//
// The walkable-space audit found the VIP terrace signposted but not standable:
// the venue's authored terrace (V30_WingTerraceFascia + the V133 gold sail
// bays) is a roofscape with no floor, and the GLB's own COL_VIPDeck ramp
// corridor is walled off by the basin-water blockers. This module lays a real
// floor ON that roof and gives it a ramp from the flank ground, so "VIP" is a
// place you climb to and look down at the show from.
//
// Every dimension lives in mainStageVenueBounds.ts (SKYDECK_*) - see the
// probe notes there for why each number is what it is - because the authored
// railing/pier rows in createMainStageCollisionBlockers.ts derive from the
// same constants and must never drift from the geometry.
//
// Walkability, in this venue, is the DOWNWARD GROUND RAY in playerController:
// it picks the highest collision surface at or just above the player's feet.
// So the deck/landing/ramp meshes have to be handed to the controller's
// collisionMeshes list (createMainStageScene does that from `walkableMeshes`)
// AND carry checkCollisions = true, which is what marks them as floor rather
// than decoration. The railings are the opposite: they are pictures, and the
// authored blocker rows are what actually stops the player - a blocker whose
// y band starts at the deck surface cannot touch anyone standing on the
// ground below, which is exactly why they are authored rather than derived.

const DECK_WIDTH = SKYDECK_X_MAX - SKYDECK_X_MIN;
const DECK_DEPTH = SKYDECK_Z_MAX - SKYDECK_Z_MIN;
const DECK_CENTER_X = (SKYDECK_X_MIN + SKYDECK_X_MAX) / 2;
const DECK_CENTER_Z = (SKYDECK_Z_MIN + SKYDECK_Z_MAX) / 2;
const SLAB_CENTER_Y = SKYDECK_DECK_Y - SKYDECK_SLAB_THICKNESS / 2;

const LANDING_WIDTH = SKYDECK_LANDING_X_MAX - SKYDECK_LANDING_X_MIN;
const LANDING_DEPTH = SKYDECK_Z_MIN - SKYDECK_LANDING_Z_MIN;
const LANDING_CENTER_X = (SKYDECK_LANDING_X_MIN + SKYDECK_LANDING_X_MAX) / 2;
const LANDING_CENTER_Z = (SKYDECK_LANDING_Z_MIN + SKYDECK_Z_MIN) / 2;

const RAMP_RUN = SKYDECK_RAMP_FOOT_X - SKYDECK_RAMP_HEAD_X;
const RAMP_RISE = SKYDECK_DECK_Y;
const RAMP_LENGTH = Math.hypot(RAMP_RUN, RAMP_RISE);
/** Ramp pitch in radians (0.493 rad = 28.25 degrees). */
export const SKYDECK_RAMP_SLOPE = Math.atan2(RAMP_RISE, RAMP_RUN);
const RAMP_WIDTH = SKYDECK_RAMP_Z_MAX - SKYDECK_RAMP_Z_MIN;
const RAMP_CENTER_Z = (SKYDECK_RAMP_Z_MIN + SKYDECK_RAMP_Z_MAX) / 2;
// Midpoint of the ramp's WALKING surface; the box body hangs below it.
const RAMP_TOP_MID_X = (SKYDECK_RAMP_FOOT_X + SKYDECK_RAMP_HEAD_X) / 2;
const RAMP_TOP_MID_Y = RAMP_RISE / 2;

const TRIM_HEIGHT = 0.22;
const TRIM_THICKNESS = 0.3;
const RAIL_TOP_Y = SKYDECK_DECK_Y + SKYDECK_RAIL_HEIGHT;
const RAIL_MID_Y = SKYDECK_DECK_Y + SKYDECK_RAIL_HEIGHT * 0.52;
const RAIL_SECTION = 0.12;
const POST_SECTION = 0.16;

export interface VipSkydeckHandle {
  /** Height of the walking surface, in runtime metres. */
  deckTopY: number;
  dispose(): void;
  /** Name of the gold family material reused, or null if we fell back. */
  goldSourceMaterial: string | null;
  meshes: Mesh[];
  /** Name of the pearl family material reused, or null if we fell back. */
  pearlSourceMaterial: string | null;
  root: TransformNode;
  /** Ramp pitch in degrees - asserted on so the run never quietly steepens. */
  rampSlopeDegrees: number;
  /** Floor surfaces: must be added to the controller's collisionMeshes. */
  walkableMeshes: Mesh[];
}

export function createVipSkydeck(scene: Scene): VipSkydeckHandle {
  const root = new TransformNode('vip-skydeck', scene);
  const meshes: Mesh[] = [];
  const walkableMeshes: Mesh[] = [];

  // Pearl deck plate. Brighter than the crown-shell tuning the family carries
  // (that is authored for geometry 24m overhead); this is a floor people
  // stand on, lifted so it reads at night without becoming a lamp.
  const pearl = createPlateMaterial(scene, {
    name: 'vip-skydeck-pearl-material',
    sourceName: PEARL_PLATE_MATERIAL,
    albedoColor: new Color3(0.42, 0.4, 0.375),
    emissiveColor: new Color3(0.024, 0.022, 0.02),
    emissiveIntensity: 0.3,
    fallbackMetallic: 0.16,
    fallbackRoughness: 0.74,
  });

  // Gold filigree edge trim and railings - the same glint the perimeter fence
  // cap rail carries, so the two read as one family from the ground.
  const gold = createPlateMaterial(scene, {
    name: 'vip-skydeck-gold-material',
    sourceName: GOLD_PLATE_MATERIAL,
    albedoColor: new Color3(0.52, 0.4, 0.17),
    emissiveColor: new Color3(0.85, 0.66, 0.28),
    emissiveIntensity: 0.45,
    fallbackMetallic: 0.85,
    fallbackRoughness: 0.42,
  });

  const materials: Material[] = [pearl.material, gold.material];

  const box = (
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: Material,
    walkable = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.parent = root;
    mesh.position.set(x, y, z);
    mesh.material = material;
    // Nothing here is a pick target; the ground ray in playerController uses
    // Ray.intersectsMesh, which does not consult isPickable.
    mesh.isPickable = false;
    if (walkable) {
      mesh.checkCollisions = true;
      walkableMeshes.push(mesh);
    }
    meshes.push(mesh);
    return mesh;
  };

  for (const side of [1, -1] as const) {
    const tag = side > 0 ? 'r' : 'l';
    const sx = (x: number) => side * x;

    // --- Floors -------------------------------------------------------
    box(
      `vip-skydeck-deck-${tag}`,
      DECK_WIDTH,
      SKYDECK_SLAB_THICKNESS,
      DECK_DEPTH,
      sx(DECK_CENTER_X),
      SLAB_CENTER_Y,
      DECK_CENTER_Z,
      pearl.material,
      true,
    );
    box(
      `vip-skydeck-landing-${tag}`,
      LANDING_WIDTH,
      SKYDECK_SLAB_THICKNESS,
      LANDING_DEPTH,
      sx(LANDING_CENTER_X),
      SLAB_CENTER_Y,
      LANDING_CENTER_Z,
      pearl.material,
      true,
    );

    // Ramp: a slab rotated about z so its TOP face is the walking plane from
    // (foot x, y 0) up to (head x, deck y). Positioned by that top face, not
    // by the box centre, so the surface lands exactly on the landing.
    const ramp = box(
      `vip-skydeck-ramp-${tag}`,
      RAMP_LENGTH,
      SKYDECK_SLAB_THICKNESS,
      RAMP_WIDTH,
      sx(RAMP_TOP_MID_X - (SKYDECK_SLAB_THICKNESS / 2) * Math.sin(SKYDECK_RAMP_SLOPE)),
      RAMP_TOP_MID_Y - (SKYDECK_SLAB_THICKNESS / 2) * Math.cos(SKYDECK_RAMP_SLOPE),
      RAMP_CENTER_Z,
      pearl.material,
      true,
    );
    // Mirrored side climbs the other way, so the pitch flips with it.
    ramp.rotation.z = side > 0 ? -SKYDECK_RAMP_SLOPE : SKYDECK_RAMP_SLOPE;
    ramp.computeWorldMatrix(true);

    // --- Gold edge trim around the deck slab ---------------------------
    const trimY = SKYDECK_DECK_Y - TRIM_HEIGHT / 2;
    box(`vip-skydeck-trim-${tag}-north`, DECK_WIDTH, TRIM_HEIGHT, TRIM_THICKNESS, sx(DECK_CENTER_X), trimY, SKYDECK_Z_MAX - TRIM_THICKNESS / 2, gold.material);
    box(`vip-skydeck-trim-${tag}-south`, DECK_WIDTH, TRIM_HEIGHT, TRIM_THICKNESS, sx(DECK_CENTER_X), trimY, SKYDECK_Z_MIN + TRIM_THICKNESS / 2, gold.material);
    box(`vip-skydeck-trim-${tag}-east`, TRIM_THICKNESS, TRIM_HEIGHT, DECK_DEPTH, sx(SKYDECK_X_MAX - TRIM_THICKNESS / 2), trimY, DECK_CENTER_Z, gold.material);
    box(`vip-skydeck-trim-${tag}-west`, TRIM_THICKNESS, TRIM_HEIGHT, DECK_DEPTH, sx(SKYDECK_X_MIN + TRIM_THICKNESS / 2), trimY, DECK_CENTER_Z, gold.material);

    // --- Guard railings -------------------------------------------------
    SKYDECK_RAIL_RUNS.forEach((run) => {
      const length = run.to - run.from;
      const along = (run.from + run.to) / 2;
      const x = run.axis === 'x' ? along : run.fixed;
      const z = run.axis === 'x' ? run.fixed : along;
      const width = run.axis === 'x' ? length : RAIL_SECTION;
      const depth = run.axis === 'x' ? RAIL_SECTION : length;
      for (const [label, railY] of [
        ['top', RAIL_TOP_Y],
        ['mid', RAIL_MID_Y],
      ] as const) {
        box(`vip-skydeck-rail-${tag}-${run.name}-${label}`, width, RAIL_SECTION, depth, sx(x), railY, z, gold.material);
      }
      // Stanchions every ~3m along the run, plus both ends.
      const posts = Math.max(1, Math.round(length / 3));
      for (let index = 0; index <= posts; index++) {
        const at = run.from + (index * length) / posts;
        box(
          `vip-skydeck-rail-post-${tag}-${run.name}-${index}`,
          POST_SECTION,
          SKYDECK_RAIL_HEIGHT,
          POST_SECTION,
          sx(run.axis === 'x' ? at : run.fixed),
          SKYDECK_DECK_Y + SKYDECK_RAIL_HEIGHT / 2,
          run.axis === 'x' ? run.fixed : at,
          gold.material,
        );
      }
    });

    // Ramp balustrade: two sloped rails riding the ramp's own pitch. Visual
    // only - see the note in createMainStageCollisionBlockers about why the
    // ramp carries no blocker rows.
    for (const [railLabel, offset] of [
      ['top', SKYDECK_RAIL_HEIGHT],
      ['mid', SKYDECK_RAIL_HEIGHT * 0.52],
    ] as const) {
      for (const [edgeLabel, edgeZ] of [
        ['south', SKYDECK_RAMP_Z_MIN + RAIL_SECTION],
        ['north', SKYDECK_RAMP_Z_MAX - RAIL_SECTION],
      ] as const) {
        const rail = box(
          `vip-skydeck-ramp-rail-${tag}-${edgeLabel}-${railLabel}`,
          RAMP_LENGTH,
          RAIL_SECTION,
          RAIL_SECTION,
          sx(RAMP_TOP_MID_X + offset * Math.sin(SKYDECK_RAMP_SLOPE)),
          RAMP_TOP_MID_Y + offset * Math.cos(SKYDECK_RAMP_SLOPE),
          edgeZ,
          gold.material,
        );
        rail.rotation.z = side > 0 ? -SKYDECK_RAMP_SLOPE : SKYDECK_RAMP_SLOPE;
      }
    }

    // --- Support posts on the wing terrace roof --------------------------
    // Short pearl posts, terrace roof (y 7.12) to deck underside. They stand
    // on the roofscape, NOT on the forecourt, so the VIP apron underneath -
    // including the vip_terrace route objective at (32, 2) - stays clear.
    const postHeight = SLAB_CENTER_Y - SKYDECK_SLAB_THICKNESS / 2 - SKYDECK_TERRACE_TOP_Y;
    let postIndex = 0;
    for (const px of [SKYDECK_X_MIN + 0.6, DECK_CENTER_X, SKYDECK_X_MAX - 0.6]) {
      for (const pz of [SKYDECK_Z_MIN + 0.6, SKYDECK_Z_MAX - 0.6]) {
        box(
          `vip-skydeck-post-${tag}-${postIndex}`,
          0.5,
          postHeight,
          0.5,
          sx(px),
          SKYDECK_TERRACE_TOP_Y + postHeight / 2,
          pz,
          pearl.material,
        );
        postIndex += 1;
      }
    }

    // --- Piers carrying the landing and ramp to the ground ---------------
    SKYDECK_PIERS.forEach((pier, index) => {
      // Height to the underside of whatever it carries: the landing piers
      // reach the slab, the ramp piers stop at the ramp's sloped soffit.
      const carriedTopY =
        pier.x >= SKYDECK_RAMP_HEAD_X
          ? ((SKYDECK_RAMP_FOOT_X - pier.x) / RAMP_RUN) * RAMP_RISE
          : SKYDECK_DECK_Y;
      const height = Math.max(0.5, carriedTopY - SKYDECK_SLAB_THICKNESS);
      box(
        `vip-skydeck-pier-${tag}-${index}`,
        SKYDECK_PIER_SIZE,
        height,
        SKYDECK_PIER_SIZE,
        sx(pier.x),
        height / 2,
        pier.z,
        pearl.material,
      );
      box(
        `vip-skydeck-pier-cap-${tag}-${index}`,
        SKYDECK_PIER_SIZE + 0.24,
        0.16,
        SKYDECK_PIER_SIZE + 0.24,
        sx(pier.x),
        height + 0.08,
        pier.z,
        gold.material,
      );
    });
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
    walkableMeshes.length = 0;
    for (const material of materials) {
      material.dispose();
    }
    materials.length = 0;
    root.dispose();
  };

  return {
    deckTopY: SKYDECK_DECK_Y,
    dispose,
    goldSourceMaterial: gold.sourceName,
    meshes,
    pearlSourceMaterial: pearl.sourceName,
    rampSlopeDegrees: (SKYDECK_RAMP_SLOPE * 180) / Math.PI,
    root,
    walkableMeshes,
  };
}
