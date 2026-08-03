import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFireworksShow } from '../createFireworksShow';

describe('createFireworksShow', () => {
  let engine: NullEngine;
  let scene: Scene;
  const zeroSource = (target: Uint8Array) => target.fill(0);
  const loudSource = (target: Uint8Array) => target.fill(220);

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The venue-present sentinel: without it the module returns an inert no-op.
    MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('is a no-op when the Main Stage venue is not present', () => {
    const bareEngine = new NullEngine();
    const bareScene = new Scene(bareEngine);
    const show = createFireworksShow(bareScene, { getFrequencyData: zeroSource });
    expect(() => show.update(0.016)).not.toThrow();
    expect(show.activeShellCount).toBe(0);
    expect(show.aerialBurstCount).toBe(0);
    show.dispose();
    bareScene.dispose();
    bareEngine.dispose();
  });

  it('builds its particle pools and rocket meshes without throwing under NullEngine', () => {
    const show = createFireworksShow(scene, { getFrequencyData: zeroSource });

    expect(scene.meshes.filter((m) => m.name.startsWith('fireworks-rocket-')).length).toBe(8);
    // 12 burst + 8 rocket-trail + 4 stage-pyro particle systems.
    expect(scene.particleSystems.filter((p) => p.name.startsWith('fireworks-')).length).toBe(24);

    expect(() => show.update(0.016)).not.toThrow();
    show.dispose();
  });

  it('idle phase (no event state) produces zero shells and zero bursts, cheaply', () => {
    const show = createFireworksShow(scene, { getFrequencyData: loudSource });

    for (let i = 0; i < 120; i++) {
      show.update(0.05);
    }
    expect(show.activeShellCount).toBe(0);
    expect(show.aerialBurstCount).toBe(0);
    expect(show.stagePyroBurstCount).toBe(0);
    expect(show.skyWriteActive).toBe(false);
    show.dispose();
  });

  it('lead_in and recovery phases stay fully idle (no launches)', () => {
    const show = createFireworksShow(scene, { getFrequencyData: loudSource });

    show.setEventState({ phase: 'lead_in', countdownSeconds: 5 });
    for (let i = 0; i < 60; i++) show.update(0.05);
    expect(show.aerialBurstCount).toBe(0);
    expect(show.stagePyroBurstCount).toBe(0);

    show.setEventState({ phase: 'recovery' });
    for (let i = 0; i < 60; i++) show.update(0.05);
    expect(show.aerialBurstCount).toBe(0);
    expect(show.stagePyroBurstCount).toBe(0);

    show.dispose();
  });

  it('active phase minute 1 (elegant) launches rockets and fires aerial bursts', () => {
    const show = createFireworksShow(scene, { getFrequencyData: loudSource });

    show.setEventState({ phase: 'active', activeMinute: 1 });
    expect(show.showIntensity01).toBe(0);
    for (let i = 0; i < 200; i++) show.update(0.05); // 10s of simulated time
    expect(show.aerialBurstCount).toBeGreaterThan(0);
    expect(show.stagePyroBurstCount).toBeGreaterThan(0);

    show.dispose();
  });

  it('minute 3 (bombastic) fires more aerial bursts than minute 1 (elegant) over the same duration', () => {
    const elegantShow = createFireworksShow(scene, { getFrequencyData: zeroSource });
    elegantShow.setEventState({ phase: 'active', activeMinute: 1 });
    for (let i = 0; i < 200; i++) elegantShow.update(0.05); // 10s
    const elegantBursts = elegantShow.aerialBurstCount;
    expect(elegantShow.showIntensity01).toBe(0);
    elegantShow.dispose();

    const engine2 = new NullEngine();
    const scene2 = new Scene(engine2);
    MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene2);
    const bombasticShow = createFireworksShow(scene2, { getFrequencyData: zeroSource });
    bombasticShow.setEventState({ phase: 'active', activeMinute: 3 });
    for (let i = 0; i < 200; i++) bombasticShow.update(0.05); // 10s
    const bombasticBursts = bombasticShow.aerialBurstCount;
    expect(bombasticShow.showIntensity01).toBe(1);
    bombasticShow.dispose();
    scene2.dispose();
    engine2.dispose();

    expect(bombasticBursts).toBeGreaterThan(elegantBursts);
  });

  it('sky-writes OMNIRAVE once at the transition into minute 2, and again into minute 3', () => {
    const show = createFireworksShow(scene, { getFrequencyData: zeroSource });

    show.setEventState({ phase: 'active', activeMinute: 1 });
    show.update(0.05);
    expect(show.skyWriteBurstCount).toBe(0);

    show.setEventState({ phase: 'active', activeMinute: 2 });
    for (let i = 0; i < 40; i++) show.update(0.05); // drain the sky-write queue
    const afterMinute2 = show.skyWriteBurstCount;
    expect(afterMinute2).toBeGreaterThan(0);
    expect(show.skyWriteActive).toBe(false); // queue fully drained

    // Staying in minute 2 must not re-trigger the sequence.
    for (let i = 0; i < 20; i++) show.update(0.05);
    expect(show.skyWriteBurstCount).toBe(afterMinute2);

    show.setEventState({ phase: 'active', activeMinute: 3 });
    for (let i = 0; i < 40; i++) show.update(0.05);
    expect(show.skyWriteBurstCount).toBeGreaterThan(afterMinute2);

    show.dispose();
  });

  it('recovery after an active show stops new launches; in-flight shells finish naturally', () => {
    const show = createFireworksShow(scene, { getFrequencyData: zeroSource });

    show.setEventState({ phase: 'active', activeMinute: 1 });
    show.update(0.05); // launches at least one shell (timer starts at 0)
    expect(show.activeShellCount).toBeGreaterThan(0);

    show.setEventState({ phase: 'recovery' });
    const burstsAtRecoveryStart = show.aerialBurstCount;
    // Let any in-flight shells finish (ascent is a few seconds at most).
    for (let i = 0; i < 100; i++) show.update(0.05);
    expect(show.activeShellCount).toBe(0);
    expect(show.aerialBurstCount).toBeGreaterThanOrEqual(burstsAtRecoveryStart);

    // No further launches after everything has settled.
    const settledBursts = show.aerialBurstCount;
    for (let i = 0; i < 40; i++) show.update(0.05);
    expect(show.aerialBurstCount).toBe(settledBursts);

    show.dispose();
  });

  it('dispose returns the module\'s own meshes/materials/particle systems to baseline', () => {
    // Scoped to this module's own 'fireworks-' prefixed artifacts (rather than
    // raw scene-wide counts): NullEngine/Babylon can lazily materialize its
    // own scene-owned singletons (e.g. a cached "default material") as a side
    // effect of unrelated mesh/material activity, which is not a leak surface
    // this module controls or owns.
    const meshCountBefore = scene.meshes.filter((m) => m.name.startsWith('fireworks-')).length;
    const materialCountBefore = scene.materials.filter((m) => m.name.startsWith('fireworks-')).length;
    const particleCountBefore = scene.particleSystems.filter((p) => p.name.startsWith('fireworks-')).length;
    expect(meshCountBefore).toBe(0);
    expect(materialCountBefore).toBe(0);
    expect(particleCountBefore).toBe(0);

    const show = createFireworksShow(scene, { getFrequencyData: loudSource });
    show.setEventState({ phase: 'active', activeMinute: 3 });
    for (let i = 0; i < 60; i++) show.update(0.05);
    show.dispose();

    expect(scene.meshes.filter((m) => m.name.startsWith('fireworks-')).length).toBe(meshCountBefore);
    expect(scene.materials.filter((m) => m.name.startsWith('fireworks-')).length).toBe(materialCountBefore);
    expect(scene.particleSystems.filter((p) => p.name.startsWith('fireworks-')).length).toBe(particleCountBefore);
  });
});
