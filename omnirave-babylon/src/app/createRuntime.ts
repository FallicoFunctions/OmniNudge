import { Engine } from '@babylonjs/core/Engines/engine';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import { createMainStageScene } from '../scene/createMainStageScene';
import { createDebugPanel } from '../ui/createDebugPanel';
import { createPerfOverlay } from '../ui/createPerfOverlay';
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

  const handleResize = () => {
    engine.resize();
  };

  let hud: HTMLElement | undefined;
  let perfOverlay: HTMLElement | undefined;
  let debugPanel: HTMLElement | undefined;

  try {
    hud = createReviewHud(host);
    const scene = await createMainStageScene(engine);
    perfOverlay = createPerfOverlay(host);
    debugPanel = createDebugPanel(host);

    engine.runRenderLoop(() => {
      scene.render();
    });

    window.addEventListener('resize', handleResize);

    return { engine, scene, canvas, hud, perfOverlay, debugPanel, config: RUNTIME_CONFIG };
  } catch (error) {
    window.removeEventListener('resize', handleResize);
    engine.dispose();
    debugPanel?.remove();
    perfOverlay?.remove();
    hud?.remove();
    canvas.remove();
    throw error;
  }
}
