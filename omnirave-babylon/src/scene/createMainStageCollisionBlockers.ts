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
  /V40_ApproachLightCore/,
  /V68_PortalArcadeShadowCore/,
  /V90_BasinStoneCopingArray/,
  /V99_Basin(ParapetRelief|RetainingWall)/,
  /V118_BasinWallRelief/,
  // BridgeRelief deliberately absent: those are knee-high walkway trim bands
  // ON the causeway (z 0.43-0.87 and crown inlay) - a blocker built from
  // their merged bounds walled off the center promenade and made the first
  // route objective unreachable.
  /V121_BasinRetainingRelief/,
  /V124_CrowdControl(FrameArray|RailArray)/,
  /V125_CrowdBarrier(BaseArray|RailArray)/,
  /V133_VipTerraceGoldArray/,
];

const BILATERAL_SOURCE_BLOCKER_RULES: readonly {
  innerClearanceX: number;
  pattern: RegExp;
}[] = [
  { pattern: /V30_VipShellFascia/, innerClearanceX: 17.3 },
  { pattern: /V40_ApproachLightCore/, innerClearanceX: 11.75 },
  { pattern: /V68_PortalArcadeShadowCore/, innerClearanceX: 8.35 },
  { pattern: /V90_BasinStoneCopingArray/, innerClearanceX: 5.1 },
  { pattern: /V99_BasinParapetRelief/, innerClearanceX: 8.3 },
  // The retaining walls sit closer to the center (x +/-5.7..7.1) than the
  // parapets: with the parapet clearance the split never fired and the
  // merged-bounds blocker bridged the walkway (player froze at z -37.9).
  { pattern: /V99_BasinRetainingWall/, innerClearanceX: 5.6 },
  { pattern: /V118_BasinWallRelief/, innerClearanceX: 6.2 },
  { pattern: /V121_BasinRetainingRelief/, innerClearanceX: 4.3 },
  { pattern: /V124_CrowdControl(FrameArray|RailArray)/, innerClearanceX: 17.8 },
  { pattern: /V125_CrowdBarrier(BaseArray|RailArray)/, innerClearanceX: 12.6 },
  { pattern: /V133_VipTerraceGoldArray/, innerClearanceX: 18.3 },
];

const MIN_SOURCE_BLOCKER_THICKNESS = 1.2;
const SOURCE_BLOCKER_CENTER_Y = 4;
const SOURCE_BLOCKER_HEIGHT = 8;

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

function createBlockersFromSourceMesh(scene: Scene, sourceMesh: AbstractMesh) {
  sourceMesh.computeWorldMatrix(true);
  sourceMesh.refreshBoundingInfo({ applySkeleton: false });
  const { minimumWorld, maximumWorld } = sourceMesh.getBoundingInfo().boundingBox;
  const lateralRule = BILATERAL_SOURCE_BLOCKER_RULES.find((rule) => rule.pattern.test(sourceMesh.name));
  if (
    lateralRule &&
    minimumWorld.x < -lateralRule.innerClearanceX &&
    maximumWorld.x > lateralRule.innerClearanceX
  ) {
    return [
      createBlockerFromSourceBounds(
        scene,
        sourceMesh,
        minimumWorld.x,
        -lateralRule.innerClearanceX,
        minimumWorld.z,
        maximumWorld.z,
        'left',
      ),
      createBlockerFromSourceBounds(
        scene,
        sourceMesh,
        lateralRule.innerClearanceX,
        maximumWorld.x,
        minimumWorld.z,
        maximumWorld.z,
        'right',
      ),
    ];
  }

  return [
    createBlockerFromSourceBounds(
      scene,
      sourceMesh,
      minimumWorld.x,
      maximumWorld.x,
      minimumWorld.z,
      maximumWorld.z,
    ),
  ];
}

function createBlockerFromSourceBounds(
  scene: Scene,
  sourceMesh: AbstractMesh,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  side?: 'left' | 'right',
) {
  const minY = SOURCE_BLOCKER_CENTER_Y - SOURCE_BLOCKER_HEIGHT / 2;
  const maxY = SOURCE_BLOCKER_CENTER_Y + SOURCE_BLOCKER_HEIGHT / 2;
  const width = Math.max(MIN_SOURCE_BLOCKER_THICKNESS, maxX - minX);
  const height = Math.max(1, maxY - minY);
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
