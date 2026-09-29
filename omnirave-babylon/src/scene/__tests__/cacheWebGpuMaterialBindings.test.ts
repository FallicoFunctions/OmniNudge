import { expect, it, vi } from 'vitest';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { cacheWebGpuMaterialBindings } from '../cacheWebGpuMaterialBindings';

it('reuses only unchanged bindings and preserves native buffer invalidation', () => {
  const texture = { _hardwareTexture: { view: {}, viewForWriting: {} } };
  const processing = { textureNames: ['bones'], samplerNames: ['linear'] };
  const effect = { _pipelineContext: { shaderProcessingContext: processing } };
  const material = { updateId: 1, isDirty: true, forceBindGroupCreation: false,
    textures: { bones: { texture } }, samplers: { linear: { hashCode: 1 } } };
  const draw = { _materialContextUpdateId: 0, isDirty: false, fastBundle: undefined as unknown };
  const rebuild = vi.fn();
  const native = vi.fn(() => {
    if (material.isDirty || draw._materialContextUpdateId !== material.updateId || draw.isDirty || material.forceBindGroupCreation) rebuild();
    draw.fastBundle = {}; draw._materialContextUpdateId = material.updateId; material.isDirty = false; draw.isDirty = false;
  });
  const engine = { isWebGPU: true, compatibilityMode: true, _draw: native,
    _currentDrawContext: draw, _currentMaterialContext: material, _currentEffect: effect };
  const scene = { getEngine: () => engine, onDisposeObservable: new Observable() };
  cacheWebGpuMaterialBindings(scene as unknown as Scene);
  const bind = () => { material.updateId++; material.isDirty = true; engine._draw(); };
  bind(); expect(rebuild).toHaveBeenCalledTimes(1);
  bind(); expect(rebuild).toHaveBeenCalledTimes(1);
  draw.isDirty = true; bind(); expect(rebuild).toHaveBeenCalledTimes(2);
  texture._hardwareTexture.view = {}; bind(); expect(rebuild).toHaveBeenCalledTimes(3);
  texture._hardwareTexture.viewForWriting = {}; bind(); expect(rebuild).toHaveBeenCalledTimes(4);
  material.samplers.linear.hashCode++; bind(); expect(rebuild).toHaveBeenCalledTimes(5);
  material.textures.bones.texture = { _hardwareTexture: { view: {}, viewForWriting: {} } };
  bind(); expect(rebuild).toHaveBeenCalledTimes(6);
  effect._pipelineContext = { shaderProcessingContext: processing };
  bind(); expect(rebuild).toHaveBeenCalledTimes(7);
  material.forceBindGroupCreation = true; bind(); expect(rebuild).toHaveBeenCalledTimes(8);
  material.forceBindGroupCreation = false;
  bind(); expect(rebuild).toHaveBeenCalledTimes(9);
  bind(); expect(rebuild).toHaveBeenCalledTimes(9);
  effect._pipelineContext.shaderProcessingContext = { ...processing };
  bind(); expect(rebuild).toHaveBeenCalledTimes(10);
  scene.onDisposeObservable.notifyObservers(null);
  expect(engine._draw).toBe(native); expect(engine.compatibilityMode).toBe(true);
});
