import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

import { MAX_ZOOM_DISTANCE, MIN_ZOOM_DISTANCE, resolveZoomState } from './cameraRigMath';

export interface FollowCameraRig {
  camera: ArcRotateCamera;
  syncZoomState: () => ReturnType<typeof resolveZoomState>;
}

export function createFollowCameraRig(scene: Scene, target: TransformNode): FollowCameraRig {
  const camera = new ArcRotateCamera('review-camera', Math.PI, 1.1, 6, target.position, scene);
  camera.lockedTarget = target;
  camera.lowerRadiusLimit = MIN_ZOOM_DISTANCE;
  camera.upperRadiusLimit = MAX_ZOOM_DISTANCE;
  camera.wheelPrecision = 24;
  camera.panningSensibility = 0;
  camera.minZ = 0.05;

  return {
    camera,
    syncZoomState() {
      const zoomState = resolveZoomState(camera.radius);
      camera.radius = zoomState.distance;
      return zoomState;
    },
  };
}
