import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyAvatarDefinition, resolveAvatarPalette } from '../applyAvatarDefinition';
import {
  DEFAULT_AVATAR_DEFINITION,
  createSeededAvatarRng,
  generateAvatarDefinition,
  resolveAvatarOption,
  type AvatarDefinition,
} from '../avatarDefinition';
import { createReviewAvatar, type ReviewAvatar } from '../createReviewAvatar';

const hexOf = (material: PBRMaterial) => material.albedoColor.toHexString().toLowerCase();

const albedoHex = (scene: Scene, meshName: string) =>
  hexOf(scene.getMeshByName(meshName)!.material as PBRMaterial);

describe('applyAvatarDefinition', () => {
  let engine: NullEngine;
  let scene: Scene;
  let avatar: ReviewAvatar;

  beforeEach(async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    avatar = await createReviewAvatar(scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('paints skin, hair, top, jacket, bottoms, and shoes from the definition', () => {
    const definition: AvatarDefinition = {
      bodyBase: 'male',
      heightInches: 68,
      hairStyle: 'buzz',
      hairColor: 'ice',
      skinTone: 'ebony',
      top: 'graphic-tee',
      jacket: 'bomber',
      bottoms: 'cargo-pants',
      shoes: 'work-boots',
    };
    applyAvatarDefinition(avatar, definition);
    const palette = resolveAvatarPalette(definition);

    expect(albedoHex(scene, 'review-avatar-head')).toBe(palette.skinHex);
    expect(albedoHex(scene, 'review-avatar-hair')).toBe(palette.hairHex);
    expect(albedoHex(scene, 'review-avatar-torso')).toBe(palette.topHex);
    expect(albedoHex(scene, 'review-avatar-jacket')).toBe(palette.jacketHex);
    expect(albedoHex(scene, 'review-avatar-hips')).toBe(palette.bottomsHex);
    expect(albedoHex(scene, 'review-avatar-left-shoe')).toBe(palette.shoesHex);
    expect(albedoHex(scene, 'review-avatar-right-shoe')).toBe(palette.shoesHex);
  });

  it('uses PBR materials only - StandardMaterial renders flat white here', () => {
    applyAvatarDefinition(avatar, DEFAULT_AVATAR_DEFINITION);
    expect(avatar.meshes.every((mesh) => mesh.material instanceof PBRMaterial)).toBe(true);
  });

  it('paints the legs only when the bottoms are full length', () => {
    const skinHex = resolveAvatarOption('skinTone', 'ebony').colorHex;

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, skinTone: 'ebony', bottoms: 'cargo-pants' });
    expect(albedoHex(scene, 'review-avatar-left-leg')).toBe(resolveAvatarOption('bottoms', 'cargo-pants').colorHex);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, skinTone: 'ebony', bottoms: 'board-shorts' });
    expect(albedoHex(scene, 'review-avatar-left-leg')).toBe(skinHex);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, skinTone: 'ebony', bottoms: 'pleated-skirt' });
    expect(albedoHex(scene, 'review-avatar-left-leg')).toBe(skinHex);
  });

  it('paints the arms only for a long-sleeve top', () => {
    const skinHex = resolveAvatarOption('skinTone', 'porcelain').colorHex;

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, skinTone: 'porcelain', top: 'henley' });
    expect(albedoHex(scene, 'review-avatar-left-arm')).toBe(resolveAvatarOption('top', 'henley').colorHex);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, skinTone: 'porcelain', top: 'ribbed-tank' });
    expect(albedoHex(scene, 'review-avatar-left-arm')).toBe(skinHex);
  });

  it('expresses coarse silhouettes through part scaling', () => {
    const hairScale = (styleId: string) => {
      applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, hairStyle: styleId });
      return scene.getMeshByName('review-avatar-hair')!.scaling.y;
    };
    expect(hairScale('long-waves')).toBeGreaterThan(hairScale('buzz'));

    const jacketScale = (jacketId: string) => {
      applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, jacket: jacketId });
      return scene.getMeshByName('review-avatar-jacket')!.scaling.y;
    };
    expect(jacketScale('longline-coat')).toBeGreaterThan(jacketScale('cropped-puffer'));

    const shoeScale = (shoesId: string) => {
      applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, shoes: shoesId });
      return scene.getMeshByName('review-avatar-left-shoe')!.scaling.y;
    };
    expect(shoeScale('work-boots')).toBeGreaterThan(shoeScale('skate-sneakers'));
    expect(shoeScale('skate-sneakers')).toBeGreaterThan(shoeScale('flip-flops'));

    const hipsWidth = (bottomsId: string) => {
      applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, bottoms: bottomsId });
      return scene.getMeshByName('review-avatar-hips')!.scaling.x;
    };
    expect(hipsWidth('pleated-skirt')).toBeGreaterThan(hipsWidth('cargo-pants'));
  });

  it('is idempotent and caches its material clones instead of leaking one per call', () => {
    applyAvatarDefinition(avatar, DEFAULT_AVATAR_DEFINITION);
    const afterFirst = scene.materials.length;
    const headMaterialName = scene.getMeshByName('review-avatar-head')!.material!.name;

    for (let index = 0; index < 10; index += 1) {
      applyAvatarDefinition(avatar, DEFAULT_AVATAR_DEFINITION);
    }

    expect(scene.materials.length).toBe(afterFirst);
    expect(scene.getMeshByName('review-avatar-head')!.material!.name).toBe(headMaterialName);
  });

  it('normalizes a garbage definition rather than throwing', () => {
    const garbage = {
      bodyBase: 'centaur',
      heightInches: Number.NaN,
      hairStyle: 'nope',
      hairColor: '',
      skinTone: undefined,
      top: 12,
      jacket: null,
      bottoms: 'nope',
      shoes: 'nope',
    } as unknown as AvatarDefinition;

    const applied = applyAvatarDefinition(avatar, garbage);

    expect(applied.bodyBase === 'male' || applied.bodyBase === 'female').toBe(true);
    expect(Number.isInteger(applied.heightInches)).toBe(true);
    expect(avatar.root.metadata?.avatarDefinition?.shoes).toBe(applied.shoes);
  });

  it('records the applied definition on the avatar root without clobbering other metadata', () => {
    avatar.root.metadata = { ...avatar.root.metadata, avatarColorway: 'aurora' };
    const definition = generateAvatarDefinition(createSeededAvatarRng('metadata'));
    applyAvatarDefinition(avatar, definition);

    expect(avatar.root.metadata?.avatarKind).toBe('festival-runner');
    expect(avatar.root.metadata?.avatarColorway).toBe('aurora');
    expect(avatar.root.metadata?.avatarDefinition?.top).toBe(definition.top);
  });
});
