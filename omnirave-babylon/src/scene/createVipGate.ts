import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';

import { isVipGateBlocker } from './createMainStageCollisionBlockers';
import {
  VIP_BOUNDARY_THICKNESS,
  VIP_BOUNDARY_Z,
  VIP_GATE_APPROACH_DEPTH,
  VIP_GATE_INNER_X,
  VIP_GATE_PROMPT_CLEAR_DISTANCE,
  VIP_PROMENADE_MOUTH_HALF_X,
} from './mainStageVenueBounds';

// VIP gating (owner decision, 2026-08-04): every SIGNED-IN player is VIP, so
// the outboard half of the spawn-pylon boundary - the way into the cascade
// courts, the VIP terraces and the skydecks above them - opens for them and
// stays a wall for guests. Walking into it as a guest is what raises the log
// in / sign up popup, so the wall teaches the rule instead of just refusing.
//
// The wall is toggled by ADDING/REMOVING the gate blockers from the solid
// list the player controller and camera rig already share (both read that
// array live, by reference, every frame - see createMainStageScene.ts), not
// by disabling the meshes: nothing in the collision path consults
// isEnabled(), so a disabled mesh would still stop the player.

export interface VipGatePosition {
  x: number;
  z: number;
}

export interface VipGate {
  /** True while signed in - the gate blockers are out of the solid list. */
  readonly unlocked: boolean;
  /**
   * Sec 11.4: whether the player was inside VIP space as of the last step().
   * Read by createRuntime on logout, which is the one caller that needs it -
   * a live flag rather than a position argument keeps the scene graph out of
   * the boot chunk.
   */
  readonly playerInsideVipArea: boolean;
  setUnlocked: (unlocked: boolean) => void;
  /**
   * Sec 12: raised once per approach when a locked gate turns a player away.
   * "VIP block opens venue-styled signup window immediately."
   */
  setOnBlockedApproach: (handler: (() => void) | undefined) => void;
  /**
   * Sec 12: raised when the player has walked VIP_GATE_PROMPT_CLEAR_DISTANCE
   * (the spec's 15 feet) from the boundary, so the window auto-closes.
   */
  setOnApproachCleared: (handler: (() => void) | undefined) => void;
  /** Call every frame with the local player's position. */
  step: (position: VipGatePosition) => void;
}

export interface CreateVipGateOptions {
  /**
   * The live solid-collision array (createMainStageScene's
   * stageAssets.solidCollisionMeshes). Mutated in place, so every consumer
   * holding the same reference sees the gate open and close.
   */
  solidCollisionMeshes: AbstractMesh[];
  onBlockedApproach?: () => void;
  onApproachCleared?: () => void;
  /** Defaults to locked, matching a guest boot. */
  unlocked?: boolean;
}

/**
 * Sec 11.4 "logout in VIP": true where a player only got to by passing the
 * gate - north of the boundary line and outside the public promenade's own
 * width (which is what the mouth in that line is). The skydecks sit directly
 * over this same footprint, so a player up on one counts too.
 */
export function isInsideVipArea(position: VipGatePosition): boolean {
  return position.z > VIP_BOUNDARY_Z && Math.abs(position.x) >= VIP_PROMENADE_MOUTH_HALF_X;
}

// Re-locking (a logout) waits until the player is back on the PUBLIC side of
// the line and clear of the blocker's own footprint. Sec 11.4 answers the
// logout-inside-VIP case directly - it forces a respawn, which createRuntime
// performs - so this is the backstop for anything that ever re-locks the gate
// without moving the player: the wall simply shuts behind them once they walk
// back out, rather than sealing them into a flank the boundary makes
// reachable only from the south.
const LOCK_CLEARANCE = VIP_BOUNDARY_THICKNESS / 2 + 1;

/**
 * Distance from the gate opening itself (the boundary segment outboard of
 * VIP_GATE_INNER_X), which is what sec 12's 15-foot rule is measured against.
 * Straight along z while the player is in front of the opening; once they
 * walk back inboard past the gate's inner end, the x offset counts too, so
 * heading up the public promenade clears the prompt just as walking south
 * does.
 */
function distanceToGate(position: VipGatePosition): number {
  const dx = Math.max(0, VIP_GATE_INNER_X - Math.abs(position.x));
  const dz = position.z - VIP_BOUNDARY_Z;
  return Math.hypot(dx, dz);
}

export function createVipGate(options: CreateVipGateOptions): VipGate {
  const gateBlockers = options.solidCollisionMeshes.filter(isVipGateBlocker);
  let onBlockedApproach = options.onBlockedApproach;
  let onApproachCleared = options.onApproachCleared;
  let unlocked = false;
  let playerInsideVipArea = false;
  // False from the moment the prompt fires until the player is a clear 15
  // feet off the boundary again - sec 12's "if they manually close it while
  // still nearby, it stays closed until they leave the radius and return".
  let armed = true;

  const openGate = () => {
    for (const mesh of gateBlockers) {
      const index = options.solidCollisionMeshes.indexOf(mesh);
      if (index >= 0) {
        options.solidCollisionMeshes.splice(index, 1);
      }
    }
  };

  const closeGate = () => {
    for (const mesh of gateBlockers) {
      if (!options.solidCollisionMeshes.includes(mesh)) {
        options.solidCollisionMeshes.push(mesh);
      }
    }
  };

  const withinGateSpan = (x: number) => Math.abs(x) >= VIP_GATE_INNER_X;

  const gate: VipGate = {
    get unlocked() {
      return unlocked;
    },
    get playerInsideVipArea() {
      return playerInsideVipArea;
    },
    setUnlocked(next: boolean) {
      unlocked = next;
      if (next) {
        // Opening is immediate: a player who just logged in should not have
        // to walk away and back before the wall lets them through.
        openGate();
      }
      // Closing is handled by step(), which waits for the player to be clear
      // (see LOCK_CLEARANCE).
    },
    setOnBlockedApproach(handler) {
      onBlockedApproach = handler;
    },
    setOnApproachCleared(handler) {
      onApproachCleared = handler;
    },
    step(position: VipGatePosition) {
      // Tracked before the unlocked early-return below: a player is only ever
      // inside VIP space BECAUSE the gate is open for them, so that is
      // precisely when this has to stay current.
      playerInsideVipArea = isInsideVipArea(position);
      if (unlocked) {
        armed = true;
        return;
      }

      if (position.z <= VIP_BOUNDARY_Z - LOCK_CLEARANCE || !withinGateSpan(position.x)) {
        closeGate();
      }

      const approaching =
        withinGateSpan(position.x) &&
        position.z >= VIP_BOUNDARY_Z - VIP_GATE_APPROACH_DEPTH &&
        position.z <= VIP_BOUNDARY_Z;
      if (approaching && armed) {
        armed = false;
        onBlockedApproach?.();
        return;
      }
      // Sec 12: 15 feet off the boundary both auto-closes the window and
      // re-arms it for the next approach.
      if (!armed && distanceToGate(position) > VIP_GATE_PROMPT_CLEAR_DISTANCE) {
        armed = true;
        onApproachCleared?.();
      }
    },
  };

  gate.setUnlocked(Boolean(options.unlocked));
  return gate;
}
