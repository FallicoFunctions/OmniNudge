import { Light } from '@babylonjs/core/Lights/light.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { Scene } from '@babylonjs/core/scene.js';

interface LightState {
  _renderId: number;
  _lastUseSpecular: boolean;
  _uniformBuffer: UniformBuffer;
}

/** Native light buffers already bound to this draw need no repeated binding. */
export function cacheWebGpuLightBindings(scene: Scene): void {
  const engine = scene.getEngine();
  if (!engine.isWebGPU) return;
  const draws = engine as unknown as { _currentDrawContext?: { buffers?: Record<string, unknown> } };
  const watched = new WeakSet<Light>(), restores: (() => void)[] = [];
  const stats = { reused: 0, bound: 0 };
  scene.metadata = { ...scene.metadata, lightBindingCache: stats };
  const watch = (light: Light) => {
    if (watched.has(light)) return;
    watched.add(light);
    const original = light._bindLight;
    light._bindLight = function(index, currentScene, effect, specular, shadows = true) {
      const state = this as unknown as LightState;
      const buffer = state._uniformBuffer;
      if (this.transferTexturesToEffect === Light.prototype.transferTexturesToEffect
        && state._renderId === currentScene.getRenderId() && state._lastUseSpecular === specular
        && buffer.useUbo && draws._currentDrawContext?.buffers?.[`Light${index}`] === buffer.getBuffer()
        && !(currentScene.shadowsEnabled && this.shadowEnabled && shadows
          && (this.getShadowGenerator(currentScene.activeCamera) ?? this.getShadowGenerator()))) {
        stats.reused++;
        return;
      }
      stats.bound++;
      original.call(this, index, currentScene, effect, specular, shadows);
    };
    restores.push(() => { light._bindLight = original; });
  };
  scene.lights.forEach(watch);
  const observer = scene.onNewLightAddedObservable.add(watch);
  scene.onDisposeObservable.addOnce(() => { scene.onNewLightAddedObservable.remove(observer); restores.forEach(restore => restore()); });
}
