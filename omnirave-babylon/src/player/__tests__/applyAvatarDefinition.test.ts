import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
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

  it('preserves authored facial submaterials carried by skin-shell GLB primitives', () => {
    const eyePrimitive = MeshBuilder.CreateBox('AvatarLuxury_male_skin_face_shell_primitive1', { size: 1 }, scene);
    const eyeMaterial = new PBRMaterial('AvatarLuxuryEyeWhite', scene);
    eyeMaterial.albedoColor.set(0.72, 0.68, 0.61);
    eyePrimitive.material = eyeMaterial;
    eyePrimitive.metadata = {
      avatarBodyBase: 'male',
      avatarBodySurface: 'skin',
      avatarPartRole: 'skin',
      avatarPreserveMaterial: true,
    };
    avatar.meshes.push(eyePrimitive);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, skinTone: 'ebony' });

    expect(eyePrimitive.material).toBe(eyeMaterial);
    expect(hexOf(eyeMaterial)).toBe('#b8ad9c');
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

  it('shows exactly one authored body base and retires fallback anatomy', () => {
    const male = MeshBuilder.CreateBox('AvatarBody_male', { size: 1 }, scene);
    male.material = new PBRMaterial('AvatarSkinBase_male', scene);
    male.metadata = { avatarBodyBase: 'male', avatarPartRole: 'skin' };
    const female = MeshBuilder.CreateBox('AvatarBody_female', { size: 1 }, scene);
    female.material = new PBRMaterial('AvatarSkinBase_female', scene);
    female.metadata = { avatarBodyBase: 'female', avatarPartRole: 'skin' };
    avatar.meshes.push(male, female);
    avatar.root.metadata = { ...avatar.root.metadata, avatarAuthoredBodiesLoaded: true };

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'male' });
    expect(male.isEnabled()).toBe(true);
    expect(female.isEnabled()).toBe(false);
    expect(scene.getMeshByName('review-avatar-head')!.isEnabled()).toBe(false);

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'female' });
    expect(male.isEnabled()).toBe(false);
    expect(female.isEnabled()).toBe(true);
  });

  it('retires the entire procedural fallback when a complete authored character is selected', () => {
    const maleBody = MeshBuilder.CreateBox('AvatarBody_male', { size: 1 }, scene);
    maleBody.material = new PBRMaterial('AvatarSkinBase_male', scene);
    maleBody.metadata = { avatarBodyBase: 'male', avatarPartRole: 'skin' };
    const bomber = MeshBuilder.CreateBox('AvatarLuxury_male_jacket_front', { size: 1 }, scene);
    bomber.material = new PBRMaterial('AvatarLuxuryPearlSatin', scene);
    bomber.metadata = { avatarBodyBase: 'male', avatarPartRole: 'jacket' };
    avatar.meshes.push(maleBody, bomber);
    avatar.root.metadata = {
      ...avatar.root.metadata,
      avatarAuthoredBodiesLoaded: true,
      avatarAuthoredCharacterBases: ['male'],
    };

    applyAvatarDefinition(avatar, { ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'male' });

    expect(maleBody.isEnabled()).toBe(true);
    expect(bomber.isEnabled()).toBe(true);
    expect(scene.getMeshByName('review-avatar-head')!.isEnabled()).toBe(false);
    expect(scene.getMeshByName('review-avatar-jacket')!.isEnabled()).toBe(false);
    expect(scene.getMeshByName('review-avatar-visor')!.isEnabled()).toBe(false);
    expect(scene.getMeshByName('review-avatar-back-halo')!.isEnabled()).toBe(false);
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
