import { beforeEach, describe, expect, it, vi } from 'vitest';

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function loadBootstrapRuntime(
  createRuntimeImpl: (host: HTMLElement) => Promise<unknown>,
) {
  vi.resetModules();
  vi.doMock('../createRuntime', () => ({
    createRuntime: vi.fn(createRuntimeImpl),
  }));

  const module = await import('../bootstrapRuntime');
  const runtimeModule = await import('../createRuntime');

  return {
    bootstrapRuntime: module.bootstrapRuntime,
    createRuntimeMock: vi.mocked(runtimeModule.createRuntime),
  };
}

describe('bootstrapRuntime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates a render canvas and review HUD once', async () => {
    const { bootstrapRuntime, createRuntimeMock } = await loadBootstrapRuntime(async (host) => {
      const canvas = document.createElement('canvas');
      canvas.dataset.testid = 'babylon-render-canvas';
      host.appendChild(canvas);

      const hud = document.createElement('aside');
      hud.dataset.testid = 'review-hud';
      host.appendChild(hud);
    });

    document.body.innerHTML = '<div id="app"></div>';

    await bootstrapRuntime();
    await bootstrapRuntime();

    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).not.toBeNull();
    expect(createRuntimeMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up failed initialization, reports it visibly, and retries in place', async () => {
    let attempts = 0;
    const { bootstrapRuntime, createRuntimeMock } = await loadBootstrapRuntime(async (host) => {
      attempts += 1;

      const canvas = document.createElement('canvas');
      canvas.dataset.testid = 'babylon-render-canvas';
      host.appendChild(canvas);

      const hud = document.createElement('aside');
      hud.dataset.testid = 'review-hud';
      host.appendChild(hud);

      if (attempts === 1) {
        throw new Error('scene failed');
      }
    });

    document.body.innerHTML = '<div id="app"></div>';

    await expect(bootstrapRuntime()).rejects.toThrow('scene failed');
    expect(document.querySelector('[data-testid="babylon-runtime-host"]')).not.toBeNull();
    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).toBeNull();
    expect(document.querySelector('[data-testid="runtime-error-overlay"]')?.getAttribute('role')).toBe('alert');
    expect(document.body.textContent).toContain('Main Stage could not start');

    document.querySelector<HTMLButtonElement>('[data-testid="runtime-retry"]')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    });

    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="runtime-error-overlay"]')).toBeNull();
    expect(createRuntimeMock).toHaveBeenCalledTimes(2);
  });
});

