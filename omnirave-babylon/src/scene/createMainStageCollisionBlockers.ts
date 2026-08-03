import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';
import type { SkydeckRailRun } from './mainStageVenueBounds';

import {
  FOH_BOOTH_BLOCKER_WIDTH,
  FOH_BOOTH_DECK_DEPTH,
  FOH_BOOTH_X,
  FOH_BOOTH_Z,
  FOUNTAIN_ELLIPSE,
  FOUNTAIN_STONE_RADII,
  fountainStoneRadiusAt,
  SKYDECK_DECK_Y,
  SKYDECK_PIERS,
  SKYDECK_PIER_SIZE,
  SKYDECK_RAIL_HEIGHT,
  SKYDECK_RAIL_RUNS,
  SKYDECK_RAMP_FOOT_X,
  SKYDECK_RAMP_HEAD_X,
  SKYDECK_RAMP_Z_MAX,
  SKYDECK_RAMP_Z_MIN,
  SKYDECK_SLAB_THICKNESS,
  WING_BRIDGE_DECK_Y,
  WING_BRIDGE_HALF_SPAN,
  WING_BRIDGE_HALF_WIDTH,
  WING_BRIDGE_Z,
  VENUE_ENVELOPE_BACK_Z,
  VENUE_ENVELOPE_BLOCKER_THICKNESS,
  VENUE_ENVELOPE_FRONT_Z,
  VENUE_WALKABLE_X_MAX,
  VENUE_WALKABLE_X_MIN,
} from './mainStageVenueBounds';

// Side runs span the back fence up to the envelope's front edge; the back run
// spans the two side runs corner to corner (their outer faces).
const ENVELOPE_SIDE_DEPTH = VENUE_ENVELOPE_FRONT_Z - VENUE_ENVELOPE_BACK_Z;
const ENVELOPE_SIDE_Z = (VENUE_ENVELOPE_FRONT_Z + VENUE_ENVELOPE_BACK_Z) / 2;
const ENVELOPE_BACK_WIDTH =
  VENUE_WALKABLE_X_MAX - VENUE_WALKABLE_X_MIN + VENUE_ENVELOPE_BLOCKER_THICKNESS;

interface CollisionBlockerSpec {
  depth: number;
  height: number;
  name: string;
  width: number;
  x: number;
  y: number;
  z: number;
}

// Elevated architecture (createVipSkydeck.ts + createWingBridge.ts). Two
// different jobs, and the split matters:
//   - The DECKS, LANDINGS and RAMPS are not blockers at all. They are FLOOR:
//     they carry checkCollisions = true and are handed to the player
//     controller's ground-ray list, which is what makes them standable.
//   - The RAILINGS are blockers, so nobody walks off a deck 8.6m up. Every
//     one of these rows starts its y band AT the deck surface, so a player on
//     the ground below (head ~1.65m) never intersects them - no phantom walls
//     under the new structures, which is the failure mode the pocket-wide
//     boxes caused on the flanks.
// Authored here rather than pattern-matched for the same reason the FOH booth
// is: the source-name patterns run over the loaded GLB at scene build time,
// and both modules are authored later, after the static freeze.
//
// The ramp RUN deliberately has no rows: an axis-aligned box hugging a 28
// degree slope would either wall the flank ground beside the ramp's low end
// or need segmenting into a stack of boxes whose seams are exactly where
// phantom walls come from. It is 4m wide with a visible balustrade, and
// stepping off it drops you onto the flank ground the ramp starts from.
const RAIL_BLOCKER_THICKNESS = 0.3;
// Piers stand on the flank ground, so their rows only need to cover a
// standing capsule's height at ground level (~1.8m, matching
// createPlayerRig.ts's REFERENCE_CAPSULE_HEIGHT_METERS) - tall enough to
// stop someone walking sideways into the visible column, short enough to
// stay well clear of anyone climbing the ramp DIRECTLY ABOVE that same pier.
//
// Player-flagged (2026-07-31, in-engine, two passes): this was originally a
// FLAT 3m for every pier. The pier at x55 sits under the ramp's own
// shallow/foot-end slope, where the ramp's real walking surface is only
// ~3.2m up there - 3m rose to within 0.2m of a climbing player's FEET,
// walling the climb outright. The first fix matched each pier's blocker
// height to createVipSkydeck.ts's own `carriedTopY - slab thickness` calc
// (i.e. flush with the ramp's underside) - still wrong, because a pier's
// whole JOB is holding the ramp up from just below its surface, so "flush
// with the underside" is ALWAYS within a slab-thickness of a climbing
// player's feet, not a real fix. 1.8m gives every pier here real clearance
// (>1.4m at the tightest, x55) rather than grazing the boundary. The min()
// against each pier's own carriedTopY is a safety clamp, not the primary
// fix: it only bites if a future pier ever sits somewhere the ramp/deck
// itself dips below capsule height, shrinking the row automatically instead
// of silently regressing this exact bug again.
const PIER_CAPSULE_CLEARANCE_HEIGHT = 1.8;
const RAMP_RUN = SKYDECK_RAMP_FOOT_X - SKYDECK_RAMP_HEAD_X;
function pierBlockerHeight(pierX: number): number {
  const carriedTopY =
    pierX >= SKYDECK_RAMP_HEAD_X
      ? ((SKYDECK_RAMP_FOOT_X - pierX) / RAMP_RUN) * SKYDECK_DECK_Y
      : SKYDECK_DECK_Y;
  return Math.max(0.5, Math.min(PIER_CAPSULE_CLEARANCE_HEIGHT, carriedTopY - SKYDECK_SLAB_THICKNESS));
}

