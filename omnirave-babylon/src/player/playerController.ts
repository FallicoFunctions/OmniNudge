import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import { resolveAvatarAnimationState, type AvatarAnimationState } from './avatarAnimationState';
import type { PlayerRig } from './createPlayerRig';
import type { MovementInput, StaminaState } from './movementMath';
import {
  createStaminaState,
  resolveCameraRelativeMoveVector,
  resolvePlayerSpeed,
  stepStamina,
} from './movementMath';

/**
 * Sec 7.7 ladder zone: an axis-aligned footprint (with a small standoff
 * margin baked into min/max by the caller) plus the vertical span the
 * player can climb within. `facingYaw` is the world yaw the avatar snaps to
 * while attached, so the character faces into the rungs.
 *
 * This is deliberately geometry-agnostic (no mesh reference) - the scene
 * that owns `production-tower-service-ladder` computes this box once from
 * the mesh's world bounding info and passes it in, keeping this module
 * NullEngine-testable without loading the venue GLB.
 */
export interface LadderZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** World Y of the ladder's foot (where a climbing player can step off). */
  baseY: number;
  /** World Y of the ladder's top (where a climbing player can step off). */
  topY: number;
  facingYaw: number;
}

/**
 * Sec 7.8 player-vs-player collision. `footY` is the ground height at the
 * remote player's feet (their root position minus their eye height - see
 * createRemotePlayerRigs.collisionTargets, which derives it since the
 * network root tracks eye height the same way the local rig does).
 * `heightMeters` is their approximate standing capsule height, feet to
 * head, used as the walkable top surface for "stand on other players."
 */
export interface RemotePlayerCollisionTarget {
  x: number;
  z: number;
  footY: number;
  radiusMeters: number;
  heightMeters: number;
}

export interface PlayerController {
  animationState: AvatarAnimationState;
  currentSpeedMetersPerSecond: number;
  grounded: boolean;
  /** Sec 8.2: true from beginSpawnGhost() until the player has moved clear. */
  ghosting: boolean;
  /** True while attached to a ladder (sec 7.7) and climbing instead of walking. */
  onLadder: boolean;
  jump: () => void;
  /**
   * Sec 8.2/8.3: starts a no-collision grace period against solids and other
   * players, active until the player has moved GHOST_CLEAR_DISTANCE_METERS
   * from where this was called (distance-based, not timed - the spec is
   * explicit that ghosting "has no timeout" and instead clears once the
   * player is clear of the spawn crowd; distance is the natural read of that
   * rule and needs no extra timer state). Call on fresh join and on manual
   * respawn.
   */
  beginSpawnGhost: () => void;
  /** Sec 7.4: current stamina 0..1, for the HUD stamina bar readout. */
  stamina0to1: number;
  step: (deltaSeconds: number) => void;
  verticalVelocityMetersPerSecond: number;
}

export interface CreatePlayerControllerOptions {
  avatarRoot: TransformNode;
  camera: Camera;
  collisionMeshes: AbstractMesh[];
  input: MovementInput;
  /** Sec 7.7. Defaults to none - most scenes have no ladders. */
  ladders?: readonly LadderZone[];
  playerRig: PlayerRig;
  /**
   * Sec 7.8. Called at most once per step; may return the SAME array/objects
   * every frame (createRemotePlayerRigs.collisionTargets does exactly that)
   * - this module only reads the fields, never retains or mutates them.
   */
  getRemotePlayerCollisionTargets?: () => readonly RemotePlayerCollisionTarget[];
  solidCollisionMeshes?: AbstractMesh[];
}

const GRAVITY_METERS_PER_SECOND = 18;
const JUMP_VELOCITY_METERS_PER_SECOND = 6.4;
const MAX_FALL_SPEED_METERS_PER_SECOND = -32;
const GROUND_SNAP_EPSILON = 0.06;
const COLLISION_SURFACE_EPSILON = 0.001;
// The venue now has WALKABLE architecture above walkable ground (the VIP
// skydecks and the wing bridge at y 8.6, plus the GLB's own COL_VIPDeck at
// y 6.5-7.1). Ground used to be "the highest surface the down-ray hits",
// which teleported anyone standing UNDER a deck straight up onto it.
// Ground is now the highest surface within one step of the player's feet:
// the deck when you are on it, the ground when you are beneath it.
//
// 1.2m clears every ledge the venue already expects the player to walk up
// (the basin coping walkways top out at y 1.0, the approach deck at 0.9,
// the promenade at 0.36) while being far below any elevated deck. If no
// surface qualifies - the player is under everything, which only happens
// falling out of the world - the old highest-hit behaviour stands in as the
// safety net.
const GROUND_MAX_RISE = 1.2;

