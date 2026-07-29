import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { AVATAR_REFERENCE_HEIGHT_INCHES, resolveAvatarHeightScale } from './avatarDefinition';

// The rig is authored at the avatar's reference height (71in / 1.80m):
// a 1.8m capsule with the eye line at 1.65m. Sec 6.5 height effects are a
// uniform scale off these numbers.
const REFERENCE_EYE_HEIGHT_METERS = 1.65;
const REFERENCE_RADIUS_METERS = 0.35;
const REFERENCE_CAPSULE_HEIGHT_METERS = 1.8;

export interface PlayerRig {
  avatarAnchor: TransformNode;
  capsule: ReturnType<typeof MeshBuilder.CreateCapsule>;
  eyeHeightMeters: number;
  /** Sec 6.5 body height driving scale / eye level / collision capsule. */
  heightInches: number;
  radiusMeters: number;
  root: TransformNode;
  /**
   * Sec 6.5: height must NOT affect movement speed, sprint speed, or jump
   * power. This value is deliberately not derived from heightInches, and
   * setHeightInches never touches it.
   */
  speedMetersPerSecond: number;
  /**
   * Re-scales the standing presence for a new body height: collision capsule,
   * eye level, and the avatar anchor. The root keeps its world foot position,
   * so a height change does not sink the player into the ground or pop them
   * into the air.
   */
  setHeightInches: (heightInches: number) => number;
}

export function createPlayerRig(scene: Scene, spawn: Vector3): PlayerRig {
  const root = new TransformNode('player-root', scene);
  root.position.copyFrom(spawn);

  const avatarAnchor = new TransformNode('player-avatar-anchor', scene);
  avatarAnchor.parent = root;

  const capsule = MeshBuilder.CreateCapsule(
    'player-capsule',
    {
      height: REFERENCE_CAPSULE_HEIGHT_METERS,
      radius: REFERENCE_RADIUS_METERS,
    },
    scene,
  );
  capsule.parent = root;
  capsule.isVisible = false;
  capsule.checkCollisions = true;

  const rig: PlayerRig = {
    avatarAnchor,
    root,
    capsule,
    speedMetersPerSecond: 4.5,
    eyeHeightMeters: REFERENCE_EYE_HEIGHT_METERS,
    heightInches: 0,
    radiusMeters: REFERENCE_RADIUS_METERS,
    setHeightInches(heightInches: number) {
      const scale = resolveAvatarHeightScale(heightInches);
      const nextEyeHeight = REFERENCE_EYE_HEIGHT_METERS * scale;
      // playerController keeps root.position.y at (ground + eyeHeightMeters),
      // so shifting the eye line must move the root by the same delta or the
      // player teleports vertically for one frame.
      root.position.y += nextEyeHeight - rig.eyeHeightMeters;
      rig.eyeHeightMeters = nextEyeHeight;
      rig.radiusMeters = REFERENCE_RADIUS_METERS * scale;
      rig.heightInches = Math.round(heightInches);
      capsule.scaling.setAll(scale);
      capsule.position.y = -(nextEyeHeight - (REFERENCE_CAPSULE_HEIGHT_METERS / 2) * scale);
      avatarAnchor.position.y = -nextEyeHeight;
      return scale;
    },
  };

  // Seed every derived value (anchor y, capsule offset) through the one code
  // path that owns them.
  rig.setHeightInches(AVATAR_REFERENCE_HEIGHT_INCHES);

  return rig;
}
