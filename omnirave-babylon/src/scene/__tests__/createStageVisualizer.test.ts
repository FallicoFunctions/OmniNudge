import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStageVisualizer,
  resolveFireworksScreenAct,
  resolveVisualizerMode,
} from '../createStageVisualizer';

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

describe('resolveFireworksScreenAct', () => {
  it('maps the authoritative active minute to Crown, Orbits, and Finale content', () => {
    expect(resolveFireworksScreenAct(null)).toBe(0);
    expect(resolveFireworksScreenAct({ phase: 'lead_in', activeMinute: 1 })).toBe(0);
    expect(resolveFireworksScreenAct({ phase: 'active', activeMinute: 1 })).toBe(1);
    expect(resolveFireworksScreenAct({ phase: 'active', activeMinute: 2 })).toBe(2);
    expect(resolveFireworksScreenAct({ phase: 'active', activeMinute: 3 })).toBe(3);
    expect(resolveFireworksScreenAct({ phase: 'recovery', activeMinute: 3 })).toBe(0);
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
    expect(scene.getMaterialByName('main-stage-visualizer-material')?.backFaceCulling).toBe(false);
    visualizer.dispose();
  });

  it('takes over the visible production screens only for countdown/active content and restores them', () => {
    buildPanels();
    const productionScreen = MeshBuilder.CreatePlane('main-stage-center-celestial-screen', { size: 1 }, scene);
    const productionDecor = MeshBuilder.CreatePlane('main-stage-center-celestial-inset', { size: 0.8 }, scene);
    productionDecor.metadata = { productionRole: 'screen-focal' };
    const originalMaterial = scene.defaultMaterial;
    productionScreen.material = originalMaterial;
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    const eventMaterial = scene.getMaterialByName('main-stage-visualizer-material');

    expect(visualizer.eventScreens).toBe(1);
    expect(productionScreen.material).toBe(originalMaterial);
    visualizer.setEventState({ phase: 'lead_in', countdownSeconds: 5 });
    expect(productionScreen.material).toBe(eventMaterial);
    expect(productionDecor.isEnabled()).toBe(false);
    visualizer.setEventState({ phase: 'active', activeMinute: 2 });
    expect(productionScreen.material).toBe(eventMaterial);
    visualizer.setEventState({ phase: 'recovery' });
    expect(productionScreen.material).toBe(originalMaterial);
    expect(productionDecor.isEnabled()).toBe(true);

    visualizer.setEventState({ phase: 'active', activeMinute: 3 });
    visualizer.dispose();
    expect(productionScreen.material).toBe(originalMaterial);
    expect(productionDecor.isEnabled()).toBe(true);
  });

  it('culls the 16-cell block on each flank blocking the VIP skydeck ramp landing', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    const mesh = barMesh();
    (mesh as unknown as { _thinInstanceDataStorage: { worldMatrices: unknown } })._thinInstanceDataStorage.worldMatrices = null;
    const matrices = mesh.thinInstanceGetWorldMatrices();

    // 48 columns x 8 rows, column-major index i = c * 8 + r (see the build
    // loop). Columns 0-7 and 40-47, rows 1-2, mirror the exact 8x2x2=32
    // cells (16 per flank) the in-engine screenshot flagged as blocking the
    // ramp landing at SKYDECK_X_MIN/SKYDECK_DECK_Y.
    let culledCount = 0;
    let litCount = 0;
    for (let c = 0; c < 48; c++) {
      for (let r = 0; r < 8; r++) {
        const i = c * 8 + r;
        // Scale x lives at element 0 of the column-major 4x4 matrix.
        const scaleX = matrices[i].m[0];
        const isCulledCell = (c <= 7 || c >= 40) && (r === 1 || r === 2);
        if (isCulledCell) {
          expect(scaleX).toBe(0);
          culledCount++;
        } else {
          expect(scaleX).toBeGreaterThan(0);
          litCount++;
        }
      }
    }
    expect(culledCount).toBe(32);
    expect(litCount).toBe(384 - 32);

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

  it('switches the hero screen through all three dedicated fireworks acts and clears on recovery', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });

    expect(visualizer.activeFireworksAct).toBe(0);
    for (const act of [1, 2, 3] as const) {
      visualizer.setEventState({ phase: 'active', activeMinute: act });
      visualizer.update(0.016);
      expect(visualizer.activeFireworksAct).toBe(act);
    }
    visualizer.setEventState({ phase: 'recovery' });
    visualizer.update(0.016);
    expect(visualizer.activeFireworksAct).toBe(0);

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

  it('sizes the unit to the §13.3 Main Stage target (~300ft x 100ft in meters)', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    // The VIP-landing cutout (see isVipLandingCell) splits the backing into
    // 5 segments - the overall unit footprint is their COMBINED extent, not
    // any single segment's (the center one alone is narrower than the unit).
    const segmentNames = [
      'main-stage-visualizer-backing',
      'main-stage-visualizer-backing-right-lower',
      'main-stage-visualizer-backing-right-upper',
      'main-stage-visualizer-backing-left-lower',
      'main-stage-visualizer-backing-left-upper',
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const name of segmentNames) {
      const segment = scene.getMeshByName(name);
      expect(segment != null).toBe(true);
      // minimumWorld/maximumWorld need an up-to-date world matrix, which a
      // freshly created (never rendered) mesh does not have yet.
      segment!.computeWorldMatrix(true);
      const bounds = segment!.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bounds.minimumWorld.x);
      maxX = Math.max(maxX, bounds.maximumWorld.x);
      minY = Math.min(minY, bounds.minimumWorld.y);
      maxY = Math.max(maxY, bounds.maximumWorld.y);
    }
    expect(Math.round((maxX - minX) * 100) / 100).toBeCloseTo(300 * 0.3048, 1);
    expect(Math.round((maxY - minY) * 100) / 100).toBeCloseTo(100 * 0.3048, 1);
    visualizer.dispose();
  });

  it('integrates the hero unit into the authored proscenium instead of spanning the approach plaza', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    const backing = scene.getMeshByName('main-stage-visualizer-backing');
    const bars = barMesh();

    expect(backing).not.toBeNull();
    // The authored crown/proscenium occupies z ~= 33..55. A screen at the
    // legacy z=-3 position is a freestanding wall between the spawn and the
    // landmark, occluding the stage and collapsing camera-collision rays.
    expect(backing!.position.z).toBeGreaterThanOrEqual(35);

    (bars as unknown as { _thinInstanceDataStorage: { worldMatrices: unknown } })._thinInstanceDataStorage.worldMatrices = null;
    const barDepths = bars.thinInstanceGetWorldMatrices().map((matrix) => matrix.m[14]);
    expect(Math.max(...barDepths)).toBeLessThan(backing!.position.z);
    expect(Math.min(...barDepths)).toBeGreaterThan(32);

    visualizer.dispose();
  });

  it('leaves an actual gap in the backing over the VIP-landing cutout, not just a dimmer draw', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });
    const segmentNames = [
      'main-stage-visualizer-backing',
      'main-stage-visualizer-backing-right-lower',
      'main-stage-visualizer-backing-right-upper',
      'main-stage-visualizer-backing-left-lower',
      'main-stage-visualizer-backing-left-upper',
    ];
    const segments = segmentNames.map((name) => {
      const segment = scene.getMeshByName(name)!;
      segment.computeWorldMatrix(true);
      return segment.getBoundingInfo().boundingBox;
    });

    // A point deep in the right-flank cutout band (skydeck deck height, near
    // the unit's right edge - the exact region flagged as blocking the ramp
    // landing): no segment's world bounds should contain it on either axis
    // at once - if one did, the "hole" would actually be covered.
    const probeX = 44;
    const probeY = 10;
    const covered = segments.some(
      (b) => probeX >= b.minimumWorld.x && probeX <= b.maximumWorld.x && probeY >= b.minimumWorld.y && probeY <= b.maximumWorld.y,
    );
    expect(covered).toBe(false);

    // The mirrored left-flank point must be equally uncovered.
    const coveredLeft = segments.some(
      (b) => -probeX >= b.minimumWorld.x && -probeX <= b.maximumWorld.x && probeY >= b.minimumWorld.y && probeY <= b.maximumWorld.y,
    );
    expect(coveredLeft).toBe(false);

    // A point just below the cutout band, same x, MUST still be covered -
    // this is a hole, not a missing flank.
    const coveredBelow = segments.some(
      (b) => probeX >= b.minimumWorld.x && probeX <= b.maximumWorld.x && 4 >= b.minimumWorld.y && 4 <= b.maximumWorld.y,
    );
    expect(coveredBelow).toBe(true);

    visualizer.dispose();
  });

  it('shows the track-start title card on a trackId change and clears it after its window', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });

    expect(visualizer.isShowingTitleCard).toBe(false);
    visualizer.setTrackInfo('Test Artist', 'Test Track', 'track-1');
    expect(visualizer.isShowingTitleCard).toBe(true);

    // Well within the window: still showing.
    visualizer.update(2);
    expect(visualizer.isShowingTitleCard).toBe(true);

    // Advance past the title card's visible window.
    visualizer.update(10);
    expect(visualizer.isShowingTitleCard).toBe(false);

    visualizer.dispose();
  });

  it('does not re-trigger the title card when the same track is reported again', () => {
    buildPanels();
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });

    visualizer.setTrackInfo('Test Artist', 'Test Track', 'track-1');
    expect(visualizer.isShowingTitleCard).toBe(true);
    visualizer.update(10);
    expect(visualizer.isShowingTitleCard).toBe(false);

    // Same trackId again (e.g. a routine snapshot refresh): must stay cleared.
    visualizer.setTrackInfo('Test Artist', 'Test Track', 'track-1');
    expect(visualizer.isShowingTitleCard).toBe(false);

    // A genuinely new track still triggers it.
    visualizer.setTrackInfo('New Artist', 'New Track', 'track-2');
    expect(visualizer.isShowingTitleCard).toBe(true);

    visualizer.dispose();
  });

  it('falls back to the existing procedural branding when no fireworks video is configured (regression guard)', () => {
    buildPanels();
    // No fireworksVideoUrl passed - the current real state (no asset exists).
    const visualizer = createStageVisualizer(scene, { getFrequencyData: zeroSource });

    expect(visualizer.isFireworksVideoActive).toBe(false);
    visualizer.setEventState({ phase: 'active' });
    expect(() => visualizer.update(0.016)).not.toThrow();
    expect(visualizer.isFireworksVideoActive).toBe(false);

    // A few more frames to confirm it never lazily engages.
    for (let i = 0; i < 5; i++) {
      visualizer.update(0.016);
    }
    expect(visualizer.isFireworksVideoActive).toBe(false);

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
      // The VIP-landing cutout (see isVipLandingCell) splits the backing
      // into 5 segments sharing one material - all 5 names must be gone too.
      'main-stage-visualizer-backing-right-lower',
      'main-stage-visualizer-backing-right-upper',
      'main-stage-visualizer-backing-left-lower',
      'main-stage-visualizer-backing-left-upper',
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
