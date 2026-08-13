import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import {
  SKYDECK_RAIL_HEIGHT,
  SKYDECK_SLAB_THICKNESS,
  WING_BRIDGE_DECK_Y,
  WING_BRIDGE_HALF_SPAN,
  WING_BRIDGE_HALF_WIDTH,
  WING_BRIDGE_PIER_SIZE,
  WING_BRIDGE_PIER_XS,
  WING_BRIDGE_Z,
} from './mainStageVenueBounds';
import { createPlateMaterial, GOLD_PLATE_MATERIAL, PEARL_PLATE_MATERIAL } from './venuePlateFamily';

// A gold causeway flying straight across the venue at the skydecks' own
// height, joining the left and right VIP skydecks (createVipSkydeck.ts).
//
// WHY THIS LINE. The two flank fields are only connected on foot around the
// back of the basin (z < -48): the VIP shell mass, the basin and the hedges
// seal |x| 8..30 for the whole mid-venue. So the crossing has to happen where
// the flanks actually are - at the skydecks - and at their height, which
// makes the entire route one continuous level:
//   flank ground -> skydeck ramp -> landing -> skydeck -> BRIDGE -> skydeck.
// No separate stair is needed at either end, which is also why the bridge
// itself is a pure span: adding its own ground ramps would have planted two
// more structures in the promenade it is meant to fly over.
//
// WHY IT DOES NOT SPOIL THE SHOW. The crowd stands z -48..-5 facing +z; the
// stage screens begin around y 12 at z 22, an 8.4 degree look-up from the
// back of the crowd. The bridge's underside at z 0 subtends 9.7 degrees from
// that same spot and rises as you walk toward it, so it stays ABOVE the stage
// sightline instead of cutting across it, and it is a slim 4.5m ribbon rather
// than a roof. Its piers land only where the ground is already solid (see
// WING_BRIDGE_PIER_XS), so nothing new blocks the promenade underneath.

const SPAN = WING_BRIDGE_HALF_SPAN * 2;
const DECK_WIDTH = WING_BRIDGE_HALF_WIDTH * 2;
const SLAB_CENTER_Y = WING_BRIDGE_DECK_Y - SKYDECK_SLAB_THICKNESS / 2;
const BEAM_HEIGHT = 0.5;
const BEAM_THICKNESS = 0.3;
const RAIL_SECTION = 0.12;
const RAIL_TOP_Y = WING_BRIDGE_DECK_Y + SKYDECK_RAIL_HEIGHT;
const RAIL_MID_Y = WING_BRIDGE_DECK_Y + SKYDECK_RAIL_HEIGHT * 0.52;
const POST_SECTION = 0.16;
const POST_SPACING = 4;

export interface WingBridgeHandle {
  /** Height of the walking surface, in runtime metres. */
  deckTopY: number;
  dispose(): void;
  /** Name of the gold family material reused, or null if we fell back. */
  goldSourceMaterial: string | null;
  meshes: Mesh[];
  /** Name of the pearl family material reused, or null if we fell back. */
  pearlSourceMaterial: string | null;
  root: TransformNode;
  /** Clear span, in runtime metres. */
  spanMeters: number;
  /** Floor surfaces: must be added to the controller's collisionMeshes. */
  walkableMeshes: Mesh[];
}

