import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStageVisualizer, resolveVisualizerMode } from '../createStageVisualizer';

const HERO_PANELS = ['main-stage-hero-screen-panel-l', 'main-stage-hero-screen-panel-r'];

describe('resolveVisualizerMode', () => {
  it('maps the fireworks event phases and defaults everything else to normal', () => {
    expect(resolveVisualizerMode(null)).toBe('normal');
    expect(resolveVisualizerMode(undefined)).toBe('normal');
    expect(resolveVisualizerMode({ phase: 'lead_in', countdownSeconds: 12 })).toBe('lead_in');
    expect(resolveVisualizerMode({ phase: 'active' })).toBe('active');
    expect(resolveVisualizerMode({ phase: 'none' })).toBe('normal');
    expect(resolveVisualizerMode({ phase: 'recovery' })).toBe('normal');
    expect(resolveVisualizerMode({ phase: 'anything-unknown' })).toBe('normal');
  });
});

describe('createStageVisualizer', () => {
  let engine: NullEngine;
  let scene: Scene;
  const zeroSource = (target: Uint8Array) => target.fill(0);
  const loudSource = (target: Uint8Array) => target.fill(200);

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function buildPanels() {
    for (const name of HERO_PANELS) {
      MeshBuilder.CreatePlane(name, { size: 1 }, scene);
    }
  }

  function barMesh(): Mesh {
    const mesh = scene.getMeshByName('main-stage-visualizer-bars');
    expect(mesh != null).toBe(true);
    return mesh as Mesh;
  }

  it('hides the old flat panels while alive and re-enables them on dispose', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(visualizer.panels).toBe(2);
    for (const name of HERO_PANELS) {
      expect(scene.getMeshByName(name)?.isEnabled()).toBe(false);
    }
    visualizer.dispose();
    for (const name of HERO_PANELS) {
      expect(scene.getMeshByName(name)?.isEnabled()).toBe(true);
    }
  });

  it('builds the 3D bar field as a large thin-instance batch plus the backing plane', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(barMesh().thinInstanceCount).toBeGreaterThan(300);
    expect(scene.getMeshByName('main-stage-visualizer-backing') != null).toBe(true);
    visualizer.dispose();
  });

  it('returns an inert no-op when no hero panels exist', () => {
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(visualizer.panels).toBe(0);
    expect(scene.getMeshByName('main-stage-visualizer-bars')).toBeNull();
    expect(() => visualizer.update(0.016)).not.toThrow();
    expect(() => visualizer.setEventState({ phase: 'lead_in' })).not.toThrow();
    expect(() => visualizer.dispose()).not.toThrow();
  });

  it('update does not throw under NullEngine across every mode', () => {
    buildPanels();
    const source = vi.fn(zeroSource);
    const visualizer = createStageVisualizer(scene, { getFrequencyData: source });

    // Normal reactive mode.
    expect(() => visualizer.update(0.016)).not.toThrow();

    // Fireworks lead-in: countdown overlay.
    visualizer.setEventState({ phase: 'lead_in', countdownSeconds: 8 });
    expect(() => visualizer.update(0.016)).not.toThrow();

    // Fireworks active: placeholder video mode.
    visualizer.setEventState({ phase: 'active' });
    expect(() => visualizer.update(0.016)).not.toThrow();

    // Back to normal.
    visualizer.setEventState(null);
    expect(() => visualizer.update(0.016)).not.toThrow();

    visualizer.dispose();
  });

  it('extrudes bars on audio energy: non-zero spectrum changes the matrix buffer vs all-zero', () => {
    buildPanels();
    let loud = false;
    const visualizer = createStageVisualizer(scene, {
      getFrequencyData: (target) => (loud ? loudSource(target) : zeroSource(target)),
    });

    const readDepths = () => {
      const mesh = barMesh();
      // thinInstanceBufferUpdated (the per-frame path) refreshes the GPU
      // buffer but not thinInstanceGetWorldMatrices' lazy cache, so drop the
      // cache to read the live matrix data.
      (mesh as unknown as { _thinInstanceDataStorage: { worldMatrices: unknown } })._thinInstanceDataStorage.worldMatrices = null;
      // Depth scale lives at element 10 of each column-major 4x4 matrix.
      return mesh.thinInstanceGetWorldMatrices().map((m) => m.m[10]);
    };

    visualizer.update(0.016);
    const idleDepths = readDepths();

    loud = true;
    // A few frames so the smoothing converges well away from idle.
    for (let i = 0; i < 30; i++) {
      visualizer.update(0.016);
    }
    const loudDepths = readDepths();

    expect(loudDepths.length).toBe(idleDepths.length);
    // Assert on primitives only (never Babylon objects): max depth grows well
    // past the idle field's, showing the buffer really re-uploaded.
    const maxIdle = Math.max(...idleDepths);
    const maxLoud = Math.max(...loudDepths);
    expect(maxLoud).toBeGreaterThan(maxIdle + 0.5);

    visualizer.dispose();
  });

  it('disposes its own meshes, material and texture on dispose, leaving none behind', () => {
    // Asserting on the visualizer's OWN named resources rather than raw scene
    // counts: NullEngine lazily creates a shared `default material` as a side
    // effect that is not ours to dispose, so a raw baseline diff would be
    // fooled by that noise.
    buildPanels();
    const ownNames = [
      'main-stage-visualizer-backing',
      'main-stage-visualizer-bars',
      'main-stage-visualizer-material',
      'main-stage-visualizer-bar-material',
      'main-stage-visualizer',
    ];
    const liveOwnResources = () =>
      [...scene.meshes, ...scene.materials, ...scene.textures].filter((resource) =>
        ownNames.includes(resource.name),
      ).length;

    expect(liveOwnResources()).toBe(0);
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(liveOwnResources()).toBeGreaterThanOrEqual(4);
    visualizer.dispose();
    expect(liveOwnResources()).toBe(0);
  });
});
