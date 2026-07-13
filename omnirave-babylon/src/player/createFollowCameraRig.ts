import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAX_ZOOM_DISTANCE, MIN_ZOOM_DISTANCE, resolveZoomState } from './cameraRigMath';
import type { ReviewCheckpointCamera } from '../scene/reviewRouteData';

export interface FollowCameraRig {
  applyCheckpointView: (view: ReviewCheckpointCamera) => ReturnType<typeof resolveZoomState>;
  camera: ArcRotateCamera;
  orbit: (deltaYaw: number, deltaPitch: number) => ReturnType<typeof resolveZoomState>;
  syncZoomState: () => ReturnType<typeof resolveZoomState>;
  targetAnchor: TransformNode;
}

export function createFollowCameraRig(scene: Scene, target: TransformNode): FollowCameraRig {
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
    const nextBeta = Math.min(1.38, Math.max(0.62, currentBeta + deltaPitch));
    const horizontalRadius = Math.sin(nextBeta) * radius;

    activeTargetToCameraOffset.set(
      horizontalRadius * Math.cos(nextAlpha),
      Math.cos(nextBeta) * radius,
      horizontalRadius * Math.sin(nextAlpha),
    );
  };

  const applyPositionOffsetCamera = (worldPosition: Vector3, worldTarget: Vector3) => {
    const offset = worldPosition.subtract(worldTarget);
    const radius = offset.length();
    camera.setTarget(worldTarget);
    camera.alpha = Math.atan2(offset.z, offset.x);
    camera.beta = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)));
    camera.radius = radius;
    camera.position.copyFrom(worldPosition);
  };

  const camera = new ArcRotateCamera('review-camera', Math.PI, 1.1, 6, targetAnchor.position, scene);
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
      return resolveZoomState(camera.radius);
    }

    hasActivePositionOffset = false;
    camera.alpha = view.alpha;
    camera.beta = view.beta;
    camera.radius = view.radius;
    return resolveZoomState(camera.radius);
  };

  return {
    applyCheckpointView,
    camera,
    orbit(deltaYaw, deltaPitch) {
      applyOrbitDelta(deltaYaw, deltaPitch);
      return this.syncZoomState();
    },
    syncZoomState() {
      // Re-anchor to the player's live position every frame so WASD movement
      // keeps the camera attached instead of leaving it behind.
      target.computeWorldMatrix(true);
      followWorldTarget.copyFrom(target.getAbsolutePosition());
      followWorldTarget.addInPlace(activeFocusOffset);
      targetAnchor.position.copyFrom(followWorldTarget);

      if (hasActivePositionOffset) {
        const distance = camera.radius;
        followWorldPosition.copyFrom(activeTargetToCameraOffset);
        followWorldPosition.normalize();
        followWorldPosition.scaleInPlace(distance);
        followWorldPosition.addInPlace(followWorldTarget);
        applyPositionOffsetCamera(followWorldPosition, followWorldTarget);
      }

      const zoomState = resolveZoomState(camera.radius);
      camera.radius = zoomState.distance;
      return zoomState;
    },
    targetAnchor,
  };
}
