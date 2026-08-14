import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createWayfindingSigns, WAYFINDING_SIGNS } from '../createWayfindingSigns';

describe('createWayfindingSigns', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('builds a post and panel for every wayfinding spec', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const summary = createWayfindingSigns(scene);

    expect(summary.signs).toBe(WAYFINDING_SIGNS.length);
    for (let i = 0; i < WAYFINDING_SIGNS.length; i++) {
      expect(scene.getMeshByName(`wayfinding-post-${i}`)).not.toBeNull();
      expect(scene.getMeshByName(`wayfinding-panel-${i}`)).not.toBeNull();
    }
  });

  it('places each sign at its authored promenade position and keeps posts non-pickable', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    createWayfindingSigns(scene);

    WAYFINDING_SIGNS.forEach((spec, i) => {
      const post = scene.getMeshByName(`wayfinding-post-${i}`)!;
      expect(post.position.x).toBeCloseTo(spec.x);
      expect(post.position.z).toBeCloseTo(spec.z);
      expect(post.isPickable).toBe(false);
      const panel = scene.getMeshByName(`wayfinding-panel-${i}`)!;
      // panel sits above the post and faces the authored yaw
      expect(panel.position.y).toBeGreaterThan(post.position.y);
      expect(panel.rotation.y).toBeCloseTo(spec.faceYaw);
    });
  });

  it('covers the VIP terrace, cascade court and stage as labelled destinations', () => {
    const labels = WAYFINDING_SIGNS.map((s) => s.label.toUpperCase());
    expect(labels.some((l) => l.includes('VIP'))).toBe(true);
    expect(labels.some((l) => l.includes('CASCADE'))).toBe(true);
    expect(labels.some((l) => l.includes('STAGE'))).toBe(true);
  });

  it('degrades without a 2D canvas context (NullEngine) instead of throwing', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);

    // NullEngine has no canvas 2D context, so labels fall back to solid
    // accent plates - the call must still succeed and build every sign.
    const summary = createWayfindingSigns(scene);
    expect(summary.signs).toBe(WAYFINDING_SIGNS.length);
    expect(summary.panelsWithText).toBeLessThanOrEqual(WAYFINDING_SIGNS.length);
    expect(() => scene.render()).not.toThrow();
  });
});
