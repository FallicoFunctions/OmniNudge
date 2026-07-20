import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import { resolveAvatarAnimationState, type AvatarAnimationState } from './avatarAnimationState';
import type { PlayerRig } from './createPlayerRig';
import type { MovementInput } from './movementMath';
import { resolveCameraRelativeMoveVector, resolvePlayerSpeed } from './movementMath';

export interface PlayerController {
  animationState: AvatarAnimationState;
  currentSpeedMetersPerSecond: number;
  grounded: boolean;
  jump: () => void;
  step: (deltaSeconds: number) => void;
  verticalVelocityMetersPerSecond: number;
}

export interface CreatePlayerControllerOptions {
  avatarRoot: TransformNode;
  camera: Camera;
  collisionMeshes: AbstractMesh[];
  input: MovementInput;
  playerRig: PlayerRig;
  solidCollisionMeshes?: AbstractMesh[];
}

const GRAVITY_METERS_PER_SECOND = 18;
const JUMP_VELOCITY_METERS_PER_SECOND = 6.4;
const MAX_FALL_SPEED_METERS_PER_SECOND = -32;
const GROUND_SNAP_EPSILON = 0.06;
const COLLISION_SURFACE_EPSILON = 0.001;

export function createPlayerController(options: CreatePlayerControllerOptions): PlayerController {
  const groundRay = new Ray(Vector3.Zero(), Vector3.Down(), 256);
  const cameraForward = new Vector3();
  let jumpQueued = false;

  const controller: PlayerController = {
    animationState: 'idle',
    currentSpeedMetersPerSecond: 0,
    grounded: false,
    verticalVelocityMetersPerSecond: 0,
    jump() {
      jumpQueued = true;
    },
    step(deltaSeconds: number) {
      const groundHeight = resolveGroundHeight(options.collisionMeshes, options.playerRig.root.position, groundRay);
      const groundedEyeHeight = groundHeight === null ? null : groundHeight + options.playerRig.eyeHeightMeters;
      const distanceToGround = groundedEyeHeight === null
        ? Number.POSITIVE_INFINITY
        : options.playerRig.root.position.y - groundedEyeHeight;
      controller.grounded = distanceToGround <= GROUND_SNAP_EPSILON && controller.verticalVelocityMetersPerSecond <= 0;

      if (options.input.jump) {
        jumpQueued = true;
        options.input.jump = false;
      }

      if (jumpQueued && controller.grounded) {
        controller.verticalVelocityMetersPerSecond = JUMP_VELOCITY_METERS_PER_SECOND;
        controller.grounded = false;
      }
      jumpQueued = false;

      resolveCameraForward(options.camera, cameraForward);
      const move = resolveCameraRelativeMoveVector(options.input, cameraForward);
      const speed = resolvePlayerSpeed(options.playerRig.speedMetersPerSecond, options.input.sprint);
      const horizontalSpeed = move.magnitude > 0 ? speed : 0;

      const previousX = options.playerRig.root.position.x;
      options.playerRig.root.position.x += move.x * horizontalSpeed * deltaSeconds;
      resolveHorizontalCollision(
        options.solidCollisionMeshes ?? [],
        options.playerRig.root.position,
        previousX,
        'x',
        options.playerRig.eyeHeightMeters,
        options.playerRig.radiusMeters,
      );
      const previousZ = options.playerRig.root.position.z;
      options.playerRig.root.position.z += move.z * horizontalSpeed * deltaSeconds;
      resolveHorizontalCollision(
        options.solidCollisionMeshes ?? [],
        options.playerRig.root.position,
        previousZ,
        'z',
        options.playerRig.eyeHeightMeters,
        options.playerRig.radiusMeters,
      );

      if (move.magnitude > 0) {
        options.avatarRoot.rotation.y = Math.atan2(move.x, move.z);
      }

      controller.verticalVelocityMetersPerSecond = Math.max(
        MAX_FALL_SPEED_METERS_PER_SECOND,
        controller.verticalVelocityMetersPerSecond - GRAVITY_METERS_PER_SECOND * deltaSeconds,
      );
      options.playerRig.root.position.y += controller.verticalVelocityMetersPerSecond * deltaSeconds;

      const updatedGroundHeight = resolveGroundHeight(
        options.collisionMeshes,
        options.playerRig.root.position,
        groundRay,
      );
      if (updatedGroundHeight !== null) {
        const updatedGroundedEyeHeight = updatedGroundHeight + options.playerRig.eyeHeightMeters;
        if (options.playerRig.root.position.y <= updatedGroundedEyeHeight && controller.verticalVelocityMetersPerSecond <= 0) {
          options.playerRig.root.position.y = updatedGroundedEyeHeight;
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

function resolveGroundHeight(collisionMeshes: AbstractMesh[], position: Vector3, ray: Ray) {
  ray.origin.set(position.x, 128, position.z);
  let nearestDistance = Number.POSITIVE_INFINITY;
  let groundHeight: number | null = null;

  for (const mesh of collisionMeshes) {
    const hit = ray.intersectsMesh(mesh, false);
    if (!hit.hit || !hit.pickedPoint) {
      continue;
    }

    if (hit.distance < nearestDistance) {
      nearestDistance = hit.distance;
      groundHeight = hit.pickedPoint.y;
    }
  }

  return groundHeight;
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
