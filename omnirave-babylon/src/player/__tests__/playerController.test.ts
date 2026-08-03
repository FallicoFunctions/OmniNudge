import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createPlayerRig } from '../createPlayerRig';
import { createPlayerController } from '../playerController';
import type { LadderZone, RemotePlayerCollisionTarget } from '../playerController';
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

    expect(rig.root.position.x).toBeCloseTo(2.649);
    expect(rig.root.position.y).toBeCloseTo(1.65);
    expect(controller.grounded).toBe(true);
  });

  it('ejects out of overlapping solids instead of walking through them pinned inside', () => {
    // Live regression: per-box nearest-face ejection churned when two solids
    // overlapped - the wall-relief blocker's east face sat INSIDE the basin
    // water blocker, so the last-iterated box pinned x inside the water box
    // while z walked the avatar straight through the "solid" water zone.
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 200, height: 200 }, scene);
    // wall-relief-style: tall thin slab whose east face lands inside the water box
    const wallRelief = MeshBuilder.CreateBox('wall-relief', { width: 2, height: 6, depth: 62 }, scene);
    wallRelief.position.set(7.2, 1, -8);
    wallRelief.computeWorldMatrix(true);
    // water-north-style: wide box overlapping the wall relief's east edge
    const waterBox = MeshBuilder.CreateBox('water-box', { width: 9.5, height: 3, depth: 14.2 }, scene);
    waterBox.position.set(13.05, 1.5, 16.3);
    waterBox.computeWorldMatrix(true);
    const rig = createPlayerRig(scene, new Vector3(12, 1.65, 16)); // inside the water box
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(12, 2, 11), scene);
    camera.setTarget(new Vector3(12, 2, 16)); // forward = +z (north)
    const input = createInput({ forward: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
      solidCollisionMeshes: [waterBox, wallRelief],
    });

    for (let i = 0; i < 120; i++) {
      controller.step(1 / 60);
    }

    // must be ejected from the union, not pinned inside walking north
    const p = rig.root.position;
    const insideWater = p.x > 7.95 && p.x < 18.15 && p.z > 8.85 && p.z < 23.75;
    expect(insideWater).toBe(false);
  });

  it('blocks movement that crosses through a solid mesh between frames', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const wall = MeshBuilder.CreateBox('thin-collision-wall', { width: 0.25, height: 4, depth: 20 }, scene);
    wall.position.set(2.4, 2, 5);
    wall.computeWorldMatrix(true);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 5));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ right: true, sprint: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
      solidCollisionMeshes: [wall],
    });

    controller.step(1);

    expect(rig.root.position.x).toBeCloseTo(1.924);
    expect(rig.root.position.y).toBeCloseTo(1.65);
  });

  it('keeps the ground under an elevated deck instead of teleporting onto it', () => {
    // The VIP skydecks and the wing bridge are walkable floor 8.6m up, over
    // walkable ground. Picking the topmost ray hit lifted anyone underneath
    // straight onto the deck; ground must stay the surface at the feet.
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 200, height: 200 }, scene);
    const deck = MeshBuilder.CreateBox('skydeck', { width: 16, height: 0.4, depth: 8.8 }, scene);
    deck.position.set(0, 8.4, 0);
    deck.computeWorldMatrix(true);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground, deck],
      input: createInput(),
      playerRig: rig,
    });

    for (let i = 0; i < 30; i += 1) {
      controller.step(1 / 60);
    }

    expect(rig.root.position.y).toBeCloseTo(1.65);
    expect(controller.grounded).toBe(true);
  });

  it('stands on an elevated deck once the player is on it', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 200, height: 200 }, scene);
    const deck = MeshBuilder.CreateBox('skydeck', { width: 16, height: 0.4, depth: 8.8 }, scene);
    deck.position.set(0, 8.4, 0);
    deck.computeWorldMatrix(true);
    // Feet start on the deck surface (y 8.6 + eye height).
    const rig = createPlayerRig(scene, new Vector3(0, 8.6 + 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 10, -5), scene);
    camera.setTarget(new Vector3(0, 10, 0));
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground, deck],
      input: createInput(),
      playerRig: rig,
    });

    for (let i = 0; i < 30; i += 1) {
      controller.step(1 / 60);
    }

    expect(rig.root.position.y).toBeCloseTo(10.25);
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

  it('moves slower while crouched and shrinks the rig eye height', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ forward: true, crouch: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.step(1);

    expect(controller.currentSpeedMetersPerSecond).toBeCloseTo(2.25);
    expect(rig.crouched).toBe(true);
    expect(rig.eyeHeightMeters).toBeLessThan(1.65);
  });

  it('lets a crouched player still jump', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ crouch: true, jump: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.step(1 / 60);

    expect(controller.grounded).toBe(false);
    expect(controller.verticalVelocityMetersPerSecond).toBeGreaterThan(0);
  });

  it('crouch overrides sprint speed and stops stamina from draining', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ forward: true, sprint: true, crouch: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.step(1);

    expect(controller.currentSpeedMetersPerSecond).toBeCloseTo(2.25);
    expect(controller.stamina0to1).toBe(1);
  });

  it('depletes sprint stamina and forces walk speed once empty, then re-allows sprint after recovering', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 500, height: 500 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ forward: true, sprint: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    // 1s at a time keeps this test cheap; stamina drains 0.25/s so 4
    // seconds fully empties it.
    for (let i = 0; i < 4; i += 1) {
      controller.step(1);
    }
    expect(controller.stamina0to1).toBe(0);
    // Sprint speed no longer applies - back to walk speed (4.5).
    expect(controller.currentSpeedMetersPerSecond).toBeCloseTo(4.5);

    input.sprint = false;
    input.forward = false;
    for (let i = 0; i < 20; i += 1) {
      controller.step(0.1);
    }
    expect(controller.stamina0to1).toBeGreaterThan(0.15);

    input.sprint = true;
    input.forward = true;
    controller.step(1 / 60);
    expect(controller.currentSpeedMetersPerSecond).toBeCloseTo(6.975, 2);
  });

  it('attaches to a ladder zone on approach and climbs vertically instead of walking', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, -0.5));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5.5), scene);
    camera.setTarget(new Vector3(0, 2, -0.5));
    const ladder: LadderZone = {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.3,
      maxZ: 0.3,
      baseY: 0,
      topY: 5,
      facingYaw: Math.PI,
    };
    const input = createInput({ forward: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      ladders: [ladder],
      playerRig: rig,
    });

    controller.step(1 / 60);
    expect(controller.onLadder).toBe(true);

    const startY = rig.root.position.y;
    for (let i = 0; i < 60; i += 1) {
      controller.step(1 / 60);
    }

    expect(controller.onLadder).toBe(true);
    expect(rig.root.position.y).toBeGreaterThan(startY);
    // Locked to the ladder's centerline while climbing.
    expect(rig.root.position.x).toBeCloseTo(0);
    expect(rig.root.position.z).toBeCloseTo(0);
  });

  it('steps off the top of a ladder back onto normal ground movement', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const ladder: LadderZone = {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.3,
      maxZ: 0.3,
      baseY: 0,
      topY: 1,
      facingYaw: 0,
    };
    const input = createInput({ forward: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      ladders: [ladder],
      playerRig: rig,
    });

    controller.step(1 / 60);
    expect(controller.onLadder).toBe(true);

    for (let i = 0; i < 120; i += 1) {
      controller.step(1 / 60);
    }

    expect(controller.onLadder).toBe(false);
  });

  it('jumps off a ladder midway when jump is pressed while climbing', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const ladder: LadderZone = {
      minX: -0.5,
      maxX: 0.5,
      minZ: -0.3,
      maxZ: 0.3,
      baseY: 0,
      topY: 10,
      facingYaw: 0,
    };
    const input = createInput({ forward: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      ladders: [ladder],
      playerRig: rig,
    });

    controller.step(1 / 60);
    expect(controller.onLadder).toBe(true);

    input.forward = false;
    input.jump = true;
    controller.step(1 / 60);

    expect(controller.onLadder).toBe(false);
    expect(controller.verticalVelocityMetersPerSecond).toBeGreaterThan(0);
  });

  it('gives ghosted spawns a no-collision window and re-engages after moving clear', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 200, height: 200 }, scene);
    const wall = MeshBuilder.CreateBox('collision-wall', { width: 4, height: 4, depth: 20 }, scene);
    wall.position.set(2, 2, 0);
    wall.computeWorldMatrix(true);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ right: true, sprint: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
      solidCollisionMeshes: [wall],
    });

    controller.beginSpawnGhost();
    expect(controller.ghosting).toBe(true);

    // Ghosting should let the player pass straight through the wall that
    // would otherwise block them (see the "blocks horizontal movement"
    // test above using the same setup without ghosting).
    controller.step(1);
    expect(rig.root.position.x).toBeGreaterThan(3);

    // Sprinting further clears the ghost radius; collision must re-engage.
    for (let i = 0; i < 5; i += 1) {
      controller.step(1);
    }
    expect(controller.ghosting).toBe(false);
  });

  it('disallows jump and crouch while ghosted', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const input = createInput({ jump: true, crouch: true });
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input,
      playerRig: rig,
    });

    controller.beginSpawnGhost();
    controller.step(1 / 60);

    expect(controller.verticalVelocityMetersPerSecond).toBeLessThanOrEqual(0);
    expect(rig.crouched).toBe(false);
  });

  it('pushes the local player out of an overlapping remote player without moving the remote', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0.3, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const remote: RemotePlayerCollisionTarget = {
      x: 0,
      z: 0,
      footY: 0,
      radiusMeters: 0.35,
      heightMeters: 1.8,
    };
    const remotePlayers = [remote];
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input: createInput(),
      playerRig: rig,
      getRemotePlayerCollisionTargets: () => remotePlayers,
    });

    controller.step(1 / 60);

    // Combined radius is 0.7; starting 0.3 apart is a deep overlap, so the
    // local player must be pushed out beyond the combined radius.
    expect(Math.abs(rig.root.position.x)).toBeGreaterThan(0.3);
    expect(remote.x).toBe(0);
    expect(Number.isFinite(rig.root.position.x)).toBe(true);
    expect(Number.isFinite(rig.root.position.z)).toBe(true);
  });

  it('lets a jumping player stand on top of a remote player instead of falling through them', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    // Start the local player already above the remote's head, falling.
    const remoteTopY = 1.8; // footY 0 + heightMeters 1.8
    const rig = createPlayerRig(scene, new Vector3(0, remoteTopY + 1.65 + 0.5, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const remote: RemotePlayerCollisionTarget = {
      x: 0,
      z: 0,
      footY: 0,
      radiusMeters: 0.35,
      heightMeters: 1.8,
    };
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input: createInput(),
      playerRig: rig,
      getRemotePlayerCollisionTargets: () => [remote],
    });

    for (let i = 0; i < 60; i += 1) {
      controller.step(1 / 60);
    }

    expect(controller.grounded).toBe(true);
    expect(rig.root.position.y).toBeCloseTo(remoteTopY + 1.65, 1);
    expect(Number.isFinite(rig.root.position.y)).toBe(true);
  });

  it('does not stand on or collide with remote players while ghosted', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const ground = MeshBuilder.CreateGround('collision-ground', { width: 100, height: 100 }, scene);
    const rig = createPlayerRig(scene, new Vector3(0.1, 1.65, 0));
    const avatarRoot = new TransformNode('avatar-root', scene);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.setTarget(new Vector3(0, 2, 0));
    const remote: RemotePlayerCollisionTarget = {
      x: 0,
      z: 0,
      footY: 0,
      radiusMeters: 0.35,
      heightMeters: 1.8,
    };
    const controller = createPlayerController({
      avatarRoot,
      camera,
      collisionMeshes: [ground],
      input: createInput(),
      playerRig: rig,
      getRemotePlayerCollisionTargets: () => [remote],
    });

    controller.beginSpawnGhost();
    controller.step(1 / 60);

    // No horizontal push while ghosted - the overlap is left alone.
    expect(rig.root.position.x).toBeCloseTo(0.1);
  });
});
