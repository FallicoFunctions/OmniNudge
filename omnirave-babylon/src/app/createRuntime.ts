import { Engine } from '@babylonjs/core/Engines/engine';
import '@babylonjs/core/Shaders/bloomMerge.fragment';
import '@babylonjs/core/Shaders/extractHighlights.fragment';
import '@babylonjs/core/Shaders/fxaa.fragment';
import '@babylonjs/core/Shaders/fxaa.vertex';
import '@babylonjs/core/Shaders/imageProcessing.fragment';
import '@babylonjs/core/Shaders/kernelBlur.fragment';
import '@babylonjs/core/Shaders/kernelBlur.vertex';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import { createMainStageScene } from '../scene/createMainStageScene';
import { createDebugPanel } from '../ui/createDebugPanel';
import { createPerfOverlay } from '../ui/createPerfOverlay';
import { createReviewHud } from '../ui/createReviewHud';
import { RUNTIME_CONFIG } from './runtimeConfig';

declare global {
  interface Window {
    __OMNIRAVE_RUNTIME__?: {
      canvas: HTMLCanvasElement;
      debugPanel?: HTMLElement;
      engine: Engine;
      host: HTMLElement;
      hud?: HTMLElement;
      perfOverlay?: HTMLElement;
      scene: Awaited<ReturnType<typeof createMainStageScene>>;
    };
  }
}

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
  let handleCanvasPick: ((event: MouseEvent) => void) | undefined;

  try {
    const scene = await createMainStageScene(engine);
    const reviewRuntime = scene.metadata?.reviewRuntime;
    hud = createReviewHud(host, {
      checkpoints: reviewRuntime?.checkpoints,
      onSelectCheckpoint(checkpoint) {
        reviewRuntime?.playerRig?.root.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
        if (checkpoint.camera) {
          reviewRuntime?.cameraRig?.applyCheckpointView(checkpoint.camera);
        }
      },
    });
    perfOverlay = createPerfOverlay(host);
    debugPanel = createDebugPanel(host);
    const pickReadout = debugPanel.querySelector<HTMLOutputElement>('[data-debug-readout="mesh-pick"]');

    handleCanvasPick = (event: MouseEvent) => {
      if (!pickReadout) {
        return;
      }

      const pick = scene.pick(event.offsetX ?? 0, event.offsetY ?? 0);
      pickReadout.value = pick?.pickedMesh?.name ?? 'none';
      pickReadout.textContent = `Pick: ${pick?.pickedMesh?.name ?? 'none'}`;
    };
    canvas.addEventListener('click', handleCanvasPick);

    window.__OMNIRAVE_RUNTIME__ = {
      canvas,
      debugPanel,
      engine,
      host,
      hud,
      perfOverlay,
      scene,
    };

    engine.runRenderLoop(() => {
      scene.render();
    });

    window.addEventListener('resize', handleResize);

    return { engine, scene, canvas, hud, perfOverlay, debugPanel, config: RUNTIME_CONFIG };
  } catch (error) {
    delete window.__OMNIRAVE_RUNTIME__;
    if (handleCanvasPick) {
      canvas.removeEventListener('click', handleCanvasPick);
    }
    window.removeEventListener('resize', handleResize);
    engine.dispose();
    debugPanel?.remove();
    perfOverlay?.remove();
    hud?.remove();
    canvas.remove();
    throw error;
  }
}