// --- Cascade fountain collision (octagon, not rectangle) ----------------
// The cascade fountain's base is an OCTAGON; treating it as an axis-aligned
// rectangle (the old clustered V150_CascadeCourtCoping boxes, measured
// x[54.3,65.1] z[-39.4,-18.8]) walled the octagon's corners with invisible
// collision where no stone stands - "stopped when walking in front of the
// fountain even though there is nothing there". That was fixed once already
// by hugging an ellipse fit to the octagon with a row of thin COLUMN boxes
// stepping across x. The ellipse fit itself was imprecise though (player-
// flagged, 2026-07-31, in-engine): it overshot the real stone by up to ~1m
// at the flat edges, wrongly culling paving tiles there (see
// FOUNTAIN_STONE_RADII's own comment in mainStageVenueBounds.ts for the
// measured data). Each column's z-half-extent now comes from
// fountainZHalfExtentAtX - a binary search against the REAL measured
// footprint (convex, so a vertical slice crosses its boundary at most
// twice) instead of the ellipse's closed-form solve - so the boxes are
// short in z at the inner/outer tips and span the full height at the middle
// exactly matching the real stone, not an ellipse's approximation of it.
// 14 columns per flank keep the x step ~1.98m (edge error well under 0.6m).
const FOUNTAIN_COLUMN_COUNT = 14;
// Inflate each column's z-extent so no real stone edge pokes through
// unblocked, while staying tight enough that the corner cells (x 52..62,
// z near -42/-15) that carry no stone are NOT blocked.
const FOUNTAIN_COLUMN_Z_MARGIN = 0.4;
// Same y band as the other cascade collision: floor through capsule.
const FOUNTAIN_COLLISION_HEIGHT = 3;
const FOUNTAIN_MAX_STONE_RADIUS = Math.max(...FOUNTAIN_STONE_RADII);

