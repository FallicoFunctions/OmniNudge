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
// Sec 7.5: crouch shrinks eye line and capsule height only - radius is left
// alone, so crouching does not change how tightly a player can squeeze past
// solids horizontally, only what they can duck under / how tall they stand.
const CROUCH_HEIGHT_SCALE = 0.62;

export interface PlayerRig {
  avatarAnchor: TransformNode;
  capsule: ReturnType<typeof MeshBuilder.CreateCapsule>;
  /** True while crouched (sec 7.5). Toggle with setCrouched. */
  crouched: boolean;
  eyeHeightMeters: number;
  /** Sec 6.5 body height driving scale / eye level / collision capsule. */
  heightInches: number;
  radiusMeters: number;
  root: TransformNode;
  /**
   * Composes with setHeightInches rather than fighting it: crouch always
   * scales relative to whatever body height is currently applied, so a tall
   * avatar's crouch and a short avatar's crouch both read as "the same
   * proportional duck," not a fixed offset. No-ops if already in that state.
   */
  setCrouched: (crouched: boolean) => void;
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

  // Body-height scale from the last setHeightInches call, kept separate from
  // rig.eyeHeightMeters so setCrouched can re-derive the crouched presence
  // off the CURRENT body height instead of stacking off whatever the eye
  // height happened to be last.
  let bodyHeightScale = 1;

  // Single code path for both setHeightInches and setCrouched: re-derives eye
  // height, capsule scale/offset, and avatar anchor from bodyHeightScale +
  // rig.crouched. Keeps the root's world FOOT position fixed across the call.
  const applyStandingPresence = () => {
    const crouchScale = rig.crouched ? CROUCH_HEIGHT_SCALE : 1;
    const nextEyeHeight = REFERENCE_EYE_HEIGHT_METERS * bodyHeightScale * crouchScale;
    // playerController keeps root.position.y at (ground + eyeHeightMeters),
    // so shifting the eye line must move the root by the same delta or the
    // player teleports vertically for one frame.
    root.position.y += nextEyeHeight - rig.eyeHeightMeters;
    rig.eyeHeightMeters = nextEyeHeight;

    const capsuleHeightScale = bodyHeightScale * crouchScale;
    capsule.scaling.set(bodyHeightScale, capsuleHeightScale, bodyHeightScale);
    capsule.position.y = -(nextEyeHeight - (REFERENCE_CAPSULE_HEIGHT_METERS / 2) * capsuleHeightScale);
    avatarAnchor.position.y = -nextEyeHeight;
  };

  const rig: PlayerRig = {
    avatarAnchor,
    root,
    capsule,
    crouched: false,
    speedMetersPerSecond: 4.5,
    eyeHeightMeters: REFERENCE_EYE_HEIGHT_METERS,
    heightInches: 0,
    radiusMeters: REFERENCE_RADIUS_METERS,
    setHeightInches(heightInches: number) {
      bodyHeightScale = resolveAvatarHeightScale(heightInches);
      rig.radiusMeters = REFERENCE_RADIUS_METERS * bodyHeightScale;
      rig.heightInches = Math.round(heightInches);
      applyStandingPresence();
      return bodyHeightScale;
    },
    setCrouched(crouched: boolean) {
      if (crouched === rig.crouched) {
        return;
      }
      rig.crouched = crouched;
      applyStandingPresence();
    },
  };

  // Seed every derived value (anchor y, capsule offset) through the one code
  // path that owns them.
  rig.setHeightInches(AVATAR_REFERENCE_HEIGHT_INCHES);

  return rig;
}
