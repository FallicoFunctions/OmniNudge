import { MeshBuilder, NullEngine, ParticleSystem, Scene } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FireworksAudio } from '../../audio/createFireworksAudio';
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
    // 12 color bursts + 12 narrow hot cores + 8 rocket trails + 4 stage pyro.
    expect(scene.particleSystems.filter((p) => p.name.startsWith('fireworks-')).length).toBe(36);

    expect(() => show.update(0.016)).not.toThrow();
    show.dispose();
  });

  it('builds crisp, stretched, high-density shells with pooled ignition flashes', () => {
    const show = createFireworksShow(scene, { getFrequencyData: zeroSource });
    const colorShells = scene.particleSystems.filter((p) => /^fireworks-burst-\d+$/.test(p.name));
    const hotCores = scene.particleSystems.filter((p) => p.name.startsWith('fireworks-burst-core-'));
    const flashes = scene.meshes.filter((m) => m.name.startsWith('fireworks-burst-flash-'));

    expect(colorShells).toHaveLength(12);
    expect(hotCores).toHaveLength(12);
    expect(flashes).toHaveLength(12);
    expect(colorShells.every((p) => p.getCapacity() === 520)).toBe(true);
    expect(colorShells.every((p) => p.billboardMode === ParticleSystem.BILLBOARDMODE_STRETCHED)).toBe(true);
    expect(hotCores.every((p) => p.billboardMode === ParticleSystem.BILLBOARDMODE_STRETCHED)).toBe(true);
    expect(colorShells[0].particleTexture?.name).toBe('fireworks-crisp-spark-sprite');
    expect(colorShells[0].maxLifeTime).toBeGreaterThan(2);
    expect(hotCores[0].maxScaleX).toBeLessThan(colorShells[0].maxScaleX);

    show.setEventState({ phase: 'active', activeMinute: 3 });
    for (let i = 0; i < 28; i++) show.update(0.05);
    expect(flashes.some((flash) => flash.isEnabled())).toBe(true);

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

  it('sends one spatial audio cue for every rocket launch and visible apex explosion', () => {
    const launches: Array<{ x: number; y: number; z: number }> = [];
    const explosions: Array<{ x: number; y: number; z: number }> = [];
    const audio: FireworksAudio = {
      unlock: vi.fn(),
      updateListener: vi.fn(),
      playLaunch(position) {
        launches.push({ ...position });
      },
      playExplosion(position) {
        explosions.push({ ...position });
      },
      dispose: vi.fn(),
    };
    const show = createFireworksShow(scene, {
      getFrequencyData: zeroSource,
      audioFactory: () => audio,
    });

    show.unlockAudio();
    expect(audio.unlock).toHaveBeenCalledOnce();
    show.setEventState({ phase: 'active', activeMinute: 1 });
    for (let i = 0; i < 120; i++) show.update(0.05);

    expect(launches.length).toBe(show.launchAudioCueCount);
    expect(explosions.length).toBe(show.explosionAudioCueCount);
    expect(launches.length).toBeGreaterThan(0);
    expect(explosions.length).toBe(show.aerialBurstCount);
    expect(launches[0]).toMatchObject({ y: 6, z: 13 });
    expect(explosions[0].y).toBeGreaterThanOrEqual(34);

    show.dispose();
    expect(audio.dispose).toHaveBeenCalledOnce();
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
