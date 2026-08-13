import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';

import { applyAvatarDefinition } from '../applyAvatarDefinition';
import {
  AVATAR_REFERENCE_HEIGHT_INCHES,
  DEFAULT_AVATAR_DEFINITION,
  EDITOR_MAX_HEIGHT_INCHES,
  EDITOR_MIN_HEIGHT_INCHES,
} from '../avatarDefinition';
import { createPlayerRig } from '../createPlayerRig';
import { createReviewAvatar } from '../createReviewAvatar';
import { createPlayerController } from '../playerController';
import { resolvePlayerSpeed, type MovementInput } from '../movementMath';

// Sec 6.5: height affects body scale, eye level, and the collision capsule /
// standing presence - and must NOT affect movement speed, sprint speed, or
// jump power.

const HEIGHTS = [EDITOR_MIN_HEIGHT_INCHES, AVATAR_REFERENCE_HEIGHT_INCHES, EDITOR_MAX_HEIGHT_INCHES] as const;

const idleInput = (): MovementInput => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  up: false,
  down: false,
});

/**
 * Runs one grounded jump at a given body height and reports the movement
 * numbers the spec forbids height from touching.
 */
const measureMovement = (heightInches: number) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateBox('ground', { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5; // walking surface at y 0

  const rig = createPlayerRig(scene, new Vector3(0, 0, 0));
  rig.setHeightInches(heightInches);
  rig.root.position.set(0, rig.eyeHeightMeters, 0);

  const camera = new FreeCamera('movement-camera', new Vector3(0, 0, -4), scene);
  const avatarRoot = new TransformNode('movement-avatar', scene);
  const input = idleInput();
  const controller = createPlayerController({
    avatarRoot,
    camera,
    collisionMeshes: [ground],
    input,
    playerRig: rig,
  });

  controller.step(0.016); // settle onto the ground
  const grounded = controller.grounded;
  controller.jump();
  controller.step(0.016);
  const jumpVelocity = controller.verticalVelocityMetersPerSecond;

  input.forward = true;
  controller.step(0.016);
  const walkSpeed = controller.currentSpeedMetersPerSecond;
  input.sprint = true;
  controller.step(0.016);
  const sprintSpeed = controller.currentSpeedMetersPerSecond;

  const baseSpeed = rig.speedMetersPerSecond;
  scene.dispose();
  engine.dispose();

  return { baseSpeed, grounded, jumpVelocity, sprintSpeed, walkSpeed };
};

describe('height effects on the player rig (sec 6.5)', () => {
  it('scales the collision capsule, eye level, and avatar anchor', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = createPlayerRig(scene, new Vector3(0, 0, 0));

    // Reference height leaves the authored rig untouched.
    expect(rig.eyeHeightMeters).toBeCloseTo(1.65, 6);
    expect(rig.radiusMeters).toBeCloseTo(0.35, 6);
    expect(rig.capsule.scaling.y).toBeCloseTo(1, 6);
    expect(rig.capsule.position.y).toBeCloseTo(-0.75, 6);
    expect(rig.avatarAnchor.position.y).toBeCloseTo(-1.65, 6);
    expect(rig.heightInches).toBe(AVATAR_REFERENCE_HEIGHT_INCHES);

    const scale = EDITOR_MIN_HEIGHT_INCHES / AVATAR_REFERENCE_HEIGHT_INCHES;
    rig.setHeightInches(EDITOR_MIN_HEIGHT_INCHES);

    expect(rig.heightInches).toBe(EDITOR_MIN_HEIGHT_INCHES);
    expect(rig.eyeHeightMeters).toBeCloseTo(1.65 * scale, 6);
    expect(rig.radiusMeters).toBeCloseTo(0.35 * scale, 6);
    expect(rig.capsule.scaling.x).toBeCloseTo(scale, 6);
    expect(rig.capsule.scaling.y).toBeCloseTo(scale, 6);
    expect(rig.capsule.position.y).toBeCloseTo(-(1.65 * scale - 0.9 * scale), 6);
    expect(rig.avatarAnchor.position.y).toBeCloseTo(-1.65 * scale, 6);

    scene.dispose();
    engine.dispose();
  });

  it('keeps the feet planted when the height changes', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = createPlayerRig(scene, new Vector3(0, 0, 0));
    rig.root.position.set(0, rig.eyeHeightMeters, 0); // feet on y 0

    rig.setHeightInches(EDITOR_MAX_HEIGHT_INCHES);
    expect(rig.root.position.y - rig.eyeHeightMeters).toBeCloseTo(0, 6);

    rig.setHeightInches(EDITOR_MIN_HEIGHT_INCHES);
    expect(rig.root.position.y - rig.eyeHeightMeters).toBeCloseTo(0, 6);

    scene.dispose();
    engine.dispose();
  });

  it('is total against a garbage height', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = createPlayerRig(scene, new Vector3(0, 0, 0));

    expect(() => rig.setHeightInches(Number.NaN)).not.toThrow();
    expect(Number.isFinite(rig.eyeHeightMeters)).toBe(true);
    expect(rig.setHeightInches(1_000_000)).toBeCloseTo(EDITOR_MAX_HEIGHT_INCHES / AVATAR_REFERENCE_HEIGHT_INCHES, 6);

    scene.dispose();
    engine.dispose();
  });

  it('scales the avatar body from its definition height', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const avatar = await createReviewAvatar(scene);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, heightInches: AVATAR_REFERENCE_HEIGHT_INCHES });
    expect(avatar.root.scaling.y).toBeCloseTo(1, 6);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, heightInches: EDITOR_MIN_HEIGHT_INCHES });
    expect(avatar.root.scaling.x).toBeCloseTo(EDITOR_MIN_HEIGHT_INCHES / AVATAR_REFERENCE_HEIGHT_INCHES, 6);
    expect(avatar.root.scaling.y).toBeCloseTo(EDITOR_MIN_HEIGHT_INCHES / AVATAR_REFERENCE_HEIGHT_INCHES, 6);
    expect(avatar.root.scaling.z).toBeCloseTo(EDITOR_MIN_HEIGHT_INCHES / AVATAR_REFERENCE_HEIGHT_INCHES, 6);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, heightInches: EDITOR_MAX_HEIGHT_INCHES });
    expect(avatar.root.scaling.y).toBeCloseTo(EDITOR_MAX_HEIGHT_INCHES / AVATAR_REFERENCE_HEIGHT_INCHES, 6);

    scene.dispose();
    engine.dispose();
  });
});

