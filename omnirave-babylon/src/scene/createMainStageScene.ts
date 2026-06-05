import { Color4, FreeCamera, Scene, Vector3 } from '@babylonjs/core';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

export async function createMainStageScene(engine: AbstractEngine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);

  const camera = new FreeCamera('review-camera', new Vector3(0, 1.6, -6), scene);
  camera.setTarget(Vector3.Zero());

  return scene;
}
