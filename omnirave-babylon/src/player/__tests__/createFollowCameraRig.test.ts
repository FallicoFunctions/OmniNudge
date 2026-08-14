import { MeshBuilder, NullEngine, Scene, TransformNode } from '@babylonjs/core';
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
    expect(rig.camera.fov).toBeCloseTo(0.96);
    expect(rig.syncZoomState().mode).toBe('third_person');

    rig.camera.radius = 0.1;

    expect(rig.syncZoomState().mode).toBe('first_person');
    expect(rig.camera.radius).toBe(0.1);
  });

  it('zooms the follow distance within the rig bounds', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    const rig = createFollowCameraRig(scene, target);

    expect(rig.zoom(4).distance).toBeCloseTo(10);
    expect(rig.camera.radius).toBeCloseTo(10);
    expect(rig.zoom(-30).distance).toBeCloseTo(0.1); // clamped to min
    expect(rig.zoom(500).distance).toBeCloseTo(140); // clamped to max
  });

  it('zooms along the authored view direction after a checkpoint with a position offset', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    const rig = createFollowCameraRig(scene, target);
    rig.applyCheckpointView({
      alpha: 0,
      beta: 1.1,
      radius: 10,
      focusOffset: { x: 0, y: 0, z: 0 },
      positionOffset: { x: 0, y: 3, z: -9 },
    });
    const before = rig.camera.radius;

    const state = rig.zoom(-3);

    expect(state.distance).toBeCloseTo(before - 3);
    expect(rig.camera.radius).toBeCloseTo(before - 3);
    // direction preserved: still behind and above the target
    expect(rig.camera.position.y).toBeGreaterThan(0);
    expect(rig.camera.position.z).toBeLessThan(0);
  });

  it('settles an authored focus offset back onto the moving player', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(5, 2, -8);
    const rig = createFollowCameraRig(scene, target);
    // Sec 7's Free Camera default doesn't re-anchor to the target; this test
    // is about focus-settle math under Auto-Follow, so opt into it explicitly.
    rig.setFollowMode('follow');
    rig.applyCheckpointView({
      alpha: 0,
      beta: 1.1,
      radius: 10,
      focusOffset: { x: 14, y: 3.5, z: -7 },
      positionOffset: { x: 0, y: 2, z: -7 },
    });

    // walking: the movement loop decays the focus toward the avatar
    for (let i = 0; i < 240; i++) {
      rig.settleFocus(0.06);
      rig.syncZoomState();
    }

    const anchor = rig.targetAnchor.position;
    expect(anchor.x).toBeCloseTo(target.position.x, 1);
    expect(anchor.y).toBeCloseTo(target.position.y, 1);
    expect(anchor.z).toBeCloseTo(target.position.z, 1);
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
    rig.setFollowMode('follow');

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
    rig.setFollowMode('follow');

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
    rig.setFollowMode('follow');

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
    rig.setFollowMode('follow');

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

  it('does not produce NaN camera state when a checkpoint positionOffset equals its focusOffset', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(3, 1.7, -5);
    const rig = createFollowCameraRig(scene, target);

    const zoomState = rig.applyCheckpointView({
      alpha: 0,
      beta: 1.1,
      radius: 10,
      focusOffset: { x: 2, y: 1, z: 4 },
      positionOffset: { x: 2, y: 1, z: 4 },
    });

    expect(Number.isNaN(rig.camera.alpha)).toBe(false);
    expect(Number.isNaN(rig.camera.beta)).toBe(false);
    expect(Number.isNaN(rig.camera.radius)).toBe(false);
    expect(rig.camera.radius).toBeCloseTo(0.1);
    expect(zoomState.distance).toBeCloseTo(0.1);

    // Recovery is real: syncZoomState (the per-frame path) also stays sane.
    const state = rig.syncZoomState();
    expect(Number.isNaN(rig.camera.alpha)).toBe(false);
    expect(Number.isNaN(rig.camera.beta)).toBe(false);
    expect(Number.isNaN(rig.camera.radius)).toBe(false);
    expect(state.distance).toBeCloseTo(0.1);
  });

  it('allows pitch orbit past horizontal so the player can look up', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(0, 1.7, 0);
    const rig = createFollowCameraRig(scene, target);
    rig.setFollowMode('follow');

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

  it('tracks the player position in both Free Camera and Auto-Follow', () => {
    // Sec 7.2: the player must never leave frame in either mode - an earlier
    // version of this rig froze the anchor in Free Camera mode, which read
    // as a broken camera the moment Free Camera became the sec 7.2 default.
    engine = new NullEngine();
    const scene = new Scene(engine);
    const target = new TransformNode('player-root', scene);
    target.position.set(0, 1.7, 0);
    const rig = createFollowCameraRig(scene, target);

    expect(rig.followMode()).toBe('free');
    target.position.set(10, 1.7, 4);
    const freeState = rig.syncZoomState();
    expect(rig.targetAnchor.position.x).toBeCloseTo(10);
    expect(Number.isNaN(freeState.distance)).toBe(false);

    rig.setFollowMode('follow');
    expect(rig.followMode()).toBe('follow');
    target.position.set(40, 1.7, 4);
    rig.syncZoomState();
    expect(rig.targetAnchor.position.x).toBeCloseTo(40);
  });

  describe('camera collision (sec 7.2)', () => {
    it('clamps the camera distance inward when a raycast hit is closer than the requested distance', () => {
      engine = new NullEngine();
      const scene = new Scene(engine);
      const target = new TransformNode('player-root', scene);
      // Sits between the player (origin) and the requested camera position
      // 10m back along -z, so the collision ray must hit it.
      const blocker = MeshBuilder.CreateBox('blocker', { size: 1 }, scene);
      blocker.position.set(0, 0, -3);
      const rig = createFollowCameraRig(scene, target, { solidCollisionMeshes: [blocker] });
      rig.setFollowMode('follow');

      rig.applyCheckpointView({
        alpha: 0,
        beta: 1.1,
        radius: 10,
        focusOffset: { x: 0, y: 0, z: 0 },
        positionOffset: { x: 0, y: 0, z: -10 },
      });

      const state = rig.syncZoomState(0.016);

      // Box near face is ~2.5m out; clamp lands short of that, well below
      // the 10m requested distance.
      expect(state.distance).toBeLessThan(3);
      expect(rig.camera.radius).toBeLessThan(3);
    });

    it('eases the camera back out toward the requested distance instead of snapping once the obstruction clears', () => {
      engine = new NullEngine();
      const scene = new Scene(engine);
      const target = new TransformNode('player-root', scene);
      const blocker = MeshBuilder.CreateBox('blocker', { size: 1 }, scene);
      blocker.position.set(0, 0, -3);
      const rig = createFollowCameraRig(scene, target, { solidCollisionMeshes: [blocker] });
      rig.setFollowMode('follow');

      rig.applyCheckpointView({
        alpha: 0,
        beta: 1.1,
        radius: 10,
        focusOffset: { x: 0, y: 0, z: 0 },
        positionOffset: { x: 0, y: 0, z: -10 },
      });

      rig.syncZoomState(0.016);
      const clampedDistance = rig.camera.radius;
      expect(clampedDistance).toBeLessThan(3);

      // Obstruction moves out of the way entirely.
      blocker.position.set(50, 0, 0);

      const easingState = rig.syncZoomState(0.1);
      // Moving back out, but NOT an instant pop to the full 10m.
      expect(easingState.distance).toBeGreaterThan(clampedDistance);
      expect(easingState.distance).toBeLessThan(10);

      // Enough elapsed time recovers the full requested distance, and never
      // overshoots it.
      const recoveredState = rig.syncZoomState(5);
      expect(recoveredState.distance).toBeCloseTo(10);
      expect(recoveredState.distance).toBeLessThanOrEqual(10);
    });

    it('never eases the camera past the mode-resolved requested distance even with no obstruction', () => {
      engine = new NullEngine();
      const scene = new Scene(engine);
      const target = new TransformNode('player-root', scene);
      const rig = createFollowCameraRig(scene, target);
      rig.setFollowMode('follow');

      rig.applyCheckpointView({
        alpha: 0,
        beta: 1.1,
        radius: 10,
        focusOffset: { x: 0, y: 0, z: 0 },
        positionOffset: { x: 0, y: 0, z: -10 },
      });

      // A huge delta with nothing in the way must still land exactly on the
      // requested distance, never past it.
      const state = rig.syncZoomState(1000);

      expect(state.distance).toBeCloseTo(10);
      expect(rig.camera.radius).toBeCloseTo(10);
    });
  });
});
