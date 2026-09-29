import type { Effect } from '@babylonjs/core/Materials/effect.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import type { Observer } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Retain a bounded set of compiled variants across remote-avatar detail changes. */
export function createAvatarShaderCache(scene: Scene, capacity = 96) {
  const engine = scene.getEngine();
  const effects = new Map<string, Effect>();
  const watchers = new Map<Material, Observer<{ effect: Effect; subMesh: SubMesh | null }>>();
  const limit = Number.isFinite(capacity) ? Math.max(1, Math.floor(capacity)) : 96;
  let disposed = false;

  const retain = (effect: Effect) => {
    if (disposed || effect.isDisposed) return;
    const previous = effects.get(effect.key);
    if (previous === effect) {
      effects.delete(effect.key); effects.set(effect.key, effect);
      return;
    }
    // Reacquire the engine's existing effect through its public API. This owns
    // one reference, independent of any mesh, without changing global lifetime
    // settings or keeping skeletons and morph textures alive offscreen.
    const retained = engine.createEffect(effect.name, {
      attributes: effect.getAttributesNames(), uniformsNames: effect.getUniformNames(),
      uniformBuffersNames: effect.getUniformBuffersNames(), samplers: effect.getSamplers(),
      defines: effect.defines, indexParameters: effect.getIndexParameters(), shaderLanguage: effect.shaderLanguage,
      fallbacks: null, onCompiled: null, onError: null,
    }, engine);
    // A changed engine configuration must not make this cache own a different
    // variant from the one the material actually requested.
    if (retained !== effect) { retained?.dispose(); return; }
    previous?.dispose();
    effects.delete(effect.key); effects.set(effect.key, effect);
    while (effects.size > limit) {
      const [key, oldest] = effects.entries().next().value!;
      effects.delete(key); oldest.dispose();
    }
  };

  return {
    watch(material: Material) {
      if (disposed || watchers.has(material)) return;
      const observer = material.onEffectCreatedObservable.add(({ effect }) => retain(effect));
      watchers.set(material, observer);
    },
    size: () => effects.size,
    dispose() {
      if (disposed) return; disposed = true;
      for (const [material, observer] of watchers) material.onEffectCreatedObservable.remove(observer);
      watchers.clear();
      for (const effect of effects.values()) effect.dispose();
      effects.clear();
    },
  };
}
