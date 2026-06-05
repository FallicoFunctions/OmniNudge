import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createInputMap } from '../player/createInputMap';
import { createPlayerRig } from '../player/createPlayerRig';
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
  const cameraRig = createFollowCameraRig(scene, playerRig.root);

  scene.activeCamera = cameraRig.camera;

  const canvas = engine.getRenderingCanvas?.();
  if (canvas) {
    cameraRig.camera.attachControl(canvas, true);
  }

  scene.onBeforeRenderObservable.add(() => {
    cameraRig.syncZoomState();

    const move = resolveMoveVector(input.state);
    if (move.magnitude === 0) {
      return;
    }

    const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
    const distance = playerRig.speedMetersPerSecond * deltaSeconds;

    playerRig.root.position.x += move.x * distance;
    playerRig.root.position.z += move.z * distance;
  });

  scene.metadata = {
    ...scene.metadata,
    reviewRuntime: {
      checkpoints: MAIN_STAGE_REVIEW_ROUTE,
      cameraRig,
      lightingRig,
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
