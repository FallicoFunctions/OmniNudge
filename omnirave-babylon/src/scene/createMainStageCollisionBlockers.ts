import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';

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
  { name: 'main-stage-blocker-left-envelope', x: -64, y: 3, z: -20, width: 4, height: 6, depth: 82 },
  { name: 'main-stage-blocker-right-envelope', x: 64, y: 3, z: -20, width: 4, height: 6, depth: 82 },
  { name: 'main-stage-blocker-back-envelope', x: 0, y: 3, z: -60, width: 124, height: 6, depth: 4 },
  { name: 'main-stage-blocker-front-stage', x: 0, y: 5, z: 14, width: 78, height: 10, depth: 4 },
  { name: 'main-stage-blocker-cascade-court-left', x: -49, y: 3, z: -28.5, width: 36, height: 6, depth: 23 },
  { name: 'main-stage-blocker-cascade-court-right', x: 49, y: 3, z: -28.5, width: 36, height: 6, depth: 23 },
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
  /V30_VipShellFascia/,
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

  return [...authoredBlockers, ...sourceBlockers];
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
    `main-stage-blocker-source-${sourceMesh.name}${side ? `-${side}` : ''}`,
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