// Sec 7.7 ladders: slower than walk speed (auto-climb reads as deliberate,
// not a shortcut), with a little vertical slack past the authored top/base
// so stepping off doesn't require pixel-perfect alignment.
const LADDER_CLIMB_SPEED_METERS_PER_SECOND = 2.2;
const LADDER_VERTICAL_MARGIN_METERS = 0.35;
const LADDER_HORIZONTAL_MARGIN_METERS = 0.6;

// Sec 8.2 spawn ghosting: cleared once the player has walked this far from
// where beginSpawnGhost() was called - "moved clear of overlapping bodies,"
// approximated as a fixed radius rather than an actual crowd-density query.
const GHOST_CLEAR_DISTANCE_METERS = 2.5;

// Sec 7.8 player-vs-player collision: soft radial push-out. Softening (<1)
// closes only part of the overlap each pass so a dense, mutually-overlapping
// crowd relaxes toward a stable packing instead of fighting to a jitter.
const PLAYER_COLLISION_PUSH_SOFTEN = 0.6;
const PLAYER_COLLISION_PASSES = 2;
// Below this squared distance the push direction is undefined (exactly
// coincident centers) - skip rather than divide by ~0 into NaN.
const PLAYER_COLLISION_MIN_DISTANCE_SQUARED = 1e-6;