// Binary search for the largest |dz| (offset from the fountain centre, in
// +x-flank-local coordinates) still inside the real stone footprint at a
// fixed x offset `dx` - valid because the footprint is convex, so a
// vertical slice at any dx crosses its boundary at most twice (never
// re-enters after exiting). Runs once at module load (this whole spec list
// is built once, not per frame), so precision costs nothing.
function fountainZHalfExtentAtX(dx: number): number {
  if (Math.abs(dx) >= FOUNTAIN_MAX_STONE_RADIUS) {
    return 0;
  }
  let lo = 0;
  let hi = FOUNTAIN_MAX_STONE_RADIUS;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const distance = Math.hypot(dx, mid);
    const angle = Math.atan2(mid, dx);
    if (distance <= fountainStoneRadiusAt(angle)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function fountainCollisionColumns(): CollisionBlockerSpec[] {
  const specs: CollisionBlockerSpec[] = [];
  const { cx, cz } = FOUNTAIN_ELLIPSE;
  const sliceWidth = (2 * FOUNTAIN_MAX_STONE_RADIUS) / FOUNTAIN_COLUMN_COUNT;
  for (const side of [1, -1] as const) {
    const tag = side > 0 ? 'r' : 'l';
    for (let i = 0; i < FOUNTAIN_COLUMN_COUNT; i++) {
      const xCenter = cx - FOUNTAIN_MAX_STONE_RADIUS + (i + 0.5) * sliceWidth;
      const zHalf = fountainZHalfExtentAtX(xCenter - cx) + FOUNTAIN_COLUMN_Z_MARGIN;
      specs.push({
        name: `main-stage-blocker-cascade-fountain-${tag}-${i}`,
        x: side * xCenter,
        y: FOUNTAIN_COLLISION_HEIGHT / 2,
        z: cz,
        width: sliceWidth,
        height: FOUNTAIN_COLLISION_HEIGHT,
        depth: zHalf * 2,
      });
    }
  }
  return specs;
}

function railBlocker(
  name: string,
  line: SkydeckRailRun,
  deckY: number,
  sideSign: number,
): CollisionBlockerSpec {
  const length = line.to - line.from;
  const along = (line.from + line.to) / 2;
  const alongX = line.axis === 'x';
  return {
    name,
    x: sideSign * (alongX ? along : line.fixed),
    y: deckY + SKYDECK_RAIL_HEIGHT / 2,
    z: alongX ? line.fixed : along,
    width: alongX ? length : RAIL_BLOCKER_THICKNESS,
    height: SKYDECK_RAIL_HEIGHT,
    depth: alongX ? RAIL_BLOCKER_THICKNESS : length,
  };
}

// Ramp balustrade collision. Previously none at all - the comment above the
// ramp's exclusion from elevatedStructureBlockers explains why an
// axis-aligned box hugging the slope was rejected (walls the flank ground
// beside the ramp's low end); a single box ROTATED to match the slope was
// never built either, because resolveHorizontalCollision only tests
// axis-aligned WORLD bounding boxes - a long thin rail rotated ~28 degrees
// has a world AABB that balloons to roughly the ramp's full rise in height,
// phantom-walling the whole corridor rather than just the true rail edge.
//
// Player-flagged (2026-07-31, in-engine): walking clean through the visible
// balustrade was worse than either failure mode, so this steps short,
// axis-aligned segments across the run instead - the same technique
// fountainCollisionColumns already uses for a curved edge. Each segment's
// floor is pinned to the ramp's own walking height at the segment's HIGHER
// (head-ward) end, never its lower end, so a segment can float a little
// above the true surface near its low end but can never dip below it and
// wall the climb itself - the exact failure the pier-height bug hit
// elsewhere on this same ramp.
const RAMP_RAIL_SEGMENT_COUNT = 16;

function rampRailBlockers(): CollisionBlockerSpec[] {
  const specs: CollisionBlockerSpec[] = [];
  const segmentRun = RAMP_RUN / RAMP_RAIL_SEGMENT_COUNT;
  for (const side of [1, -1] as const) {
    const tag = side > 0 ? 'r' : 'l';
    for (const [edgeLabel, edgeZ] of [
      ['south', SKYDECK_RAMP_Z_MIN + RAIL_BLOCKER_THICKNESS / 2],
      ['north', SKYDECK_RAMP_Z_MAX - RAIL_BLOCKER_THICKNESS / 2],
    ] as const) {
      for (let i = 0; i < RAMP_RAIL_SEGMENT_COUNT; i++) {
        // xHigh is this segment's head-ward (higher) end; x increases toward
        // the foot, where the walking surface gets lower.
        const xHigh = SKYDECK_RAMP_HEAD_X + i * segmentRun;
        const xCenter = xHigh + segmentRun / 2;
        const floorY = ((SKYDECK_RAMP_FOOT_X - xHigh) / RAMP_RUN) * SKYDECK_DECK_Y;
        specs.push({
          name: `main-stage-blocker-skydeck-ramp-rail-${tag}-${edgeLabel}-${i}`,
          x: side * xCenter,
          y: floorY + SKYDECK_RAIL_HEIGHT / 2,
          z: edgeZ,
          width: segmentRun,
          height: SKYDECK_RAIL_HEIGHT,
          depth: RAIL_BLOCKER_THICKNESS,
        });
      }
    }
  }
  return specs;
}

function elevatedStructureBlockers(): CollisionBlockerSpec[] {
  const specs: CollisionBlockerSpec[] = [];
  for (const side of [1, -1] as const) {
    const tag = side > 0 ? 'r' : 'l';
    for (const line of SKYDECK_RAIL_RUNS) {
      specs.push(railBlocker(`main-stage-blocker-skydeck-${tag}-${line.name}`, line, SKYDECK_DECK_Y, side));
    }
    SKYDECK_PIERS.forEach((pier, index) => {
      const height = pierBlockerHeight(pier.x);
      specs.push({
        name: `main-stage-blocker-skydeck-pier-${tag}-${index}`,
        x: side * pier.x,
        y: height / 2,
        z: pier.z,
        width: SKYDECK_PIER_SIZE,
        height,
        depth: SKYDECK_PIER_SIZE,
      });
    });
  }
  // The bridge's two rails run the whole span; the piers under it stand on
  // ground that is already solid (see WING_BRIDGE_PIER_XS), so they add none.
  for (const side of [1, -1] as const) {
    specs.push({
      name: `main-stage-blocker-wing-bridge-rail-${side > 0 ? 'north' : 'south'}`,
      x: 0,
      y: WING_BRIDGE_DECK_Y + SKYDECK_RAIL_HEIGHT / 2,
      z: WING_BRIDGE_Z + side * WING_BRIDGE_HALF_WIDTH,
      width: WING_BRIDGE_HALF_SPAN * 2,
      height: SKYDECK_RAIL_HEIGHT,
      depth: RAIL_BLOCKER_THICKNESS,
    });
  }
  return specs;
}

const MAIN_STAGE_COLLISION_BLOCKERS: readonly CollisionBlockerSpec[] = [
  // Envelope fence. The back edge sits at z VENUE_ENVELOPE_BACK_Z, past the
  // spawn gate sentinels (z -82), so the player can leave the approach deck
  // and walk the promenade over the paver field (deck's back edge is z -57;
  // the old fence at z -60 walled it off, player-flagged). Ground collision
  // (COL_Ground) ends at VENUE_GROUND_EDGE_Z (see mainStageVenueBounds.ts),
  // so the fence stays just inside it, and the sides extend to meet the back
  // fence corner-to-corner.
  { name: 'main-stage-blocker-left-envelope', x: VENUE_WALKABLE_X_MIN, y: 3, z: ENVELOPE_SIDE_Z, width: VENUE_ENVELOPE_BLOCKER_THICKNESS, height: 6, depth: ENVELOPE_SIDE_DEPTH },
  { name: 'main-stage-blocker-right-envelope', x: VENUE_WALKABLE_X_MAX, y: 3, z: ENVELOPE_SIDE_Z, width: VENUE_ENVELOPE_BLOCKER_THICKNESS, height: 6, depth: ENVELOPE_SIDE_DEPTH },
  { name: 'main-stage-blocker-back-envelope', x: 0, y: 3, z: VENUE_ENVELOPE_BACK_Z, width: ENVELOPE_BACK_WIDTH, height: 6, depth: VENUE_ENVELOPE_BLOCKER_THICKNESS },
  { name: 'main-stage-blocker-front-stage', x: 0, y: 5, z: 14, width: 78, height: 10, depth: 4 },
  // The cascade fountain's collision is authored by fountainCollisionColumns()
  // (spread in below) as an ellipse-hugging row of tapering columns. The old
  // clustered V150_CascadeCourtCoping footprint boxed the octagon into a
  // rectangle and walled its empty corners (player-flagged: "stopped in front
  // of the fountain even though there is nothing there"); an even earlier set
  // of pocket-wide boxes (x 31..67 per side) sealed the entire east/west flanks
  // - cascade plazas, flank fields, and the VIP forecourts were unreachable.
  // The basin foliage hedges guarding the sunken water strip (|x| 8.3..17.3)
  // end at z 9.2, but the water runs to z 23.2: without these caps the
  // avatar can step off the outer coping walkway and wade through the
  // water's unhedged north tip (verified live).
  // The east edge tucks 0.5 under the outer walkway floor: a zero-gap seam
  // let the capsule wedge into the box rim when stepping off the edge.
  { name: 'main-stage-blocker-basin-water-north-left', x: -13.05, y: 1.5, z: 16.3, width: 9.5, height: 3, depth: 14.2 },
  { name: 'main-stage-blocker-basin-water-north-right', x: 13.05, y: 1.5, z: 16.3, width: 9.5, height: 3, depth: 14.2 },
  // Front-of-house sound booth (createSoundBooth.ts) - restricted crew
  // infrastructure, so players walk around it. Authored here rather than
  // pattern-matched: the source-mesh patterns above run over the loaded GLB
  // meshes at scene build time, and the booth is authored later, after the
  // static freeze. Dimensions come from the shared FOH_BOOTH_* constants so
  // the body can never drift from the deck. Width covers the deck plus the
  // two flight cases beside it; DEPTH is the DECK depth only, so neither the
  // canopy overhang nor the ground cable looms leaving the front become
  // phantom walls. It leaves ~9.4m of clear promenade on each side (crowd
  // runs to |x| 14).
  {
    name: 'main-stage-blocker-foh-sound-booth',
    x: FOH_BOOTH_X,
    y: 1.5,
    z: FOH_BOOTH_Z,
    width: FOH_BOOTH_BLOCKER_WIDTH,
    height: 3,
    depth: FOH_BOOTH_DECK_DEPTH,
  },
  ...fountainCollisionColumns(),
  ...elevatedStructureBlockers(),
  ...rampRailBlockers(),
];

const SOLID_SOURCE_NAME_PATTERNS: readonly RegExp[] = [
  // Basin foliage banks hedge the sunken water strip (|x| 8.3..17.3) so the
  // avatar cannot wade in; the coping walkways around it are FLOOR (see
  // COL_BasinCoping* in the collision GLB), which is why
  // V90_BasinStoneCopingArray is deliberately absent here - its blocker
  // sealed the entire flank including the cascade-court objective.
  /V33_BasinFoliage(Understory|Midstory)/,
  /V40_ApproachLightCore/,
  /V68_PortalArcadeShadowCore/,
  /V99_Basin(ParapetRelief|RetainingWall)/,
  /V118_BasinWallRelief/,
  // BridgeRelief deliberately absent: those are knee-high walkway trim bands
  // ON the causeway (z 0.43-0.87 and crown inlay) - a blocker built from
  // their merged bounds walled off the center promenade and made the first
  // route objective unreachable. RetainingRelief is also absent: its
  // geometry floats at y 4.25+ on the terrace, above the capsule, so the
  // overhead skip made its pattern a permanent no-op.
  /V124_CrowdControl(FrameArray|RailArray)/,
  /V125_CrowdBarrier(BaseArray|RailArray)/,
  /V133_VipTerraceGoldArray/,
];

// Families of DISCRETE objects (pylon rows, sentinels, plinth daises,
// lantern stems, pyro pods, the VIP wing shell segments): one bbox per side
// would wall off every visible gap between the objects - the repeated
// "invisible walls" / "walk-through objects" complaint class. These are
// decomposed into per-object boxes by recursive axis-gap clustering of the
// mesh's own vertices, so each pylon/stem/shell blocks exactly where it
// stands and the gaps between them stay walkable.
// One representative mesh per physical family: sentinel/pylon co-located
// dressing meshes (crowns, spines, shadow cores) share the pearl shell's
// footprint and would only duplicate boxes.
const CLUSTERED_SOURCE_NAME_PATTERNS: readonly RegExp[] = [
  // The wing shell's own base only meets the ground at two strips - opening
  // just the fascia would let players walk under the elevated terrace,
  // whose sweep/soffit hang below capsule height (1.9m). Clustering those
  // undercroft meshes too seals the sub-capsule space with real footprints
  // while the genuinely open ground around the wings stays walkable.
  /V26_VipTerraceOuterSweep/,
  /V30_VipShellFascia/,
  /V30_VipSoffitShadow/,
  /V33_BasinLanternStem/,
  // V150_CascadeCourtCoping is deliberately ABSENT: clustering the octagonal
  // fountain's coping produced a coarse rectangle (measured x[54.3,65.1]
  // z[-39.4,-18.8]) that walled the octagon's empty corners. Its collision is
  // now the ellipse-hugging fountainCollisionColumns() authored above.
  /V44_PlazaLanternStemCluster/,
  /V45_PyroPodPearlShell/,
  /V55_SpawnPylonPearlShell/,
  /V57_BackPlazaSentinelPearl\+/,
  /V58_ArrivalPlinthPearlDais/,
  /V59_BackPlazaLanternStemCluster/,
  /V60_SpawnGateSentinelPearl\+/,
];

// Objects closer than this along an axis merge into one blocker box; the
// capsule (diameter 0.8) cannot pass a narrower gap anyway.
const CLUSTER_GAP = 1.5;

const MIN_SOURCE_BLOCKER_THICKNESS = 1.2;
// Side pairs merged into one mesh must split back into per-side blockers.
// The split is derived from the mesh's own vertices (a real central gap of
// at least this width), and each side box hugs that side's actual bounds:
// synthetic clearance rectangles overfilled the gap between the clearance
// line and the merged bbox edge with phantom collision, sealing whole
// flanks of walkable plaza (player-flagged as invisible walls).
const MIN_CENTER_GAP_X = 2;
// Geometry that floats entirely above the avatar capsule (elevated terrace
// reliefs and the like) never blocks ground movement.
const CAPSULE_TOP_Y = 2.4;
const MIN_SOURCE_BLOCKER_HEIGHT = 1;

export function createMainStageCollisionBlockers(scene: Scene, sourceMeshes: readonly AbstractMesh[] = []): Mesh[] {
  const authoredBlockers = MAIN_STAGE_COLLISION_BLOCKERS.map((blocker) => createBlockerFromSpec(scene, blocker));
  const sourceBlockers = sourceMeshes
    .filter((mesh) => SOLID_SOURCE_NAME_PATTERNS.some((pattern) => pattern.test(mesh.name)))
    .flatMap((mesh) => createBlockersFromSourceMesh(scene, mesh));
  const clusteredBlockers = sourceMeshes
    .filter((mesh) => CLUSTERED_SOURCE_NAME_PATTERNS.some((pattern) => pattern.test(mesh.name)))
    .flatMap((mesh) => createClusteredBlockersFromSourceMesh(scene, mesh));

  return [...authoredBlockers, ...sourceBlockers, ...clusteredBlockers];
}

function createBlockerFromSpec(scene: Scene, blocker: CollisionBlockerSpec) {
  const mesh = MeshBuilder.CreateBox(
    blocker.name,
    {
      width: blocker.width,
      height: blocker.height,
      depth: blocker.depth,
    },
    scene,
  );
  mesh.position.set(blocker.x, blocker.y, blocker.z);
  configureBlocker(mesh);
  return mesh;
}

interface SideBounds {
  maxX: number;
  maxY: number;
  maxZ: number;
  minX: number;
  minY: number;
  minZ: number;
}

function createBlockersFromSourceMesh(scene: Scene, sourceMesh: AbstractMesh) {
  sourceMesh.computeWorldMatrix(true);
  const positions = sourceMesh.getVerticesData('position');
  if (!positions || positions.length === 0) {
    return [];
  }

  const worldMatrix = sourceMesh.getWorldMatrix();
  const left = emptyBounds();
  const right = emptyBounds();
  const vertex = new Vector3();
  for (let index = 0; index < positions.length; index += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[index],
      positions[index + 1],
      positions[index + 2],
      worldMatrix,
      vertex,
    );
    growBounds(vertex.x < 0 ? left : right, vertex);
  }

  const sides: Array<{ bounds: SideBounds; side?: 'left' | 'right' }> = [];
  const hasCentralGap =
    Number.isFinite(left.maxX) &&
    Number.isFinite(right.minX) &&
    right.minX - left.maxX >= MIN_CENTER_GAP_X;
  if (hasCentralGap) {
    sides.push({ bounds: left, side: 'left' }, { bounds: right, side: 'right' });
  } else {
    const merged = emptyBounds();
    for (const bounds of [left, right]) {
      if (!Number.isFinite(bounds.minX)) continue;
      merged.minX = Math.min(merged.minX, bounds.minX);
      merged.maxX = Math.max(merged.maxX, bounds.maxX);
      merged.minY = Math.min(merged.minY, bounds.minY);
      merged.maxY = Math.max(merged.maxY, bounds.maxY);
      merged.minZ = Math.min(merged.minZ, bounds.minZ);
      merged.maxZ = Math.max(merged.maxZ, bounds.maxZ);
    }
    sides.push({ bounds: merged });
  }

  return sides
    .filter(({ bounds }) => bounds.minY <= CAPSULE_TOP_Y)
    .map(({ bounds, side }) => createBlockerFromSourceBounds(scene, sourceMesh, bounds, side));
}

// Decompose a family mesh into per-object blocker boxes. Merged family
// meshes concatenate their source objects' vertex buffers, so each physical
// pylon/stem/shell survives as a disconnected component of the index
// buffer: union-find over the triangles recovers them exactly (a vertex-gap
// scan cannot - wide hollow objects have no interior vertices and split at
// their own faces). Components whose xz bounds sit closer than CLUSTER_GAP
// merge back together, since the capsule cannot pass between them anyway;
// groups floating entirely above the capsule are skipped.
function createClusteredBlockersFromSourceMesh(scene: Scene, sourceMesh: AbstractMesh) {
  sourceMesh.computeWorldMatrix(true);
  const positions = sourceMesh.getVerticesData('position');
  if (!positions || positions.length === 0) {
    return [];
  }
  const vertexCount = positions.length / 3;
  const rawIndices = sourceMesh.getIndices();
  const indices = rawIndices && rawIndices.length > 0 ? rawIndices : null;

  // Union-find over triangle connectivity; without indices every vertex is
  // its own component and the spatial merge below groups them.
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (a: number): number => {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== root) {
      const next = parent[a];
      parent[a] = root;
      a = next;
    }
    return root;
  };
  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = find(indices[i]);
      const b = find(indices[i + 1]);
      const c = find(indices[i + 2]);
      parent[b] = a;
      parent[c] = a;
    }
  }

  // World-space vertex positions, transformed once.
  const world = new Float32Array(positions.length);
  const vertex = new Vector3();
  for (let i = 0; i < vertexCount; i++) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
      worldMatrixOf(sourceMesh),
      vertex,
    );
    world[i * 3] = vertex.x;
    world[i * 3 + 1] = vertex.y;
    world[i * 3 + 2] = vertex.z;
  }

  // The blocker footprint is built from TRIANGLES that reach down into the
  // capsule band (any vertex at or below CAPSULE_TOP_Y): a wide solid wall
  // has no interior vertices, but its faces span it, while lintels and
  // canopies above the band contribute nothing. Each qualifying triangle is
  // recorded as its bbox. Without indices, each vertex stands alone.
  const lowBoxes: SideBounds[] = [];
  const lowBoxComponent: number[] = [];
  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      const minY = Math.min(world[a * 3 + 1], world[b * 3 + 1], world[c * 3 + 1]);
      if (minY > CAPSULE_TOP_Y) continue;
      const box = emptyBounds();
      for (const v of [a, b, c]) {
        box.minX = Math.min(box.minX, world[v * 3]);
        box.maxX = Math.max(box.maxX, world[v * 3]);
        box.minY = Math.min(box.minY, world[v * 3 + 1]);
        box.maxY = Math.max(box.maxY, world[v * 3 + 1]);
        box.minZ = Math.min(box.minZ, world[v * 3 + 2]);
        box.maxZ = Math.max(box.maxZ, world[v * 3 + 2]);
      }
      lowBoxes.push(box);
      lowBoxComponent.push(find(a));
    }
  } else {
    for (let i = 0; i < vertexCount; i++) {
      if (world[i * 3 + 1] > CAPSULE_TOP_Y) continue;
      const box = emptyBounds();
      box.minX = box.maxX = world[i * 3];
      box.minY = box.maxY = world[i * 3 + 1];
      box.minZ = box.maxZ = world[i * 3 + 2];
      lowBoxes.push(box);
      lowBoxComponent.push(find(i));
    }
  }
  if (lowBoxes.length === 0) {
    return [];
  }

  // Group the triangle boxes by connected component, then merge groups
  // whose xz footprints are within CLUSTER_GAP of each other until stable.
  const groupsByRoot = new Map<number, ClusterGroup>();
  lowBoxes.forEach((box, index) => {
    const root = lowBoxComponent[index];
    let group = groupsByRoot.get(root);
    if (!group) {
      group = { bounds: emptyBounds(), boxes: [] };
      groupsByRoot.set(root, group);
    }
    group.boxes.push(box);
    mergeBounds(group.bounds, box);
  });
  // Sweep-until-stable (never restart the scan per merge: families like the
  // cascade coping arrive as thousands of per-stone components, and a
  // restart-per-merge scan goes cubic and hangs the suite).
  const groups = [...groupsByRoot.values()];
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = groups.length - 1; j > i; j--) {
        const a = groups[i].bounds;
        const b = groups[j].bounds;
        const gapX = Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX);
        const gapZ = Math.max(a.minZ, b.minZ) - Math.min(a.maxZ, b.maxZ);
        if (gapX < CLUSTER_GAP && gapZ < CLUSTER_GAP) {
          mergeBounds(a, b);
          for (const box of groups[j].boxes) groups[i].boxes.push(box);
          groups.splice(j, 1);
          merged = true;
        }
      }
    }
  }

  const blockers: Mesh[] = [];
  for (const group of groups) {
    for (const bounds of refineGroupFootprint(group)) {
      blockers.push(
        createBlockerFromSourceBounds(scene, sourceMesh, bounds, undefined, `-cluster-${blockers.length}`),
      );
    }
  }
  return blockers;
}

