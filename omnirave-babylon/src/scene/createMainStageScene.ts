import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createInputMap } from '../player/createInputMap';
import { createPlayerRig } from '../player/createPlayerRig';
import { createReviewAvatar } from '../player/createReviewAvatar';
import { resolveMoveVector } from '../player/movementMath';
import { createLightingRig } from './createLightingRig';
import { loadMainStageAssets } from './loadMainStageAssets';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from './reviewRouteData';

export async function createMainStageScene(engine: AbstractEngine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  scene.collisionsEnabled = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.008;
  scene.fogColor = new Color3(0.04, 0.05, 0.08);

  const stageAssets = await loadMainStageAssets(scene);
  const lightingRig = createLightingRig(scene);
  const input = createInputMap(window);
  const playerRig = createPlayerRig(
    scene,
    new Vector3(BACK_PLAZA_SPAWN.x, BACK_PLAZA_SPAWN.y, BACK_PLAZA_SPAWN.z),
  );
  const reviewAvatar = await createReviewAvatar(scene);
  reviewAvatar.root.parent = playerRig.avatarAnchor;
  const cameraRig = createFollowCameraRig(scene, playerRig.root);
  cameraRig.camera.alpha = -Math.PI / 2;
  cameraRig.camera.beta = 1.22;
  cameraRig.camera.radius = 72;

  scene.activeCamera = cameraRig.camera;

  const canvas = engine.getRenderingCanvas?.();
  if (canvas) {
    cameraRig.camera.attachControl(canvas, true);
  }

  scene.onBeforeRenderObservable.add(() => {
    const zoomState = cameraRig.syncZoomState();
    const avatarVisibility = zoomState.mode === 'first_person' ? 0 : zoomState.shoulderOpacity;
    for (const mesh of reviewAvatar.meshes) {
      mesh.visibility = avatarVisibility;
    }

    const move = resolveMoveVector(input.state);
    if (move.magnitude > 0) {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      const distance = playerRig.speedMetersPerSecond * deltaSeconds;

      playerRig.root.position.x += move.x * distance;
      playerRig.root.position.z += move.z * distance;
    }

    const groundHeight = resolveGroundHeight(stageAssets.collisionMeshes, playerRig.root.position);
    if (groundHeight !== null) {
      playerRig.root.position.y = groundHeight + playerRig.eyeHeightMeters;
    }
  });

  scene.metadata = {
    ...scene.metadata,
    reviewRuntime: {
      checkpoints: MAIN_STAGE_REVIEW_ROUTE,
      cameraRig,
      lightingRig,
      reviewAvatar,
      stageAssets,
      input,
      playerRig,
      spawn: BACK_PLAZA_SPAWN,
    },
  };

  scene.onDisposeObservable.add(() => {
    input.dispose();
    cameraRig.camera.detachControl();
  });

  return scene;
}

function resolveGroundHeight(collisionMeshes: AbstractMesh[], position: Vector3) {
  const ray = new Ray(new Vector3(position.x, 128, position.z), Vector3.Down(), 256);
  let nearestHit: { distance: number; y: number } | null = null;

  for (const mesh of collisionMeshes) {
    const hit = ray.intersectsMesh(mesh, false);
    if (!hit.hit || !hit.pickedPoint) {
      continue;
    }

    if (!nearestHit || hit.distance < nearestHit.distance) {
      nearestHit = {
        distance: hit.distance,
        y: hit.pickedPoint.y,
      };
    }
  }

  return nearestHit?.y ?? null;
}