export function createWingBridge(scene: Scene): WingBridgeHandle {
  const root = new TransformNode('wing-bridge', scene);
  const meshes: Mesh[] = [];
  const walkableMeshes: Mesh[] = [];

  const pearl = createPlateMaterial(scene, {
    name: 'wing-bridge-pearl-material',
    sourceName: PEARL_PLATE_MATERIAL,
    albedoColor: new Color3(0.42, 0.4, 0.375),
    emissiveColor: new Color3(0.024, 0.022, 0.02),
    emissiveIntensity: 0.3,
    fallbackMetallic: 0.16,
    fallbackRoughness: 0.74,
  });

  const gold = createPlateMaterial(scene, {
    name: 'wing-bridge-gold-material',
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
    mesh.isPickable = false;
    if (walkable) {
      mesh.checkCollisions = true;
      walkableMeshes.push(mesh);
    }
    meshes.push(mesh);
    return mesh;
  };

  // --- Deck -------------------------------------------------------------
  box(
    'wing-bridge-deck',
    SPAN,
    SKYDECK_SLAB_THICKNESS,
    DECK_WIDTH,
    0,
    SLAB_CENTER_Y,
    WING_BRIDGE_Z,
    pearl.material,
    true,
  );

  // --- Gold edge beams --------------------------------------------------
  // Deeper than the deck slab: they are what makes the span read as a beam
  // bridge from below rather than as a floating plank.
  for (const [label, side] of [
    ['south', -1],
    ['north', 1],
  ] as const) {
    box(
      `wing-bridge-beam-${label}`,
      SPAN,
      BEAM_HEIGHT,
      BEAM_THICKNESS,
      0,
      WING_BRIDGE_DECK_Y - BEAM_HEIGHT / 2,
      WING_BRIDGE_Z + side * (WING_BRIDGE_HALF_WIDTH - BEAM_THICKNESS / 2),
      gold.material,
    );

    // --- Railings -------------------------------------------------------
    for (const [railLabel, railY] of [
      ['top', RAIL_TOP_Y],
      ['mid', RAIL_MID_Y],
    ] as const) {
      box(
        `wing-bridge-rail-${label}-${railLabel}`,
        SPAN,
        RAIL_SECTION,
        RAIL_SECTION,
        0,
        railY,
        WING_BRIDGE_Z + side * (WING_BRIDGE_HALF_WIDTH - RAIL_SECTION),
        gold.material,
      );
    }
  }

  const postCount = Math.round(SPAN / POST_SPACING);
  for (let index = 0; index <= postCount; index++) {
    const x = -WING_BRIDGE_HALF_SPAN + (index * SPAN) / postCount;
    for (const [label, side] of [
      ['south', -1],
      ['north', 1],
    ] as const) {
      box(
        `wing-bridge-rail-post-${label}-${index}`,
        POST_SECTION,
        SKYDECK_RAIL_HEIGHT,
        POST_SECTION,
        x,
        WING_BRIDGE_DECK_Y + SKYDECK_RAIL_HEIGHT / 2,
        WING_BRIDGE_Z + side * (WING_BRIDGE_HALF_WIDTH - RAIL_SECTION),
        gold.material,
      );
    }
  }

  // --- Piers -------------------------------------------------------------
  // Only on already-solid ground (see WING_BRIDGE_PIER_XS): the promenade
  // beneath the span keeps every route it had.
  const pierHeight = WING_BRIDGE_DECK_Y - BEAM_HEIGHT;
  WING_BRIDGE_PIER_XS.forEach((pierX, index) => {
    for (const side of [1, -1] as const) {
      const tag = `${side > 0 ? 'r' : 'l'}${index}`;
      box(
        `wing-bridge-pier-${tag}`,
        WING_BRIDGE_PIER_SIZE,
        pierHeight,
        WING_BRIDGE_PIER_SIZE,
        side * pierX,
        pierHeight / 2,
        WING_BRIDGE_Z,
        pearl.material,
      );
      box(
        `wing-bridge-pier-cap-${tag}`,
        WING_BRIDGE_PIER_SIZE + 0.3,
        0.18,
        DECK_WIDTH,
        side * pierX,
        pierHeight + 0.09,
        WING_BRIDGE_Z,
        gold.material,
      );
    }
  });

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
    deckTopY: WING_BRIDGE_DECK_Y,
    dispose,
    goldSourceMaterial: gold.sourceName,
    meshes,
    pearlSourceMaterial: pearl.sourceName,
    root,
    spanMeters: SPAN,
    walkableMeshes,
  };
}
