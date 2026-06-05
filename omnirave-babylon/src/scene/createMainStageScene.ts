import { Color4, Scene } from '@babylonjs/core';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

export async function createMainStageScene(engine: AbstractEngine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  return scene;
}
