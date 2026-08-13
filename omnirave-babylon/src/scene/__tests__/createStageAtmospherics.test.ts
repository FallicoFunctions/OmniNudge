import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createStageAtmospherics } from '../createStageAtmospherics';

describe('createStageAtmospherics', () => {
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

  it('builds haze, jets, fountains and strobe pods without throwing under NullEngine', () => {
    const atmo = createStageAtmospherics(scene, { getFrequencyData: zeroSource });

    // 6 flame heat-glow spheres + 6 strobe pods.
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('stage-atmo-flame-glow-')).length).toBe(6);
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('stage-atmo-strobe-')).length).toBe(6);
    // 1 haze + 6 CO2 + 6 flame + 4 spark particle systems.
    expect(scene.particleSystems.filter((system) => system.name.startsWith('stage-atmo-')).length).toBe(17);

    expect(() => atmo.update(0.016)).not.toThrow();
    atmo.dispose();
  });

  it('does not throw on update with zero spectrum or with injected loud audio', () => {
    const atmo = createStageAtmospherics(scene, { getFrequencyData: loudSource });
    for (let i = 0; i < 60; i++) {
      expect(() => atmo.update(0.016)).not.toThrow();
    }
    atmo.dispose();
  });

  it('stays haze-only on a zero spectrum: no CO2, flames, sparks or strobes', () => {
    const atmo = createStageAtmospherics(scene, { getFrequencyData: zeroSource });
    for (let i = 0; i < 120; i++) {
      atmo.update(0.05);
    }
    expect(atmo.hazeRate).toBeGreaterThan(0);
    expect(atmo.activeCo2Bursts).toBe(0);
    expect(atmo.flameBurstCount).toBe(0);
    expect(atmo.strobeFlashCount).toBe(0);
    expect(atmo.sparkRate).toBe(0);
    atmo.dispose();
  });

  it('loud sustained bass fires CO2 blasts, strobe flashes and eventually flame bursts', () => {
    const atmo = createStageAtmospherics(scene, { getFrequencyData: loudSource });

    // 3 seconds of sustained loud audio: the first frame is a strong punch
    // (CO2 + strobe) and the slow envelope crosses the flame threshold.
    for (let i = 0; i < 60; i++) {
      atmo.update(0.05);
    }
    expect(atmo.activeCo2Bursts).toBeGreaterThanOrEqual(1);
    expect(atmo.strobeFlashCount).toBeGreaterThanOrEqual(1);
    expect(atmo.flameBurstCount).toBeGreaterThanOrEqual(1);
    atmo.dispose();
  });

  it('strobe count grows across repeated strong punches, respecting the cooldown', () => {
    let loud = false;
    const atmo = createStageAtmospherics(scene, {
      getFrequencyData: (target) => (loud ? loudSource(target) : zeroSource(target)),
    });

    // Three strong punches spaced beyond the 3s strobe cooldown.
    const countAfterPunch: number[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      loud = true;
      atmo.update(0.1);
      countAfterPunch.push(atmo.strobeFlashCount);
      loud = false;
      for (let i = 0; i < 35; i++) {
        atmo.update(0.1); // 3.5s of quiet clears bass, punch and the cooldown
      }
    }
    expect(countAfterPunch[0]).toBeGreaterThanOrEqual(1);
    expect(countAfterPunch[1]).toBeGreaterThan(countAfterPunch[0]);
    expect(countAfterPunch[2]).toBeGreaterThan(countAfterPunch[1]);
    atmo.dispose();
  });

  it('active mode runs the cold-spark fountains continuously; lead_in silences pyro', () => {
    const atmo = createStageAtmospherics(scene, { getFrequencyData: loudSource });

    atmo.setEventState({ phase: 'active' });
    atmo.update(0.05);
    expect(atmo.sparkRate).toBeGreaterThan(0);

    // lead_in: haze stays up but no new pyro punctuation fires. Let any burst
    // already in flight (started by the active-mode punch) finish first.
    atmo.setEventState({ phase: 'lead_in', countdownSeconds: 10 });
    for (let i = 0; i < 10; i++) {
      atmo.update(0.05);
    }
    const co2Before = atmo.activeCo2Bursts;
    const flamesBefore = atmo.flameBurstCount;
    const strobesBefore = atmo.strobeFlashCount;
    for (let i = 0; i < 40; i++) {
      atmo.update(0.05);
    }
    expect(atmo.sparkRate).toBe(0);
    expect(atmo.hazeRate).toBeGreaterThan(0);
    expect(atmo.activeCo2Bursts).toBe(co2Before);
    expect(atmo.flameBurstCount).toBe(flamesBefore);
    expect(atmo.strobeFlashCount).toBe(strobesBefore);

    // null recovers to normal without throwing.
    atmo.setEventState(null);
    expect(() => atmo.update(0.05)).not.toThrow();
    atmo.dispose();
  });

  it('returns an inert no-op when the Main Stage venue is absent', () => {
    const bare = new Scene(engine);
    const atmo = createStageAtmospherics(bare, { getFrequencyData: zeroSource });
    expect(atmo.activeCo2Bursts).toBe(0);
    expect(atmo.flameBurstCount).toBe(0);
    expect(atmo.strobeFlashCount).toBe(0);
    expect(atmo.sparkRate).toBe(0);
    expect(atmo.hazeRate).toBe(0);
    expect(bare.particleSystems.length).toBe(0);
    expect(bare.getMeshByName('stage-atmo-strobe-0')).toBeNull();
    expect(() => atmo.update(0.016)).not.toThrow();
    expect(() => atmo.setEventState({ phase: 'active' })).not.toThrow();
    expect(() => atmo.dispose()).not.toThrow();
    bare.dispose();
  });

  it('dispose returns this module owned resources to baseline', () => {
    const ownResources = () =>
      [...scene.meshes, ...scene.materials, ...scene.textures, ...scene.particleSystems].filter((resource) =>
        resource.name.startsWith('stage-atmo-'),
      ).length;

    expect(ownResources()).toBe(0);
    const atmo = createStageAtmospherics(scene, { getFrequencyData: loudSource });
    // 12 meshes + 2 materials + 17 particle systems (+ sprite texture).
    expect(ownResources()).toBeGreaterThanOrEqual(31);
    atmo.update(0.016);
    atmo.dispose();

    expect(ownResources()).toBe(0);
  });
});
