import { MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { applyAvatarColorway, resolveAvatarColorway, USER_AVATAR_COLORWAYS } from '../avatarColorways';
import type { ReviewAvatar } from '../createReviewAvatar';

describe('avatarColorways', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('applies a selectable user avatar colorway and caches the generated material', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox('avatar-body', { size: 1 }, scene);
    const baseMaterial = new StandardMaterial('avatar-base', scene);
    mesh.material = baseMaterial;
    const avatar: ReviewAvatar = {
      meshes: [mesh],
      root: new TransformNode('avatar-root', scene),
    };

    const selected = applyAvatarColorway(avatar, 'pulse');
    const firstMaterial = mesh.material;

    expect(selected.id).toBe('pulse');
    expect(avatar.root.metadata?.avatarColorway).toBe('pulse');
    expect(mesh.metadata?.avatarColorway).toBe('pulse');
    expect(firstMaterial).not.toBe(baseMaterial);

    applyAvatarColorway(avatar, 'pulse');

    expect(mesh.material).toBe(firstMaterial);
  });

  it('falls back to the default avatar colorway for an unknown id', () => {
    expect(resolveAvatarColorway('missing-avatar').id).toBe(USER_AVATAR_COLORWAYS[0].id);
  });
});
