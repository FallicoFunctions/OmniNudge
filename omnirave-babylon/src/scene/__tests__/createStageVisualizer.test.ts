import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
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

  it('drives the hero panels and reports the panel count', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(visualizer.panels).toBe(2);
    // Both panels share the visualizer's material.
    const materialL = scene.getMeshByName('main-stage-hero-screen-panel-l')?.material;
    const materialR = scene.getMeshByName('main-stage-hero-screen-panel-r')?.material;
    expect(materialL).not.toBeNull();
    expect(materialL).toBe(materialR);
    visualizer.dispose();
  });

  it('returns an inert no-op when no hero panels exist', () => {
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(visualizer.panels).toBe(0);
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

  it('disposes its own material and texture on dispose, leaving neither behind', () => {
    // Asserting on the visualizer's OWN named resources rather than raw scene
    // counts: NullEngine lazily creates a shared `default material` as a side
    // effect that is not ours to dispose, so a raw baseline diff would be
    // fooled by that noise.
    buildPanels();
    const hasMaterial = () => scene.materials.some((m) => m.name === 'main-stage-visualizer-material');
    const hasTexture = () => scene.textures.some((t) => t.name === 'main-stage-visualizer');

    expect(hasMaterial()).toBe(false);
    expect(hasTexture()).toBe(false);

    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    expect(hasMaterial()).toBe(true);
    expect(hasTexture()).toBe(true);

    visualizer.dispose();
    expect(hasMaterial()).toBe(false);
    expect(hasTexture()).toBe(false);
  });
});
