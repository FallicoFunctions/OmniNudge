import { expect, it, vi } from 'vitest';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
const copier = vi.hoisted(() => ({ isReady: vi.fn(() => true), copy: vi.fn(() => true), dispose: vi.fn() }));
vi.mock('@babylonjs/core/Misc/copyTextureToTexture.js', () => ({ CopyTextureToTexture: vi.fn(function() { return copier; }) }));
import { reuseAvatarTransmissionBackground } from '../reuseAvatarTransmissionBackground';

it('keeps native refraction until copying succeeds and restores it when HDR copying is unavailable', () => {
  let frame = 1;
  const hdr = { texture: {} }, targetBuffer = {}, viewport = {};
  const engine = { isWebGPU: true, _currentRenderTarget: hdr as unknown, currentViewport: viewport,
    bindFramebuffer: vi.fn(), setViewport: vi.fn() };
  const native = vi.fn(() => true), target = { samples: 4, _shouldRender: native, renderTarget: targetBuffer };
  const post = { inputTexture: hdr as unknown };
  const scene = { getEngine: () => engine, metadata: { reuseTransmissionExperiment: true }, getFrameId: () => frame,
    activeCamera: { _postProcesses: [null, post] }, setRenderingAutoClearDepthStencil: vi.fn(), resetCachedMaterial: vi.fn(),
    onBeforeRenderingGroupObservable: new Observable(), onDisposeObservable: new Observable() };
  reuseAvatarTransmissionBackground(scene as unknown as Scene, target as unknown as RenderTargetTexture, []);
  const render = () => scene.onBeforeRenderingGroupObservable.notifyObservers({ renderingGroupId: 3 });
  expect(target._shouldRender()).toBe(true);
  render(); frame++;
  expect(target._shouldRender()).toBe(false);
  expect(engine.bindFramebuffer).toHaveBeenLastCalledWith(hdr);
  expect(engine.setViewport).toHaveBeenLastCalledWith(viewport);
  copier.isReady.mockReturnValue(false); expect(target._shouldRender()).toBe(true);
  copier.isReady.mockReturnValue(true);
  post.inputTexture = undefined; expect(target._shouldRender()).toBe(true);
  post.inputTexture = hdr;
  engine._currentRenderTarget = { texture: {} }; render(); frame++;
  expect(target._shouldRender()).toBe(true); expect(copier.copy).toHaveBeenCalledTimes(1);
  engine._currentRenderTarget = hdr; copier.copy.mockReturnValue(false); render(); frame++;
  expect(target._shouldRender()).toBe(true);
  copier.copy.mockReturnValue(true); render(); frame++;
  expect(target._shouldRender()).toBe(false);
  scene.onDisposeObservable.notifyObservers(null);
  expect(target._shouldRender).toBe(native); expect(copier.dispose).toHaveBeenCalledOnce();
});
