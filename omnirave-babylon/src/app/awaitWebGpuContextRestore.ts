import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

interface RecoveringEngine {
  isDisposed: boolean;
  _device?: { destroy(): void };
  _depthCullingState: { depthTest: boolean; depthFunc: number | null; depthMask: boolean };
  _stencilState: { stencilTest: boolean };
  scenes: { resetCachedMaterial(): void; _rebuildGeometries(): void }[];
  _virtualScenes: RecoveringEngine['scenes'];
  _rebuildBuffers(): void;
  _cacheRenderPipeline?: { reset(): void };
  _clearQuad?: { _cacheRenderPipeline: { reset(): void } };
  _restoreEngineAfterContextLost(initialize: () => void | Promise<void>): void;
  createRawCubeTexture: AbstractEngine['createRawCubeTexture'];
  getLoadedTexturesCache: AbstractEngine['getLoadedTexturesCache'];
}

/** Babylon 9.29's shared restore path does not await WebGPU initialization. */
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
    // WebGPU's raw cube creator omits cache registration in Babylon 9.29.
    // Register it so native recovery rebuilds the environment on the new device.
    const cache = this.getLoadedTexturesCache();
    if (!cache.includes(texture)) cache.push(texture);
    return texture;
  };
  if (typeof originalCube === 'function') native.createRawCubeTexture = createCube;
  const rebuildBuffers = function(this: RecoveringEngine): void {
    // WebGPU inherits AbstractEngine's uniform-buffer-only rebuild, unlike
    // Engine's rebuild of scene geometry and thin-instance vertex buffers.
    for (const scene of [...this.scenes, ...this._virtualScenes]) {
      scene.resetCachedMaterial();
      scene._rebuildGeometries();
    }
    originalBuffers.call(this);
  };
  native._rebuildBuffers = rebuildBuffers;
  const wrapped = function(this: RecoveringEngine, initialize: () => void | Promise<void>): void {
    const depthTest = this._depthCullingState.depthTest;
    const depthFunc = this._depthCullingState.depthFunc;
    const depthMask = this._depthCullingState.depthMask;
    const stencilTest = this._stencilState.stencilTest;
    void (async () => {
      if (this.isDisposed) return;
      // initAsync replaces the device and render-state objects. Only then can
      // Babylon clear old bundles and rebuild buffers, textures and shaders.
      await initialize();
      if (this.isDisposed) {
        this._device?.destroy();
        return;
      }
      this._depthCullingState.depthTest = depthTest;
      this._depthCullingState.depthFunc = depthFunc;
      this._depthCullingState.depthMask = depthMask;
      this._stencilState.stencilTest = stencilTest;
      // Keep the native WebGPU cache cleanup and resource rebuild. Its shared
      // restore callback is now synchronous because initialization is done.
      original.call(this, () => {});
      // Native cleanup resets the shared pipeline tree. Repoint the new
      // device's cache instances at that tree rather than retaining old nodes.
      this._cacheRenderPipeline?.reset();
      this._clearQuad?._cacheRenderPipeline.reset();
    })().catch(error => { if (!this.isDisposed) onFailure(error); });
  };
  native._restoreEngineAfterContextLost = wrapped;
  engine.onDisposeObservable.addOnce(() => {
    if (native._restoreEngineAfterContextLost === wrapped) native._restoreEngineAfterContextLost = original;
    if (native._rebuildBuffers === rebuildBuffers) native._rebuildBuffers = originalBuffers;
    if (native.createRawCubeTexture === createCube) native.createRawCubeTexture = originalCube;
  });
}