export function createPlayerController(options: CreatePlayerControllerOptions): PlayerController {
  const groundRay = new Ray(Vector3.Zero(), Vector3.Down(), 256);
  const cameraForward = new Vector3();
  let jumpQueued = false;
  const staminaState: StaminaState = createStaminaState();
  let ghostActive = false;
  const ghostOrigin = new Vector3();
  let onLadder = false;
  let activeLadder: LadderZone | null = null;

  const controller: PlayerController = {
    animationState: 'idle',
    currentSpeedMetersPerSecond: 0,
    grounded: false,
    ghosting: false,
    onLadder: false,
    stamina0to1: staminaState.stamina,
    verticalVelocityMetersPerSecond: 0,
    jump() {
      jumpQueued = true;
    },
    beginSpawnGhost() {
      ghostActive = true;
      controller.ghosting = true;
      ghostOrigin.copyFrom(options.playerRig.root.position);
    },
    step(deltaSeconds: number) {
      const position = options.playerRig.root.position;
      const ladders = options.ladders ?? [];
      const remotePlayers = options.getRemotePlayerCollisionTargets?.() ?? [];
      // Sec 8.2: ghosting suppresses solid + player collision only, never
      // ground contact - clears once the player has walked clear.
      if (ghostActive && Vector3.Distance(position, ghostOrigin) >= GHOST_CLEAR_DISTANCE_METERS) {
        ghostActive = false;
        controller.ghosting = false;
      }

      // Set below whenever this step already handled ladder climbing/
      // detaching, so the attach check further down never fires in the same
      // frame a jump-off or step-off just ran - otherwise a still-held
      // forward/jump input would reattach instantly and the detach would
      // never actually take.
      let ladderHandledThisFrame = false;

      if (onLadder && activeLadder) {
        ladderHandledThisFrame = true;
        const jumpedOff = stepLadderClimb(options, activeLadder, deltaSeconds, controller);
        const feetY = position.y - options.playerRig.eyeHeightMeters;
        if (jumpedOff || !isWithinLadder(activeLadder, position.x, position.z, feetY)) {
          onLadder = false;
          activeLadder = null;
          controller.onLadder = false;
        } else {
          controller.currentSpeedMetersPerSecond = Math.abs(controller.verticalVelocityMetersPerSecond);
          controller.animationState = resolveAvatarAnimationState(controller.currentSpeedMetersPerSecond);
          options.avatarRoot.metadata = {
            ...options.avatarRoot.metadata,
            animationState: controller.animationState,
            grounded: false,
          };
          return;
        }
      }

      const groundHeight = resolveGroundHeight(
        options.collisionMeshes,
        position,
        groundRay,
        position.y - options.playerRig.eyeHeightMeters,
        ghostActive ? [] : remotePlayers,
        options.playerRig.radiusMeters,
      );
      const groundedEyeHeight = groundHeight === null ? null : groundHeight + options.playerRig.eyeHeightMeters;
      const distanceToGround = groundedEyeHeight === null
        ? Number.POSITIVE_INFINITY
        : position.y - groundedEyeHeight;
      controller.grounded = distanceToGround <= GROUND_SNAP_EPSILON && controller.verticalVelocityMetersPerSecond <= 0;

      // Sec 8.2: only walk/sprint are enabled while ghosted - no jump.
      if (options.input.jump && !ghostActive) {
        jumpQueued = true;
        options.input.jump = false;
      } else if (options.input.jump) {
        options.input.jump = false;
      }

      const attemptedJumpThisFrame = jumpQueued;
      if (jumpQueued && controller.grounded) {
        controller.verticalVelocityMetersPerSecond = JUMP_VELOCITY_METERS_PER_SECOND;
        controller.grounded = false;
      }
      jumpQueued = false;

      // Sec 8.2: no crouch while ghosted.
      const crouchActive = Boolean(options.input.crouch) && !ghostActive;
      options.playerRig.setCrouched(crouchActive);

      resolveCameraForward(options.camera, cameraForward);
      const move = resolveCameraRelativeMoveVector(options.input, cameraForward);
      // Sec 7.5: crouch overrides sprint, so stamina only drains for sprint
      // that is actually being applied as speed.
      const sprintEngaged = options.input.sprint && !crouchActive;
      const sprintAllowed = stepStamina(staminaState, sprintEngaged, deltaSeconds);
      controller.stamina0to1 = staminaState.stamina;
      const speed = resolvePlayerSpeed(options.playerRig.speedMetersPerSecond, sprintAllowed, crouchActive);
      const horizontalSpeed = move.magnitude > 0 ? speed : 0;

      // Sec 7.7: approaching a ladder's footprint while walking/sprinting/
      // jumping toward it attaches instead of colliding with it as a wall.
      if (!ladderHandledThisFrame && !ghostActive && ladders.length > 0) {
        const candidate = resolveLadderZone(ladders, position.x, position.z, position.y - options.playerRig.eyeHeightMeters);
        if (candidate && (move.magnitude > 0 || attemptedJumpThisFrame)) {
          onLadder = true;
          activeLadder = candidate;
          controller.onLadder = true;
          controller.verticalVelocityMetersPerSecond = 0;
          position.x = (candidate.minX + candidate.maxX) / 2;
          position.z = (candidate.minZ + candidate.maxZ) / 2;
          options.avatarRoot.rotation.y = candidate.facingYaw;
          controller.currentSpeedMetersPerSecond = 0;
          controller.animationState = 'idle';
          return;
        }
      }

      const previousX = position.x;
      position.x += move.x * horizontalSpeed * deltaSeconds;
      if (!ghostActive) {
        resolveHorizontalCollision(
          options.solidCollisionMeshes ?? [],
          position,
          previousX,
          'x',
          options.playerRig.eyeHeightMeters,
          options.playerRig.radiusMeters,
        );
      }
      const previousZ = position.z;
      position.z += move.z * horizontalSpeed * deltaSeconds;
      if (!ghostActive) {
        resolveHorizontalCollision(
          options.solidCollisionMeshes ?? [],
          position,
          previousZ,
          'z',
          options.playerRig.eyeHeightMeters,
          options.playerRig.radiusMeters,
        );
      }

      // Sec 7.8: soft radial push-out against other players, never a shove -
      // only the local position moves. Ghosting skips this entirely (no
      // "standing on/colliding with other players" while ghosted).
      if (!ghostActive && remotePlayers.length > 0) {
        resolveRemotePlayerHorizontalCollision(remotePlayers, position, options.playerRig.radiusMeters);
      }

      if (move.magnitude > 0) {
        options.avatarRoot.rotation.y = Math.atan2(move.x, move.z);
      }

      controller.verticalVelocityMetersPerSecond = Math.max(
        MAX_FALL_SPEED_METERS_PER_SECOND,
        controller.verticalVelocityMetersPerSecond - GRAVITY_METERS_PER_SECOND * deltaSeconds,
      );
      position.y += controller.verticalVelocityMetersPerSecond * deltaSeconds;

      const updatedGroundHeight = resolveGroundHeight(
        options.collisionMeshes,
        position,
        groundRay,
        position.y - options.playerRig.eyeHeightMeters,
        ghostActive ? [] : remotePlayers,
        options.playerRig.radiusMeters,
      );
      if (updatedGroundHeight !== null) {
        const updatedGroundedEyeHeight = updatedGroundHeight + options.playerRig.eyeHeightMeters;
        if (position.y <= updatedGroundedEyeHeight && controller.verticalVelocityMetersPerSecond <= 0) {
          position.y = updatedGroundedEyeHeight;
          controller.verticalVelocityMetersPerSecond = 0;
          controller.grounded = true;
        }
      }

      controller.currentSpeedMetersPerSecond = horizontalSpeed;
      controller.animationState = resolveAvatarAnimationState(horizontalSpeed);
      options.avatarRoot.metadata = {
        ...options.avatarRoot.metadata,
        animationState: controller.animationState,
        grounded: controller.grounded,
      };
    },
  };

  return controller;
}

