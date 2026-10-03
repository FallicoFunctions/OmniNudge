import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { WebGPUCacheBindGroups } from '@babylonjs/core/Engines/WebGPU/webgpuCacheBindGroups';
import { WebGPUCacheRenderPipelineTree } from '@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipelineTree';

interface RecoveringScene {
  resetCachedMaterial(): void;
  _rebuildGeometries(): void;
  meshes: { subMeshes?: { _drawWrappers: unknown[] }[] }[];
  materials: { _materialContext?: { reset(): void } }[];
}
interface RecoveringEngine {
  isDisposed: boolean;
  _contextWasLost: boolean;
  _device?: { destroy(): void };
  _depthCullingState: { depthTest: boolean; depthFunc: number | null; depthMask: boolean };
  _stencilState: { stencilTest: boolean };
  scenes: RecoveringScene[];
  _virtualScenes: RecoveringScene[];
  _uniformBuffers: { name: string }[];
  _clearEmptyResources(): void;
  _rebuildGraphicsResources(): void;
  _flagContextRestored(): void;
  _rebuildBuffers(): void;
  _cacheRenderPipeline?: { reset(): void };
  _clearQuad?: { _cacheRenderPipeline: { reset(): void } };
  _restoreEngineAfterContextLost(initialize: () => void | Promise<void>): void;
  createRawCubeTexture: AbstractEngine['createRawCubeTexture'];
  getLoadedTexturesCache: AbstractEngine['getLoadedTexturesCache'];
}

/** Awaitable, disposal-safe counterpart of Babylon 9.29's WebGPU restore path. */
export function awaitWebGpuContextRestore(
  engine: AbstractEngine,
  onFailure: (error: unknown) => void = error => console.error('Graphics recovery failed', error),
): void {
  if (!engine.isWebGPU) return;
  const native = engine as unknown as RecoveringEngine;
  const original = native._restoreEngineAfterContextLost;
  const originalBuffers = native._rebuildBuffers;
  if (typeof original !== 'function' || typeof originalBuffers !== 'function') return;
  const originalCube = native.createRawCubeTexture;
  const createCube: RecoveringEngine['createRawCubeTexture'] = function(this: RecoveringEngine, ...args) {
    const texture = originalCube.apply(this, args);
    // Babylon 9.29 omits raw cube cache registration on WebGPU. Native
    // texture recovery needs this entry to rebuild the environment texture.
    const cache = this.getLoadedTexturesCache();
    if (!cache.includes(texture)) cache.push(texture);
    return texture;
  };
  if (typeof originalCube === 'function') native.createRawCubeTexture = createCube;
  const rebuildBuffers = function(this: RecoveringEngine): void {
    // Unlike WebGL, WebGPU's native buffer rebuild omits scene geometry.
    for (const scene of [...this.scenes, ...this._virtualScenes]) {
      scene.resetCachedMaterial();
      scene._rebuildGeometries();
    }
    originalBuffers.call(this);
  };
  native._rebuildBuffers = rebuildBuffers;
  let recovering = false;
  let queued: (() => void | Promise<void>) | undefined;
  const wrapped = function(this: RecoveringEngine, initialize: () => void | Promise<void>): void {
    if (this.isDisposed) return;
    if (recovering) {
      // A replacement device can itself be lost before initialization finishes.
      // Keep its latest recovery request, but never initialize devices in parallel.
      queued = initialize;
      return;
    }
    recovering = true;
    this._contextWasLost = true;
    const depthTest = this._depthCullingState.depthTest;
    const depthFunc = this._depthCullingState.depthFunc;
    const depthMask = this._depthCullingState.depthMask;
    const stencilTest = this._stencilState.stencilTest;
    const restoreState = () => {
      this._depthCullingState.depthTest = depthTest;
      this._depthCullingState.depthFunc = depthFunc;
      this._depthCullingState.depthMask = depthMask;
      this._stencilState.stencilTest = stencilTest;
    };
    void (async () => {
      if (this.isDisposed) return;
      await initialize();
      if (this.isDisposed) {
        this._device?.destroy();
        return;
      }
      restoreState();
      // A queued loss supersedes this device. Do not rebuild or announce it
      // as restored; carry the saved state into the next initialization.
      if (queued) return;
      // Keep Babylon's browser-level deferral inside the awaited error path.
      // Check disposal again: the runtime can be closed during this task gap.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (this.isDisposed) return;
      if (queued) return;
      this._clearEmptyResources();
      // Mirror WebGPUEngine's native cleanup before rebuilding resources.
      WebGPUCacheRenderPipelineTree.ResetCache();
      WebGPUCacheBindGroups.ResetCache();
      for (const scene of [...this.scenes, ...this._virtualScenes]) {
        for (const mesh of scene.meshes) {
          for (const subMesh of mesh.subMeshes ?? []) subMesh._drawWrappers = [];
        }
        for (const material of scene.materials) material._materialContext?.reset();
      }
      this._uniformBuffers = this._uniformBuffers.filter(buffer => !buffer.name.includes('leftOver'));
      // Repoint the replacement device's caches at the new global tree.
      this._cacheRenderPipeline?.reset();
      this._clearQuad?._cacheRenderPipeline.reset();
      this._rebuildGraphicsResources();
      restoreState();
      if (!this.isDisposed) this._flagContextRestored();
    })().catch(error => {
      if (!this.isDisposed) {
        // Initialization and resource rebuilding can reset render state before
        // throwing. Preserve the pre-loss settings for a queued or later retry.
        restoreState();
        onFailure(error);
      }
    }).finally(() => {
      recovering = false;
      const next = queued;
      queued = undefined;
      if (next && !this.isDisposed) wrapped.call(this, next);
    });
  };
  native._restoreEngineAfterContextLost = wrapped;
  engine.onDisposeObservable.addOnce(() => {
    queued = undefined;
    if (native._restoreEngineAfterContextLost === wrapped) native._restoreEngineAfterContextLost = original;
    if (native._rebuildBuffers === rebuildBuffers) native._rebuildBuffers = originalBuffers;
    if (native.createRawCubeTexture === createCube) native.createRawCubeTexture = originalCube;
  });
}
