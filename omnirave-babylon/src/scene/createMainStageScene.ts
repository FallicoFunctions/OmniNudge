import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createInputMap } from '../player/createInputMap';
import { createPlayerRig } from '../player/createPlayerRig';
import { resolveMoveVector } from '../player/movementMath';

export async function createMainStageScene(engine: AbstractEngine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  scene.collisionsEnabled = true;

  const light = new HemisphericLight('review-key-light', new Vector3(0, 1, 0), scene);
  light.intensity = 0.9;

  const input = createInputMap(window);
  const playerRig = createPlayerRig(scene, new Vector3(0, 0, 0));
  const cameraRig = createFollowCameraRig(scene, playerRig.root);

  scene.activeCamera = cameraRig.camera;

  const canvas = engine.getRenderingCanvas?.();
  if (canvas) {
    cameraRig.camera.attachControl(canvas, true);
  }

  scene.onBeforeRenderObservable.add(() => {
    const move = resolveMoveVector(input.state);
    if (move.magnitude === 0) {
      return;
    }

    const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
    const distance = playerRig.speedMetersPerSecond * deltaSeconds;

    playerRig.root.position.x += move.x * distance;
    playerRig.root.position.z += move.z * distance;
    cameraRig.syncZoomState();
  });

  scene.metadata = {
    ...scene.metadata,
    reviewRuntime: {
      cameraRig,
      input,
      light,
      playerRig,
    },
  };

  scene.onDisposeObservable.add(() => {
    input.dispose();
    cameraRig.camera.detachControl();
  });

  return scene;
}
