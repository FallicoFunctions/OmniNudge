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

  it('preserves authored camera position offsets while following a snapped player root', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(32, 8.5, 4);
    const rig = createFollowCameraRig(scene, target);

    rig.applyCheckpointView({
      alpha: -2.8,
      beta: 1,
      radius: 38,
      focusOffset: { x: -26, y: 5, z: -4 },
      positionOffset: { x: 6, y: 8, z: -30 },
    });

    target.position.y = 1.65;
    rig.syncZoomState();

    expect(rig.targetAnchor.position.x).toBeCloseTo(6);
    expect(rig.targetAnchor.position.y).toBeCloseTo(6.65);
    expect(rig.targetAnchor.position.z).toBeCloseTo(0);
    expect(rig.camera.position.x).toBeCloseTo(38);
    expect(rig.camera.position.y).toBeCloseTo(9.65);
    expect(rig.camera.position.z).toBeCloseTo(-26);
    expect(rig.camera.radius).toBeCloseTo(Math.hypot(32, 3, -26));

    scene.render();

    expect(rig.camera.position.x).toBeCloseTo(38, 0);
    expect(rig.camera.position.y).toBeCloseTo(9.65, 0);
    expect(rig.camera.position.z).toBeCloseTo(-26, 0);
  });

  it('keeps the camera anchored to the player root as it moves after a checkpoint view, instead of staying fixed at the old position', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(0, 1.7, 0);
    const rig = createFollowCameraRig(scene, target);

    rig.applyCheckpointView({
      alpha: -Math.PI / 2,
      beta: 1.08,
      radius: 6,
      focusOffset: { x: 0, y: 0, z: 0 },
    });

    expect(rig.targetAnchor.position.x).toBeCloseTo(0);
    expect(rig.targetAnchor.position.z).toBeCloseTo(0);

    // Simulate WASD movement: the player walks forward without any further
    // checkpoint interaction.
    target.position.set(5, 1.7, 12);
    rig.syncZoomState();

    expect(rig.targetAnchor.position.x).toBeCloseTo(5);
    expect(rig.targetAnchor.position.y).toBeCloseTo(1.7);
    expect(rig.targetAnchor.position.z).toBeCloseTo(12);
  });

  it('preserves the checkpoint focus offset while following the player root on subsequent frames', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(0, 1.7, 0);
    const rig = createFollowCameraRig(scene, target);

    rig.applyCheckpointView({
      alpha: -Math.PI / 2,
      beta: 1.02,
      radius: 50,
      focusOffset: { x: 4, y: 10.3, z: 20 },
    });

    target.position.set(3, 1.7, 5);
    rig.syncZoomState();

    expect(rig.targetAnchor.position.x).toBeCloseTo(7);
    expect(rig.targetAnchor.position.y).toBeCloseTo(12);
    expect(rig.targetAnchor.position.z).toBeCloseTo(25);
  });

  it('orbits the follow camera around the player without moving the player target', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(0, 1.7, 0);
    const rig = createFollowCameraRig(scene, target);

    rig.applyCheckpointView({
      alpha: -Math.PI / 2,
      beta: 1.1,
      radius: 8,
      focusOffset: { x: 0, y: 1.4, z: 0 },
      positionOffset: { x: 0, y: 4, z: -8 },
    });

    const targetBefore = rig.targetAnchor.position.clone();

    rig.orbit(Math.PI / 2, 0.2);

    expect(target.position.x).toBeCloseTo(0);
    expect(target.position.z).toBeCloseTo(0);
    expect(rig.targetAnchor.position.x).toBeCloseTo(targetBefore.x);
    expect(rig.targetAnchor.position.y).toBeCloseTo(targetBefore.y);
    expect(rig.targetAnchor.position.z).toBeCloseTo(targetBefore.z);
    expect(rig.camera.position.x).toBeGreaterThan(7);
    expect(rig.camera.position.y).toBeLessThan(5.7);
    expect(rig.camera.position.z).toBeCloseTo(0, 1);
  });

  it('allows pitch orbit past horizontal so the player can look up', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(0, 1.7, 0);
    const rig = createFollowCameraRig(scene, target);

    rig.applyCheckpointView({
      alpha: -Math.PI / 2,
      beta: 1.1,
      radius: 8,
      focusOffset: { x: 0, y: 1.4, z: 0 },
      positionOffset: { x: 0, y: 4, z: -8 },
    });

    rig.orbit(0, 1.2);

    expect(rig.camera.beta).toBeGreaterThan(Math.PI / 2);
    expect(rig.camera.position.y).toBeLessThan(rig.targetAnchor.position.y);
  });
});
