import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
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
];

const SOLID_SOURCE_NAME_PATTERNS: readonly RegExp[] = [
  /V30_VipShellFascia/,
  /V68_PortalArcadeShadowCore/,
  /V118_BasinWallRelief/,
  /V133_VipTerraceGoldArray/,
];

const MIN_SOURCE_BLOCKER_THICKNESS = 1.2;
const FOREGROUND_BARRICADE_CLEAR_Z = 0.25;

export function createMainStageCollisionBlockers(scene: Scene, sourceMeshes: readonly AbstractMesh[] = []): Mesh[] {
  const authoredBlockers = MAIN_STAGE_COLLISION_BLOCKERS.map((blocker) => createBlockerFromSpec(scene, blocker));
  const sourceBlockers = sourceMeshes
    .filter((mesh) => SOLID_SOURCE_NAME_PATTERNS.some((pattern) => pattern.test(mesh.name)))
    .map((mesh) => createBlockerFromSourceMesh(scene, mesh));

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

function createBlockerFromSourceMesh(scene: Scene, sourceMesh: AbstractMesh) {
  sourceMesh.computeWorldMatrix(true);
  sourceMesh.refreshBoundingInfo({ applySkeleton: false });
  const { minimumWorld, maximumWorld } = sourceMesh.getBoundingInfo().boundingBox;
  const minX = minimumWorld.x;
  const maxX = maximumWorld.x;
  const minY = minimumWorld.y;
  const maxY = maximumWorld.y;
  const minZ = /V118_BasinWallRelief/.test(sourceMesh.name)
    ? Math.max(minimumWorld.z, FOREGROUND_BARRICADE_CLEAR_Z)
    : minimumWorld.z;
  const maxZ = maximumWorld.z;
  const width = Math.max(MIN_SOURCE_BLOCKER_THICKNESS, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const depth = Math.max(MIN_SOURCE_BLOCKER_THICKNESS, maxZ - minZ);
  const mesh = MeshBuilder.CreateBox(
    `main-stage-blocker-source-${sourceMesh.name}`,
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
