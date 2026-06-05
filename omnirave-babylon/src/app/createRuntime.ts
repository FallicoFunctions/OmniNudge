import { Engine } from '@babylonjs/core/Engines/engine';
import { createMainStageScene } from '../scene/createMainStageScene';
import { createReviewHud } from '../ui/createReviewHud';
import { RUNTIME_CONFIG } from './runtimeConfig';

export async function createRuntime(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.id = RUNTIME_CONFIG.defaultCanvasId;
  canvas.dataset.testid = RUNTIME_CONFIG.defaultCanvasId;
  canvas.className = 'babylon-render-canvas';
  host.appendChild(canvas);

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  const hud = createReviewHud(host);
  const scene = await createMainStageScene(engine);

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => {
    engine.resize();
  });

  return { engine, scene, canvas, hud, config: RUNTIME_CONFIG };
}