describe('height does NOT affect movement (sec 6.5 negative requirement)', () => {
  it('leaves walk speed, sprint speed, and jump power identical at min, default, and max height', () => {
    const [shortest, reference, tallest] = HEIGHTS.map(measureMovement);

    // Every measurement grounded first, so the jump numbers are comparable.
    expect(shortest.grounded).toBe(true);
    expect(reference.grounded).toBe(true);
    expect(tallest.grounded).toBe(true);

    expect(shortest.baseSpeed).toBe(reference.baseSpeed);
    expect(tallest.baseSpeed).toBe(reference.baseSpeed);

    expect(shortest.walkSpeed).toBe(reference.walkSpeed);
    expect(tallest.walkSpeed).toBe(reference.walkSpeed);

    expect(shortest.sprintSpeed).toBe(reference.sprintSpeed);
    expect(tallest.sprintSpeed).toBe(reference.sprintSpeed);
    expect(reference.sprintSpeed).toBeGreaterThan(reference.walkSpeed);

    expect(shortest.jumpVelocity).toBe(reference.jumpVelocity);
    expect(tallest.jumpVelocity).toBe(reference.jumpVelocity);
    expect(reference.jumpVelocity).toBeGreaterThan(0);
  });

  it('never derives the speed constants from height', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = createPlayerRig(scene, new Vector3(0, 0, 0));
    const base = rig.speedMetersPerSecond;
    const sprint = resolvePlayerSpeed(base, true);

    for (const heightInches of HEIGHTS) {
      rig.setHeightInches(heightInches);
      expect(rig.speedMetersPerSecond).toBe(base);
      expect(resolvePlayerSpeed(rig.speedMetersPerSecond, false)).toBe(base);
      expect(resolvePlayerSpeed(rig.speedMetersPerSecond, true)).toBe(sprint);
    }

    scene.dispose();
    engine.dispose();
  });
});
