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
});
