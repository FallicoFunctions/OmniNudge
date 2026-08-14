import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createBackstageEasterEgg } from '../createBackstageEasterEgg';

describe('createBackstageEasterEgg', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('is a no-op when the footer trim mesh is absent (stripped test/mock scenes)', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const summary = createBackstageEasterEgg(scene);

    expect(summary.applied).toBe(false);
    expect(scene.getMeshByName('backstage-easter-egg-plate')).toBeNull();
  });

  it('mounts a flush overlay plate on the footer trim\'s own measured bounds', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    // Stand-in for the real GLB-authored footer trim (see the module's own
    // comment: the real mesh has a tiled UV atlas unsuitable for text, which
    // is why this mounts a NEW plate rather than texturing the trim itself -
    // its presence by name is the only thing this module reads).
    const footer = MeshBuilder.CreateBox('V126_WideHeroScreenIvoryFooter', { size: 1 }, scene);
    footer.position.set(0, 13.7, 23);

    const summary = createBackstageEasterEgg(scene);
    expect(summary.applied).toBe(true);

    const plate = scene.getMeshByName('backstage-easter-egg-plate');
    expect(plate).not.toBeNull();
    expect(plate!.isPickable).toBe(false);
    // Sits in front of the whole screen assembly - ahead of the gold frame's
    // side members, whose front face measures live at z 21.31.
    expect(plate!.position.z).toBeLessThan(21.31);
  });

  // Owner-directed placement (2026-08-04, via a marked-up screenshot): the
  // label belongs on the band at the foot of the mullions, "as if it were
  // posted onto V126_WideHeroScreenGoldMullionArray" - NOT down on the ivory
  // footer trim (y 12.96..14.52) where it originally sat.
  it('parks the label on the foot of the mullion array', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    // The plate is positioned at fixed, live-measured venue coordinates
    // (not relative to the footer stub's own transform), so only the
    // footer's presence-by-name matters here - its position is irrelevant.
    MeshBuilder.CreateBox('V126_WideHeroScreenIvoryFooter', { size: 1 }, scene);

    createBackstageEasterEgg(scene);
    const plate = scene.getMeshByName('backstage-easter-egg-plate')!;
    plate.computeWorldMatrix(true);
    const bb = plate.getBoundingInfo().boundingBox;

    // Bottom edge rests on the mullions' own measured base (y 15.18)...
    expect(bb.minimumWorld.y).toBeGreaterThanOrEqual(15.1);
    // ...and the label stays down at that base rather than riding up into
    // the middle of the screen (the mullions run all the way to y 26.02).
    expect(bb.maximumWorld.y).toBeLessThan(17);
    // Clear of the ivory footer trim it used to sit on (top edge y 14.52).
    expect(bb.minimumWorld.y).toBeGreaterThan(14.52);
  });

  it('keeps the label at its authored full height (never silently shrunk)', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    MeshBuilder.CreateBox('V126_WideHeroScreenIvoryFooter', { size: 1 }, scene);

    createBackstageEasterEgg(scene);
    const plate = scene.getMeshByName('backstage-easter-egg-plate')!;
    plate.computeWorldMatrix(true);
    const bb = plate.getBoundingInfo().boundingBox;

    expect(bb.maximumWorld.y - bb.minimumWorld.y).toBeCloseTo(1.5, 3);
    expect(bb.maximumWorld.x - bb.minimumWorld.x).toBeCloseTo(38.5, 3);
  });

  it('degrades to a solid plate without a 2D canvas context (NullEngine) instead of throwing', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    MeshBuilder.CreateBox('V126_WideHeroScreenIvoryFooter', { size: 1 }, scene);

    // NullEngine has no canvas 2D context, so the label falls back to a
    // solid accent plate - the call must still succeed.
    const summary = createBackstageEasterEgg(scene);
    expect(summary.applied).toBe(true);
    const plate = scene.getMeshByName('backstage-easter-egg-plate');
    expect(plate!.material).not.toBeNull();
  });
});
