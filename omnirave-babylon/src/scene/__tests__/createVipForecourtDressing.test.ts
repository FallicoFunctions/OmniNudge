import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createVipForecourtDressing } from '../createVipForecourtDressing';

describe('createVipForecourtDressing', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('builds three lanterns per forecourt side with warm cores', () => {
    const summary = createVipForecourtDressing(scene);

    expect(summary.lanterns).toBe(6);
    expect(summary.warmCores).toBe(6);
  });

  it('names every glowing core for the lighting rig practical pool scan', () => {
    createVipForecourtDressing(scene);

    const cores = scene.meshes.filter((mesh) => /LanternWarmCore/.test(mesh.name));
    expect(cores.length).toBe(6);
  });

  it('mirrors the lanterns across the promenade and keeps posts off the walk lane', () => {
    createVipForecourtDressing(scene);

    const posts = scene.meshes.filter((mesh) => mesh.name.startsWith('vip-forecourt-post-'));
    expect(posts.length).toBe(6);

    const xs = posts.map((post) => post.position.x).sort((a, b) => a - b);
    const mirrored = xs.every((x) => xs.includes(x) && xs.some((other) => Math.abs(other + x) < 1e-6));
    expect(mirrored).toBe(true);

    // Clear of the wing shell blockers (|x| <= 29.8) and of the route
    // objective spot (|x| 32, z 2).
    for (const post of posts) {
      expect(Math.abs(post.position.x)).toBeGreaterThan(29.8);
      const distanceToObjective = Math.hypot(
        Math.abs(post.position.x) - 32,
        post.position.z - 2,
      );
      expect(distanceToObjective).toBeGreaterThan(2);
    }
  });
});
