import { Mesh, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createVenueCpuProfile } from '../createVenueCpuProfile';

afterEach(() => vi.restoreAllMocks());

it('counts only accepted frames, separates nested work, preserves returns and restores own/inherited methods', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  Object.defineProperty(engine, 'isWebGPU', { get: () => true });
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const draw = function(this: unknown, count: number) { expect(this).toBe(engine); time += 2; return count * 2; };
  const native = Object.assign(engine, { _draw: draw, compatibilityMode: true,
    _cacheRenderPipeline: { vertexBuffers: [1, 2, 3] } });
  const animate = () => { time++; const result = native._draw(7); time += 3; return result; };
  scene._animate = animate;
  const meshRender = Mesh.prototype.render;
  const animationDescriptor = Object.getOwnPropertyDescriptor(scene, '_animate');
  const matrixWasOwn = Object.hasOwn(scene, '_evaluateActiveMeshes');
  const profile = createVenueCpuProfile(scene);
  try {
    expect(scene._animate()).toBe(14); // outside a benchmark frame
    profile.beginFrame(); scene._animate(); profile.endFrame(false); // warm-up
    expect(profile.measuredFrames()).toBe(0);
    for (let i = 0; i < 2; i++) { profile.beginFrame(); scene._animate(); profile.endFrame(true); }
    expect(profile.measuredFrames()).toBe(2);
    expect(profile.vertexBindingsPerFrame()).toBe(3);
    expect(profile.report()).toEqual(expect.arrayContaining([
      { name: 'Scene animation', callsPerFrame: 1, inclusiveMsPerFrame: 6, selfMsPerFrame: 4 },
      { name: 'GPU draw encoding', callsPerFrame: 1, inclusiveMsPerFrame: 2, selfMsPerFrame: 2 },
    ]));
    profile.dispose(); profile.dispose();
    expect(Mesh.prototype.render).toBe(meshRender); expect(native._draw).toBe(draw);
    expect(Object.getOwnPropertyDescriptor(scene, '_animate')).toEqual(animationDescriptor);
    expect(Object.hasOwn(scene, '_evaluateActiveMeshes')).toBe(matrixWasOwn);
  } finally { profile.dispose(); scene.dispose(); engine.dispose(); }
});

it('unwinds the timing stack on exceptions and starts the next run with empty counters', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  Object.assign(engine, { compatibilityMode: true });
  let time = 0, fail = true;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const failure = new Error('render failed');
  scene._animate = () => { time += 5; if (fail) throw failure; };
  const first = createVenueCpuProfile(scene);
  try {
    first.beginFrame(); expect(() => scene._animate()).toThrow(failure); first.endFrame(false);
    fail = false; first.beginFrame(); scene._animate(); first.endFrame(true);
    expect(first.vertexBindingsPerFrame()).toBeNull(); // WebGL has no WebGPU binding counter.
    expect(first.report().find(row => row.name === 'Scene animation')).toEqual({
      name: 'Scene animation', callsPerFrame: 1, inclusiveMsPerFrame: 5, selfMsPerFrame: 5,
    });
    first.dispose();
    const second = createVenueCpuProfile(scene);
    try {
      expect(second.measuredFrames()).toBe(0); expect(second.report().every(row => row.callsPerFrame === 0)).toBe(true);
      expect(second.vertexBindingsPerFrame()).toBeNull();
    } finally { second.dispose(); }
  } finally { first.dispose(); scene.dispose(); engine.dispose(); }
});
