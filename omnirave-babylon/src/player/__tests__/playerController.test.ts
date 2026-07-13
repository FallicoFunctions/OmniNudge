import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createPlayerRig } from '../createPlayerRig';
import { createPlayerController } from '../playerController';
import type { MovementInput } from '../movementMath';

function createInput(overrides: Partial<MovementInput> = {}): MovementInput {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    up: false,
    down: false,
    ...overrides,
  };
}

describe('createPlayerController', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('moves the player relative to the camera and rotates the avatar toward travel', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ forward: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.step(1);

    expect(rig.root.position.z).toBeGreaterThan(4.4);
    expect(rig.root.position.x).toBeCloseTo(0);
    expect(rig.root.position.y).toBeCloseTo(1.65);
    expect(avatarRoot.rotation.y).toBeCloseTo(0);
    expect(controller.animationState).toBe('run');
    expect(avatarRoot.metadata?.animationState).toBe('run');
    expect(controller.grounded).toBe(true);
  });

  it('applies sprint speed while preserving normalized diagonal movement', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ forward: true, right: true, sprint: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.step(1);

    expect(Math.hypot(rig.root.position.x, rig.root.position.z)).toBeCloseTo(6.975, 3);
    expect(controller.currentSpeedMetersPerSecond).toBeCloseTo(6.975, 3);
  });

  it('blocks horizontal movement against solid collision meshes without using them as ground', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const wall = MeshBuilder.CreateBox('collision-wall', { width: 4, height: 4, depth: 20 }, scene);
    wall.position.set(5, 2, 5);
    wall.computeWorldMatrix(true);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 5));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ right: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
      solidCollisionMeshes: [wall],
    });

    controller.step(1);

    expect(rig.root.position.x).toBeCloseTo(2.65);
    expect(rig.root.position.y).toBeCloseTo(1.65);
    expect(controller.grounded).toBe(true);
  });

  it('jumps from the ground and lands back on collision geometry', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ jump: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.step(1 / 60);

    expect(controller.grounded).toBe(false);
    expect(input.jump).toBe(false);
    expect(rig.root.position.y).toBeGreaterThan(1.65);

    for (let i = 0; i < 120; i += 1) {
      controller.step(1 / 60);
    }

    expect(controller.grounded).toBe(true);
    expect(rig.root.position.y).toBeCloseTo(1.65);
    expect(controller.verticalVelocityMetersPerSecond).toBe(0);
  });
});
