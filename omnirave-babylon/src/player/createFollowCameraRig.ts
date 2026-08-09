import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAX_ZOOM_DISTANCE, MIN_ZOOM_DISTANCE, resolveZoomState } from './cameraRigMath';
import type { ReviewCheckpointCamera } from '../scene/reviewRouteData';

const MIN_ORBIT_BETA = 0.62;
// Raised from the old 2.2 so the view pitches substantially further up toward
// the sky. The camera arcs a little below the target at the extreme, but the
// sky is what the player is after there.
const MAX_ORBIT_BETA = 2.62;

// Design doc sec 7.2: "camera collision pushes inward when blocked... camera
// returns to chosen zoom when space opens up again". How far back from a
// raycast hit the camera stops, so the near plane (minZ 0.18) never pokes
// through the wall it just collided with.
const CAMERA_COLLISION_SKIN_MARGIN = 0.35;
// Meters/second the camera can extend back out toward the player's chosen
// zoom distance once a collision clears. Fast enough to read as responsive,
// slow enough not to pop - crosses the whole third-person range (a few
// meters to ~10m) in well under a second.
const CAMERA_COLLISION_EASE_BACK_SPEED = 24;

/**
 * Settings-popup `Camera Follow` mode (design doc sec 9.6 / 7.2).
 * `follow` - Auto-Follow.
 * `free`   - Free Camera.
 *
 * Both modes track the player's world POSITION every frame - sec 7.2's
 * "medium third-person" default and "player can look around while standing
 * still or moving" only make sense if the player never leaves frame, in
 * either mode. Earlier versions of this rig had `free` stop tracking
 * entirely (camera frozen in place while the player walked away) - that read
 * as a broken camera the instant Free Camera became the sec 7.2 default,
 * not a real feature, so it was removed. The distinction this type still
 * exists for is future: Auto-Follow auto-recentering the ORBIT ANGLE behind
 * the player's facing after a period with no manual orbit input, which
 * Free Camera would not do. That recenter behavior is not implemented yet -
 * today both modes behave identically beyond position tracking.
 */
export type CameraFollowMode = 'follow' | 'free';

export interface FollowCameraRig {
  applyCheckpointView: (view: ReviewCheckpointCamera) => ReturnType<typeof resolveZoomState>;
  camera: ArcRotateCamera;
  followMode: () => CameraFollowMode;
  setFollowMode: (mode: CameraFollowMode) => void;
  orbit: (deltaYaw: number, deltaPitch: number) => ReturnType<typeof resolveZoomState>;
  settleFocus: (strength: number) => void;
  // deltaSeconds defaults to the scene engine's own frame delta; production
  // call sites never pass it. Tests pass an explicit value so the ease-back
  // behaviour (sec below) is deterministic instead of depending on however
  // fast NullEngine happens to tick.
  syncZoomState: (deltaSeconds?: number) => ReturnType<typeof resolveZoomState>;
  targetAnchor: TransformNode;
  zoom: (deltaDistance: number) => ReturnType<typeof resolveZoomState>;
}

export interface FollowCameraRigOptions {
  // The same solid-geometry list the player controller collides against
  // (createMainStageScene's stageAssets.solidCollisionMeshes). Reused rather
  // than building a second parallel list - see createMainStageCollisionBlockers.
  solidCollisionMeshes?: AbstractMesh[];
  // Player-flagged (2026-07-31): orbiting to look UP swings the camera to a
  // LOW position behind/below the player - solidCollisionMeshes (walls/
  // rails/blockers) alone left nothing for that ray to hit, so the camera
  // clipped straight through the ground/floor. The same list playerController
  // uses for its own ground-ray (createMainStageScene's
  // stageAssets.collisionMeshes) closes that gap - passed by REFERENCE, not
  // copied, so meshes createMainStageScene pushes onto it AFTER this rig is
  // constructed (the VIP skydeck/wing bridge floors) are still picked up.
  groundCollisionMeshes?: AbstractMesh[];
}

