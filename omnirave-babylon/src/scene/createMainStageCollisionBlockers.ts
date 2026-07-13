import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
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

export function createMainStageCollisionBlockers(scene: Scene): Mesh[] {
  return MAIN_STAGE_COLLISION_BLOCKERS.map((blocker) => {
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
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.checkCollisions = true;
    mesh.metadata = {
      ...mesh.metadata,
      mainStageCollisionBlocker: true,
    };
    mesh.computeWorldMatrix(true);
    return mesh;
  });
}
