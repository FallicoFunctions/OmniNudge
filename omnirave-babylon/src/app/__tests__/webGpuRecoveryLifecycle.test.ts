import { afterEach, expect, it, vi } from 'vitest';
import { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Observable } from '@babylonjs/core/Misc/observable';
import { awaitWebGpuContextRestore } from '../awaitWebGpuContextRestore';

afterEach(() => vi.useRealTimers());

function queuedHarness() {
  // Use the actual native task boundary rather than a synchronous restore mock.
  const native = AbstractEngine.prototype as unknown as {
    _restoreEngineAfterContextLost(initialize: () => void | Promise<void>): void;
  };
  const engine = {
    isWebGPU: true, isDisposed: false, onDisposeObservable: new Observable(),
    scenes: [], _virtualScenes: [], _uniformBuffers: [], _device: { destroy: vi.fn() },
    _depthCullingState: { depthTest: true, depthFunc: 515, depthMask: true },
    _stencilState: { stencilTest: false },
    _clearEmptyResources: vi.fn(), _rebuildBuffers: vi.fn(),
    _rebuildGraphicsResources: vi.fn(), _flagContextRestored: vi.fn(),
    _restoreEngineAfterContextLost: native._restoreEngineAfterContextLost,
  };
  return { engine, typed: engine as unknown as AbstractEngine };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it('does not rebuild or announce restoration if disposed between initialization and the queued rebuild', async () => {
  vi.useFakeTimers();
  const h = queuedHarness();
  awaitWebGpuContextRestore(h.typed);
  h.engine._restoreEngineAfterContextLost(() => {});
  await flush();
  h.engine.isDisposed = true;
  h.engine.onDisposeObservable.notifyObservers(null);
  await vi.runAllTimersAsync();
  expect(h.engine._rebuildGraphicsResources).not.toHaveBeenCalled();
  expect(h.engine._flagContextRestored).not.toHaveBeenCalled();
});

it('reports a queued rebuild failure without an uncaught timer or restored signal', async () => {
  vi.useFakeTimers();
  const h = queuedHarness(), failure = vi.fn(), error = new Error('texture rebuild failed');
  h.engine._rebuildGraphicsResources.mockImplementation(() => { throw error; });
  awaitWebGpuContextRestore(h.typed, failure);
  h.engine._restoreEngineAfterContextLost(() => {});
  await flush();
  await expect(vi.runAllTimersAsync()).resolves.toBeDefined();
  expect(failure).toHaveBeenCalledWith(error);
  expect(h.engine._flagContextRestored).not.toHaveBeenCalled();
});
