import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStageVisualizer } from '../createStageVisualizer';

let engine: NullEngine, scene: Scene;
beforeEach(() => {
  const context = Object.fromEntries(['fillRect', 'fillText', 'clearRect', 'drawImage', 'save', 'restore',
    'translate', 'scale', 'rotate', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'ellipse']
    .map(name => [name, vi.fn()]));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  engine = new NullEngine(); scene = new Scene(engine);
  MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', {}, scene);
});
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });

it('keeps animated bars and fades live while retaining identical backing pixels', () => {
  const upload = vi.spyOn(DynamicTexture.prototype, 'update').mockImplementation(() => {});
  let volume = 180;
  const visualizer = createStageVisualizer(scene, { getFrequencyData: target => target.fill(volume) });
  upload.mockClear();
  visualizer.update(.3); visualizer.update(.3);
  expect(upload).toHaveBeenCalledTimes(2); // Every changing fade frame is uploaded.
  visualizer.update(1); // Fully visible wordmark.
  const bars = scene.getMeshByName('main-stage-visualizer-bars')!;
  const matrices = Array.from((bars as import('@babylonjs/core').Mesh).thinInstanceGetWorldMatrices()[0].m);
  upload.mockClear();
  volume = 25;
  visualizer.update(.1); visualizer.update(.1);
  expect(upload).not.toHaveBeenCalled();
  (bars as unknown as { _thinInstanceDataStorage: { worldMatrices: unknown } })._thinInstanceDataStorage.worldMatrices = null;
  expect(Array.from((bars as import('@babylonjs/core').Mesh).thinInstanceGetWorldMatrices()[0].m)).not.toEqual(matrices);
  visualizer.update(4); // Blank background.
  upload.mockClear();
  visualizer.update(1); visualizer.update(1);
  expect(upload).not.toHaveBeenCalled();
  visualizer.update(16.4); // Next wordmark fade starts at 24.2 seconds.
  expect(upload).toHaveBeenCalledTimes(1);
});

it('invalidates title changes, event transitions and every pulsing countdown frame', () => {
  const upload = vi.spyOn(DynamicTexture.prototype, 'update').mockImplementation(() => {});
  const visualizer = createStageVisualizer(scene, { getFrequencyData: target => target.fill(0) });
  visualizer.setTrackInfo('First artist', 'First track', 'one');
  visualizer.update(1); upload.mockClear();
  visualizer.update(.1); visualizer.update(.1);
  expect(upload).not.toHaveBeenCalled();
  visualizer.setTrackInfo('Second artist', 'Second track', 'two');
  visualizer.update(1);
  expect(upload).toHaveBeenCalledTimes(1);
  visualizer.setEventState({ phase: 'lead_in', countdownSeconds: 8 });
  visualizer.update(.1); visualizer.update(.1);
  expect(upload).toHaveBeenCalledTimes(3);
  visualizer.setEventState(null); visualizer.update(.1);
  expect(upload).toHaveBeenCalledTimes(4);
  visualizer.update(.1);
  expect(upload).toHaveBeenCalledTimes(4);
  visualizer.setEventState({ phase: 'active', activeMinute: 1 });
  visualizer.update(.1); visualizer.update(.1);
  expect(upload).toHaveBeenCalledTimes(6);
});
