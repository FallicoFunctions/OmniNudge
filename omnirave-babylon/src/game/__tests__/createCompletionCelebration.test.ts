import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCompletionCelebration } from '../createCompletionCelebration';

describe('createCompletionCelebration', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  function buildScene() {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);
    return scene;
  }

  it('constructs without creating particle systems until started', () => {
    const scene = buildScene();
    const initialParticleSystemCount = scene.particleSystems.length;

    const celebration = createCompletionCelebration(scene);

    expect(celebration.active).toBe(false);
    expect(scene.particleSystems.length).toBe(initialParticleSystemCount);
  });

  it('start() activates the celebration and creates one particle system per launch point', () => {
    const scene = buildScene();
    const initialParticleSystemCount = scene.particleSystems.length;
    const celebration = createCompletionCelebration(scene);

    celebration.start();

    expect(celebration.active).toBe(true);
    expect(scene.particleSystems.length).toBe(initialParticleSystemCount + 6);
  });

  it('is idempotent: calling start() again does not duplicate particle systems', () => {
    const scene = buildScene();
    const celebration = createCompletionCelebration(scene);

    celebration.start();
    const countAfterFirstStart = scene.particleSystems.length;
    celebration.start();

    expect(scene.particleSystems.length).toBe(countAfterFirstStart);
    expect(celebration.active).toBe(true);
  });

  it('stop() halts emission and sets active to false without disposing the systems', () => {
    const scene = buildScene();
    const celebration = createCompletionCelebration(scene);

    celebration.start();
    const countAfterStart = scene.particleSystems.length;
    celebration.stop();

    expect(celebration.active).toBe(false);
    expect(scene.particleSystems.length).toBe(countAfterStart);
  });

  it('fires shells over simulated frames by driving manualEmitCount bursts', () => {
    // NullEngine's raw textures never report isReady() (no GPU upload), so
    // Babylon's own particle update short-circuits and never consumes
    // manualEmitCount back to 0 - this asserts our own burst scheduling
    // (the thing this module owns) rather than the engine-gated particle
    // simulation (which cascadeCourtWaterMotion's tests don't exercise
    // either, for the same reason).
    engine = new NullEngine();
    vi.spyOn(engine, 'getDeltaTime').mockReturnValue(16.7);
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);
    const celebration = createCompletionCelebration(scene);

    celebration.start();
    for (const system of scene.particleSystems) {
      expect(system.manualEmitCount).toBe(0);
    }

    // Render enough frames to cross every staggered shell interval at least
    // once (interval 1.4s at ~60fps is ~84 frames).
    for (let i = 0; i < 100; i++) {
      scene.render();
    }

    // Every launch point fired at least one burst.
    for (const system of scene.particleSystems) {
      expect(system.manualEmitCount).toBe(160);
    }
  });

  it('does not fire shells while stopped', () => {
    engine = new NullEngine();
    vi.spyOn(engine, 'getDeltaTime').mockReturnValue(16.7);
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);
    const celebration = createCompletionCelebration(scene);

    celebration.start();
    celebration.stop();

    for (let i = 0; i < 100; i++) {
      scene.render();
    }

    for (const system of scene.particleSystems) {
      expect(system.manualEmitCount).toBe(0);
    }
  });

  it('dispose() removes the particle systems and the render observer', () => {
    const scene = buildScene();
    const initialParticleSystemCount = scene.particleSystems.length;
    const initialObserverCount = scene.onBeforeRenderObservable.observers.length;
    const celebration = createCompletionCelebration(scene);

    celebration.start();
    celebration.dispose();

    expect(celebration.active).toBe(false);
    expect(scene.particleSystems.length).toBe(initialParticleSystemCount);
    expect(scene.onBeforeRenderObservable.observers.length).toBe(initialObserverCount);
    expect(() => scene.render()).not.toThrow();
  });
});
