import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  GRID_SPACING,
  MAX_POINTS,
  countdownKeyFor,
  createHologramGrid,
  planHologramLattice,
} from '../createHologramGrid';

const LAMELLA = 'merged:V113_CrownShellLamellaArray+1';
const GOLD_SEAM = 'merged:V113_CrownShellGoldSeamArray+1';
const SHADOW_COFFER = 'V127_CrownScreenShadowCoffer';
const VERTICAL_KEYSTONE = 'V127_CrownScreenVerticalKeystone';

describe('createHologramGrid', () => {
  let engine: NullEngine;
  let scene: Scene;
  const zeroSource = (target: Uint8Array) => target.fill(0);
  const loudSource = (target: Uint8Array) => target.fill(220);

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The venue-present sentinel: without it the grid returns an inert no-op.
    MeshBuilder.CreatePlane('main-stage-hero-screen-panel-l', { size: 1 }, scene);
    // The V113 canopy plates whose airspace the hologram takes over.
    MeshBuilder.CreatePlane(LAMELLA, { size: 1 }, scene);
    MeshBuilder.CreatePlane(GOLD_SEAM, { size: 1 }, scene);
    // Player-flagged (2026-07-31): small V127 crown-screen fragments that
    // graze this same volume and were left orphaned once the V113 plates
    // above were hidden - folded into the same hide/restore pair.
    MeshBuilder.CreatePlane(SHADOW_COFFER, { size: 1 }, scene);
    MeshBuilder.CreatePlane(VERTICAL_KEYSTONE, { size: 1 }, scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function plateEnabled(name: string): boolean {
    const mesh = scene.getMeshByName(name);
    return mesh != null && mesh.isEnabled(false);
  }

  function pointInstanceCount(): number {
    const mesh = scene.getMeshByName('hologram-grid-point') as Mesh | null;
    return mesh ? mesh.thinInstanceCount : -1;
  }

  it('builds and renders without throwing under NullEngine', () => {
    new FreeCamera('hologram-grid-test-camera', new Vector3(0, 6, -50), scene);
    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    expect(() => grid.update(0.016)).not.toThrow();
    expect(() => scene.render()).not.toThrow();
    grid.dispose();
  });

  it('returns an inert no-op when the Main Stage venue is absent', () => {
    const bare = new Scene(engine);
    MeshBuilder.CreatePlane(LAMELLA, { size: 1 }, bare);
    const grid = createHologramGrid(bare, { getFrequencyData: zeroSource });
    expect(grid.pointCount).toBe(0);
    expect(bare.getMeshByName('hologram-grid-point')).toBeNull();
    // A scene without the venue is left completely untouched.
    expect(bare.getMeshByName(LAMELLA)!.isEnabled(false)).toBe(true);
    expect(() => grid.update(0.016)).not.toThrow();
    expect(() => grid.setEventState({ phase: 'lead_in' })).not.toThrow();
    expect(() => grid.dispose()).not.toThrow();
    bare.dispose();
  });

  it('HIDES the V113 canopy plates and V127 crown-screen fragments on create and RESTORES them on dispose', () => {
    expect(plateEnabled(LAMELLA)).toBe(true);
    expect(plateEnabled(GOLD_SEAM)).toBe(true);
    expect(plateEnabled(SHADOW_COFFER)).toBe(true);
    expect(plateEnabled(VERTICAL_KEYSTONE)).toBe(true);

    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    expect(grid.hiddenPlateCount).toBe(4);
    expect(plateEnabled(LAMELLA)).toBe(false);
    expect(plateEnabled(GOLD_SEAM)).toBe(false);
    expect(plateEnabled(SHADOW_COFFER)).toBe(false);
    expect(plateEnabled(VERTICAL_KEYSTONE)).toBe(false);
    // Hidden, NOT deleted: the meshes are still in the scene.
    expect(scene.getMeshByName(LAMELLA) != null).toBe(true);
    expect(scene.getMeshByName(GOLD_SEAM) != null).toBe(true);
    expect(scene.getMeshByName(SHADOW_COFFER) != null).toBe(true);
    expect(scene.getMeshByName(VERTICAL_KEYSTONE) != null).toBe(true);

    grid.dispose();
    expect(plateEnabled(LAMELLA)).toBe(true);
    expect(plateEnabled(GOLD_SEAM)).toBe(true);
    expect(plateEnabled(SHADOW_COFFER)).toBe(true);
    expect(plateEnabled(VERTICAL_KEYSTONE)).toBe(true);
  });

  it('instance count matches the spacing arithmetic and stays under MAX_POINTS', () => {
    // 34 x 20 x 32 volume at a 2m pitch: 17 x 10 x 16 = 2,720 points.
    const plan = planHologramLattice(GRID_SPACING);
    expect(plan.spacing).toBe(2);
    expect(plan.nx).toBe(17);
    expect(plan.ny).toBe(10);
    expect(plan.nz).toBe(16);
    expect(plan.count).toBe(2720);
    expect(plan.count).toBeLessThanOrEqual(MAX_POINTS);

    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    expect(grid.pointCount).toBe(plan.count);
    expect(pointInstanceCount()).toBe(plan.count);
    grid.dispose();
  });

  it('MAX_POINTS guard coarsens a reckless spacing instead of exploding the scene', () => {
    // The owner's literal 1-foot pitch would be ~776,000 points.
    const oneFoot = planHologramLattice(0.3048);
    expect(oneFoot.count).toBeLessThanOrEqual(MAX_POINTS);
    expect(oneFoot.spacing).toBeGreaterThan(0.3048);
    // Even an absurd request stays bounded.
    expect(planHologramLattice(0.01).count).toBeLessThanOrEqual(MAX_POINTS);
  });

  it('is a light, not geometry: unpickable and no collision', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    const mesh = scene.getMeshByName('hologram-grid-point') as Mesh | null;
    expect(mesh != null).toBe(true);
    expect(mesh!.isPickable).toBe(false);
    expect(mesh!.checkCollisions).toBe(false);
    expect(mesh!.alwaysSelectAsActiveMesh).toBe(true);
    grid.dispose();
  });

  it('handles zero and loud spectra across many frames without throwing', () => {
    let loud = false;
    const grid = createHologramGrid(scene, {
      getFrequencyData: (target) => (loud ? loudSource(target) : zeroSource(target)),
    });
    for (let i = 0; i < 60; i++) {
      expect(() => grid.update(0)).not.toThrow();
    }
    loud = true;
    for (let i = 0; i < 60; i++) {
      expect(() => grid.update(0.016)).not.toThrow();
    }
    grid.setEventState({ phase: 'active' });
    for (let i = 0; i < 30; i++) {
      expect(() => grid.update(0.016)).not.toThrow();
    }
    grid.setEventState({ phase: 'lead_in' });
    for (let i = 0; i < 30; i++) {
      expect(() => grid.update(0.016)).not.toThrow();
    }
    grid.setEventState(null);
    expect(() => grid.update(0.016)).not.toThrow();
    grid.dispose();
  });

  it('the choreography sequencer advances the formation over simulated time', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    const first = grid.currentShape;
    expect(first).toBe('cube');

    let changed = false;
    // Hold is ~16s; step 100s of simulated time at 20fps and bail on the change.
    for (let i = 0; i < 2000 && !changed; i++) {
      grid.update(0.05);
      if (grid.currentShape !== first) {
        changed = true;
      }
    }
    expect(changed).toBe(true);
    // Mid-morph the swarm is crossfading between two named formations.
    expect(grid.previousShape).toBe(first);
    expect(grid.morphProgress).toBeLessThanOrEqual(1);
    grid.dispose();
  });

  it('keeps the arrival sightline clear while silent and lights only when the show has ownership', () => {
    const idleGrid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    idleGrid.update(0.016);
    const idlePeak = idleGrid.peakBrightness;
    expect(idlePeak).toBe(0);
    expect(idleGrid.litPoints).toBe(0);
    expect(scene.getMeshByName('hologram-grid-point')?.isEnabled()).toBe(false);
    // The superseded canopy slabs stay retired even while the effect yields;
    // restoring them would replace the point cloud with two giant gold plates
    // across the same approval sightline.
    expect(plateEnabled(LAMELLA)).toBe(false);
    expect(plateEnabled(GOLD_SEAM)).toBe(false);
    idleGrid.dispose();

    const loudGrid = createHologramGrid(scene, { getFrequencyData: loudSource });
    for (let i = 0; i < 6; i++) {
      loudGrid.update(0.016);
    }
    expect(loudGrid.peakBrightness).toBeGreaterThan(0.3);
    expect(scene.getMeshByName('hologram-grid-point')?.isEnabled()).toBe(true);
    expect(plateEnabled(LAMELLA)).toBe(false);
    expect(plateEnabled(GOLD_SEAM)).toBe(false);
    loudGrid.dispose();
  });

  it('keeps the lit colour saturated (no wash to white) on a loud frame', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    for (let i = 0; i < 6; i++) {
      grid.update(0.016);
    }
    const r = grid.peakColorR;
    const g = grid.peakColorG;
    const b = grid.peakColorB;
    // Actually bright somewhere...
    expect(Math.max(r, g, b)).toBeGreaterThan(0.3);
    // ...but NOT white: a saturated hue keeps a real gap between its strongest
    // and weakest channel.
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(0.2);
    grid.dispose();
  });

  it('lights the whole lattice in the cube formation (nothing parked dark)', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    grid.update(0.016);
    expect(grid.litPoints).toBe(grid.pointCount);
    grid.dispose();
  });

  it('lead_in countdown produces a lit/legible formation distinct from idle cube', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    // Silent normal mode yields ownership to the authored crown plates.
    grid.update(0.016);
    expect(grid.formationOverride).toBe('none');
    expect(grid.litPoints).toBe(0);

    // lead_in: the countdown formation takes over - a DIFFERENT formation
    // (never the held/morphing shape-library cube) for as long as the event
    // is in its 10s countdown window.
    grid.setEventState({ phase: 'lead_in', countdownSeconds: 10 });
    grid.update(0.016);
    expect(grid.formationOverride).toBe('countdown');
    expect(scene.getMeshByName('hologram-grid-point')?.isEnabled()).toBe(true);
    // No real 2D canvas exists under jsdom/NullEngine (see the other tests'
    // "Not implemented: HTMLCanvasElement's getContext()" warning), so the
    // countdown formation cannot sample real digit pixels here; it correctly
    // reports zero lit points rather than accidentally lighting the full
    // cube, which is itself the distinguishing, testable signal.
    expect(grid.litPoints).toBe(0);
    grid.dispose();
  });

  it('countdownKeyFor: first tick shows the announcement phrase, then digits 10 down to 1', () => {
    // Very first tick of the 10s lead-in: the announcement beat, not "10" yet.
    expect(countdownKeyFor(10)).toBe('phrase');
    expect(countdownKeyFor(9.6)).toBe('phrase');
    // Once past the announcement threshold, the digit takes over immediately -
    // still within the SAME integer second ceil(9.4) === 10.
    expect(countdownKeyFor(9.4)).toBe('10');
    expect(countdownKeyFor(9.0001)).toBe('10');
    expect(countdownKeyFor(9)).toBe('9');
    expect(countdownKeyFor(5.5)).toBe('6');
    expect(countdownKeyFor(1.0)).toBe('1');
    expect(countdownKeyFor(0.4)).toBe('1');
    expect(countdownKeyFor(0)).toBe('1');
  });

  it('a full simulated 10s countdown never throws while the digit key keeps changing', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    grid.setEventState({ phase: 'lead_in', countdownSeconds: 10 });
    grid.update(0.016);
    expect(grid.formationOverride).toBe('countdown');

    // Step through the whole 10s window; the override stays 'countdown'
    // throughout regardless of which digit/phrase is currently cached, and
    // resampling on every key change must not throw or allocate unsafely.
    for (let cd = 10; cd >= 0.2; cd -= 0.2) {
      grid.setEventState({ phase: 'lead_in', countdownSeconds: cd });
      expect(() => grid.update(0.05)).not.toThrow();
      expect(grid.formationOverride).toBe('countdown');
    }
    grid.dispose();
  });

  it('active minute 1 and minute 3 hold the drone-spelled OMNIRAVE wordmark; minute 3 is brighter', () => {
    const minute1Grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    minute1Grid.setEventState({ phase: 'active', activeMinute: 1 });
    let minute1Peak = 0;
    for (let i = 0; i < 10; i++) {
      minute1Grid.update(0.016);
      minute1Peak = minute1Grid.peakBrightness;
    }
    expect(minute1Grid.formationOverride).toBe('wordmark');
    minute1Grid.dispose();

    const minute3Grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    minute3Grid.setEventState({ phase: 'active', activeMinute: 3 });
    let minute3Peak = 0;
    for (let i = 0; i < 10; i++) {
      minute3Grid.update(0.016);
      minute3Peak = minute3Grid.peakBrightness;
    }
    expect(minute3Grid.formationOverride).toBe('wordmark');
    // "each is bigger than the last" (§5.1.1): minute 3's escalation reads
    // brighter than minute 1's under identical (loud) audio.
    expect(minute3Peak).toBeGreaterThan(minute1Peak);
    minute3Grid.dispose();
  });

  it('active minute 2 does NOT trigger the drone wordmark path (the parallel firework-letter beat owns it)', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    grid.setEventState({ phase: 'active', activeMinute: 2 });
    for (let i = 0; i < 10; i++) {
      grid.update(0.016);
    }
    expect(grid.formationOverride).toBe('none');
    grid.dispose();
  });

  it('recovery phase and a missing/zero activeMinute fall back to normal behaviour, no special formation', () => {
    const grid = createHologramGrid(scene, { getFrequencyData: loudSource });
    grid.setEventState({ phase: 'recovery', activeMinute: 0 });
    grid.update(0.016);
    expect(grid.formationOverride).toBe('none');

    grid.setEventState({ phase: 'active' }); // activeMinute absent
    grid.update(0.016);
    expect(grid.formationOverride).toBe('none');
    grid.dispose();
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const grid = createHologramGrid(scene, { getFrequencyData: zeroSource });
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    grid.update(0.016);
    grid.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    // Idempotent.
    expect(() => grid.dispose()).not.toThrow();
  });
});