export function createFollowCameraRig(
  scene: Scene,
  target: TransformNode,
  options: FollowCameraRigOptions = {},
): FollowCameraRig {
  const solidCollisionMeshes = options.solidCollisionMeshes ?? [];
  const groundCollisionMeshes = options.groundCollisionMeshes ?? [];
  const targetAnchor = new TransformNode('review-camera-target', scene);
  const checkpointWorldTarget = new Vector3();
  const checkpointWorldPosition = new Vector3();
  const followWorldTarget = new Vector3();
  const followWorldPosition = new Vector3();
  const activeTargetToCameraOffset = new Vector3();
  // The offset last authored by a checkpoint view, re-applied to the player's
  // CURRENT position every frame in syncZoomState. Without this, the anchor
  // only ever moved at the instant a checkpoint button was clicked, so free
  // WASD movement walked the player out from under a camera that never
  // followed - it just sat at wherever the last checkpoint (or scene load)
  // had left it. Defaults to zero: look directly at the player.
  const activeFocusOffset = new Vector3(0, 0, 0);
  const activePositionOffset = new Vector3(0, 0, 0);
  let hasActivePositionOffset = false;

  // Camera-collision scratch (sec 7.2). Preallocated: this is read every
  // frame from syncZoomState, so nothing here may allocate in the hot path.
  const collisionRay = new Ray(new Vector3(), new Vector3(0, 0, 1), MAX_ZOOM_DISTANCE);
  const collisionDirection = new Vector3();
  // The distance actually applied to the camera this frame - equal to the
  // player's requested zoom distance when nothing is in the way, pulled
  // closer when a raycast hits venue geometry first. Persists across frames
  // so the inward push and the eased return both have somewhere to read
  // "where the camera currently is" from.
  let appliedCameraDistance = 6;
  let cameraCollisionObstructed = false;

  // Casts from `origin` toward `direction` (unit vector) out to
  // `requestedDistance` against the venue's solid collision meshes. Blocked:
  // clamps just short of the hit (skin margin) immediately, so the lens
  // never lingers inside geometry even for one frame. Clearing: eases back
  // out toward requestedDistance at CAMERA_COLLISION_EASE_BACK_SPEED rather
  // than snapping, per sec 7.2 ("returns to chosen zoom when space opens up
  // again"). Never returns more than requestedDistance - collision only
  // ever pulls the camera closer than the mode's normal distance.
  const resolveCollisionClampedDistance = (
    origin: Vector3,
    direction: Vector3,
    requestedDistance: number,
    deltaSeconds: number,
  ): number => {
    let hitDistance = requestedDistance;
    if (requestedDistance > MIN_ZOOM_DISTANCE) {
      collisionRay.origin.copyFrom(origin);
      collisionRay.direction.copyFrom(direction);
      collisionRay.length = requestedDistance;
      // Two lists, one ray: walls/rails/blockers AND the ground/floor - see
      // groundCollisionMeshes's doc comment for why looking up needs both.
      for (const mesh of solidCollisionMeshes) {
        // Same reasoning as playerController's own collision pass: Babylon
        // caches the world matrix, so a mesh moved this frame without an
        // explicit render pass in between would otherwise be picked at its
        // stale (often origin) transform.
        mesh.computeWorldMatrix(true);
        const hit = collisionRay.intersectsMesh(mesh, false);
        if (hit.hit && hit.distance < hitDistance) {
          hitDistance = hit.distance;
        }
      }
      for (const mesh of groundCollisionMeshes) {
        mesh.computeWorldMatrix(true);
        const hit = collisionRay.intersectsMesh(mesh, false);
        if (hit.hit && hit.distance < hitDistance) {
          hitDistance = hit.distance;
        }
      }
    }

    const obstructed = hitDistance < requestedDistance;
    const clampTarget = obstructed
      ? Math.max(MIN_ZOOM_DISTANCE, Math.min(requestedDistance, hitDistance - CAMERA_COLLISION_SKIN_MARGIN))
      : requestedDistance;

    if (!cameraCollisionObstructed || clampTarget <= appliedCameraDistance) {
      // Newly obstructed, or getting MORE obstructed than last frame, or
      // nothing was blocking last frame (so any change - including a
      // deliberate zoom - should feel instant, not damped): snap.
      appliedCameraDistance = clampTarget;
    } else {
      // Was obstructed and is now less obstructed (or fully clear): ease
      // back out instead of popping to the new distance.
      appliedCameraDistance = Math.min(
        clampTarget,
        appliedCameraDistance + CAMERA_COLLISION_EASE_BACK_SPEED * deltaSeconds,
      );
    }

    cameraCollisionObstructed = obstructed;
    return appliedCameraDistance;
  };

  const syncActiveOffsetFromCamera = () => {
    targetAnchor.computeWorldMatrix(true);
    activeTargetToCameraOffset.copyFrom(camera.position);
    activeTargetToCameraOffset.subtractInPlace(targetAnchor.getAbsolutePosition());
    hasActivePositionOffset = true;
  };

  const applyOrbitDelta = (deltaYaw: number, deltaPitch: number) => {
    if (!hasActivePositionOffset || activeTargetToCameraOffset.lengthSquared() === 0) {
      syncActiveOffsetFromCamera();
    }

    const radius = Math.max(MIN_ZOOM_DISTANCE, activeTargetToCameraOffset.length());
    const currentAlpha = Math.atan2(activeTargetToCameraOffset.z, activeTargetToCameraOffset.x);
    const currentBeta = Math.acos(Math.min(1, Math.max(-1, activeTargetToCameraOffset.y / radius)));
    const nextAlpha = currentAlpha + deltaYaw;
    const nextBeta = Math.min(MAX_ORBIT_BETA, Math.max(MIN_ORBIT_BETA, currentBeta + deltaPitch));
    const horizontalRadius = Math.sin(nextBeta) * radius;

    activeTargetToCameraOffset.set(
      horizontalRadius * Math.cos(nextAlpha),
      Math.cos(nextBeta) * radius,
      horizontalRadius * Math.sin(nextAlpha),
    );
  };

  const applyZoomDelta = (deltaDistance: number) => {
    if (!hasActivePositionOffset || activeTargetToCameraOffset.lengthSquared() === 0) {
      syncActiveOffsetFromCamera();
    }

    const currentLength = Math.max(MIN_ZOOM_DISTANCE, activeTargetToCameraOffset.length());
    const nextLength = Math.min(
      MAX_ZOOM_DISTANCE,
      Math.max(MIN_ZOOM_DISTANCE, currentLength + deltaDistance),
    );
    activeTargetToCameraOffset.scaleInPlace(nextLength / currentLength);
    // syncZoomState treats camera.radius as the distance source of truth
    // (the offset only supplies direction), so the radius must move too or
    // the zoom silently does nothing.
    camera.radius = nextLength;
  };

  const applyPositionOffsetCamera = (worldPosition: Vector3, worldTarget: Vector3) => {
    const offset = worldPosition.subtract(worldTarget);
    // A checkpoint whose positionOffset equals its focusOffset collapses
    // this to the zero vector - offset.y / radius would then be 0/0 (NaN),
    // permanently breaking alpha/beta and every frame downstream. Clamp to
    // the same floor applyOrbitDelta/applyZoomDelta already use.
    const radius = Math.max(MIN_ZOOM_DISTANCE, offset.length());
    camera.setTarget(worldTarget);
    camera.alpha = Math.atan2(offset.z, offset.x);
    camera.beta = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)));
    camera.radius = radius;
    camera.position.copyFrom(worldPosition);
  };

  const camera = new ArcRotateCamera('review-camera', Math.PI, 1.1, 6, targetAnchor.position, scene);
  // Slightly wider than Babylon's default 0.8 rad lens: the Main Stage
  // reveal must hold the nearby avatar and the 80 m Crown apex together.
  camera.fov = 0.96;
  camera.lockedTarget = targetAnchor;
  camera.lowerRadiusLimit = MIN_ZOOM_DISTANCE;
  camera.upperRadiusLimit = MAX_ZOOM_DISTANCE;
  camera.wheelPrecision = 24;
  camera.panningSensibility = 0;
  // 0.18 instead of 0.05: depth precision scales with the near plane, and at
  // 5cm the buffer had so little resolution 100m+ away that layered facade
  // planes a few cm apart shredded into z-fighting. 18cm still clears
  // first-person wall approaches while multiplying distant precision ~3.6x.
  camera.minZ = 0.18;

  const applyCheckpointView = (view: ReviewCheckpointCamera) => {
    // Kill residual inertial motion: a teleporting checkpoint jump must land
    // exactly, not drift through nearby geometry for the first frames.
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
    activeFocusOffset.set(view.focusOffset.x, view.focusOffset.y, view.focusOffset.z);
    target.computeWorldMatrix(true);
    checkpointWorldTarget.copyFrom(target.getAbsolutePosition());
    checkpointWorldTarget.addInPlace(activeFocusOffset);
    targetAnchor.position.copyFrom(checkpointWorldTarget);

    if (view.positionOffset) {
      activePositionOffset.set(view.positionOffset.x, view.positionOffset.y, view.positionOffset.z);
      hasActivePositionOffset = true;
      checkpointWorldPosition.copyFrom(target.getAbsolutePosition());
      checkpointWorldPosition.addInPlace(activePositionOffset);
      activeTargetToCameraOffset.copyFrom(checkpointWorldPosition.subtract(checkpointWorldTarget));
      applyPositionOffsetCamera(checkpointWorldPosition, checkpointWorldTarget);
      // Write the resolved (clamped) distance back to camera.radius, same
      // as syncZoomState - otherwise a degenerate offset silently leaves
      // camera.radius at whatever pre-clamp value applyPositionOffsetCamera
      // computed, and recovery from the NaN case above isn't real.
      const zoomState = resolveZoomState(camera.radius);
      camera.radius = zoomState.distance;
      // A checkpoint jump is a teleport, not a walk toward a wall: land
      // exactly on the authored framing instead of easing out of whatever
      // collision state the PREVIOUS view left behind.
      appliedCameraDistance = zoomState.distance;
      cameraCollisionObstructed = false;
      return zoomState;
    }

    hasActivePositionOffset = false;
    camera.alpha = view.alpha;
    camera.beta = view.beta;
    camera.radius = view.radius;
    const zoomState = resolveZoomState(camera.radius);
    camera.radius = zoomState.distance;
    appliedCameraDistance = zoomState.distance;
    cameraCollisionObstructed = false;
    return zoomState;
  };

  // Sec 7: default camera mode is Free Camera; Auto-Follow is opt-in.
  let followMode: CameraFollowMode = 'free';

  return {
    applyCheckpointView,
    camera,
    followMode: () => followMode,
    setFollowMode(mode) {
      followMode = mode;
    },
    orbit(deltaYaw, deltaPitch) {
      applyOrbitDelta(deltaYaw, deltaPitch);
      return this.syncZoomState();
    },
    settleFocus(strength) {
      // Checkpoint views author a focus offset so the review framing looks
      // at scenery, not the avatar - but once the player MOVES, the camera
      // must recenter on them (player-flagged: "the avatar is not locked in
      // the middle like you'd expect in a video game"). Called from the
      // movement loop, this decays the authored offset toward zero so the
      // avatar glides back to center over a few steps instead of snapping.
      const clamped = Math.min(1, Math.max(0, strength));
      activeFocusOffset.scaleInPlace(1 - clamped);
      if (activeFocusOffset.lengthSquared() < 0.0004) {
        activeFocusOffset.set(0, 0, 0);
      }
    },
    syncZoomState(deltaSeconds) {
      const resolvedDeltaSeconds = deltaSeconds ?? scene.getEngine().getDeltaTime() / 1000;
      // Both modes re-anchor to the player's live position every frame so
      // WASD movement keeps the camera attached instead of leaving it
      // behind - see the CameraFollowMode doc comment above for why `free`
      // no longer skips this.
      target.computeWorldMatrix(true);
      followWorldTarget.copyFrom(target.getAbsolutePosition());
      followWorldTarget.addInPlace(activeFocusOffset);

      targetAnchor.position.copyFrom(followWorldTarget);

      if (hasActivePositionOffset) {
        // activeTargetToCameraOffset (not camera.radius) is the player's
        // REQUESTED distance - untouched by collision, so zoom()/orbit()
        // deltas keep composing off the chosen distance even while the
        // camera itself is currently pulled in by a wall.
        const requestedDistance = Math.max(MIN_ZOOM_DISTANCE, activeTargetToCameraOffset.length());
        collisionDirection.copyFrom(activeTargetToCameraOffset);
        collisionDirection.normalize();
        const appliedDistance = resolveCollisionClampedDistance(
          followWorldTarget,
          collisionDirection,
          requestedDistance,
          resolvedDeltaSeconds,
        );
        followWorldPosition.copyFrom(collisionDirection);
        followWorldPosition.scaleInPlace(appliedDistance);
        followWorldPosition.addInPlace(followWorldTarget);
        applyPositionOffsetCamera(followWorldPosition, followWorldTarget);
      }

      const zoomState = resolveZoomState(camera.radius);
      camera.radius = zoomState.distance;
      return zoomState;
    },
    targetAnchor,
    zoom(deltaDistance) {
      applyZoomDelta(deltaDistance);
      return this.syncZoomState();
    },
  };
}