function worldMatrixOf(mesh: AbstractMesh) {
  return mesh.getWorldMatrix();
}

interface ClusterGroup {
  bounds: SideBounds;
  // Bboxes of the group's triangles that reach into the capsule band.
  boxes: SideBounds[];
}

// A wide CONNECTED structure (the VIP wing shell, the cascade-court stone
// ring) is one component, so a single bbox would wall its archways and
// taper its corners into phantom collision. Refine: bin the group's
// low-reaching triangle boxes along the longer axis; bins no triangle spans
// are real openings (no blocker), and runs of occupied bins with a similar
// cross-axis profile collapse into one snug box each. Compact groups
// (single pylons, stems) stay one box.
const REFINE_MIN_SPAN = 8;
const REFINE_BIN_SIZE = 1;
const REFINE_PROFILE_TOLERANCE = 0.75;

function refineGroupFootprint(group: ClusterGroup): SideBounds[] {
  const total = group.bounds;
  const spanX = total.maxX - total.minX;
  const spanZ = total.maxZ - total.minZ;
  const span = Math.max(spanX, spanZ);
  if (span <= REFINE_MIN_SPAN) {
    return [total];
  }

  const alongX = spanX >= spanZ;
  const start = alongX ? total.minX : total.minZ;
  const binCount = Math.ceil(span / REFINE_BIN_SIZE);
  const bins: Array<SideBounds | undefined> = new Array(binCount);
  for (const box of group.boxes) {
    const alongMin = (alongX ? box.minX : box.minZ) - start;
    const alongMax = (alongX ? box.maxX : box.maxZ) - start;
    const first = Math.min(binCount - 1, Math.max(0, Math.floor(alongMin / REFINE_BIN_SIZE)));
    const last = Math.min(binCount - 1, Math.max(0, Math.floor(alongMax / REFINE_BIN_SIZE)));
    for (let index = first; index <= last; index++) {
      let bin = bins[index];
      if (!bin) {
        bin = emptyBounds();
        bins[index] = bin;
      }
      mergeBounds(bin, box);
    }
  }

  const results: SideBounds[] = [];
  let run: SideBounds | undefined;
  for (const bin of bins) {
    if (!bin) {
      if (run) results.push(run);
      run = undefined;
      continue;
    }
    const crossMinRun = run ? (alongX ? run.minZ : run.minX) : 0;
    const crossMaxRun = run ? (alongX ? run.maxZ : run.maxX) : 0;
    const crossMinBin = alongX ? bin.minZ : bin.minX;
    const crossMaxBin = alongX ? bin.maxZ : bin.maxX;
    const similar =
      run &&
      Math.abs(crossMinBin - crossMinRun) <= REFINE_PROFILE_TOLERANCE &&
      Math.abs(crossMaxBin - crossMaxRun) <= REFINE_PROFILE_TOLERANCE;
    if (run && similar) {
      mergeBounds(run, bin);
    } else {
      if (run) results.push(run);
      run = bin;
    }
  }
  if (run) results.push(run);
  return results;
}

