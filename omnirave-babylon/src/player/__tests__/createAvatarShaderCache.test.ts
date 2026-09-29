import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Scene } from '@babylonjs/core/scene.js';
import { expect, it } from 'vitest';
import { createAvatarShaderCache } from '../createAvatarShaderCache';

it('reuses the compiled variant after its last mesh leaves and releases its one reference on cleanup', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const material = new PBRMaterial('avatar', scene);
  const cache = createAvatarShaderCache(scene);
  const path = { vertexSource: 'attribute vec3 position; void main() { gl_Position = vec4(position, 1.0); }',
    fragmentSource: 'void main() { gl_FragColor = vec4(1.0); }' };
  const options = { attributes: ['position'], uniformsNames: [], samplers: [], defines: '',
    fallbacks: null, onCompiled: null, onError: null };
  try {
    cache.watch(material); cache.watch(material);
    const first = engine.createEffect(path, options, engine);
    material.onEffectCreatedObservable.notifyObservers({ effect: first, subMesh: null });
    material.onEffectCreatedObservable.notifyObservers({ effect: first, subMesh: null });
    expect(cache.size()).toBe(1);
    first.dispose();
    expect(first.isDisposed).toBe(false);
    const next = engine.createEffect(path, options, engine);
    expect(next).toBe(first); next.dispose();
    cache.dispose(); cache.dispose();
    expect(first.isDisposed).toBe(true);
    expect(material.onEffectCreatedObservable.hasObservers()).toBe(false);
  } finally { cache.dispose(); scene.dispose(); engine.dispose(); }
});

it('evicts the least recently requested variant without disposing a mesh-owned shader', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const material = new PBRMaterial('avatar', scene); const cache = createAvatarShaderCache(scene, 2);
  const make = (id: number) => engine.createEffect({
    vertexSource: 'attribute vec3 position; void main() { gl_Position = vec4(position, 1.0); }',
    fragmentSource: 'void main() { gl_FragColor = vec4(1.0); }',
  }, { attributes: ['position'], uniformsNames: [], samplers: [], defines: `#define VARIANT ${id}`,
    fallbacks: null, onCompiled: null, onError: null }, engine);
  try {
    cache.watch(material);
    const a = make(1), b = make(2), c = make(3);
    const request = (effect: typeof a) => material.onEffectCreatedObservable.notifyObservers({ effect, subMesh: null });
    request(a); request(b); request(a); request(c);
    expect(cache.size()).toBe(2);
    expect(b.isDisposed).toBe(false); b.dispose(); expect(b.isDisposed).toBe(true);
    a.dispose(); c.dispose();
    expect(a.isDisposed).toBe(false); expect(c.isDisposed).toBe(false);
    cache.dispose();
    expect(a.isDisposed).toBe(true); expect(c.isDisposed).toBe(true);
  } finally { cache.dispose(); scene.dispose(); engine.dispose(); }
});
