import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface PlayerRig {
  capsule: ReturnType<typeof MeshBuilder.CreateCapsule>;
  eyeHeightMeters: number;
  root: TransformNode;
  speedMetersPerSecond: number;
}

export function createPlayerRig(scene: Scene, spawn: Vector3): PlayerRig {
  const root = new TransformNode('player-root', scene);
  root.position.copyFrom(spawn);

  const capsule = MeshBuilder.CreateCapsule(
    'player-capsule',
    {
      height: 1.8,
      radius: 0.35,
    },
    scene,
  );
  capsule.parent = root;
  capsule.position.y = 0.9;
  capsule.isVisible = false;
  capsule.checkCollisions = true;

  return {
    root,
    capsule,
    speedMetersPerSecond: 4.5,
    eyeHeightMeters: 1.65,
  };
}
