import type { Scene } from '@babylonjs/core/scene.js';

interface TextureBinding { texture?: { _hardwareTexture?: { view?: unknown; viewForWriting?: unknown } } | null }
interface MaterialContext {
  updateId: number; isDirty: boolean; forceBindGroupCreation: boolean;
  textures: Record<string, TextureBinding>; samplers: Record<string, { hashCode: number }>;
}
interface DrawContext { _materialContextUpdateId: number; fastBundle?: unknown }
interface EffectBinding {
  _pipelineContext: { shaderProcessingContext: { textureNames: string[]; samplerNames: string[] } };
}
interface BundleEngine {
  compatibilityMode: boolean; _draw: (...args: number[]) => void;
  _currentDrawContext: DrawContext; _currentMaterialContext: MaterialContext; _currentEffect: EffectBinding;
}
interface BindingRecord {
  effect: EffectBinding; pipeline: EffectBinding['_pipelineContext']; material: MaterialContext;
  processing: EffectBinding['_pipelineContext']['shaderProcessingContext'];
  textures: unknown[]; views: unknown[]; writeViews: unknown[]; samplers: number[];
}

/** Reuse unchanged per-draw bindings when another avatar changed a shared material. */
export function cacheWebGpuMaterialBindings(scene: Scene): void {
  if (!scene.getEngine().isWebGPU) return;
  const engine = scene.getEngine() as unknown as BundleEngine;
  const original = engine._draw, compatibility = engine.compatibilityMode;
  const records = new WeakMap<DrawContext, BindingRecord>();
  engine.compatibilityMode = false;
  engine._draw = function(...args: number[]) {
    const draw = this._currentDrawContext, material = this._currentMaterialContext, effect = this._currentEffect;
    const processing = effect?._pipelineContext?.shaderProcessingContext;
    if (!processing || material.forceBindGroupCreation) {
      // Native binding can replace this draw's bundle on these paths. Its
      // next ordinary draw must not trust the prior bundle's fingerprint.
      records.delete(draw);
      return original.apply(this, args);
    }
    const old = records.get(draw);
    const textureNames = processing.textureNames, samplerNames = processing.samplerNames;
    let same = old?.effect === effect && old.pipeline === effect._pipelineContext
      && old.processing === processing && old.material === material
      && old.textures.length === textureNames.length && old.samplers.length === samplerNames.length;
    if (same && old) {
      for (let i = 0; i < textureNames.length && same; i++) {
        const texture = material.textures[textureNames[i]]?.texture;
        same = old.textures[i] === texture && old.views[i] === texture?._hardwareTexture?.view
          && old.writeViews[i] === texture?._hardwareTexture?.viewForWriting;
      }
      for (let i = 0; i < samplerNames.length && same; i++) same = old.samplers[i] === (material.samplers[samplerNames[i]]?.hashCode ?? 0);
      if (same) {
        // Keep Babylon's independent buffer-dirty flag intact. Only its shared
        // material revision changed while another mesh was being bound.
        draw._materialContextUpdateId = material.updateId;
        material.isDirty = false;
      }
    }
    original.apply(this, args);
    if (draw.fastBundle && !same) {
      const textures = textureNames.map(name => material.textures[name]?.texture);
      records.set(draw, { effect, pipeline: effect._pipelineContext, processing, material, textures,
        views: textures.map(texture => texture?._hardwareTexture?.view),
        writeViews: textures.map(texture => texture?._hardwareTexture?.viewForWriting),
        samplers: samplerNames.map(name => material.samplers[name]?.hashCode ?? 0) });
    }
  };
  scene.metadata = { ...scene.metadata, materialBindingCacheEnabled: true };
  scene.onDisposeObservable.addOnce(() => { engine._draw = original; engine.compatibilityMode = compatibility; });
}
