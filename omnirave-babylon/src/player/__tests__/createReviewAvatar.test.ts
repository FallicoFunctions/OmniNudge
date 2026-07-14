import { NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { applyAvatarColorway } from '../avatarColorways';
import { createReviewAvatar } from '../createReviewAvatar';

describe('createReviewAvatar', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('creates a visible human-scale festival avatar with colorway roles', async () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const avatar = await createReviewAvatar(scene);

    expect(avatar.root.name).toBe('review-avatar-root');
    expect(avatar.root.metadata?.avatarKind).toBe('festival-runner');
    expect(avatar.meshes.length).toBeGreaterThanOrEqual(10);
    expect(scene.getMeshByName('review-avatar-head')).not.toBeNull();
    expect(scene.getMeshByName('review-avatar-torso')).not.toBeNull();
    expect(scene.getMeshByName('review-avatar-left-leg')).not.toBeNull();
    expect(scene.getMeshByName('review-avatar-right-arm')).not.toBeNull();
    expect(avatar.meshes.every((mesh) => mesh.parent === avatar.root)).toBe(true);
    expect(avatar.meshes.every((mesh) => mesh.isPickable === false)).toBe(true);
    expect(avatar.meshes.every((mesh) => mesh.checkCollisions === false)).toBe(true);

    const head = scene.getMeshByName('review-avatar-head')!;
    expect(head.position.y + head.getBoundingInfo().boundingBox.extendSize.y).toBeGreaterThan(1.8);

    applyAvatarColorway(avatar, 'pulse');
    const visorMaterial = scene.getMeshByName('review-avatar-visor')!.material as PBRMaterial;

    expect(avatar.root.metadata?.avatarColorway).toBe('pulse');
    expect(visorMaterial.emissiveIntensity).toBeGreaterThanOrEqual(1.2);
  });

  it('animates limbs from the controller movement state', async () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const avatar = await createReviewAvatar(scene);
    const leftArm = scene.getMeshByName('review-avatar-left-arm')!;

    avatar.animate(0, 'idle');
    const idleRotation = leftArm.rotation.x;
    avatar.animate(0.35, 'run');

    expect(leftArm.rotation.x).not.toBe(idleRotation);
  });
});