function isWithinLadder(ladder: LadderZone, x: number, z: number, feetY: number): boolean {
  return (
    x >= ladder.minX - LADDER_HORIZONTAL_MARGIN_METERS &&
    x <= ladder.maxX + LADDER_HORIZONTAL_MARGIN_METERS &&
    z >= ladder.minZ - LADDER_HORIZONTAL_MARGIN_METERS &&
    z <= ladder.maxZ + LADDER_HORIZONTAL_MARGIN_METERS &&
    feetY >= ladder.baseY - LADDER_VERTICAL_MARGIN_METERS &&
    feetY <= ladder.topY + LADDER_VERTICAL_MARGIN_METERS
  );
}

function resolveLadderZone(
  ladders: readonly LadderZone[],
  x: number,
  z: number,
  feetY: number,
): LadderZone | null {
  for (const ladder of ladders) {
    if (isWithinLadder(ladder, x, z, feetY)) {
      return ladder;
    }
  }
  return null;
}

/**
 * Sec 7.7: vertical-only movement while attached, locked to the ladder's
 * centerline (the "auto-align to the ladder's face" rule) - normal ground
 * movement, gravity, and jump are skipped entirely for this step. Stepping
 * off top/bottom or a mid-climb jump both fall out of the caller re-checking
 * isWithinLadder after this runs, plus the explicit jump-off below.
 */
function stepLadderClimb(
  options: CreatePlayerControllerOptions,
  ladder: LadderZone,
  deltaSeconds: number,
  controller: PlayerController,
): boolean {
  const position = options.playerRig.root.position;
  const climbInput = Number(options.input.forward) - Number(options.input.backward);

  // Sec 7.7: "can jump off midway" - a jump press while attached detaches
  // immediately with a little upward pop, same as a ground jump would.
  // Returns true so the caller forces the ladder-attached state off even
  // though the position hasn't left the ladder's footprint yet.
  if (options.input.jump) {
    options.input.jump = false;
    controller.onLadder = false;
    controller.verticalVelocityMetersPerSecond = JUMP_VELOCITY_METERS_PER_SECOND;
    return true;
  }

  position.x = (ladder.minX + ladder.maxX) / 2;
  position.z = (ladder.minZ + ladder.maxZ) / 2;
  const rawFeetY =
    position.y -
    options.playerRig.eyeHeightMeters +
    climbInput * LADDER_CLIMB_SPEED_METERS_PER_SECOND * deltaSeconds;

  // Sec 7.7: "can pause and stay attached" (climbInput === 0 just holds in
  // place) but climbing PAST either end steps off onto normal ground
  // movement rather than clamping forever at the rails - without this a
  // player holding forward at the top would be stuck attached with nowhere
  // left to climb.
  if (rawFeetY > ladder.topY) {
    // Popped just past the attach margin on purpose: landing exactly at
    // topY would still read as "within reach" to isWithinLadder, and with
    // forward still held this would reattach on the very same/next step
    // instead of actually stepping off. Gravity (run right after this,
    // same frame) settles the tiny overshoot onto real ground/mesh height.
    position.y =
      ladder.topY + LADDER_VERTICAL_MARGIN_METERS + COLLISION_SURFACE_EPSILON + options.playerRig.eyeHeightMeters;
    controller.verticalVelocityMetersPerSecond = 0;
    return true;
  }
  if (rawFeetY < ladder.baseY) {
    position.y =
      ladder.baseY - LADDER_VERTICAL_MARGIN_METERS - COLLISION_SURFACE_EPSILON + options.playerRig.eyeHeightMeters;
    controller.verticalVelocityMetersPerSecond = 0;
    return true;
  }

  position.y = rawFeetY + options.playerRig.eyeHeightMeters;
  controller.verticalVelocityMetersPerSecond = 0;
  controller.grounded = false;
  options.avatarRoot.rotation.y = ladder.facingYaw;
  return false;
}

