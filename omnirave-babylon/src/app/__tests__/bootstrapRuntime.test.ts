import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    // Dev chrome (review HUD / perf overlay / debug panel) only appears when
    // explicitly requested. Most tests in this describe assert that chrome
    // exists, so opt in by default; the dedicated "no debug flag" test below
    // resets the URL before creating its runtime.
    window.history.replaceState(null, '', '/?debug=1');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
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
      getDeltaTime: vi.fn(() => 16),
      getHardwareScalingLevel: vi.fn(() => 1),
      onDisposeObservable: { addOnce: vi.fn() },
      resize: vi.fn(),
      runRenderLoop: vi.fn(),
      setHardwareScalingLevel: vi.fn(),
    };
    const EngineMock = vi.fn((_canvas: HTMLCanvasElement, _antialias: boolean, _options: Record<string, unknown>) => webglEngine);
    const scene = {
      metadata: {},
      getMeshByName: () => null,
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
      getDeltaTime: vi.fn(() => 16),
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
      getMeshByName: () => null,
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
      getDeltaTime: vi.fn(() => 16),
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
      getMeshByName: () => null,
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
      getDeltaTime: vi.fn(() => 16),
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
        getMeshByName: () => null,
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
        getDeltaTime: vi.fn(() => 16),
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
    let renderFrame: (() => void) | undefined;
    const engineRunRenderLoop = vi.fn((callback: () => void) => {
      renderFrame = callback;
    });
    const engineResize = vi.fn();
    const scenePick = vi.fn(() => ({
      hit: true,
      pickedMesh: { name: 'main-stage-wing-screen-right' },
    }));
    const sceneRender = vi.fn();
    const playerPositionSet = vi.fn();
    const applyCheckpointView = vi.fn();
    const routeProgressReset = vi.fn();
    const setAvatarColorway = vi.fn();
    const completionCelebrationStop = vi.fn();
    const scene = {
      getMeshByName: () => null,
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
          avatarColorways: [
            {
              id: 'aurora',
              label: 'Aurora',
              primaryHex: '#f4efe2',
              accentHex: '#68d8ff',
              emissiveHex: '#49b9ff',
            },
            {
              id: 'pulse',
              label: 'Pulse',
              primaryHex: '#352944',
              accentHex: '#67e2b0',
              emissiveHex: '#51ffc4',
            },
          ],
          cameraRig: {
            applyCheckpointView,
          },
          playerRig: {
            root: {
              position: {
                x: 1.25,
                y: 1.65,
                z: -47.5,
                set: playerPositionSet,
              },
            },
          },
          selectedAvatarColorway: {
            id: 'aurora',
            label: 'Aurora',
            primaryHex: '#f4efe2',
            accentHex: '#68d8ff',
            emissiveHex: '#49b9ff',
          },
          setAvatarColorway,
          completionCelebration: {
            stop: completionCelebrationStop,
          },
          routeProgress: {
            activeCheckpoint: {
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
            activeIndex: 0,
            completedCount: 0,
            complete: false,
            currentDistanceMeters: 12,
            reset: routeProgressReset,
            totalCount: 1,
          },
          playerController: {
            animationState: 'idle',
            currentSpeedMetersPerSecond: 4.5,
            grounded: true,
          },
          reviewAvatar: {
            root: {
              metadata: {
                animationState: 'run',
              },
            },
          },
        },
      },
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        getDeltaTime: vi.fn(() => 16),
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
    expect(host.querySelector('[data-debug-readout="mesh-pick"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-readout="player-state"]')).not.toBeNull();
    expect(host.querySelector('[data-review-objective]')).not.toBeNull();
    expect(host.querySelector('[data-avatar-colorway="aurora"]')?.getAttribute('aria-pressed')).toBe('true');
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
    expect(routeProgressReset).toHaveBeenCalledWith(0);
    // Fast travel converts the authored scenery view into the standard
    // follow framing: avatar centered, camera behind them along the
    // authored look direction (here due +z, so the camera sits at -z).
    expect(applyCheckpointView).toHaveBeenCalledWith({
      alpha: 0,
      beta: 1.12,
      radius: 7,
      focusOffset: { x: 0, y: -0.35, z: 0 },
      positionOffset: { x: 0, y: 2.25, z: -7 },
    });
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    renderFrame?.();
    expect(host.querySelector('[data-debug-readout="player-state"]')?.textContent).toBe(
      'Player: run grounded 4.5m/s @ 1.3,1.6,-47.5',
    );
    expect(host.querySelector('[data-review-objective]')?.textContent).toBe(
      'Objective: reach Spawn Reveal (0/1)',
    );
    expect(host.querySelector('[data-review-checkpoint="spawn_reveal"]')?.getAttribute('data-route-state')).toBe(
      'active',
    );
    host.querySelector<HTMLButtonElement>('[data-avatar-colorway="pulse"]')?.click();
    expect(setAvatarColorway).toHaveBeenCalledWith('pulse');
    expect(host.querySelector('[data-avatar-colorway="pulse"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(engineDispose).not.toHaveBeenCalled();

    // Play Again: stops any in-flight finale, resets route progress to the
    // start, teleports to the back-plaza spawn, and applies the same
    // standard follow framing fast-travel uses (default north-facing since
    // there's no authored checkpoint view to derive a look direction from).
    host.querySelector<HTMLButtonElement>('[data-review-restart]')?.click();
    expect(completionCelebrationStop).toHaveBeenCalledTimes(1);
    expect(routeProgressReset).toHaveBeenCalledWith(0);
    expect(playerPositionSet).toHaveBeenCalledWith(0, 1.7, -48);
    expect(applyCheckpointView).toHaveBeenCalledWith({
      alpha: 0,
      beta: 1.12,
      radius: 7,
      focusOffset: { x: 0, y: -0.35, z: 0 },
      positionOffset: { x: 0, y: 2.25, z: -7 },
    });

    runtime.dispose();
  });

  it('shows a loading overlay until the scene finishes booting', async () => {
    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();
    const deferredScene = createDeferredPromise<{
      metadata: { reviewRuntime: Record<string, never> };
      getMeshByName: () => null;
      pick: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
    }>();

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        getDeltaTime: vi.fn(() => 16),
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
      getMeshByName: () => null,
      pick: vi.fn(() => null),
      render: vi.fn(),
    });

    const runtime = await runtimePromise;

    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).toBeNull();
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    expect(engineDispose).not.toHaveBeenCalled();

    runtime.dispose();
  });

  it('creates only the render canvas when the debug flag is absent', async () => {
    window.history.replaceState(null, '', '/');

    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();
    const scenePick = vi.fn(() => null);
    const scene = {
      metadata: {},
      getMeshByName: () => null,
      pick: scenePick,
      render: vi.fn(),
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        getDeltaTime: vi.fn(() => 16),
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
    expect(host.querySelector('[data-testid="review-hud"]')).toBeNull();
    expect(host.querySelector('[data-testid="perf-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="debug-panel"]')).toBeNull();
    expect(runtime.hud).toBeUndefined();
    expect(runtime.perfOverlay).toBeUndefined();
    expect(runtime.debugPanel).toBeUndefined();
    // Without ?debug=1 the global isn't exposed at all - not even with its
    // dev-chrome fields undefined - so it can't be reached by page scripts.
    expect(window.__OMNIRAVE_RUNTIME__).toBeUndefined();

    // No canvas pick handler is wired up without debug chrome.
    host
      .querySelector<HTMLCanvasElement>('canvas[data-testid="babylon-render-canvas"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(scenePick).not.toHaveBeenCalled();

    // Render loop still runs and does not throw despite no HUD/overlay/panel.
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    const renderFrame = engineRunRenderLoop.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(() => renderFrame?.()).not.toThrow();

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
      createMainStageScene: vi.fn(async () => ({ getMeshByName: () => null, render: vi.fn() })),
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
