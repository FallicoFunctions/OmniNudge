import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
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

  function beamMaterialIntensity(): number {
    const material = scene.getMaterialByName('immersive-beam-magenta');
    expect(material instanceof PBRMaterial).toBe(true);
    return (material as PBRMaterial).emissiveIntensity;
  }

  it('creates all four layers without throwing under NullEngine', () => {
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });

    expect(show.beams).toBe(10);
    expect(show.laserBlades).toBe(28);
    expect(scene.getMeshByName('immersive-beam-0') != null).toBe(true);
    expect(scene.getMeshByName('immersive-beam-9') != null).toBe(true);
    expect(scene.getMeshByName('immersive-laser-blade-3-6') != null).toBe(true);
    expect(scene.getMeshByName('immersive-floor-pulse') != null).toBe(true);
    expect(scene.particleSystems.some((system) => system.name === 'immersive-air')).toBe(true);

    show.dispose();
  });

  it('update tolerates zero and loud spectra, and loud bass spikes beam emissiveIntensity', () => {
    let loud = false;
    const show = createImmersiveAudioShow(scene, {
      getFrequencyData: (target) => (loud ? loudSource(target) : zeroSource(target)),
    });

    // Idle (silence): must not throw, and beams sit at the dim idle level.
    expect(() => show.update(0.016)).not.toThrow();
    const idleIntensity = beamMaterialIntensity();
    expect(show.bassLevel).toBeNull();

    // Loud audio: first loud frame is a bass punch (raw >> smoothed), which
    // must spike the beam intensity well above idle.
    loud = true;
    expect(() => show.update(0.016)).not.toThrow();
    const punchIntensity = beamMaterialIntensity();
    expect(punchIntensity).toBeGreaterThan(idleIntensity + 1);
    expect(show.bassLevel).not.toBeNull();
    expect(show.bassLevel!).toBeGreaterThan(0);
    expect(show.bassLevel!).toBeLessThanOrEqual(1);

    // Sustained loud audio settles back toward the audio-driven base level.
    for (let i = 0; i < 60; i++) {
      show.update(0.016);
    }
    expect(beamMaterialIntensity()).toBeLessThan(punchIntensity);

    show.dispose();
  });

  it('setEventState transitions: lead_in points beams skyward, active and null recover', () => {
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });

    show.update(0.05);
    const mount = scene.getTransformNodeByName('immersive-beam-mount-0');
    expect(mount != null).toBe(true);
    const normalRotX = mount!.rotation.x;
    expect(normalRotX).toBeLessThan(1.2);

    show.setEventState({ phase: 'lead_in', countdownSeconds: 10 });
    for (let i = 0; i < 120; i++) {
      show.update(0.05);
    }
    // Converged toward pointing straight up (rotation.x -> PI).
    expect(mount!.rotation.x).toBeGreaterThan(2.5);
    expect(beamMaterialIntensity()).toBe(2.5);

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
    expect(bare.getMeshByName('immersive-beam-0')).toBeNull();
    expect(() => show.update(0.016)).not.toThrow();
    expect(() => show.setEventState({ phase: 'lead_in' })).not.toThrow();
    expect(() => show.dispose()).not.toThrow();
    bare.dispose();
  });

  it('dispose removes every owned resource, returning the scene to baseline', () => {
    // Count only OWN-named resources: the first PBRMaterial lazily creates a
    // shared EnvironmentBRDFTexture as a scene-level side effect that is not
    // ours to dispose, so raw scene counts would be fooled by that noise.
    const ownResources = () =>
      [...scene.meshes, ...scene.transformNodes, ...scene.materials, ...scene.textures].filter((resource) =>
        resource.name.startsWith('immersive-'),
      ).length;
    const baselineParticles = scene.particleSystems.length;

    expect(ownResources()).toBe(0);
    const show = createImmersiveAudioShow(scene, { getFrequencyData: zeroSource });
    // 10 cones + 10 mounts + 28 blades + 4 fans + floor + 5 materials + sprite.
    expect(ownResources()).toBeGreaterThanOrEqual(59);
    expect(scene.particleSystems.length).toBe(baselineParticles + 1);
    show.update(0.016);
    show.dispose();

    expect(ownResources()).toBe(0);
    expect(scene.particleSystems.length).toBe(baselineParticles);
  });
});
