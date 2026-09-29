import { expect, it, vi } from 'vitest';
import { Light } from '@babylonjs/core/Lights/light.js';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { cacheWebGpuLightBindings } from '../cacheWebGpuLightBindings';

it('retains native light updates when a frame, buffer, specular, projection or shadow binding changes', () => {
  const native = vi.fn(), firstBuffer = {}, secondBuffer = {};
  let buffer = firstBuffer, frame = 7;
  const light = Object.create(Light.prototype);
  Object.defineProperties(light, {
    _bindLight: { value: native, writable: true },
    _renderId: { value: 7, writable: true },
    _lastUseSpecular: { value: true, writable: true },
    _uniformBuffer: { value: { useUbo: true, getBuffer: () => buffer } },
    shadowEnabled: { value: false, writable: true },
    getShadowGenerator: { value: () => ({}), writable: true },
  });
  const engine = { isWebGPU: true, _currentDrawContext: { buffers: { Light0: firstBuffer } } };
  const scene = { getEngine: () => engine, getRenderId: () => frame, shadowsEnabled: true,
    lights: [light], onNewLightAddedObservable: new Observable(), onDisposeObservable: new Observable() };
  cacheWebGpuLightBindings(scene as unknown as Scene);
  const bind = (specular = true) => light._bindLight(0, scene, {}, specular);
  bind(); expect(native).not.toHaveBeenCalled();
  frame++; bind(); expect(native).toHaveBeenCalledTimes(1); frame--;
  buffer = secondBuffer; bind(); expect(native).toHaveBeenCalledTimes(2); buffer = firstBuffer;
  bind(false); expect(native).toHaveBeenCalledTimes(3);
  light.transferTexturesToEffect = () => {}; bind(); expect(native).toHaveBeenCalledTimes(4);
  delete light.transferTexturesToEffect;
  light.shadowEnabled = true; bind(); expect(native).toHaveBeenCalledTimes(5);
  light.shadowEnabled = false;
  bind(); expect(native).toHaveBeenCalledTimes(5);
  scene.onDisposeObservable.notifyObservers(null);
  expect(light._bindLight).toBe(native);
  expect(scene.onNewLightAddedObservable.hasObservers()).toBe(false);
});
