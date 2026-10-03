import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { InternalTexture } from '@babylonjs/core/Materials/Textures/internalTexture';
import { expect, it, vi } from 'vitest';
import { awaitWebGpuContextRestore } from '../awaitWebGpuContextRestore';

function harness() {
  const events: string[] = [];
  const scene = { resetCachedMaterial: () => events.push('material'), _rebuildGeometries: () => events.push('geometry') };
  const virtual = { resetCachedMaterial: () => events.push('virtual material'), _rebuildGeometries: () => events.push('virtual geometry') };
  const engine = {
    isWebGPU: true, isDisposed: false, _device: { destroy: vi.fn() },
    scenes: [scene], _virtualScenes: [virtual],
    _depthCullingState: { depthTest: false, depthFunc: 518, depthMask: false },
    _stencilState: { stencilTest: true }, onDisposeObservable: new Observable(),
    _cacheRenderPipeline: { reset: vi.fn(() => events.push('pipeline cache')) },
    _clearQuad: { _cacheRenderPipeline: { reset: vi.fn(() => events.push('clear cache')) } },
    _rebuildBuffers: vi.fn(() => { events.push('uniform buffers'); }),
    _restoreEngineAfterContextLost: vi.fn((initialize: () => void | Promise<void>) => {
      initialize(); engine._rebuildBuffers(); events.push('restored');
    }),
  };
  return { engine, events, typed: engine as unknown as AbstractEngine };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it('waits for device initialization, preserves render state and rebuilds mesh buffers before native buffers', async () => {
  const h = harness(); let ready!: () => void;
  const initialize = vi.fn(() => new Promise<void>(resolve => { ready = resolve; }));
  const restore = h.engine._restoreEngineAfterContextLost;
  awaitWebGpuContextRestore(h.typed);
  h.engine._restoreEngineAfterContextLost(initialize);
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(restore).not.toHaveBeenCalled(); expect(h.events).toEqual([]);
  h.engine._depthCullingState = { depthTest: true, depthFunc: 515, depthMask: true };
  h.engine._stencilState = { stencilTest: false };
  ready(); await flush();
  expect(h.engine._depthCullingState).toEqual({ depthTest: false, depthFunc: 518, depthMask: false });
  expect(h.engine._stencilState.stencilTest).toBe(true);
  expect(h.events).toEqual(['material', 'geometry', 'virtual material', 'virtual geometry', 'uniform buffers', 'restored', 'pipeline cache', 'clear cache']);
  expect(restore).toHaveBeenCalledTimes(1);
  h.engine._restoreEngineAfterContextLost(() => {}); await flush();
  expect(restore).toHaveBeenCalledTimes(2);
});

it('reports initialization failure without rebuilding resources on a lost device', async () => {
  const h = harness(), failure = vi.fn(), restore = h.engine._restoreEngineAfterContextLost;
  awaitWebGpuContextRestore(h.typed, failure);
  const error = new Error('replacement device unavailable');
  h.engine._restoreEngineAfterContextLost(() => Promise.reject(error)); await flush();
  expect(failure).toHaveBeenCalledWith(error); expect(restore).not.toHaveBeenCalled();
  expect(h.events).toEqual([]);
});

it('releases a late device if the runtime was disposed during recovery', async () => {
  const h = harness(); let ready!: () => void;
  const restore = h.engine._restoreEngineAfterContextLost, buffers = h.engine._rebuildBuffers;
  awaitWebGpuContextRestore(h.typed);
  h.engine._restoreEngineAfterContextLost(() => new Promise<void>(resolve => { ready = resolve; }));
  h.engine.isDisposed = true; h.engine.onDisposeObservable.notifyObservers(null);
  ready(); await flush();
  expect(h.engine._device.destroy).toHaveBeenCalledTimes(1);
  expect(restore).not.toHaveBeenCalled(); expect(h.engine._restoreEngineAfterContextLost).toBe(restore);
  expect(h.engine._rebuildBuffers).toBe(buffers);
});

it('does not change WebGL recovery', () => {
  const h = harness(); h.engine.isWebGPU = false;
  const restore = h.engine._restoreEngineAfterContextLost, buffers = h.engine._rebuildBuffers;
  awaitWebGpuContextRestore(h.typed);
  expect(h.engine._restoreEngineAfterContextLost).toBe(restore); expect(h.engine._rebuildBuffers).toBe(buffers);
});

it('registers raw cubes for native recovery without duplicating cache entries and restores the creator on disposal', () => {
  const h = harness();
  const texture = {} as InternalTexture;
  const cache: InternalTexture[] = [];
  const create = vi.fn(() => texture);
  Object.assign(h.engine, { createRawCubeTexture: create, getLoadedTexturesCache: () => cache });
  awaitWebGpuContextRestore(h.typed);
  const faces = Array.from({ length: 6 }, () => new Uint8Array(4));
  expect(h.typed.createRawCubeTexture(faces, 1, 5, 0, false, false, 1, null)).toBe(texture);
  expect(cache).toEqual([texture]);
  h.typed.createRawCubeTexture(faces, 1, 5, 0, false, false, 1, null);
  expect(cache).toEqual([texture]);
  expect(create).toHaveBeenCalledWith(faces, 1, 5, 0, false, false, 1, null);
  h.engine.onDisposeObservable.notifyObservers(null);
  expect(h.typed.createRawCubeTexture).toBe(create);
});
