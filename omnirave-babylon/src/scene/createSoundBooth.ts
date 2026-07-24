import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import {
  FOH_BOOTH_DECK_DEPTH,
  FOH_BOOTH_DECK_WIDTH,
  FOH_BOOTH_X,
  FOH_BOOTH_Z,
} from './mainStageVenueBounds';

// Front-of-house sound booth for the Main Stage. Every real festival stage
// has one out in the crowd facing the stage; without it the promenade reads
// as bare ground between the barriers and the mix position that a live show
// obviously needs is simply missing.
//
// The game has no NPCs, so the booth is EMPTY - it is infrastructure, not a
// character set. Raised deck on a dark scaffold skirt, gold waist rail
// (venue's pearl-and-gold language, kept dim so it never competes with the
// stage), a mixing desk facing +z toward the stage with small emissive
// channel-strip accents, a dark canopy on four posts, ground cable looms
// running toward the stage, and two flight cases parked beside the deck.
//
// Placement/size live in mainStageVenueBounds.ts (FOH_BOOTH_*) - see the
// acoustic derivation there for why the mix position sits where it does -
// because the authored collision row in createMainStageCollisionBlockers.ts
// derives the booth's solid body from the same numbers. Nothing here may
// hardcode a position.

const DECK_TOP_Y = 0.5;
const DECK_HALF_W = FOH_BOOTH_DECK_WIDTH / 2;
const DECK_HALF_D = FOH_BOOTH_DECK_DEPTH / 2;
// Deck edges in world z: FRONT faces the stage (+z), BACK is the open end
// players approach from.
const FRONT_Z = FOH_BOOTH_Z + DECK_HALF_D;
const BACK_Z = FOH_BOOTH_Z - DECK_HALF_D;
const RAIL_TOP_Y = DECK_TOP_Y + 1.1;
const RAIL_MID_Y = DECK_TOP_Y + 0.58;
const CANOPY_Y = 3.2;

export interface SoundBoothHandle {
  root: TransformNode;
  meshes: Mesh[];
  dispose(): void;
}

