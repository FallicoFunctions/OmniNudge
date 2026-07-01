import { NullEngine, Scene, TransformNode } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createFollowCameraRig } from '../createFollowCameraRig';

describe('createFollowCameraRig', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('creates a bounded review camera that reports zoom mode transitions', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    const rig = createFollowCameraRig(scene, target);

    expect(rig.camera.lockedTarget).toBe(rig.targetAnchor);
    expect(rig.camera.radius).toBe(6);
    expect(rig.camera.lowerRadiusLimit).toBe(0.1);
    expect(rig.camera.upperRadiusLimit).toBe(140);
    expect(rig.syncZoomState().mode).toBe('third_person');

    rig.camera.radius = 0.1;

    expect(rig.syncZoomState().mode).toBe('first_person');
    expect(rig.camera.radius).toBe(0.1);
  });

  it('applies authored checkpoint framing with a local focus offset instead of orbiting the player root directly', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(10, 5, -20);
    const rig = createFollowCameraRig(scene, target);

    rig.applyCheckpointView({
      alpha: -2.3,
      beta: 1.04,
      radius: 38,
      focusOffset: {
        x: -12,
        y: 8,
        z: 20,
      },
      positionOffset: {
        x: 18,
        y: 6,
        z: -44,
      },
    });

    expect(rig.targetAnchor.position.x).toBeCloseTo(-2);
    expect(rig.targetAnchor.position.y).toBeCloseTo(13);
    expect(rig.targetAnchor.position.z).toBeCloseTo(0);
    expect(rig.camera.position.x).toBeCloseTo(28);
    expect(rig.camera.position.y).toBeCloseTo(11);
    expect(rig.camera.position.z).toBeCloseTo(-64);
  });

  it('keeps authored checkpoint framing stable across sequential position-offset views after zoom sync', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    const rig = createFollowCameraRig(scene, target);

    target.position.set(0, 1.7, 0);
    rig.applyCheckpointView({
      alpha: -Math.PI / 2,
      beta: 1.02,
      radius: 50,
      focusOffset: { x: 4, y: 10.3, z: 20 },
      positionOffset: { x: 34, y: 18.3, z: -70 },
    });

    target.position.set(0, 1.7, -18);
    rig.applyCheckpointView({
      alpha: -Math.PI / 2,
      beta: 1.06,
      radius: 52,
      focusOffset: { x: 0, y: 10.3, z: 36 },
      positionOffset: { x: 10, y: 20.3, z: -48 },
    });

    rig.syncZoomState();

    expect(rig.targetAnchor.position.x).toBeCloseTo(0);
    expect(rig.targetAnchor.position.y).toBeCloseTo(12);
    expect(rig.targetAnchor.position.z).toBeCloseTo(18);
    expect(rig.camera.position.x).toBeCloseTo(10);
    expect(rig.camera.position.y).toBeCloseTo(22);
    expect(rig.camera.position.z).toBeCloseTo(-66);
  });
});