function resolveCameraForward(camera: Camera, target: Vector3) {
  const forward = camera.getForwardRay(1).direction;
  target.set(forward.x, 0, forward.z);
  if (target.lengthSquared() === 0) {
    target.set(0, 0, 1);
    return target;
  }

  target.normalize();
  return target;
}

function resolveGroundHeight(
  collisionMeshes: AbstractMesh[],
  position: Vector3,
  ray: Ray,
  feetY: number,
  remotePlayers: readonly RemotePlayerCollisionTarget[] = [],
  localRadiusMeters = 0,
) {
  ray.origin.set(position.x, 128, position.z);
  const ceiling = feetY + GROUND_MAX_RISE;
  let groundHeight: number | null = null;
  let highestHeight: number | null = null;

  for (const mesh of collisionMeshes) {
    const hit = ray.intersectsMesh(mesh, false);
    if (!hit.hit || !hit.pickedPoint) {
      continue;
    }

    const surfaceY = hit.pickedPoint.y;
    if (highestHeight === null || surfaceY > highestHeight) {
      highestHeight = surfaceY;
    }
    if (surfaceY <= ceiling && (groundHeight === null || surfaceY > groundHeight)) {
      groundHeight = surfaceY;
    }
  }

  // Sec 7.8: "can jump onto and stand on other players" - a remote player's
  // top-of-head surface is folded into the SAME "highest surface within one
  // step of the feet" rule the elevated decks already use, not a parallel
  // system.
  for (const remote of remotePlayers) {
    const dx = position.x - remote.x;
    const dz = position.z - remote.z;
    const combinedRadius = remote.radiusMeters + localRadiusMeters;
    if (dx * dx + dz * dz > combinedRadius * combinedRadius) {
      continue;
    }
    const topY = remote.footY + remote.heightMeters;
    if (highestHeight === null || topY > highestHeight) {
      highestHeight = topY;
    }
    if (topY <= ceiling && (groundHeight === null || topY > groundHeight)) {
      groundHeight = topY;
    }
  }

  return groundHeight ?? highestHeight;
}

/**
 * Sec 7.8: soft radial push-out so the local player cannot overlap another
 * player's body. Only the LOCAL position is ever moved here - remote
 * players are read-only inputs - so this can never shove/displace anyone;
 * it only ever keeps the local player out of their space. Multiple passes
 * plus the softening factor let a dense, mutually-overlapping crowd settle
 * toward a stable packing instead of oscillating every frame. Because the
 * push is purely radial (the tangential component of movement is never
 * touched), a player angling past the edge of another slides around them
 * instead of hard-stopping.
 */
function resolveRemotePlayerHorizontalCollision(
  remotePlayers: readonly RemotePlayerCollisionTarget[],
  position: Vector3,
  localRadiusMeters: number,
): void {
  for (let pass = 0; pass < PLAYER_COLLISION_PASSES; pass++) {
    for (const remote of remotePlayers) {
      const dx = position.x - remote.x;
      const dz = position.z - remote.z;
      const distanceSquared = dx * dx + dz * dz;
      const combinedRadius = remote.radiusMeters + localRadiusMeters;
      if (
        distanceSquared >= combinedRadius * combinedRadius ||
        distanceSquared < PLAYER_COLLISION_MIN_DISTANCE_SQUARED
      ) {
        continue;
      }
      const distance = Math.sqrt(distanceSquared);
      const overlap = combinedRadius - distance;
      const normalX = dx / distance;
      const normalZ = dz / distance;
      position.x += normalX * overlap * PLAYER_COLLISION_PUSH_SOFTEN;
      position.z += normalZ * overlap * PLAYER_COLLISION_PUSH_SOFTEN;
    }
  }
}