function mergeBounds(target: SideBounds, source: SideBounds) {
  target.minX = Math.min(target.minX, source.minX);
  target.maxX = Math.max(target.maxX, source.maxX);
  target.minY = Math.min(target.minY, source.minY);
  target.maxY = Math.max(target.maxY, source.maxY);
  target.minZ = Math.min(target.minZ, source.minZ);
  target.maxZ = Math.max(target.maxZ, source.maxZ);
}

function emptyBounds(): SideBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function growBounds(bounds: SideBounds, vertex: Vector3) {
  bounds.minX = Math.min(bounds.minX, vertex.x);
  bounds.maxX = Math.max(bounds.maxX, vertex.x);
  bounds.minY = Math.min(bounds.minY, vertex.y);
  bounds.maxY = Math.max(bounds.maxY, vertex.y);
  bounds.minZ = Math.min(bounds.minZ, vertex.z);
  bounds.maxZ = Math.max(bounds.maxZ, vertex.z);
}

function createBlockerFromSourceBounds(
  scene: Scene,
  sourceMesh: AbstractMesh,
  bounds: SideBounds,
  side?: 'left' | 'right',
  nameSuffix?: string,
) {
  const { minX, maxX, minZ, maxZ } = bounds;
  // Block from the floor through the geometry's real top: a knee-high rail
  // still stops the capsule, while the box never towers 8m over trim again.
  const minY = Math.min(bounds.minY, 0);
  const maxY = Math.max(bounds.maxY, minY + MIN_SOURCE_BLOCKER_HEIGHT);
  const width = Math.max(MIN_SOURCE_BLOCKER_THICKNESS, maxX - minX);
  const height = Math.max(MIN_SOURCE_BLOCKER_HEIGHT, maxY - minY);
  const depth = Math.max(MIN_SOURCE_BLOCKER_THICKNESS, maxZ - minZ);
  const mesh = MeshBuilder.CreateBox(
    `main-stage-blocker-source-${sourceMesh.name}${side ? `-${side}` : ''}${nameSuffix ?? ''}`,
    {
      width,
      height,
      depth,
    },
    scene,
  );
  mesh.position.set(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  );
  mesh.metadata = {
    ...mesh.metadata,
    blockerSide: side,
    sourceMeshName: sourceMesh.name,
  };
  configureBlocker(mesh);
  return mesh;
}

function configureBlocker(mesh: Mesh) {
  mesh.isVisible = false;
  mesh.isPickable = false;
  mesh.checkCollisions = true;
  mesh.metadata = {
    ...mesh.metadata,
    mainStageCollisionBlocker: true,
  };
  mesh.computeWorldMatrix(true);
}
