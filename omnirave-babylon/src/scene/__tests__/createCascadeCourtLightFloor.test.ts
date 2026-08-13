import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCascadeCourtLightFloor } from '../createCascadeCourtLightFloor';
import { createCascadeCourtPaving } from '../createCascadeCourtPaving';

describe('createCascadeCourtLightFloor', () => {
  let engine: NullEngine;
  let scene: Scene;
  const zeroSource = (target: Uint8Array) => target.fill(0);
  const loudSource = (target: Uint8Array) => target.fill(220);
  // Present but quiet: audio flag stays true (music path, not idle) with no
  // transients, so a lit floor DECAYS toward the dim music baseline.
  const quietSource = (target: Uint8Array) => target.fill(6);
  // Loud in the BASS band only: only bass-affinity tiles trigger, so the floor
  // does NOT move as one - the variety diagnostic.
  const bassOnlySource = (target: Uint8Array) => {
    target.fill(4);
    for (let i = 0; i < 11; i++) target[i] = 220;
  };

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The venue-present sentinel: without it the floor returns an inert no-op.
    MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function lightInstanceCount(): number {
    const mesh = scene.getMeshByName('cascade-court-light-floor') as Mesh | null;
    return mesh ? mesh.thinInstanceCount : -1;
  }

  it('builds and renders without throwing under NullEngine', () => {
    new FreeCamera('cascade-light-floor-test-camera', new Vector3(40, 3, -30), scene);
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: zeroSource });
    expect(() => floor.update(0.016)).not.toThrow();
    expect(() => scene.render()).not.toThrow();
    floor.dispose();
  });

  it('returns an inert no-op when the Main Stage venue is absent', () => {
    const bare = new Scene(engine);
    const floor = createCascadeCourtLightFloor(bare, { getFrequencyData: zeroSource });
    expect(floor.tileInstances).toBe(0);
    expect(bare.getMeshByName('cascade-court-light-floor')).toBeNull();
    expect(() => floor.update(0.016)).not.toThrow();
    expect(() => floor.setEventState({ phase: 'lead_in' })).not.toThrow();
    expect(() => floor.dispose()).not.toThrow();
    bare.dispose();
  });

  it('lays one light quad per real paving tile (1:1 across both flanks)', () => {
    const paving = createCascadeCourtPaving(scene);
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: zeroSource });

    expect(floor.tileInstances).toBe(paving.tiles);
    expect(lightInstanceCount()).toBe(paving.tiles);

    floor.dispose();
    paving.dispose();
  });

  it('is a light, not floor: unpickable and no collision', () => {
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: zeroSource });
    const quad = scene.getMeshByName('cascade-court-light-floor') as Mesh | null;
    expect(quad != null).toBe(true);
    expect(quad!.isPickable).toBe(false);
    expect(quad!.checkCollisions).toBe(false);
    floor.dispose();
  });

  it('idle floor stays near-dark so the pearl reads normal', () => {
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: zeroSource });
    floor.update(0.016);
    const idlePeak = floor.peakBrightness;
    expect(idlePeak).toBeGreaterThan(0);
    expect(idlePeak).toBeLessThan(0.12);
    floor.dispose();
  });

  it('snaps bright on a loud bass frame, then DECAYS on subsequent quiet frames', () => {
    let phase: 'idle' | 'loud' | 'quiet' = 'idle';
    const floor = createCascadeCourtLightFloor(scene, {
      getFrequencyData: (target) => {
        if (phase === 'loud') loudSource(target);
        else if (phase === 'quiet') quietSource(target);
        else zeroSource(target);
      },
    });

    // Idle (silence): near-dark.
    floor.update(0.016);
    const idlePeak = floor.peakBrightness;
    expect(idlePeak).toBeLessThan(0.12);

    // Loud frames: the tiles SNAP well above the idle floor (fast attack).
    phase = 'loud';
    for (let i = 0; i < 5; i++) floor.update(0.016);
    const loudPeak = floor.peakBrightness;
    expect(loudPeak).toBeGreaterThan(idlePeak);
    expect(loudPeak).toBeGreaterThan(0.3);

    // Present-but-quiet frames (still the music path, no transients): the lit
    // tiles DECAY back down - proves attack+decay, not a constant floor level.
    phase = 'quiet';
    for (let i = 0; i < 150; i++) floor.update(0.016);
    const decayedPeak = floor.peakBrightness;
    expect(decayedPeak).toBeLessThan(loudPeak * 0.5);

    floor.dispose();
  });

  it('lights tiles independently: a bass-only frame does not move the floor as one', () => {
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: bassOnlySource });
    // Only the bass-affinity tiles trigger; mids/highs tiles stay dim, so peak
    // and min are far apart. If every tile moved as one, spread would be ~0.
    for (let i = 0; i < 3; i++) floor.update(0.016);
    expect(floor.brightnessSpread).toBeGreaterThan(0.15);
    floor.dispose();
  });

  it('keeps the lit colour saturated (no wash to white) on a loud frame', () => {
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: loudSource });
    for (let i = 0; i < 4; i++) floor.update(0.016);
    const r = floor.peakColorR;
    const g = floor.peakColorG;
    const b = floor.peakColorB;
    // A lit tile is actually bright somewhere.
    expect(Math.max(r, g, b)).toBeGreaterThan(0.3);
    // ...but NOT white: the channels are not all near-equal-and-high. A
    // saturated hue keeps a real gap between its strongest and weakest channel.
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(spread).toBeGreaterThan(0.2);
    floor.dispose();
  });

  it('handles zero and loud spectra across many frames without throwing', () => {
    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: loudSource });
    for (let i = 0; i < 60; i++) {
      expect(() => floor.update(0.016)).not.toThrow();
    }
    floor.setEventState({ phase: 'active' });
    for (let i = 0; i < 30; i++) {
      expect(() => floor.update(0.016)).not.toThrow();
    }
    floor.setEventState(null);
    expect(() => floor.update(0.016)).not.toThrow();
    floor.dispose();
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const floor = createCascadeCourtLightFloor(scene, { getFrequencyData: zeroSource });
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    floor.update(0.016);
    floor.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    // Idempotent.
    expect(() => floor.dispose()).not.toThrow();
  });
});
