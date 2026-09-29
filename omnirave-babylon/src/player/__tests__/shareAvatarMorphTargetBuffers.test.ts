import { MorphTarget, MorphTargetManager, NullEngine, Scene } from '@babylonjs/core';
import { InternalTexture, InternalTextureSource } from '@babylonjs/core/Materials/Textures/internalTexture.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shareAvatarMorphTargetBuffers } from '../shareAvatarMorphTargetBuffers';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine(); scene = new Scene(engine);
  Object.assign(engine.getCaps(), { canUseGLVertexID: true, textureFloat: true,
    maxVertexTextureImageUnits: 16, texture2DArrayMaxLayerCount: 256, maxTextureSize: 4096 });
  vi.spyOn(engine, 'createRawTexture2DArray').mockImplementation((data, width, height, depth) => {
    const texture = new InternalTexture(engine, InternalTextureSource.Raw2DArray, true);
    Object.assign(texture, { width, height, depth, is2DArray: true, isReady: true, _bufferView: data });
    return texture;
  });
});
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });

function source() {
  const manager = new MorphTargetManager(scene);
  manager.areUpdatesFrozen = true;
  for (const [index, name] of ['Expression_BlinkLeft', 'Corrective_Knee'].entries()) {
    const target = new MorphTarget(name, index ? .2 : .7, scene);
    target.setPositions(new Float32Array([0, index, 0, 1, index, 0, 0, index + 1, 0]));
    target.setNormals(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
    manager.addTarget(target);
  }
  manager.areUpdatesFrozen = false;
  return manager;
}

const texture = (manager: MorphTargetManager) => (manager as unknown as { _targetStoreTexture: BaseTexture })._targetStoreTexture;
const references = (internal: InternalTexture) => (internal as unknown as { _references: number })._references;

it('keeps exact native GPU data while poses and disposal remain independent', () => {
  const template = source();
  const internal = texture(template).getInternalTexture()!;
  const data = Array.from((internal as unknown as { _bufferView: Float32Array })._bufferView);
  const nativeClone = template.clone;
  const store = shareAvatarMorphTargetBuffers(scene, template);
  template.useTextureToStoreTargets = false;
  const a = template.clone(), b = template.clone();
  expect(engine.createRawTexture2DArray).toHaveBeenCalledTimes(1);
  expect(texture(a)).not.toBe(texture(b));
  expect(texture(a).getInternalTexture()).toBe(internal);
  expect(texture(b).getInternalTexture()).toBe(internal);
  expect(Array.from((internal as unknown as { _bufferView: Float32Array })._bufferView)).toEqual(data);
  expect(references(internal)).toBe(3);
  expect(a.vertexCount).toBe(3); expect(a.supportsPositions).toBe(true); expect(a.supportsNormals).toBe(true);
  expect(a.getTarget(0)).not.toBe(b.getTarget(0));
  a.getTarget(0).influence = 0; b.getTarget(1).influence = .9;
  expect(Array.from(a.influences)).toEqual([expect.closeTo(.2)]);
  expect(Array.from(b.influences)).toEqual([expect.closeTo(.7), expect.closeTo(.9)]);
  expect(template.getTarget(0).influence).toBe(.7);
  a.dispose(); expect(references(internal)).toBe(2);
  // The final visible copy still owns the upload after its source pool closes.
  store.dispose(); store.dispose(); expect(references(internal)).toBe(1);
  expect(template.clone).toBe(nativeClone);
  expect(texture(b).isReady()).toBe(true);
  b.dispose(); expect(references(internal)).toBe(0);
});

it('uses native storage when a visible copy changes target data or layout', () => {
  const template = source(), store = shareAvatarMorphTargetBuffers(scene, template);
  const a = template.clone(), b = template.clone();
  const shared = texture(b).getInternalTexture();
  a.getTarget(0).setPositions(new Float32Array([4, 0, 0, 5, 0, 0, 4, 1, 0]));
  a.synchronize();
  expect(engine.createRawTexture2DArray).toHaveBeenCalledTimes(2);
  expect(texture(a).getInternalTexture()).not.toBe(shared);
  expect(texture(b).getInternalTexture()).toBe(shared);
  expect(b.getTarget(0).getPositions()![0]).toBe(0);
  a.getTarget(1).setNormals(null!);
  expect(a.supportsNormals).toBe(false); expect(b.supportsNormals).toBe(true);
  a.dispose(); b.dispose(); store.dispose();
});

it('falls back when the source arrays change and leaves unsupported managers native', () => {
  const template = source(), store = shareAvatarMorphTargetBuffers(scene, template);
  template.getTarget(0).setPositions(new Float32Array([4, 0, 0, 5, 0, 0, 4, 1, 0]));
  const copy = template.clone();
  expect(engine.createRawTexture2DArray).toHaveBeenCalledTimes(2);
  expect(texture(copy).getInternalTexture()).not.toBe(texture(template).getInternalTexture());
  copy.dispose(); store.dispose();
  template.useTextureToStoreTargets = false;
  const native = template.clone;
  const unsupported = shareAvatarMorphTargetBuffers(scene, template);
  expect(unsupported.bytes).toBe(0); expect(template.clone).toBe(native); unsupported.dispose();
});
