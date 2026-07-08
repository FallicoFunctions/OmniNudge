import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import { MAX_ZOOM_DISTANCE, MIN_ZOOM_DISTANCE, resolveZoomState } from './cameraRigMath';
import type { ReviewCheckpointCamera } from '../scene/reviewRouteData';

export interface FollowCameraRig {
  applyCheckpointView: (view: ReviewCheckpointCamera) => ReturnType<typeof resolveZoomState>;
  camera: ArcRotateCamera;
  syncZoomState: () => ReturnType<typeof resolveZoomState>;
  targetAnchor: TransformNode;
}

export function createFollowCameraRig(scene: Scene, target: TransformNode): FollowCameraRig {
  const targetAnchor = new TransformNode('review-camera-target', scene);
  const checkpointWorldTarget = new Vector3();
  const checkpointWorldPosition = new Vector3();
  const followWorldTarget = new Vector3();
  // The offset last authored by a checkpoint view, re-applied to the player's
  // CURRENT position every frame in syncZoomState. Without this, the anchor
  // only ever moved at the instant a checkpoint button was clicked, so free
  // WASD movement walked the player out from under a camera that never
  // followed - it just sat at wherever the last checkpoint (or scene load)
  // had left it. Defaults to zero: look directly at the player.
  const activeFocusOffset = new Vector3(0, 0, 0);

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
      checkpointWorldPosition.copyFrom(target.getAbsolutePosition());
      checkpointWorldPosition.x += view.positionOffset.x;
      checkpointWorldPosition.y += view.positionOffset.y;
      checkpointWorldPosition.z += view.positionOffset.z;
      camera.position.copyFrom(checkpointWorldPosition);
      camera.setTarget(checkpointWorldTarget);
      camera.rebuildAnglesAndRadius();
      return resolveZoomState(camera.radius);
    }

    camera.alpha = view.alpha;
    camera.beta = view.beta;
    camera.radius = view.radius;
    return resolveZoomState(camera.radius);
  };

  return {
    applyCheckpointView,
    camera,
    syncZoomState() {
      // Re-anchor to the player's live position every frame so WASD movement
      // keeps the camera attached instead of leaving it behind.
      target.computeWorldMatrix(true);
      followWorldTarget.copyFrom(target.getAbsolutePosition());
      followWorldTarget.addInPlace(activeFocusOffset);
      targetAnchor.position.copyFrom(followWorldTarget);

      const zoomState = resolveZoomState(camera.radius);
      camera.radius = zoomState.distance;
      return zoomState;
    },
    targetAnchor,
  };
}
