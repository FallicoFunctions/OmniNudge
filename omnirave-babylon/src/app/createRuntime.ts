import { Engine } from '@babylonjs/core/Engines/engine';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { createMainStageScene } from '../scene/createMainStageScene';
import { createReviewHud } from '../ui/createReviewHud';
import { RUNTIME_CONFIG } from './runtimeConfig';

function shouldUseNullEngine() {
  return typeof navigator !== 'undefined' && /\bjsdom\b/i.test(navigator.userAgent);
}

export async function createRuntime(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.id = RUNTIME_CONFIG.defaultCanvasId;
  canvas.dataset.testid = RUNTIME_CONFIG.defaultCanvasId;
  canvas.className = 'babylon-render-canvas';
  host.appendChild(canvas);

  const engine = shouldUseNullEngine()
    ? new NullEngine({
        renderWidth: 1,
        renderHeight: 1,
        textureSize: 1,
        deterministicLockstep: false,
        lockstepMaxSteps: 1,
      })
    : new Engine(canvas, true, {
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