describe('createRuntime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.__OMNIRAVE_RUNTIME__;
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../createRuntime');
    vi.doUnmock('../../scene/createMainStageScene');
    vi.doUnmock('@babylonjs/core/Engines/engine');
    vi.doUnmock('@babylonjs/core/Engines/webgpuEngine');
  });

  it('disposes a failed WebGPU engine and falls back to WebGL', async () => {
    const webgpuDispose = vi.fn();
    const webgpuInit = vi.fn().mockRejectedValue(new Error('WebGPU adapter failed'));
    const WebGPUEngineMock = Object.assign(
      vi.fn(() => ({
        dispose: webgpuDispose,
        initAsync: webgpuInit,
      })),
      { IsSupportedAsync: Promise.resolve(true) },
    );
    const webglEngine = {
      dispose: vi.fn(),
      getFps: vi.fn(() => 60),
      getHardwareScalingLevel: vi.fn(() => 1),
      onDisposeObservable: { addOnce: vi.fn() },
      resize: vi.fn(),
      runRenderLoop: vi.fn(),
      setHardwareScalingLevel: vi.fn(),
    };
    const EngineMock = vi.fn((_canvas: HTMLCanvasElement, _antialias: boolean, _options: Record<string, unknown>) => webglEngine);
    const scene = {
      metadata: {},
      pick: vi.fn(() => null),
      render: vi.fn(),
    };

    vi.doMock('@babylonjs/core/Engines/webgpuEngine', () => ({
      WebGPUEngine: WebGPUEngineMock,
    }));
    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: EngineMock,
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => scene),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');
    const runtime = await createRuntime(host);

    expect(webgpuInit).toHaveBeenCalledTimes(1);
    expect(webgpuDispose).toHaveBeenCalledTimes(1);
    expect(EngineMock).toHaveBeenCalledTimes(1);
    expect(EngineMock.mock.calls[0]?.[2]).not.toHaveProperty('preserveDrawingBuffer');
    expect(runtime.engine).toBe(webglEngine);
    expect(webglEngine.getHardwareScalingLevel).toHaveBeenCalledTimes(1);

    runtime.dispose();
  });

  it('disposes a successful runtime and removes all owned resources', async () => {
    let notifyEngineDisposed: (() => void) | undefined;
    const engineDispose = vi.fn(() => notifyEngineDisposed?.());
    const engineResize = vi.fn();
    const engine = {
      dispose: engineDispose,
      getFps: vi.fn(() => 60),
      getHardwareScalingLevel: vi.fn(() => 1),
      onDisposeObservable: {
        addOnce: vi.fn((callback: () => void) => {
          notifyEngineDisposed = callback;
        }),
      },
      resize: engineResize,
      runRenderLoop: vi.fn(),
      setHardwareScalingLevel: vi.fn(),
    };
    const scenePick = vi.fn(() => null);
    const scene = {
      metadata: {},
      pick: scenePick,
      render: vi.fn(),
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => engine),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => scene),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');
    const runtime = await createRuntime(host);
    const canvas = runtime.canvas;

    window.dispatchEvent(new Event('resize'));
    canvas.dispatchEvent(new MouseEvent('click'));
    expect(engineResize).toHaveBeenCalledTimes(1);
    expect(scenePick).toHaveBeenCalledTimes(1);

    runtime.dispose();
    runtime.dispose();

    expect(engineDispose).toHaveBeenCalledTimes(1);
    expect(window.__OMNIRAVE_RUNTIME__).toBeUndefined();
    expect(host.children).toHaveLength(0);

    window.dispatchEvent(new Event('resize'));
    canvas.dispatchEvent(new MouseEvent('click'));
    expect(engineResize).toHaveBeenCalledTimes(1);
    expect(scenePick).toHaveBeenCalledTimes(1);
  });

  it('applies adaptive resolution before the next render instead of invalidating the submitted WebGPU frame', async () => {
    const frameEvents: string[] = [];
    let renderFrame: (() => void) | undefined;
    const setHardwareScalingLevel = vi.fn(() => frameEvents.push('scale'));
    const engine = {
      dispose: vi.fn(),
      getFps: vi.fn(() => 30),
      getHardwareScalingLevel: vi.fn(() => 1 / 1.5),
      onDisposeObservable: { addOnce: vi.fn() },
      resize: vi.fn(),
      runRenderLoop: vi.fn((callback: () => void) => {
        renderFrame = callback;
      }),
      setHardwareScalingLevel,
    };
    const scene = {
      activeCamera: undefined,
      metadata: {},
      pick: vi.fn(() => null),
      render: vi.fn(() => frameEvents.push('render')),
      textures: [],
    };
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0).mockReturnValue(2_000);

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => engine),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => scene),
    }));

    const { createRuntime } = await import('../createRuntime');
    const runtime = await createRuntime(document.createElement('div'));

    expect(renderFrame).toBeTypeOf('function');
    for (let frame = 0; frame < 60; frame += 1) {
      renderFrame?.();
    }
    expect(setHardwareScalingLevel).not.toHaveBeenCalled();

    frameEvents.length = 0;
    renderFrame?.();

    expect(frameEvents.slice(0, 2)).toEqual(['scale', 'render']);
    expect(setHardwareScalingLevel).toHaveBeenCalledTimes(1);
    runtime.dispose();
    now.mockRestore();
  });

  it('cleans up owned resources when the engine is disposed externally', async () => {
    let notifyEngineDisposed: (() => void) | undefined;
    const engineDispose = vi.fn(() => notifyEngineDisposed?.());
    const engine = {
      dispose: engineDispose,
      getFps: vi.fn(() => 60),
      getHardwareScalingLevel: vi.fn(() => 1),
      onDisposeObservable: {
        addOnce: vi.fn((callback: () => void) => {
          notifyEngineDisposed = callback;
        }),
      },
      resize: vi.fn(),
      runRenderLoop: vi.fn(),
      setHardwareScalingLevel: vi.fn(),
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => engine),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => ({
        metadata: {},
        pick: vi.fn(() => null),
        render: vi.fn(),
      })),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');
    const runtime = await createRuntime(host);

    engine.dispose();

    expect(window.__OMNIRAVE_RUNTIME__).toBeUndefined();
    expect(host.children).toHaveLength(0);
    runtime.dispose();
    expect(engineDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the engine and removes DOM nodes when scene creation fails', async () => {
    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        getHardwareScalingLevel: vi.fn(() => 1),
        onDisposeObservable: { addOnce: vi.fn() },
        runRenderLoop: engineRunRenderLoop,
        resize: engineResize,
        setHardwareScalingLevel: vi.fn(),
      })),
    }));

    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => {
        throw new Error('scene failed');
      }),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');

    await expect(createRuntime(host)).rejects.toThrow('scene failed');

    expect(engineDispose).toHaveBeenCalledTimes(1);
    expect(engineRunRenderLoop).not.toHaveBeenCalled();
    expect(host.querySelector('canvas[data-testid="babylon-render-canvas"]')).toBeNull();
    expect(host.querySelector('[data-testid="review-hud"]')).toBeNull();
    expect(host.querySelector('[data-testid="perf-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="debug-panel"]')).toBeNull();
  });

  it('renders review instrumentation after successful runtime creation', async () => {
    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();
    const scenePick = vi.fn(() => ({
      hit: true,
      pickedMesh: { name: 'main-stage-wing-screen-right' },
    }));
    const sceneRender = vi.fn();
    const playerPositionSet = vi.fn();
    const applyCheckpointView = vi.fn();
    const scene = {
      pick: scenePick,
      render: sceneRender,
      onAfterRenderObservable: {
        // The runtime defers checkpoint camera application by one frame;
        // in the mock, run it immediately.
        addOnce: (callback: () => void) => callback(),
      },
      metadata: {
        reviewRuntime: {
          checkpoints: [
            {
              id: 'spawn_reveal',
              x: 0,
              y: 1.7,
              z: -48,
              camera: {
                alpha: -Math.PI / 2,
                beta: 1.08,
                radius: 60,
                focusOffset: { x: 0, y: 8, z: 44 },
                positionOffset: { x: 0, y: 26.3, z: -57 },
              },
            },
          ],
          cameraRig: {
            applyCheckpointView,
          },
          playerRig: {
            root: {
              position: {
                set: playerPositionSet,
              },
            },
          },
        },
      },
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        getHardwareScalingLevel: vi.fn(() => 1),
        onDisposeObservable: { addOnce: vi.fn() },
        runRenderLoop: engineRunRenderLoop,
        resize: engineResize,
        setHardwareScalingLevel: vi.fn(),
      })),
    }));

    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => scene),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');

    const runtime = await createRuntime(host);

    expect(host.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="review-hud"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="perf-overlay"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="debug-panel"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-toggle="collision"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-toggle="routes"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-toggle="lighting"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-readout="mesh-pick"]')).not.toBeNull();
    expect(window.__OMNIRAVE_RUNTIME__).toMatchObject({
      canvas: expect.any(HTMLCanvasElement),
      debugPanel: expect.any(HTMLElement),
      engine: expect.any(Object),
      host,
      hud: expect.any(HTMLElement),
      perfOverlay: expect.any(HTMLElement),
      scene,
    });
    host
      .querySelector<HTMLCanvasElement>('canvas[data-testid="babylon-render-canvas"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(scenePick).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-debug-readout="mesh-pick"]')?.textContent).toContain(
      'main-stage-wing-screen-right',
    );
    host.querySelector<HTMLButtonElement>('[data-review-checkpoint="spawn_reveal"]')?.click();
    expect(playerPositionSet).toHaveBeenCalledWith(0, 1.7, -48);
    expect(applyCheckpointView).toHaveBeenCalledWith({
      alpha: -Math.PI / 2,
      beta: 1.08,
      radius: 60,
      focusOffset: { x: 0, y: 8, z: 44 },
      positionOffset: { x: 0, y: 26.3, z: -57 },
    });
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    expect(engineDispose).not.toHaveBeenCalled();

    runtime.dispose();
  });

  it('shows a loading overlay until the scene finishes booting', async () => {
    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();
    const deferredScene = createDeferredPromise<{
      metadata: { reviewRuntime: Record<string, never> };
      pick: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
    }>();

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        getHardwareScalingLevel: vi.fn(() => 1),
        onDisposeObservable: { addOnce: vi.fn() },
        runRenderLoop: engineRunRenderLoop,
        resize: engineResize,
        setHardwareScalingLevel: vi.fn(),
      })),
    }));

    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(() => deferredScene.promise),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');

    const runtimePromise = createRuntime(host);
    await vi.waitFor(() => {
      expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    });
    expect(host.textContent).toContain('Loading Main Stage');
    expect(host.querySelector('[data-testid="review-hud"]')).toBeNull();

    deferredScene.resolve({
      metadata: { reviewRuntime: {} },
      pick: vi.fn(() => null),
      render: vi.fn(),
    });

    const runtime = await runtimePromise;

    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).toBeNull();
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    expect(engineDispose).not.toHaveBeenCalled();

    runtime.dispose();
  });

  it('registers the Babylon runtime shaders required by GLB materials and presentation post-processes', async () => {
    const { ShaderStore } = await import('@babylonjs/core/Engines/shaderStore.js');

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: vi.fn(),
        runRenderLoop: vi.fn(),
        resize: vi.fn(),
      })),
    }));

    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => ({ render: vi.fn() })),
    }));

    await import('../createRuntime');

    expect(ShaderStore.ShadersStore.pbrVertexShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.pbrPixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.rgbdDecodePixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.imageProcessingPixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.extractHighlightsPixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.kernelBlurPixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.kernelBlurVertexShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.bloomMergePixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.fxaaPixelShader).toEqual(expect.any(String));
    expect(ShaderStore.ShadersStore.fxaaVertexShader).toEqual(expect.any(String));
  });
});
