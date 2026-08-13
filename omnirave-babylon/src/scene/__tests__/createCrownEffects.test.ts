import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCrownEffects } from '../createCrownEffects';

describe('createCrownEffects', () => {
  let engine: NullEngine;
  let scene: Scene;
  const zeroSource = (target: Uint8Array) => target.fill(0);
  const loudSource = (target: Uint8Array) => target.fill(220);

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The venue-present sentinel: without it the effects return an inert no-op.
    MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('builds the tracery, crystal and beacon without throwing under NullEngine', () => {
    const effects = createCrownEffects(scene, { getFrequencyData: zeroSource });

    // 4 vertical strips x 16 segments + 5 tier rings x 4 bars = 84 segments.
    expect(effects.traceryInstances).toBe(84);
    expect(scene.getMeshByName('crown-fx-tracery') != null).toBe(true);
    expect(scene.getMeshByName('crown-fx-crystal') != null).toBe(true);
    expect(scene.getMeshByName('crown-fx-halo') != null).toBe(true);
    expect(scene.getMeshByName('crown-fx-beacon') != null).toBe(true);

    expect(() => effects.update(0.016)).not.toThrow();
    effects.dispose();
  });

  it('does not throw on update with zero spectrum or with injected loud audio', () => {
    const effects = createCrownEffects(scene, { getFrequencyData: loudSource });
    for (let i = 0; i < 30; i++) {
      expect(() => effects.update(0.016)).not.toThrow();
    }
    effects.dispose();
  });

  it('loud bass raises the apex crystal intensity above the idle level', () => {
    let loud = false;
    const effects = createCrownEffects(scene, {
      getFrequencyData: (target) => (loud ? loudSource(target) : zeroSource(target)),
    });

    // Idle (silence): soft breathe near the idle floor.
    effects.update(0.016);
    const idleIntensity = effects.crystalIntensity;
    expect(idleIntensity).toBeGreaterThan(0);
    expect(idleIntensity).toBeLessThan(2.5);

    // First loud frame is a strong bass punch: the reactor flares.
    loud = true;
    effects.update(0.016);
    expect(effects.crystalIntensity).toBeGreaterThan(idleIntensity + 1);

    effects.dispose();
  });

  it('setEventState transitions between lead_in, active and normal are exercised', () => {
    const effects = createCrownEffects(scene, { getFrequencyData: zeroSource });

    effects.update(0.05);

    // lead_in pre-charges the crystal to its dimmed hold value.
    effects.setEventState({ phase: 'lead_in', countdownSeconds: 10 });
    effects.update(0.05);
    const leadInIntensity = effects.crystalIntensity;
    expect(leadInIntensity).toBeGreaterThan(0);

    // active pushes brighter than the lead_in pre-charge.
    effects.setEventState({ phase: 'active' });
    effects.update(0.05);
    expect(effects.crystalIntensity).toBeGreaterThan(leadInIntensity);

    // null recovers to normal without throwing.
    effects.setEventState(null);
    expect(() => effects.update(0.05)).not.toThrow();

    effects.dispose();
  });

  it('returns an inert no-op when the Main Stage venue is absent', () => {
    const bare = new Scene(engine);
    const effects = createCrownEffects(bare, { getFrequencyData: zeroSource });
    expect(effects.traceryInstances).toBe(0);
    expect(effects.crystalIntensity).toBe(0);
    expect(effects.beaconIntensity).toBe(0);
    expect(bare.getMeshByName('crown-fx-crystal')).toBeNull();
    expect(() => effects.update(0.016)).not.toThrow();
    expect(() => effects.setEventState({ phase: 'active' })).not.toThrow();
    expect(() => effects.dispose()).not.toThrow();
    bare.dispose();
  });

  it('dispose returns this module owned meshes and materials to baseline', () => {
    const ownResources = () =>
      [...scene.meshes, ...scene.transformNodes, ...scene.materials, ...scene.textures].filter((resource) =>
        resource.name.startsWith('crown-fx-'),
      ).length;

    expect(ownResources()).toBe(0);
    const effects = createCrownEffects(scene, { getFrequencyData: zeroSource });
    // tracery mesh + crystal + halo + beacon + beacon pivot + 4 materials.
    expect(ownResources()).toBeGreaterThanOrEqual(9);
    effects.update(0.016);
    effects.dispose();

    expect(ownResources()).toBe(0);
  });
});