function resolveHorizontalCollision(
  solidCollisionMeshes: AbstractMesh[],
  position: Vector3,
  previousAxisPosition: number,
  movingAxis: 'x' | 'z',
  eyeHeightMeters: number,
  radiusMeters: number,
) {
  const feetY = position.y - eyeHeightMeters;
  const headY = position.y;

  for (const mesh of solidCollisionMeshes) {
    mesh.computeWorldMatrix(true);
    const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
    if (headY < minimumWorld.y || feetY > maximumWorld.y) {
      continue;
    }

    const minX = minimumWorld.x - radiusMeters;
    const maxX = maximumWorld.x + radiusMeters;
    const minZ = minimumWorld.z - radiusMeters;
    const maxZ = maximumWorld.z + radiusMeters;
    const crossAxis = movingAxis === 'x' ? 'z' : 'x';
    const crossAxisPosition = position[crossAxis];
    const crossAxisMin = movingAxis === 'x' ? minZ : minX;
    const crossAxisMax = movingAxis === 'x' ? maxZ : maxX;
    if (crossAxisPosition < crossAxisMin || crossAxisPosition > crossAxisMax) {
      continue;
    }

    const movingAxisMin = movingAxis === 'x' ? minX : minZ;
    const movingAxisMax = movingAxis === 'x' ? maxX : maxZ;
    const currentAxisPosition = position[movingAxis];
    if (previousAxisPosition <= movingAxisMin && currentAxisPosition > movingAxisMin) {
      position[movingAxis] = movingAxisMin - COLLISION_SURFACE_EPSILON;
      continue;
    }
    if (previousAxisPosition >= movingAxisMax && currentAxisPosition < movingAxisMax) {
      position[movingAxis] = movingAxisMax + COLLISION_SURFACE_EPSILON;
      continue;
    }
    if (currentAxisPosition < movingAxisMin || currentAxisPosition > movingAxisMax) {
      continue;
    }
  }

  // Ejection from any box the position ended up inside (diagonal corner
  // entries, seam drops). Resolved against the UNION of containing boxes:
  // per-box nearest-face ejection churned when solids overlap - one box's
  // ejection face sat inside a neighbour, so whichever mesh iterated last
  // pinned the player INSIDE the other while the free axis walked them
  // straight through it (observed live: wall-relief blocker pinned x while
  // z strolled through the basin water blocker).
  resolveSolidPenetration(solidCollisionMeshes, position, eyeHeightMeters, radiusMeters);
}

interface ExpandedBox {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}

function resolveSolidPenetration(
  solidCollisionMeshes: AbstractMesh[],
  position: Vector3,
  eyeHeightMeters: number,
  radiusMeters: number,
) {
  const feetY = position.y - eyeHeightMeters;
  const headY = position.y;

  const boxes: ExpandedBox[] = [];
  for (const mesh of solidCollisionMeshes) {
    const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
    if (headY < minimumWorld.y || feetY > maximumWorld.y) {
      continue;
    }
    boxes.push({
      minX: minimumWorld.x - radiusMeters,
      maxX: maximumWorld.x + radiusMeters,
      minZ: minimumWorld.z - radiusMeters,
      maxZ: maximumWorld.z + radiusMeters,
    });
  }

  const contains = (box: ExpandedBox, x: number, z: number) =>
    x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;

  for (let pass = 0; pass < 3; pass++) {
    if (!boxes.some((box) => contains(box, position.x, position.z))) {
      return;
    }

    // For each cardinal direction, march the exit point outward until it
    // clears every box in the overlapping cluster, then take the cheapest.
    let best: { axis: 'x' | 'z'; value: number; cost: number } | null = null;
    for (const [axis, sign] of [
      ['x', 1],
      ['x', -1],
      ['z', 1],
      ['z', -1],
    ] as const) {
      let candidate = axis === 'x' ? position.x : position.z;
      for (let hop = 0; hop < 4; hop++) {
        const x = axis === 'x' ? candidate : position.x;
        const z = axis === 'z' ? candidate : position.z;
        const blocking = boxes.find((box) => contains(box, x, z));
        if (!blocking) {
          break;
        }
        const face =
          axis === 'x'
            ? sign > 0
              ? blocking.maxX
              : blocking.minX
            : sign > 0
              ? blocking.maxZ
              : blocking.minZ;
        candidate = face + sign * COLLISION_SURFACE_EPSILON;
      }
      const origin = axis === 'x' ? position.x : position.z;
      const cost = Math.abs(candidate - origin);
      if (!best || cost < best.cost) {
        best = { axis, value: candidate, cost };
      }
    }

    if (!best) {
      return;
    }
    position[best.axis] = best.value;
  }
}
