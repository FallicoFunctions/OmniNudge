import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createFollowCameraRig } from '../createFollowCameraRig';
import { createPlayerRig } from '../createPlayerRig';
import { createPlayerController } from '../playerController';
import { createInputMap } from '../createInputMap';
import { updateKeyboardCamera } from '../updateKeyboardCamera';
import type { MovementInput } from '../movementMath';

describe('Auto-Follow camera', () => {
  let engine: NullEngine;
  let scene: Scene;
  afterEach(() => { scene?.dispose(); engine?.dispose(); });

  function setup(radius = 6) {
    engine = new NullEngine();
    scene = new Scene(engine);
    const target = new TransformNode('player', scene);
    target.position.y = 1.65;
    const rig = createFollowCameraRig(scene, target);
    rig.applyCheckpointView({ alpha: -Math.PI / 2, beta: 1.1, radius, focusOffset: { x: 0, y: 0, z: 0 } });
    scene.render();
    return { rig, target };
  }

  it.each([30, 60, 144])('eases behind travel at %s FPS while retaining pitch and zoom', fps => {
    const { rig, target } = setup();
    expect(rig.followMode()).toBe('follow');
    for (let frame = 0; frame < fps; frame++) {
      target.position.x += 4.5 / fps;
      rig.syncZoomState(1 / fps);
      scene.render();
      if (frame === 0) {
        expect(rig.camera.position.x).toBeLessThan(target.position.x);
        expect(rig.camera.position.z).toBeLessThan(-1);
      }
    }
    const forward = rig.camera.getForwardRay().direction;
    expect(forward.x).toBeGreaterThan(0.88);
    expect(Math.abs(forward.z)).toBeLessThan(0.02);
    expect(rig.camera.beta).toBeCloseTo(1.1);
    expect(rig.camera.radius).toBeCloseTo(6);
  });

  it('keeps a free orbit while moving, and enabling Auto-Follow takes effect immediately', () => {
    const { rig, target } = setup();
    rig.setFollowMode('free');
    for (let frame = 0; frame < 60; frame++) {
      target.position.x += 0.05;
      rig.syncZoomState(1 / 60);
      scene.render();
    }
    expect(rig.camera.alpha).toBeCloseTo(-Math.PI / 2);
    expect(rig.targetAnchor.position.x).toBeCloseTo(3);
    rig.setFollowMode('follow');
    target.position.x += 0.05;
    rig.syncZoomState(1 / 60);
    expect(rig.camera.alpha).toBeLessThan(-Math.PI / 2);
  });

  it('leaves manual look in charge during a drag and briefly after release', () => {
    const { rig, target } = setup();
    rig.setManualLookActive(true);
    rig.orbit(0.4, 0.2);
    const alpha = rig.camera.alpha, beta = rig.camera.beta;
    const step = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        target.position.x += 0.05;
        rig.syncZoomState(1 / 60);
        scene.render();
      }
    };
    step(90);
    expect(rig.camera.alpha).toBeCloseTo(alpha);
    rig.setManualLookActive(false);
    step(20);
    expect(rig.camera.alpha).toBeCloseTo(alpha);
    step(80);
    expect(rig.camera.getForwardRay().direction.x).toBeGreaterThan(0.94);
    expect(rig.camera.beta).toBeCloseTo(beta);
    const stationaryAlpha = rig.camera.alpha;
    for (let i = 0; i < 90; i++) { rig.syncZoomState(1 / 60); scene.render(); }
    expect(rig.camera.alpha).toBeCloseTo(stationaryAlpha);
  });

  it('does not recenter first-person, operator, vertical-only, or teleport movement', () => {
    const { rig, target } = setup(0.1);
    target.position.x += 0.05;
    rig.syncZoomState(1 / 60);
    scene.render();
    expect(rig.camera.alpha).toBeCloseTo(-Math.PI / 2);
    rig.zoom(5.9);
    target.position.y += 0.05;
    rig.syncZoomState(1 / 60);
    expect(rig.camera.alpha).toBeCloseTo(-Math.PI / 2);
    target.position.x += 50;
    rig.syncZoomState(1 / 60);
    expect(rig.camera.alpha).toBeCloseTo(-Math.PI / 2);
    rig.setOperatorView(true);
    rig.orbit(0.3, 0.2);
    const forward = rig.camera.getForwardRay().direction.clone();
    for (let i = 0; i < 120; i++) {
      target.position.x += 0.05;
      rig.syncZoomState(1 / 60);
      scene.render();
    }
    expect(Vector3.Distance(rig.camera.getForwardRay().direction, forward)).toBeLessThan(0.0001);
  });

  function setupPlayer(input: MovementInput, fps = 60) {
    engine = new NullEngine(); scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, scene);
    const player = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const rig = createFollowCameraRig(scene, player.root, { groundCollisionMeshes: [ground] });
    rig.applyCheckpointView({ alpha: -Math.PI / 2, beta: 1.1, radius: 6, focusOffset: { x: 0, y: 0, z: 0 } });
    const controller = createPlayerController({
      avatarRoot: player.avatarAnchor, playerRig: player, camera: rig.camera, cameraRig: rig,
      collisionMeshes: [ground], input,
    });
    const step = (frames: number, onFrame?: () => void) => {
      for (let i = 0; i < frames; i++) {
        updateKeyboardCamera(rig, input, 1 / fps);
        controller.step(1 / fps);
        rig.syncZoomState(1 / fps);
        scene.render();
        onFrame?.();
      }
    };
    scene.render();
    return { player, rig, step };
  }

  const input = (direction: string): MovementInput => ({
    forward: direction === 'forward', backward: direction === 'backward',
    left: direction === 'left', right: direction === 'right',
    jump: false, sprint: false, up: false, down: false,
  });

  it.each([30, 60, 144].flatMap(fps => [-1, 1].map(turn => ({ fps, turn }))))(
    'steers forward travel continuously with camera arrows $turn at $fps FPS', ({ fps, turn }) => {
      const keys = input('forward');
      keys.cameraLeft = turn === -1;
      keys.cameraRight = turn === 1;
      const { player, rig, step } = setupPlayer(keys, fps);
      const beta = rig.camera.beta, radius = rig.camera.radius;
      step(fps * 4);
      // Four seconds of camera steering completes a circle while walking.
      expect(Math.hypot(player.root.position.x, player.root.position.z)).toBeLessThan(0.01);
      expect(rig.camera.beta).toBeCloseTo(beta);
      expect(rig.camera.radius).toBeCloseTo(radius);
      keys.forward = false;
      keys.cameraLeft = false; keys.cameraRight = false;
      const stopped = player.root.position.clone(), alpha = rig.camera.alpha;
      step(fps);
      expect(Vector3.Distance(player.root.position, stopped)).toBeLessThan(0.001);
      expect(rig.camera.alpha).toBeCloseTo(alpha);
    },
  );

  it.each(['forward', 'backward'])(
    'stays on a straight path holding %s as the camera aligns behind the avatar', direction => {
      const { player, rig, step } = setupPlayer(input(direction));
      step(180);
      const position = player.root.position;
      const travel = new Vector3(position.x, 0, position.z).normalize();
      const expected = new Vector3(direction === 'right' ? 1 : direction === 'left' ? -1 : 0,
        0, direction === 'forward' ? 1 : direction === 'backward' ? -1 : 0);
      expect(Vector3.Distance(travel, expected)).toBeLessThan(0.001);
      expect(Math.hypot(position.x, position.z)).toBeCloseTo(13.5, 2);
      const cameraOffset = rig.camera.position.subtract(position); cameraOffset.y = 0; cameraOffset.normalize();
      expect(Vector3.Dot(cameraOffset, travel)).toBeLessThan(-0.999);
      expect(player.avatarAnchor.rotation.y).toBeCloseTo(Math.atan2(travel.x, travel.z));
    },
  );

  it.each([30, 60, 144].flatMap(fps => [-1, 1].flatMap(turn => [false, true].map(forward => ({
    fps, turn, forward,
  })))))(
    'keeps turning with lateral input $turn and forward=$forward at $fps FPS', ({ fps, turn, forward }) => {
      const keys = input(turn === -1 ? 'left' : 'right');
      keys.forward = forward;
      const { player, step } = setupPlayer(keys, fps);
      let previousYaw = 0, totalTurn = 0, firstSecondTurn = 0, pathLength = 0;
      const previousPosition = player.root.position.clone();
      const sample = () => {
        const yaw = player.avatarAnchor.rotation.y;
        totalTurn += Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw));
        previousYaw = yaw;
        pathLength += Vector3.Distance(player.root.position, previousPosition);
        previousPosition.copyFrom(player.root.position);
      };
      step(fps, sample);
      firstSecondTurn = totalTurn;
      step(fps, sample);
      // The player keeps turning in the second second and completes a loop,
      // rather than only rotating once and then continuing in a straight line.
      expect((totalTurn - firstSecondTurn) * turn).toBeGreaterThan(2);
      expect(totalTurn * turn).toBeGreaterThan(Math.PI * 2);
      expect(pathLength).toBeCloseTo(9, 2);
      expect(Math.hypot(player.root.position.x, player.root.position.z)).toBeLessThan(4.5);
      keys.left = false; keys.right = false; keys.forward = false;
      const stopped = player.root.position.clone();
      step(fps);
      expect(Vector3.Distance(player.root.position, stopped)).toBeLessThan(0.001);
    },
  );

  it('keeps walking and turning the camera with left/up after releasing A/W', () => {
    const keyboard = createInputMap(window);
    try {
      const { player, step } = setupPlayer(keyboard.state);
      const dispatch = (type: string, codes: string[]) => {
        for (const code of codes) window.dispatchEvent(new KeyboardEvent(type, { code }));
      };
      dispatch('keydown', ['KeyA', 'KeyW', 'ArrowLeft', 'ArrowUp']);
      expect(keyboard.state.left).toBe(true);
      expect(keyboard.state.forward).toBe(true);
      let previousYaw = 0, totalTurn = 0;
      const sample = () => {
        const yaw = player.avatarAnchor.rotation.y;
        totalTurn += Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw));
        previousYaw = yaw;
      };
      step(60, sample);
      const firstTurn = totalTurn;
      dispatch('keyup', ['KeyA', 'KeyW']);
      expect(keyboard.state.left).toBe(false);
      expect(keyboard.state.cameraLeft).toBe(true);
      expect(keyboard.state.forward).toBe(true);
      step(60, sample);
      // Switching from diagonal A/W movement changes the initial heading;
      // the remaining arrows then keep steering forward travel around a circle.
      const secondTurn = totalTurn;
      step(60, sample);
      expect(totalTurn - secondTurn).toBeCloseTo(-Math.PI / 2, 2);
      expect(secondTurn - firstTurn).toBeLessThan(-0.5);
      dispatch('keyup', ['ArrowLeft', 'ArrowUp']);
      const stopped = player.root.position.clone();
      step(60);
      expect(Vector3.Distance(player.root.position, stopped)).toBeLessThan(0.001);
    } finally {
      keyboard.dispose();
    }
  });

  it('uses the current view for new movement keys and manual look while a key stays held', () => {
    const keys = input('backward');
    const { player, rig, step } = setupPlayer(keys);
    step(120);
    keys.backward = false; keys.forward = true;
    const start = player.root.position.clone();
    step(30);
    expect(start.z - player.root.position.z).toBeGreaterThan(2.2);
    expect(Math.abs(player.root.position.x - start.x)).toBeLessThan(0.02);
    rig.orbit(Math.PI / 2, 0);
    const afterLook = player.root.position.clone();
    step(30);
    expect(player.root.position.x - afterLook.x).toBeGreaterThan(2.2);
    expect(Math.abs(player.root.position.z - afterLook.z)).toBeLessThan(0.02);
  });
});
