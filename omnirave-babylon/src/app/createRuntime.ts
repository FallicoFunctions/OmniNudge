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
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  stepAdaptiveResolution,
} from './adaptiveResolutionMath';
import { createMainStageScene } from '../scene/createMainStageScene';
import { createDebugPanel } from '../ui/createDebugPanel';
import { createPerfOverlay, updatePerfOverlay } from '../ui/createPerfOverlay';
import { createReviewHud } from '../ui/createReviewHud';
import { createRuntimeLoadingOverlay } from '../ui/createRuntimeLoadingOverlay';
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
    // Render at the display's true pixel density. Without this, Babylon
    // defaults to CSS-pixel resolution and the browser upscales the buffer,
    // so the whole scene renders soft/pixelated on high-DPI (retina) screens.
    adaptToDeviceRatio: true,
  });

  // Cap the effective render density: full retina (2x) quadruples the pixel
  // cost of this heavy scene, but 1.5x is still visibly crisp at roughly half
  // that cost — the sweet spot between "pixelated" and "unplayable".
  const MAX_RENDER_RATIO = 1.5;
  const deviceRatio = window.devicePixelRatio || 1;
  if (deviceRatio > MAX_RENDER_RATIO) {
    // The adaptive controller's sharpest bound mirrors this same cap.
    engine.setHardwareScalingLevel(ADAPTIVE_RESOLUTION_DEFAULTS.sharpestLevel);
  }

  const handleResize = () => {
    engine.resize();
  };

  let hud: HTMLElement | undefined;
  let perfOverlay: HTMLElement | undefined;
  let debugPanel: HTMLElement | undefined;
  const loadingOverlay = createRuntimeLoadingOverlay(host);
  let handleCanvasPick: ((event: MouseEvent) => void) | undefined;

  try {
    const scene = await createMainStageScene(engine);
    const reviewRuntime = scene.metadata?.reviewRuntime;
    hud = createReviewHud(host, {
      checkpoints: reviewRuntime?.checkpoints,
      onSelectCheckpoint(checkpoint) {
        reviewRuntime?.playerRig?.root.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
        if (checkpoint.camera) {
          // Defer one frame: the player's ground-height snap runs in the next
          // onBeforeRender, and applying the camera from the pre-snap player
          // position intermittently lands it inside nearby geometry.
          scene.onAfterRenderObservable.addOnce(() => {
            reviewRuntime?.cameraRig?.applyCheckpointView(checkpoint.camera);
          });
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
    loadingOverlay.remove();

    let perfFrameCounter = 0;
    let adaptiveState = createAdaptiveResolutionState(ADAPTIVE_RESOLUTION_DEFAULTS);
    engine.runRenderLoop(() => {
      scene.render();
      perfFrameCounter += 1;
      if (perfFrameCounter % 30 === 0) {
        const fps = engine.getFps();

        // Hold the FPS target by trading render scale, never frame pacing:
        // sharp when the GPU can afford it, gracefully coarser when not.
        const nextState = stepAdaptiveResolution(adaptiveState, ADAPTIVE_RESOLUTION_DEFAULTS, fps, performance.now());
        if (nextState.level !== adaptiveState.level) {
          engine.setHardwareScalingLevel(nextState.level);
        }
        adaptiveState = nextState;

        if (perfOverlay) {
          const activeFx = scene.activeCamera?._postProcesses?.filter(Boolean).length ?? 0;
          const shadowCasters =
            scene.metadata?.reviewRuntime?.lightingRig?.shadowGenerator?.getShadowMap()?.renderList?.length ?? 0;
          const readyTextures = scene.textures.filter((texture) => texture.isReady()).length;
          updatePerfOverlay(perfOverlay, fps, fps > 0 ? 1000 / fps : 0, activeFx, shadowCasters, readyTextures, adaptiveState.level);
        }
      }
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
    loadingOverlay.remove();
    canvas.remove();
    throw error;
  }
}
