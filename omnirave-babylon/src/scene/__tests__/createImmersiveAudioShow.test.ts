import { Mesh, MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createImmersiveAudioShow } from '../createImmersiveAudioShow';

describe('createImmersiveAudioShow', () => {
  let engine: NullEngine;
  let scene: Scene;
  const zeroSource = (target: Uint8Array) => target.fill(0);
  const loudSource = (target: Uint8Array) => target.fill(200);

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The venue-present sentinel: without it the show returns an inert no-op.
    MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function coneMaterialIntensity(): number {
    const material = scene.getMaterialByName('immersive-beam-mat-a');
    expect(material instanceof PBRMaterial).toBe(true);
    return (material as PBRMaterial).emissiveIntensity;
  }

  it('creates the layers without throwing under NullEngine', () => {
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });

    expect(show.beams).toBe(18);
    // Dense thin-instanced laser field: hundreds of beams in one mesh.
    expect(show.laserBlades).toBeGreaterThanOrEqual(600);
    expect(show.laserBlades).toBeLessThanOrEqual(800);
    expect(scene.getMeshByName('immersive-beam-0') != null).toBe(true);
    expect(scene.getMeshByName('immersive-laser-beam') != null).toBe(true);
    expect(scene.getMeshByName('immersive-floor-pulse') != null).toBe(true);
    expect(scene.particleSystems.some((system) => system.name === 'immersive-air')).toBe(true);

    show.dispose();
  });

  it('the laser field is one thin-instanced mesh carrying every beam', () => {
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });
    show.update(0.016);
    const beam = scene.getMeshByName('immersive-laser-beam');
    expect(beam instanceof Mesh).toBe(true);
    expect((beam as Mesh).thinInstanceCount).toBe(show.laserBlades);
    show.dispose();
  });

  it('loud bass spikes cone intensity, raises laser brightness and fires the beat flash', () => {
    let loud = false;
    const show = createImmersiveAudioShow(scene, {
      getFrequencyData: (target) => (loud ? loudSource(target) : zeroSource(target)),
    });

    // Idle (silence): dim, calm, no audio energy.
    expect(() => show.update(0.016)).not.toThrow();
    const idleConeIntensity = coneMaterialIntensity();
    const idleLaserIntensity = show.laserIntensity;
    expect(show.bassLevel).toBeNull();
    expect(show.beatFlash).toBe(0);

    // First loud frame is a strong bass punch (raw >> smoothed).
    loud = true;
    expect(() => show.update(0.016)).not.toThrow();
    const punchConeIntensity = coneMaterialIntensity();
    expect(punchConeIntensity).toBeGreaterThan(idleConeIntensity + 1);
    expect(show.laserIntensity).toBeGreaterThan(idleLaserIntensity);
    // Venue-wide beat flash lit up.
    expect(show.beatFlash).toBeGreaterThan(0);
    expect(show.bassLevel).not.toBeNull();
    expect(show.bassLevel!).toBeGreaterThan(0);
    expect(show.bassLevel!).toBeLessThanOrEqual(1);

    // Sustained loud audio settles back below the punch peak.
    for (let i = 0; i < 60; i++) {
      show.update(0.016);
    }
    expect(coneMaterialIntensity()).toBeLessThan(punchConeIntensity);

    show.dispose();
  });

  it('cycles the palette over time, shifting the exposed current color', () => {
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });

    show.update(0.05);
    const early = { r: show.currentColorR, g: show.currentColorG, b: show.currentColorB };
    expect(Number.isFinite(early.r)).toBe(true);
    expect(early.r).toBeGreaterThanOrEqual(0);
    expect(early.r).toBeLessThanOrEqual(1);

    // Advance several seconds of palette drift.
    for (let i = 0; i < 120; i++) {
      show.update(0.05);
    }
    const later = { r: show.currentColorR, g: show.currentColorG, b: show.currentColorB };
    const delta = Math.abs(early.r - later.r) + Math.abs(early.g - later.g) + Math.abs(early.b - later.b);
    expect(delta).toBeGreaterThan(0.02);

    show.dispose();
  });

  it('setEventState transitions: lead_in points cones skyward, active and null recover', () => {
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });

    show.update(0.05);
    const mount = scene.getTransformNodeByName('immersive-beam-mount-0');
    expect(mount != null).toBe(true);
    expect(mount!.rotation.x).toBeLessThan(1.2);

    show.setEventState({ phase: 'lead_in', countdownSeconds: 10 });
    for (let i = 0; i < 120; i++) {
      show.update(0.05);
    }
    expect(mount!.rotation.x).toBeGreaterThan(2.5);
    expect(coneMaterialIntensity()).toBe(2.5);

    show.setEventState({ phase: 'active' });
    for (let i = 0; i < 120; i++) {
      show.update(0.05);
    }
    expect(mount!.rotation.x).toBeLessThan(1.2);

    show.setEventState(null);
    expect(() => show.update(0.05)).not.toThrow();

    show.dispose();
  });

  it('returns an inert no-op when the Main Stage venue is absent', () => {
    const bare = new Scene(engine);
    const show = createImmersiveAudioShow(bare, { getFrequencyData: zeroSource });
    expect(show.beams).toBe(0);
    expect(show.laserBlades).toBe(0);
    expect(show.bassLevel).toBeNull();
    expect(show.beatFlash).toBe(0);
    expect(bare.getMeshByName('immersive-beam-0')).toBeNull();
    expect(() => show.update(0.016)).not.toThrow();
    expect(() => show.setEventState({ phase: 'lead_in' })).not.toThrow();
    expect(() => show.dispose()).not.toThrow();
    bare.dispose();
  });

  it('dispose removes every owned resource, returning the scene to baseline', () => {
    const ownResources = () =>
      [...scene.meshes, ...scene.transformNodes, ...scene.materials, ...scene.textures].filter((resource) =>
        resource.name.startsWith('immersive-'),
      ).length;
    const baselineParticles = scene.particleSystems.length;

    expect(ownResources()).toBe(0);
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });
    // 18 cones + 18 mounts + 1 beam mesh + floor + 4 materials (>= 42 owned).
    expect(ownResources()).toBeGreaterThanOrEqual(42);
    expect(scene.particleSystems.length).toBe(baselineParticles + 1);
    show.update(0.016);
    show.dispose();

    expect(ownResources()).toBe(0);
    expect(scene.particleSystems.length).toBe(baselineParticles);
  });
});
