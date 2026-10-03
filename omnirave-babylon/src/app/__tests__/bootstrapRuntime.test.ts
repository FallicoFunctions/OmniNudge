import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockShowControlRuntime } from './mockShowControlRuntime';

let displayTargetFps = 60;
const disposeDisplayRefresh = vi.fn();

// Vitest 5 cannot call a mock built on an arrow function with `new`, and the
// runtime constructs Babylon's engines and the browser's Audio with `new`. A
// regular function can be constructed, returns what make() returns, and the
// mock still records every argument.
function constructible<A extends unknown[], R>(make: (...args: A) => R) {
  return vi.fn(function (...args: A) {
    return make(...args);
  });
}

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
    displayTargetFps = 60;
    vi.doMock('../displayRefreshRate', () => ({
      createDisplayRefreshMonitor: () => ({ get targetFps() { return displayTargetFps; }, dispose: disposeDisplayRefresh }),
    }));
    vi.doUnmock('../createRuntime');
    vi.doUnmock('../../scene/createMainStageScene');
    vi.doUnmock('@babylonjs/core/Engines/engine');
    vi.doUnmock('@babylonjs/core/Engines/webgpuEngine');
    mockShowControlRuntime();
    // Dev chrome (review HUD / perf overlay / debug panel) only appears when
    // explicitly requested. Most tests in this describe assert that chrome
    // exists, so opt in by default; the dedicated "no debug flag" test below
    // resets the URL before creating its runtime.
    window.history.replaceState(null, '', '/?debug=1');
  });

  afterEach(async () => {
    // Failed boots can leave preloaded modules in flight. Drain them before
    // the next test resets the module cache and replaces its engine/scene.
    await vi.dynamicImportSettled();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.doUnmock('../../scene/createCrownEffects');
  });

  it.each(['rejection', 'timeout'] as const)('recovers from WebGPU %s with a new WebGL canvas', async failure => {
    const webgpuDispose = vi.fn();
    const pending = createDeferredPromise<void>();
    const webgpuInit = vi.fn(() => failure === 'timeout' ? pending.promise : Promise.reject(new Error('WebGPU adapter failed')));
    const WebGPUEngineMock = Object.assign(
      constructible((_canvas: HTMLCanvasElement) => ({
        dispose: webgpuDispose,
        initAsync: webgpuInit,
      })),
      { IsSupportedAsync: Promise.resolve(true) },
    );
    const webglEngine = {
      dispose: vi.fn(),
      _drawCalls: { current: 123 },
      onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => 60),
      getDeltaTime: vi.fn(() => 16),
      getHardwareScalingLevel: vi.fn(() => 1),
      onDisposeObservable: { addOnce: vi.fn() },
      resize: vi.fn(),
      runRenderLoop: vi.fn(),
      setHardwareScalingLevel: vi.fn(),
    };
    const EngineMock = constructible((_canvas: HTMLCanvasElement, _antialias: boolean, _options: Record<string, unknown>) => webglEngine);
    const scene = {
      metadata: {},
      getMeshByName: () => null,
      pick: vi.fn(() => null),
      isReady: () => true,
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
    if (failure === 'timeout') vi.useFakeTimers();
    const starting = createRuntime(host);
    if (failure === 'timeout') {
      await vi.waitFor(() => expect(webgpuInit).toHaveBeenCalledTimes(1));
      expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    const runtime = await starting;

    expect(webgpuInit).toHaveBeenCalledTimes(1);
    expect(webgpuDispose).toHaveBeenCalledTimes(1);
    expect(EngineMock).toHaveBeenCalledTimes(1);
    expect(EngineMock.mock.calls[0]?.[2]).not.toHaveProperty('preserveDrawingBuffer');
    expect(runtime.engine).toBe(webglEngine);
    expect(EngineMock.mock.calls[0]?.[0]).not.toBe(WebGPUEngineMock.mock.calls[0]?.[0]);
    expect(host.querySelector('canvas')).toBe(EngineMock.mock.calls[0]?.[0]);
    expect(webglEngine.getHardwareScalingLevel).toHaveReturnedWith(1);

    if (failure === 'timeout') {
      pending.resolve();
      await Promise.resolve();
      expect(webgpuDispose).toHaveBeenCalledTimes(2);
      expect(runtime.engine).toBe(webglEngine);
    }

    runtime.dispose();
  });

  it('uses WebGL in Firefox even when WebGPU is offered', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0');
    const WebGPUEngineMock = Object.assign(constructible(() => ({ dispose: vi.fn(), initAsync: vi.fn(async () => {}) })),
      { IsSupportedAsync: Promise.resolve(true) });
    const webglEngine = {
      dispose: vi.fn(), onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: () => 60, getDeltaTime: () => 16, getHardwareScalingLevel: () => 1,
      onDisposeObservable: { addOnce: vi.fn() }, resize: vi.fn(), runRenderLoop: vi.fn(), setHardwareScalingLevel: vi.fn(),
    };
    const EngineMock = constructible(() => webglEngine);
    vi.doMock('@babylonjs/core/Engines/webgpuEngine', () => ({ WebGPUEngine: WebGPUEngineMock }));
    vi.doMock('@babylonjs/core/Engines/engine', () => ({ Engine: EngineMock }));
    vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene: vi.fn(async () => ({
      metadata: {}, getMeshByName: () => null, pick: vi.fn(() => null), isReady: () => true, render: vi.fn(),
    })) }));
    const { createRuntime } = await import('../createRuntime');
    const runtime = await createRuntime(document.createElement('div'));
    expect(WebGPUEngineMock).not.toHaveBeenCalled();
    expect(runtime.engine === (webglEngine as unknown)).toBe(true);
    runtime.dispose();
    vi.restoreAllMocks();
  });

  it('disposes a successful runtime and removes all owned resources', async () => {
    let notifyEngineDisposed: (() => void) | undefined;
    const engineDispose = vi.fn(() => notifyEngineDisposed?.());
    const engineResize = vi.fn();
    const engine = {
      dispose: engineDispose,
      _drawCalls: { current: 123 },
      onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
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
      isReady: () => true,
      render: vi.fn(),
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => engine),
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
    expect(disposeDisplayRefresh).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('resize'));
    canvas.dispatchEvent(new MouseEvent('click'));
    expect(engineResize).toHaveBeenCalledTimes(1);
    expect(scenePick).toHaveBeenCalledTimes(1);
  });

  it.each([
    { search: '/', antialias: false, timestamps: false, supported: true },
    { search: '/?perf=nopost', antialias: true, timestamps: false, supported: true },
    { search: '/?debug=1&gpuBundles=0', antialias: false, timestamps: false, supported: true },
    { search: '/?gpuBundles=0', antialias: false, timestamps: false, supported: true },
    { search: '/?debug=1&backbufferMsaa=1', antialias: true, timestamps: false, supported: true },
    { search: '/?backbufferMsaa=1&gpuProfile=1', antialias: false, timestamps: false, supported: true },
    { search: '/?debug=1&gpuProfile=1', antialias: false, timestamps: true, supported: true },
    { search: '/?debug=1&gpuProfile=1', antialias: false, timestamps: true, supported: false },
  ])('configures WebGPU output and optional timing for $search (timers: $supported)', async test => {
    window.history.replaceState(null, '', test.search);
    const engine = {
      dispose: vi.fn(), initAsync: vi.fn(async () => {}), enableGPUTimingMeasurements: false,
      compatibilityMode: false,
      getCaps: () => ({ timerQuery: test.supported }),
      _drawCalls: { current: 123 },
      onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: () => 60, getDeltaTime: () => 16, getHardwareScalingLevel: () => 1,
      onDisposeObservable: { addOnce: vi.fn() }, resize: vi.fn(), runRenderLoop: vi.fn(), setHardwareScalingLevel: vi.fn(),
    };
    const factory = Object.assign(constructible((_canvas: HTMLCanvasElement, _options: Record<string, unknown>) => engine),
      { IsSupportedAsync: Promise.resolve(true) });
    vi.doMock('@babylonjs/core/Engines/webgpuEngine', () => ({ WebGPUEngine: factory }));
    const createScene = vi.fn(async () => {
      // Timing must be enabled before render targets allocate their counters.
      expect(engine.enableGPUTimingMeasurements).toBe(test.timestamps && test.supported);
      return { metadata: {}, getMeshByName: () => null, pick: vi.fn(() => null), isReady: () => true, render: vi.fn() };
    });
    vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene: createScene }));
    const { createRuntime } = await import('../createRuntime');
    const runtime = await createRuntime(document.createElement('div'));
    expect(runtime.engine).toBe(engine);
    expect(factory.mock.calls[0]?.[1]).toEqual({ adaptToDeviceRatio: true, antialias: test.antialias,
      ...(test.timestamps ? { deviceDescriptor: { requiredFeatures: ['timestamp-query'] } } : {}),
    });
    expect(createScene).toHaveBeenCalledTimes(1);
    expect(engine.compatibilityMode).toBe(test.search.includes('debug=1&gpuBundles=0'));
    runtime.dispose();
  });

  it.each([
    { target: 60, fps: 54, mobile: false }, { target: 120, fps: 110, mobile: false },
    { target: 144, fps: 90, mobile: false }, { target: 240, fps: 120, mobile: false },
    { target: 60, fps: 54, mobile: true }, { target: 120, fps: 110, mobile: true },
  ])('adapts for $target Hz (mobile=$mobile) before the next render without invalidating the submitted frame', async ({ target, fps, mobile }) => {
    displayTargetFps = target;
    window.sessionStorage.removeItem('omnirave.guestSettings.v2');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile,
      addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    if (mobile) vi.stubGlobal('devicePixelRatio', 3);
    const frameEvents: string[] = [];
    let renderFrame: (() => void) | undefined;
    let scalingLevel = 1 / 1.5;
    const setHardwareScalingLevel = vi.fn((level: number) => { scalingLevel = level; frameEvents.push('scale'); });
    const engine = {
      dispose: vi.fn(),
      maxFPS: 60 as number | undefined,
      adaptToDeviceRatio: true,
      _drawCalls: { current: 123 },
      onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => fps),
      getDeltaTime: vi.fn(() => 16),
      getHardwareScalingLevel: vi.fn(() => scalingLevel),
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
      isReady: () => true,
      render: vi.fn(() => frameEvents.push('render')),
      textures: [],
    };
    // An explicit clock, not "0 once, then 2000": the test runner's own module
    // loader reads performance.now during the import below, and under Vitest 5
    // it took the single 0 meant for the controller's first reading (frame 30).
    let clock = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => engine),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => scene),
    }));

    const { createRuntime } = await import('../createRuntime');
    const runtimeHost = document.createElement('div');
    document.body.append(runtimeHost);
    const runtime = await createRuntime(runtimeHost);

    expect(engine.maxFPS).toBeUndefined();
    expect(engine.adaptToDeviceRatio).toBe(false);
    if (mobile) expect(setHardwareScalingLevel).toHaveBeenCalledWith(1 / 3);
    setHardwareScalingLevel.mockClear();
    expect(renderFrame).toBeTypeOf('function');
    // Two slow frames separated by the sustained-low window suffice; a
    // struggling phone need not wait for 30 frames to make each decision.
    renderFrame?.();
    clock = 750;
    renderFrame?.();
    expect(setHardwareScalingLevel).not.toHaveBeenCalled();

    frameEvents.length = 0;
    renderFrame?.();

    expect(frameEvents.slice(0, 2)).toEqual(['scale', 'render']);
    expect(setHardwareScalingLevel).toHaveBeenCalledTimes(1);
    if (mobile) {
      expect(scalingLevel).toBeGreaterThan(1 / 3);
      expect(scalingLevel).toBeLessThanOrEqual(0.5);
    }
    if (mobile) {
      // A manual pin wins even during slow frames, and resize cannot reset
      // its density. Re-enabling Auto resumes adaptation from that pin.
      const auto = runtimeHost.querySelector<HTMLInputElement>('[data-settings-control="graphics-auto"]')!;
      const detail = runtimeHost.querySelector<HTMLInputElement>('[data-settings-control="graphics-level"]')!;
      auto.click();
      detail.value = '10';
      detail.dispatchEvent(new Event('input', { bubbles: true }));
      renderFrame?.();
      expect(scalingLevel).toBe(1 / 3);
      setHardwareScalingLevel.mockClear();
      window.dispatchEvent(new Event('resize'));
      clock = 10_000;
      renderFrame?.();
      clock = 20_000;
      renderFrame?.();
      expect(setHardwareScalingLevel).not.toHaveBeenCalled();
      auto.click();
      renderFrame?.();
      clock = 20_750;
      renderFrame?.();
      renderFrame?.();
      expect(scalingLevel).toBeGreaterThan(1 / 3);
      expect(scalingLevel).toBeLessThanOrEqual(0.5);
    }
    runtime.dispose();
    expect(disposeDisplayRefresh).toHaveBeenCalledTimes(1);
    now.mockRestore();
    vi.unstubAllGlobals();
  });

  it('cleans up owned resources when the engine is disposed externally', async () => {
    let notifyEngineDisposed: (() => void) | undefined;
    const engineDispose = vi.fn(() => notifyEngineDisposed?.());
    const engine = {
      dispose: engineDispose,
      _drawCalls: { current: 123 },
      onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
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
      Engine: constructible(() => engine),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => ({
        metadata: {},
        getMeshByName: () => null,
        pick: vi.fn(() => null),
        isReady: () => true,
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
      Engine: constructible(() => ({
        dispose: engineDispose,
        _drawCalls: { current: 123 },
        onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => 60),
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
    expect(disposeDisplayRefresh).toHaveBeenCalledTimes(1);
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
    const debugDrawCounter = { current: 1000 };
    const sceneRender = vi.fn(() => { debugDrawCounter.current += 123; });
    const playerPositionSet = vi.fn();
    const applyCheckpointView = vi.fn();
    const routeProgressReset = vi.fn();
    const setAvatarColorway = vi.fn();
    const completionCelebrationStop = vi.fn();
    const scene = {
      textures: [],
      getMeshByName: () => null,
      pick: scenePick,
      isReady: () => true,
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
      Engine: constructible(() => ({
        dispose: engineDispose,
        _drawCalls: debugDrawCounter,
        onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => 60),
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
    // The development review harness preserves the authored scenery view so
    // each checkpoint is an intentional approval composition.
    expect(applyCheckpointView).toHaveBeenCalledWith({
      alpha: -Math.PI / 2,
      beta: 1.08,
      radius: 60,
      focusOffset: { x: 0, y: 8, z: 44 },
      positionOffset: { x: 0, y: 26.3, z: -57 },
    });
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    renderFrame?.();
    expect(host.querySelector('[data-testid="perf-overlay"]')?.textContent).toContain('WebGL | CPU render:');
    expect(host.querySelector('[data-testid="perf-overlay"]')?.textContent).toContain('Draws: 123');
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
    // start, teleports to the back-plaza spawn, and reapplies the authored
    // spawn-reveal composition.
    host.querySelector<HTMLButtonElement>('[data-review-restart]')?.click();
    expect(completionCelebrationStop).toHaveBeenCalledTimes(1);
    expect(routeProgressReset).toHaveBeenCalledWith(0);
    expect(playerPositionSet).toHaveBeenCalledWith(0, 1.7, -48);
    expect(applyCheckpointView).toHaveBeenCalledWith({
      alpha: -Math.PI / 2,
      beta: 1.08,
      radius: 60,
      focusOffset: { x: 0, y: 8, z: 44 },
      positionOffset: { x: 0, y: 26.3, z: -57 },
    });

    runtime.dispose();
  });

  it('keeps the loading overlay until the first frame and a ready scene, then marks visible once', async () => {
    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();
    const deferredScene = createDeferredPromise<{
      metadata: { reviewRuntime: Record<string, never> };
      getMeshByName: () => null;
      pick: ReturnType<typeof vi.fn>;
      isReady: () => boolean;
      render: ReturnType<typeof vi.fn>;
      textures: unknown[];
    }>();
    let sceneReady = false;
    const showModuleRequested = vi.fn();
    const deferredShowModule = createDeferredPromise<void>();
    vi.doMock('../../scene/createCrownEffects', async importOriginal => {
      showModuleRequested();
      await deferredShowModule.promise;
      return importOriginal();
    });

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => ({
        dispose: engineDispose,
        _drawCalls: { current: 123 },
        onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => 60),
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

    const bootTiming = await import('../bootTiming');
    const mark = vi.spyOn(bootTiming, 'markBootPhase').mockImplementation(() => {});
    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');

    const runtimePromise = createRuntime(host);
    await vi.waitFor(() => {
      expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
      expect(showModuleRequested).toHaveBeenCalledTimes(1);
    });
    expect(host.textContent).toContain('Loading Main Stage');
    expect(host.querySelector('[data-testid="review-hud"]')).toBeNull();

    deferredScene.resolve({
      textures: [],
      metadata: { reviewRuntime: {} },
      getMeshByName: () => null,
      pick: vi.fn(() => null),
      isReady: () => sceneReady,
      render: vi.fn(),
    });
    deferredShowModule.resolve();

    const runtime = await runtimePromise;

    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith('render_ready');
    expect(mark).not.toHaveBeenCalledWith('visible');
    const renderFrame = engineRunRenderLoop.mock.calls[0][0] as () => void;
    // The first frame drew, but the venue's GPU programs are still compiling.
    renderFrame();
    expect(mark).toHaveBeenCalledWith('first_frame');
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    expect(host.textContent).toContain('Preparing the graphics.');
    expect(mark).not.toHaveBeenCalledWith('visible', undefined);
    renderFrame();
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    sceneReady = true;
    renderFrame();
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).toBeNull();
    expect(mark).toHaveBeenCalledWith('visible', undefined);
    renderFrame();
    expect(mark.mock.calls.filter(([phase]) => phase === 'visible')).toHaveLength(1);
    expect(engineDispose).not.toHaveBeenCalled();

    runtime.dispose();
    mark.mockRestore();
  });

  it('removes the loading overlay at the cap when the scene never becomes ready', async () => {
    const engineRunRenderLoop = vi.fn();
    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => ({
        dispose: vi.fn(),
        _drawCalls: { current: 123 },
        onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => 60),
        getDeltaTime: vi.fn(() => 16),
        getHardwareScalingLevel: vi.fn(() => 1),
        onDisposeObservable: { addOnce: vi.fn() },
        runRenderLoop: engineRunRenderLoop,
        resize: vi.fn(),
        setHardwareScalingLevel: vi.fn(),
      })),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => ({
        metadata: { reviewRuntime: {} }, getMeshByName: () => null, pick: vi.fn(() => null),
        isReady: () => false, render: vi.fn(),
        textures: [],
      })),
    }));
    const bootTiming = await import('../bootTiming');
    const mark = vi.spyOn(bootTiming, 'markBootPhase').mockImplementation(() => {});
    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');
    const runtime = await createRuntime(host);
    const renderFrame = engineRunRenderLoop.mock.calls[0][0] as () => void;
    let now = 1_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);

    renderFrame();
    now += 19_000;
    renderFrame();
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    now += 2_000; // past the 20 s cap
    renderFrame();
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).toBeNull();
    expect(mark).toHaveBeenCalledWith('visible', 'cap');

    clock.mockRestore();
    runtime.dispose();
    mark.mockRestore();
  });

  it('handles a preloaded module failure through normal startup cleanup', async () => {
    const dispose = vi.fn();
    const scene = createDeferredPromise<object>();
    const createScene = vi.fn(() => scene.promise);
    const moduleRequested = vi.fn();
    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => ({
        onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
        dispose, getHardwareScalingLevel: () => 1, setHardwareScalingLevel: vi.fn(),
      })),
    }));
    vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene: createScene }));
    vi.doMock('../../scene/createCrownEffects', async () => {
      moduleRequested();
      throw new Error('show module download failed');
    });
    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');
    const starting = createRuntime(host);
    const rejection = starting.catch(error => error as Error);
    await vi.waitFor(() => {
      expect(createScene).toHaveBeenCalledTimes(1);
      expect(moduleRequested).toHaveBeenCalledTimes(1);
    });
    expect(dispose).not.toHaveBeenCalled();
    scene.resolve({ metadata: {}, getMeshByName: () => null, render: vi.fn() });
    const error = await rejection as Error;
    // Vitest wraps module-factory rejections; the original download error
    // remains the cause. Real browser imports reject with the original error.
    expect((error.cause as Error | undefined)?.message ?? error.message).toBe('show module download failed');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.children).toHaveLength(0);
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
      isReady: () => true,
      render: vi.fn(),
    };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => ({
        dispose: engineDispose,
        _drawCalls: { current: 123 },
        onEndFrameObservable: { add: vi.fn(), remove: vi.fn() },
      getFps: vi.fn(() => 60),
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
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    scene.render.mockImplementationOnce(() => {
      // Shader setup can block the first render; keep its loading state
      // visible until render() has actually completed.
      expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).not.toBeNull();
    });
    expect(() => renderFrame?.()).not.toThrow();
    expect(host.querySelector('[data-testid="runtime-loading-overlay"]')).toBeNull();

    runtime.dispose();
  });

  it('registers the Babylon runtime shaders required by GLB materials and presentation post-processes', async () => {
    const { ShaderStore } = await import('@babylonjs/core/Engines/shaderStore.js');

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: constructible(() => ({
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
