import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MODULAR_AVATAR_BODY_MORPHS,
  MODULAR_AVATAR_CONTRACT_VERSION,
  MODULAR_AVATAR_EDITORIAL_ASSET_URL,
  MODULAR_AVATAR_FASHION_ASSET_URL,
  MODULAR_AVATAR_LEAN_ASSET_URL,
  MODULAR_AVATAR_SLOTS,
  modularAvatarSlotRootName,
  validateModularAvatarAsset,
} from '../modularAvatarContract';

describe('committed modular avatar GLB', () => {
  it('contains one shared skeleton, one morphable body, synchronized details and no review floor', async () => {
    const path = resolve(process.cwd(), 'public/assets/avatars/modular-v1/avatar-base.glb');
    const document = await new NodeIO().registerExtensions([EXTTextureWebP]).read(path);
    const root = document.getRoot();
    const nodes = root.listNodes();
    const bodyNode = nodes.find((node) => node.getName() === 'AvatarBody');
    const bodyMesh = bodyNode?.getMesh();
    const bodyMorphNames = (bodyMesh?.getExtras().targetNames ?? []) as string[];
    const sceneExtras = root.listScenes()[0]?.getExtras() ?? {};
    const slotOptionIds = Object.fromEntries(MODULAR_AVATAR_SLOTS.map((slot) => {
      const slotRoot = nodes.find((node) => node.getName() === modularAvatarSlotRootName(slot));
      const prefix = `AvatarOption_${slot}__`;
      return [slot, slotRoot?.listChildren()
        .map((node) => node.getName())
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length)) ?? []];
    })) as unknown as Parameters<typeof validateModularAvatarAsset>[0]['slotOptionIds'];

    const validation = validateModularAvatarAsset({
      contract: String(sceneExtras.avatarContract ?? ''),
      rootNames: nodes.map((node) => node.getName()),
      skeletonNames: root.listSkins().map((skin) => skin.getName()),
      bodyNames: nodes.filter((node) => node.getMesh()).map((node) => node.getName()),
      bodyMorphNames,
      slotRootNames: nodes.map((node) => node.getName()),
      slotOptionIds,
    });

    expect(validation).toEqual({ valid: true, errors: [] });
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(56);
    expect(bodyNode?.getSkin()).toBe(root.listSkins()[0]);
    expect(bodyMorphNames).toEqual([...MODULAR_AVATAR_BODY_MORPHS]);
    expect(MODULAR_AVATAR_SLOTS.map(modularAvatarSlotRootName).every(
      (name) => nodes.some((node) => node.getName() === name),
    )).toBe(true);
    expect(nodes.some((node) => /floor|review/i.test(node.getName()))).toBe(false);

    for (const slot of MODULAR_AVATAR_SLOTS) {
      expect(slotOptionIds[slot]).toContain('none');
    }
    expect([...slotOptionIds.hair].sort()).toEqual([
      'blunt-bob',
      'box-braids',
      'buzz',
      'high-pony',
      'long-waves',
      'man-bun',
      'none',
      'shoulder-shag',
      'space-buns',
      'taper-fade',
      'textured-crop',
    ]);
    expect([...slotOptionIds.top].sort()).toEqual(['graphic-tee', 'mesh-crop', 'none', 'ribbed-tank']);
    expect([...slotOptionIds.jacket].sort()).toEqual([
      'bomber',
      'cropped-puffer',
      'none',
      'utility-vest',
    ]);
    expect([...slotOptionIds.bottoms].sort()).toEqual([
      'cargo-pants',
      'mesh-shorts',
      'none',
      'tech-joggers',
    ]);
    expect([...slotOptionIds.shoes].sort()).toEqual([
      'chunky-sneakers',
      'high-tops',
      'none',
      'platform-boots',
      'skate-sneakers',
      'trail-runners',
      'work-boots',
    ]);
    expect(slotOptionIds.accessories).toContain('gold-hoops');

    for (const node of nodes.filter((candidate) => candidate.getName().startsWith('AvatarEye')
      || candidate.getName().startsWith('AvatarIris')
      || candidate.getName().startsWith('AvatarPupil'))) {
      expect(node.getSkin()).toBe(root.listSkins()[0]);
      expect((node.getMesh()?.getExtras().targetNames ?? []) as string[])
        .toEqual([...MODULAR_AVATAR_BODY_MORPHS]);
    }

    for (const name of [
      'AvatarHair_long-waves',
      'AvatarHair_box-braids',
      'AvatarHair_high-pony',
      'AvatarHair_blunt-bob',
      'AvatarHair_space-buns',
      'AvatarHair_buzz',
      'AvatarHair_taper-fade',
      'AvatarHair_textured-crop',
      'AvatarHair_man-bun',
      'AvatarHair_shoulder-shag',
      'AvatarHair_space-buns_bun_l',
      'AvatarHair_space-buns_bun_r',
      'AvatarHair_man-bun_bun_center',
      'AvatarTop_graphic-tee',
      'AvatarTop_ribbed-tank',
      'AvatarTop_mesh-crop',
      'AvatarJacket_bomber',
      'AvatarJacket_utility-vest',
      'AvatarJacket_cropped-puffer',
      'AvatarBottoms_tech-joggers',
      'AvatarBottoms_cargo-pants',
      'AvatarBottoms_mesh-shorts',
      'AvatarShoes_platform-boots',
      'AvatarShoes_chunky-sneakers',
      'AvatarShoes_skate-sneakers',
      'AvatarShoes_trail-runners',
      'AvatarShoes_high-tops',
      'AvatarShoes_work-boots',
      'AvatarEyebrows',
      'AvatarEyelashes',
      'AvatarAccessory_gold-hoops_l',
      'AvatarAccessory_gold-hoops_r',
    ]) {
      const node = nodes.find((candidate) => candidate.getName() === name);
      expect(node?.getSkin()).toBe(root.listSkins()[0]);
      expect((node?.getMesh()?.getExtras().targetNames ?? []) as string[])
        .toEqual([...MODULAR_AVATAR_BODY_MORPHS]);
    }

    expect(sceneExtras.avatarContract).toBe(MODULAR_AVATAR_CONTRACT_VERSION);
    expect(root.listAnimations().map((animation) => animation.getName()).sort())
      .toEqual(['idle', 'run', 'walk']);
    expect(root.listAnimations().every((animation) => animation.listChannels().length > 0))
      .toBe(true);
  });

  it('keeps the lean body as a fitted third morph on one shared animation rig', async () => {
    const path = resolve(process.cwd(), `public${MODULAR_AVATAR_LEAN_ASSET_URL}`);
    const document = await new NodeIO().registerExtensions([EXTTextureWebP]).read(path);
    const root = document.getRoot();
    const nodes = root.listNodes();
    const targetNames = (name: string) => {
      const node = nodes.find((candidate) => candidate.getName() === name);
      return (node?.getMesh()?.getExtras().targetNames ?? []) as string[];
    };

    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(56);
    expect(root.listAnimations().map((animation) => animation.getName()).sort())
      .toEqual(['idle', 'run', 'walk']);
    for (const name of [
      'AvatarBody',
      'AvatarTop_graphic-tee',
      'AvatarJacket_bomber',
      'AvatarBottoms_tech-joggers',
    ]) {
      expect(targetNames(name)).toEqual(['male', 'female', 'lean']);
    }
    for (const name of ['AvatarHair_textured-crop', 'AvatarShoes_high-tops']) {
      expect(targetNames(name)).toEqual([...MODULAR_AVATAR_BODY_MORPHS]);
    }
  });

  it('keeps Fashion V2 on the same modular topology, morph, and animation contract', async () => {
    const path = resolve(process.cwd(), `public${MODULAR_AVATAR_FASHION_ASSET_URL}`);
    const document = await new NodeIO().registerExtensions([EXTTextureWebP]).read(path);
    const root = document.getRoot();
    const nodes = root.listNodes();
    const targetNames = (name: string) => {
      const node = nodes.find((candidate) => candidate.getName() === name);
      return (node?.getMesh()?.getExtras().targetNames ?? []) as string[];
    };

    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(56);
    expect(root.listAnimations().map((animation) => animation.getName()).sort())
      .toEqual(['idle', 'run', 'walk']);
    for (const name of [
      'AvatarBody',
      'AvatarTop_graphic-tee',
      'AvatarJacket_bomber',
      'AvatarBottoms_tech-joggers',
    ]) {
      expect(targetNames(name)).toEqual(['male', 'female', 'lean']);
    }
    for (const name of ['AvatarHair_textured-crop', 'AvatarShoes_high-tops']) {
      expect(targetNames(name)).toEqual([...MODULAR_AVATAR_BODY_MORPHS]);
    }
  });

  it('keeps Editorial V3 on the same modular topology, morph, and animation contract', async () => {
    const path = resolve(process.cwd(), `public${MODULAR_AVATAR_EDITORIAL_ASSET_URL}`);
    const document = await new NodeIO().registerExtensions([EXTTextureWebP]).read(path);
    const root = document.getRoot();
    const nodes = root.listNodes();
    const targetNames = (name: string) => {
      const node = nodes.find((candidate) => candidate.getName() === name);
      return (node?.getMesh()?.getExtras().targetNames ?? []) as string[];
    };

    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(56);
    expect(root.listAnimations().map((animation) => animation.getName()).sort())
      .toEqual(['idle', 'run', 'walk']);
    for (const name of [
      'AvatarBody',
      'AvatarTop_graphic-tee',
      'AvatarJacket_bomber',
      'AvatarBottoms_tech-joggers',
    ]) {
      expect(targetNames(name)).toEqual(['male', 'female', 'lean']);
    }
    for (const name of ['AvatarHair_textured-crop', 'AvatarShoes_high-tops']) {
      expect(targetNames(name)).toEqual([...MODULAR_AVATAR_BODY_MORPHS]);
    }
  });
});
