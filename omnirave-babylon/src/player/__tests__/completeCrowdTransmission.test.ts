import { NullEngine, PBRMaterial, RenderTargetTexture, Scene } from '@babylonjs/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompleteCrowdTransmission } from '../completeCrowdTransmission';

let engine: NullEngine | undefined;
afterEach(() => { vi.restoreAllMocks(); engine?.dispose(); });

function fixture() {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new PBRMaterial('jacket', scene);
  material.metadata = { gltf: { extras: { launchTransmission: true } } };
  material.subSurface.isRefractionEnabled = true;
  material.subSurface.refractionIntensity = .85;
  function background(width = 1024, height = 1024) {
    const texture = new RenderTargetTexture('opaque scene', { width, height }, scene, true);
    // NullEngine has no multisampled framebuffer; model only that GPU property.
    let samples = 4;
    Object.defineProperty(texture, 'samples', { get: () => samples, set: value => { samples = value; } });
    return texture;
  }
  return { scene, material, background };
}

it('handles late assignment, preserves optics, restores close quality and avoids repeated allocation', () => {
  const { material, background } = fixture();
  const quality = createCompleteCrowdTransmission();
  quality.watch(material); quality.update(false);
  expect(quality.stats()).toEqual([]);
  const target = background(1024, 768);
  const resize = vi.spyOn(target, 'resize');
  material.subSurface.refractionTexture = target;
  quality.update(false);
  expect(quality.stats()).toEqual([{ width: 512, height: 384, samples: 1 }]);
  quality.update(false);
  expect(resize).toHaveBeenCalledOnce();
  expect(material.subSurface.refractionIntensity).toBe(.85);
  expect(material.subSurface.isRefractionEnabled).toBe(true);
  expect(material.subSurface.refractionTexture).toBe(target);
  quality.update(true);
  expect(quality.stats()).toEqual([{ width: 1024, height: 768, samples: 4 }]);
  quality.update(false); quality.dispose(); quality.dispose();
  expect(target.getSize()).toEqual({ width: 1024, height: 768 });
  expect(target.samples).toBe(4);
  expect(target.getInternalTexture()).not.toBeNull();
});

it('keeps full quality while another owner needs it and restores the original on the last release', () => {
  const { material, background } = fixture();
  const target = background(); material.subSurface.refractionTexture = target;
  const far = createCompleteCrowdTransmission(), near = createCompleteCrowdTransmission();
  far.watch(material); near.watch(material);
  far.update(false); near.update(true); far.update(false);
  expect(target.getSize().width).toBe(1024); expect(target.samples).toBe(4);
  near.dispose();
  expect(target.getSize().width).toBe(512); expect(target.samples).toBe(1);
  far.dispose();
  expect(target.getSize().width).toBe(1024); expect(target.samples).toBe(4);
});

it('releases replaced backgrounds, skips unrelated materials and tolerates target disposal', () => {
  const { scene, material, background } = fixture();
  const unrelated = new PBRMaterial('unrelated glass', scene), untouched = background();
  unrelated.subSurface.refractionTexture = untouched;
  const old = background(), next = background(256, 128);
  material.subSurface.refractionTexture = old;
  const quality = createCompleteCrowdTransmission();
  quality.watch(material); quality.watch(unrelated); quality.update(false);
  expect(untouched.getSize().width).toBe(1024); expect(untouched.samples).toBe(4);
  material.subSurface.refractionTexture = next; quality.update(false);
  expect(old.getSize().width).toBe(1024); expect(old.samples).toBe(4);
  expect(next.getSize()).toEqual({ width: 256, height: 128 });
  next.dispose(); quality.update(false);
  expect(quality.stats()).toEqual([]);
  quality.dispose(); quality.watch(material); quality.update(false);
  expect(quality.stats()).toEqual([]);
});