export function createSoundBooth(scene: Scene): SoundBoothHandle {
  const root = new TransformNode('sound-booth', scene);
  const meshes: Mesh[] = [];
  const materials: Material[] = [];

  const track = <T extends Material>(material: T) => {
    materials.push(material);
    return material;
  };

  // Dark scaffold/truss metal: the standard festival staging finish.
  const scaffoldMaterial = track(new PBRMaterial('sound-booth-scaffold-material', scene));
  scaffoldMaterial.albedoColor = new Color3(0.055, 0.062, 0.078);
  scaffoldMaterial.metallic = 0.6;
  scaffoldMaterial.roughness = 0.5;

  // Deck plate - matte ply/ali, a touch lighter than the frame so the
  // platform reads as a surface rather than a black slab.
  const deckMaterial = track(new PBRMaterial('sound-booth-deck-material', scene));
  deckMaterial.albedoColor = new Color3(0.11, 0.115, 0.13);
  deckMaterial.metallic = 0.25;
  deckMaterial.roughness = 0.8;

  // Gold rail, matching the VIP/terrace gold but darker and rougher: this is
  // background infrastructure and must not outshine the stage.
  const railMaterial = track(new PBRMaterial('sound-booth-rail-material', scene));
  railMaterial.albedoColor = new Color3(0.62, 0.48, 0.24);
  railMaterial.metallic = 0.85;
  railMaterial.roughness = 0.45;

  // Canopy fabric - non-metallic, very rough, near black.
  const canopyMaterial = track(new PBRMaterial('sound-booth-canopy-material', scene));
  canopyMaterial.albedoColor = new Color3(0.042, 0.048, 0.062);
  canopyMaterial.metallic = 0.02;
  canopyMaterial.roughness = 0.95;

  // Self-lit desk faceplate: albedo black + disableLighting so the channel
  // strips glow on their own without depending on scene lights, and stay a
  // dim suggestion of LEDs rather than a screen.
  const faceplateMaterial = track(new PBRMaterial('sound-booth-faceplate-material', scene));
  faceplateMaterial.albedoColor = new Color3(0, 0, 0);
  faceplateMaterial.emissiveColor = new Color3(0.32, 0.62, 0.78);
  faceplateMaterial.emissiveIntensity = 0.55;
  faceplateMaterial.disableLighting = true;

  const meterMaterial = track(new PBRMaterial('sound-booth-meter-material', scene));
  meterMaterial.albedoColor = new Color3(0, 0, 0);
  meterMaterial.emissiveColor = new Color3(0.95, 0.68, 0.28);
  meterMaterial.emissiveIntensity = 0.8;
  meterMaterial.disableLighting = true;

  const rubberMaterial = track(new PBRMaterial('sound-booth-cable-material', scene));
  rubberMaterial.albedoColor = new Color3(0.03, 0.032, 0.038);
  rubberMaterial.metallic = 0.05;
  rubberMaterial.roughness = 0.9;

  const box = (
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: Material,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.parent = root;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };

  // --- Deck + scaffold skirt -------------------------------------------
  box(
    'sound-booth-deck',
    FOH_BOOTH_DECK_WIDTH,
    0.18,
    FOH_BOOTH_DECK_DEPTH,
    FOH_BOOTH_X,
    DECK_TOP_Y - 0.09,
    FOH_BOOTH_Z,
    deckMaterial,
  );

  // Skirt trusses: a top and bottom chord on each of the four sides. Reads
  // as scaffold from a distance for 8 boxes.
  [0.09, DECK_TOP_Y - 0.24].forEach((chordY, chord) => {
    box(`sound-booth-truss-left-${chord}`, 0.12, 0.12, FOH_BOOTH_DECK_DEPTH, FOH_BOOTH_X - DECK_HALF_W + 0.06, chordY, FOH_BOOTH_Z, scaffoldMaterial);
    box(`sound-booth-truss-right-${chord}`, 0.12, 0.12, FOH_BOOTH_DECK_DEPTH, FOH_BOOTH_X + DECK_HALF_W - 0.06, chordY, FOH_BOOTH_Z, scaffoldMaterial);
    box(`sound-booth-truss-front-${chord}`, FOH_BOOTH_DECK_WIDTH, 0.12, 0.12, FOH_BOOTH_X, chordY, FRONT_Z - 0.06, scaffoldMaterial);
    box(`sound-booth-truss-back-${chord}`, FOH_BOOTH_DECK_WIDTH, 0.12, 0.12, FOH_BOOTH_X, chordY, BACK_Z + 0.06, scaffoldMaterial);
  });
  // Corner legs holding the deck off the ground.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(
        `sound-booth-leg-${sx > 0 ? 'r' : 'l'}${sz > 0 ? 'f' : 'b'}`,
        0.16,
        DECK_TOP_Y,
        0.16,
        FOH_BOOTH_X + sx * (DECK_HALF_W - 0.1),
        DECK_TOP_Y / 2,
        FOH_BOOTH_Z + sz * (DECK_HALF_D - 0.1),
        scaffoldMaterial,
      );
    }
  }

  // --- Waist-high railing ----------------------------------------------
  // Left, right and front (stage-side) runs. The back is left open: that is
  // the crew entrance, and it keeps the silhouette from reading as a cage.
  const railInsetX = DECK_HALF_W - 0.08;
  const railInsetZ = DECK_HALF_D - 0.08;
  for (const railY of [RAIL_TOP_Y, RAIL_MID_Y]) {
    const tag = railY === RAIL_TOP_Y ? 'top' : 'mid';
    box(`sound-booth-rail-left-${tag}`, 0.08, 0.08, FOH_BOOTH_DECK_DEPTH - 0.16, FOH_BOOTH_X - railInsetX, railY, FOH_BOOTH_Z, railMaterial);
    box(`sound-booth-rail-right-${tag}`, 0.08, 0.08, FOH_BOOTH_DECK_DEPTH - 0.16, FOH_BOOTH_X + railInsetX, railY, FOH_BOOTH_Z, railMaterial);
    box(`sound-booth-rail-front-${tag}`, FOH_BOOTH_DECK_WIDTH - 0.16, 0.08, 0.08, FOH_BOOTH_X, railY, FRONT_Z - 0.08, railMaterial);
  }
  // Stanchions at the corners and at the mid-span of each run.
  const stanchionSpots: Array<[number, number]> = [
    [-railInsetX, -railInsetZ],
    [-railInsetX, 0],
    [-railInsetX, railInsetZ],
    [railInsetX, -railInsetZ],
    [railInsetX, 0],
    [railInsetX, railInsetZ],
    [0, railInsetZ],
  ];
  stanchionSpots.forEach(([dx, dz], index) => {
    box(
      `sound-booth-rail-post-${index}`,
      0.07,
      RAIL_TOP_Y - DECK_TOP_Y,
      0.07,
      FOH_BOOTH_X + dx,
      (RAIL_TOP_Y + DECK_TOP_Y) / 2,
      FOH_BOOTH_Z + dz,
      railMaterial,
    );
  });

  // --- Mixing desk, facing the stage (+z) -------------------------------
  const consoleZ = FRONT_Z - 0.95;
  box('sound-booth-console', 3.4, 0.72, 0.8, FOH_BOOTH_X, DECK_TOP_Y + 0.36, consoleZ, scaffoldMaterial);
  // Sloped faceplate: channel strips reading toward the stage.
  const faceplate = box(
    'sound-booth-console-faceplate',
    3.2,
    0.52,
    0.04,
    FOH_BOOTH_X,
    DECK_TOP_Y + 0.86,
    consoleZ + 0.16,
    faceplateMaterial,
  );
  faceplate.rotation.x = -0.85;
  // Two small meter-bridge accents; deliberately tiny so the booth glows
  // faintly instead of becoming a second screen.
  for (const sx of [-1, 1]) {
    box(
      `sound-booth-console-meter-${sx > 0 ? 'r' : 'l'}`,
      0.5,
      0.06,
      0.05,
      FOH_BOOTH_X + sx * 1.2,
      DECK_TOP_Y + 1.06,
      consoleZ - 0.1,
      meterMaterial,
    );
  }

  // --- Canopy on four posts --------------------------------------------
  const postTop = CANOPY_Y - 0.08;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(
        `sound-booth-canopy-post-${sx > 0 ? 'r' : 'l'}${sz > 0 ? 'f' : 'b'}`,
        0.12,
        postTop - DECK_TOP_Y,
        0.12,
        FOH_BOOTH_X + sx * (DECK_HALF_W - 0.2),
        (postTop + DECK_TOP_Y) / 2,
        FOH_BOOTH_Z + sz * (DECK_HALF_D - 0.2),
        scaffoldMaterial,
      );
    }
  }
  // Roof overhangs the deck slightly (7.4 x 5.4) - still well inside the
  // walkway, and the collision body deliberately ignores the overhang so it
  // cannot create a phantom wall.
  box('sound-booth-canopy', FOH_BOOTH_DECK_WIDTH + 0.4, 0.12, FOH_BOOTH_DECK_DEPTH + 0.4, FOH_BOOTH_X, CANOPY_Y, FOH_BOOTH_Z, canopyMaterial);
  // Front valance hanging off the stage-side edge.
  box('sound-booth-canopy-valance', FOH_BOOTH_DECK_WIDTH + 0.4, 0.3, 0.06, FOH_BOOTH_X, CANOPY_Y - 0.2, FRONT_Z + 0.17, canopyMaterial);

  // --- Cable looms running toward the stage ------------------------------
  // Flat ground-taped snakes leaving the front of the booth; they read as
  // the multicore going back to stage left.
  const loomOffsets = [-1.15, 0.1, 1.35];
  loomOffsets.forEach((offsetX, index) => {
    box(
      `sound-booth-cable-loom-${index}`,
      0.34,
      0.07,
      6.5,
      FOH_BOOTH_X + offsetX,
      0.035,
      FRONT_Z + 3.25,
      rubberMaterial,
    );
  });

  // --- Flight cases beside the deck --------------------------------------
  // Included in the collision body (see FOH_BOOTH_BLOCKER_WIDTH) so they are
  // not walk-through props.
  for (const sx of [-1, 1]) {
    box(
      `sound-booth-flight-case-${sx > 0 ? 'r' : 'l'}`,
      1.1,
      0.66,
      0.85,
      FOH_BOOTH_X + sx * 4,
      0.33,
      FOH_BOOTH_Z - 0.2,
      scaffoldMaterial,
    );
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

  return { root, meshes, dispose };
}
