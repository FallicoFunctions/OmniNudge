import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';

import {
  VENUE_ENVELOPE_BACK_Z,
  VENUE_WALKABLE_X_MAX,
  VENUE_WALKABLE_X_MIN,
} from './mainStageVenueBounds';

interface CollisionBlockerSpec {
  depth: number;
  height: number;
  name: string;
  width: number;
  x: number;
  y: number;
  z: number;
}

const MAIN_STAGE_COLLISION_BLOCKERS: readonly CollisionBlockerSpec[] = [
  // Envelope fence. The back edge sits at z VENUE_ENVELOPE_BACK_Z, past the
  // spawn gate sentinels (z -82), so the player can leave the approach deck
  // and walk the promenade over the paver field (deck's back edge is z -57;
  // the old fence at z -60 walled it off, player-flagged). Ground collision
  // (COL_Ground) ends at VENUE_GROUND_EDGE_Z (see mainStageVenueBounds.ts),
  // so the fence stays just inside it, and the sides extend to meet the back
  // fence corner-to-corner.
  { name: 'main-stage-blocker-left-envelope', x: VENUE_WALKABLE_X_MIN, y: 3, z: -34.5, width: 4, height: 6, depth: 111 },
  { name: 'main-stage-blocker-right-envelope', x: VENUE_WALKABLE_X_MAX, y: 3, z: -34.5, width: 4, height: 6, depth: 111 },
  { name: 'main-stage-blocker-back-envelope', x: 0, y: 3, z: VENUE_ENVELOPE_BACK_Z, width: 132, height: 6, depth: 4 },
  { name: 'main-stage-blocker-front-stage', x: 0, y: 5, z: 14, width: 78, height: 10, depth: 4 },
  // The cascade-court water features have no authored rows here: their
  // collision comes from the clustered V150_CascadeCourtCoping footprint
  // (see CLUSTERED_SOURCE_NAME_PATTERNS), which hugs the stone rim's real
  // outline. The earlier pocket-wide boxes (x 31..67 per side) sealed the
  // entire east/west flanks - cascade plazas, flank fields, and the VIP
  // forecourts were unreachable on foot - and even a hand-hugged rectangle
  // left phantom walls at the feature's tapered corners (player-flagged).
  // The basin foliage hedges guarding the sunken water strip (|x| 8.3..17.3)
  // end at z 9.2, but the water runs to z 23.2: without these caps the
  // avatar can step off the outer coping walkway and wade through the
  // water's unhedged north tip (verified live).
  // The east edge tucks 0.5 under the outer walkway floor: a zero-gap seam
  // let the capsule wedge into the box rim when stepping off the edge.
  { name: 'main-stage-blocker-basin-water-north-left', x: -13.05, y: 1.5, z: 16.3, width: 9.5, height: 3, depth: 14.2 },
  { name: 'main-stage-blocker-basin-water-north-right', x: 13.05, y: 1.5, z: 16.3, width: 9.5, height: 3, depth: 14.2 },
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
  // The stone rim of the tiered cascade water features: its refined
  // footprint replaces the hand-authored pocket rectangles (see the note in
  // MAIN_STAGE_COLLISION_BLOCKERS) and keeps the tiers and water unwadeable.
  /V150_CascadeCourtCoping/,
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
