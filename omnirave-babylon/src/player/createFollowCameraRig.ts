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

  const camera = new ArcRotateCamera('review-camera', Math.PI, 1.1, 6, targetAnchor.position, scene);
  camera.lockedTarget = targetAnchor;
  camera.lowerRadiusLimit = MIN_ZOOM_DISTANCE;
  camera.upperRadiusLimit = MAX_ZOOM_DISTANCE;
  camera.wheelPrecision = 24;
  camera.panningSensibility = 0;
  camera.minZ = 0.05;

  const applyCheckpointView = (view: ReviewCheckpointCamera) => {
    // Kill residual inertial motion: a teleporting checkpoint jump must land
    // exactly, not drift through nearby geometry for the first frames.
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
    target.computeWorldMatrix(true);
    checkpointWorldTarget.copyFrom(target.getAbsolutePosition());
    checkpointWorldTarget.x += view.focusOffset.x;
    checkpointWorldTarget.y += view.focusOffset.y;
    checkpointWorldTarget.z += view.focusOffset.z;
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
      const zoomState = resolveZoomState(camera.radius);
      camera.radius = zoomState.distance;
      return zoomState;
    },
    targetAnchor,
  };
}
