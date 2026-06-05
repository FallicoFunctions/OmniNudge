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

    expect(rig.camera.lockedTarget).toBe(target);
    expect(rig.camera.radius).toBe(6);
    expect(rig.camera.lowerRadiusLimit).toBe(0.1);
    expect(rig.camera.upperRadiusLimit).toBe(8);
    expect(rig.syncZoomState().mode).toBe('third_person');

    rig.camera.radius = 0.1;

    expect(rig.syncZoomState().mode).toBe('first_person');
    expect(rig.camera.radius).toBe(0.1);
  });
});
