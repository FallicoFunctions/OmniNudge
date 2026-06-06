import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('cleans up failed initialization so bootstrap can retry', async () => {
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
    expect(document.querySelector('[data-testid="babylon-runtime-host"]')).toBeNull();
    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).toBeNull();

    await bootstrapRuntime();

    expect(document.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="review-hud"]')).not.toBeNull();
    expect(createRuntimeMock).toHaveBeenCalledTimes(2);
  });
});

describe('createRuntime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../createRuntime');
    vi.doUnmock('../../scene/createMainStageScene');
    vi.doUnmock('@babylonjs/core/Engines/engine');
  });

  it('disposes the engine and removes DOM nodes when scene creation fails', async () => {
    const engineDispose = vi.fn();
    const engineRunRenderLoop = vi.fn();
    const engineResize = vi.fn();

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        runRenderLoop: engineRunRenderLoop,
        resize: engineResize,
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
    const sceneRender = vi.fn();
    const scene = { render: sceneRender };

    vi.doMock('@babylonjs/core/Engines/engine', () => ({
      Engine: vi.fn(() => ({
        dispose: engineDispose,
        runRenderLoop: engineRunRenderLoop,
        resize: engineResize,
      })),
    }));

    vi.doMock('../../scene/createMainStageScene', () => ({
      createMainStageScene: vi.fn(async () => scene),
    }));

    const { createRuntime } = await import('../createRuntime');
    const host = document.createElement('div');

    await createRuntime(host);

    expect(host.querySelector('canvas[data-testid="babylon-render-canvas"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="review-hud"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="perf-overlay"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="debug-panel"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-toggle="collision"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-toggle="routes"]')).not.toBeNull();
    expect(host.querySelector('[data-debug-toggle="lighting"]')).not.toBeNull();
    expect(engineRunRenderLoop).toHaveBeenCalledTimes(1);
    expect(engineDispose).not.toHaveBeenCalled();
  });

  it('registers the Babylon PBR shaders required by imported GLB materials', async () => {
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
  });
});
