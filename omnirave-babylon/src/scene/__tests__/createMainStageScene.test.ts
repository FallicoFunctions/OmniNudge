import { NullEngine } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createMainStageScene } from '../createMainStageScene';

describe('createMainStageScene', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('wires a player rig and follow camera foundation into the scene', async () => {
    engine = new NullEngine();

    const scene = await createMainStageScene(engine);

    expect(scene.collisionsEnabled).toBe(true);
    expect(scene.activeCamera?.name).toBe('review-camera');
    expect(scene.getTransformNodeByName('player-root')).not.toBeNull();
    expect(scene.getMeshByName('player-capsule')).not.toBeNull();
  });
});
