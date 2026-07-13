import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface PlayerRig {
  avatarAnchor: TransformNode;
  capsule: ReturnType<typeof MeshBuilder.CreateCapsule>;
  eyeHeightMeters: number;
  radiusMeters: number;
  root: TransformNode;
  speedMetersPerSecond: number;
}

export function createPlayerRig(scene: Scene, spawn: Vector3): PlayerRig {
  const root = new TransformNode('player-root', scene);
  root.position.copyFrom(spawn);

  const eyeHeightMeters = 1.65;
  const radiusMeters = 0.35;
  const avatarAnchor = new TransformNode('player-avatar-anchor', scene);
  avatarAnchor.parent = root;
  avatarAnchor.position.y = -eyeHeightMeters;

  const capsule = MeshBuilder.CreateCapsule(
    'player-capsule',
    {
      height: 1.8,
      radius: radiusMeters,
    },
    scene,
  );
  capsule.parent = root;
  capsule.position.y = -(eyeHeightMeters - 0.9);
  capsule.isVisible = false;
  capsule.checkCollisions = true;

  return {
    avatarAnchor,
    root,
    capsule,
    speedMetersPerSecond: 4.5,
    eyeHeightMeters,
    radiusMeters,
  };
}
