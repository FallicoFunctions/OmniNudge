import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { parsePerfFlags } from './perfFlags';
import './webgpuShaders';
import '@babylonjs/core/Shaders/bloomMerge.fragment';
import '@babylonjs/core/Shaders/extractHighlights.fragment';
import '@babylonjs/core/Shaders/fxaa.fragment';
import '@babylonjs/core/Shaders/fxaa.vertex';
import '@babylonjs/core/Shaders/imageProcessing.fragment';
import '@babylonjs/core/Shaders/kernelBlur.fragment';
import '@babylonjs/core/Shaders/kernelBlur.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  stepAdaptiveResolution,
} from './adaptiveResolutionMath';
import type { createMainStageScene } from '../scene/createMainStageScene';
import { createDebugPanel } from '../ui/createDebugPanel';
import { createPerfOverlay, updatePerfOverlay } from '../ui/createPerfOverlay';
import { createReviewHud } from '../ui/createReviewHud';
import { createRuntimeLoadingOverlay } from '../ui/createRuntimeLoadingOverlay';
import { RUNTIME_CONFIG } from './runtimeConfig';

type RuntimeEngine = Engine | WebGPUEngine;

declare global {
  interface Window {
    __OMNIRAVE_RUNTIME__?: {
      canvas: HTMLCanvasElement;
      debugPanel?: HTMLElement;
      dispose: () => void;
      engine: RuntimeEngine;
      host: HTMLElement;
      hud?: HTMLElement;
      perfOverlay?: HTMLElement;
      scene: Awaited<ReturnType<typeof createMainStageScene>>;
    };
  }
}

function createWebGlEngine(canvas: HTMLCanvasElement) {
  return new Engine(canvas, true, {
    stencil: true,
    // Render at the display's true pixel density. Without this, Babylon
    // defaults to CSS-pixel resolution and the browser upscales the buffer,
    // so the whole scene renders soft/pixelated on high-DPI (retina)
    // screens.
    adaptToDeviceRatio: true,
  });
}

async function createBabylonEngine(canvas: HTMLCanvasElement, forceWebGl: boolean): Promise<RuntimeEngine> {
  if (!forceWebGl) {
    let webgpu: WebGPUEngine | undefined;

    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        webgpu = new WebGPUEngine(canvas, {
          adaptToDeviceRatio: true,
          antialias: true,
        });
        await webgpu.initAsync();
        return webgpu;
      }
    } catch {
      // A rejected adapter/device request must not leave a partial WebGPU
      // engine alive or prevent the supported WebGL fallback from booting.
      try {
        webgpu?.dispose();
      } catch {
        // Continue to WebGL even if the failed engine cannot finish teardown.
      }
    }
  }

  return createWebGlEngine(canvas);
}

export async function createRuntime(host: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.id = RUNTIME_CONFIG.defaultCanvasId;
  canvas.dataset.testid = RUNTIME_CONFIG.defaultCanvasId;
  canvas.className = 'babylon-render-canvas';
  host.appendChild(canvas);

  // WebGPU is the default engine where supported: the venue is
  // draw-submission-bound and WebGPU removes that floor (validated
  // in-session: 53fps shared-GPU where WebGL managed 45 solo). WebGL
  // remains the automatic fallback, and ?perf=webgl forces it for
  // debugging comparisons.
  const perfFlags = parsePerfFlags(window.location.search);
  let engine: RuntimeEngine | undefined;
  let hud: HTMLElement | undefined;
  let perfOverlay: HTMLElement | undefined;
  let debugPanel: HTMLElement | undefined;
  let loadingOverlay: HTMLElement | undefined;
  let handleCanvasPick: ((event: MouseEvent) => void) | undefined;
  let handleResize: (() => void) | undefined;
  let disposed = false;

  const cleanupOwnedResources = () => {
    if (disposed) {
      return;
    }
    disposed = true;

    if (engine && window.__OMNIRAVE_RUNTIME__?.engine === engine) {
      delete window.__OMNIRAVE_RUNTIME__;
    }
    if (handleCanvasPick) {
      canvas.removeEventListener('click', handleCanvasPick);
    }
    if (handleResize) {
      window.removeEventListener('resize', handleResize);
    }
    debugPanel?.remove();
    perfOverlay?.remove();
    hud?.remove();
    loadingOverlay?.remove();
    canvas.remove();
  };

  try {
    engine = await createBabylonEngine(canvas, perfFlags.webgl);
    const activeEngine = engine;

    // Cap the effective render density: full retina (2x) quadruples the pixel
    // cost of this heavy scene, but 1.5x is still visibly crisp at roughly half
    // that cost — the sweet spot between "pixelated" and "unplayable".
    const MAX_RENDER_RATIO = 1.5;
    const deviceRatio = window.devicePixelRatio || 1;
    if (deviceRatio > MAX_RENDER_RATIO) {
      // The adaptive controller's sharpest bound mirrors this same cap.
      activeEngine.setHardwareScalingLevel(ADAPTIVE_RESOLUTION_DEFAULTS.sharpestLevel);
    }

    handleResize = () => {
      activeEngine.resize();
    };
    loadingOverlay = createRuntimeLoadingOverlay(host);

    // Keep the engine/bootstrap chunk small; scene construction brings in the
    // full Main Stage graph and can load behind the visible boot overlay.
    const { createMainStageScene: createScene } = await import('../scene/createMainStageScene');
    const scene = await createScene(activeEngine);
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

    const dispose = () => {
      if (disposed) {
        return;
      }
      cleanupOwnedResources();
      activeEngine.dispose();
    };
    const runtime = {
      canvas,
      debugPanel,
      dispose,
      engine: activeEngine,
      host,
      hud,
      perfOverlay,
      scene,
    };
    window.__OMNIRAVE_RUNTIME__ = runtime;
    loadingOverlay.remove();

    let perfFrameCounter = 0;
    let adaptiveState = createAdaptiveResolutionState(
      ADAPTIVE_RESOLUTION_DEFAULTS,
      activeEngine.getHardwareScalingLevel(),
    );
    let pendingHardwareScalingLevel: number | undefined;
    activeEngine.runRenderLoop(() => {
      // WebGPU submits the command buffers recorded by scene.render() after
      // this callback returns. Resizing here, before recording the next frame,
      // prevents setHardwareScalingLevel() from destroying the swapchain
      // texture still referenced by the current submission.
      if (pendingHardwareScalingLevel !== undefined) {
        activeEngine.setHardwareScalingLevel(pendingHardwareScalingLevel);
        pendingHardwareScalingLevel = undefined;
      }
      scene.render();
      perfFrameCounter += 1;
      if (perfFrameCounter % 30 === 0) {
        const fps = activeEngine.getFps();

        // Hold the FPS target by trading render scale, never frame pacing:
        // sharp when the GPU can afford it, gracefully coarser when not.
        const nextState = stepAdaptiveResolution(adaptiveState, ADAPTIVE_RESOLUTION_DEFAULTS, fps, performance.now());
        if (nextState.level !== adaptiveState.level) {
          pendingHardwareScalingLevel = nextState.level;
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
    activeEngine.onDisposeObservable.addOnce(cleanupOwnedResources);

    return { ...runtime, config: RUNTIME_CONFIG };
  } catch (error) {
    cleanupOwnedResources();
    try {
      engine?.dispose();
    } catch {
      // Preserve the startup error after best-effort engine teardown.
    }
    throw error;
  }
}
