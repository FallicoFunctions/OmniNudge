import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  findMissingCanonicalJoints,
  MODULAR_AVATAR_SKELETON_NAME,
  OMNIAVATAR_CANONICAL_JOINTS,
  OMNIAVATAR_CONTRACT_VERSION_V2,
  OMNIAVATAR_FEMALE_V1_ASSET_URL,
  OMNIAVATAR_MALE_V1_ASSET_URL,
  validateOmniAvatarV2Asset,
  type OmniAvatarV2AssetSummary,
} from '../modularAvatarContract';

interface V2Case {
  url: string;
  character: string;
  expectedWeights: readonly number[];
}

const CASES: readonly V2Case[] = [
  {
    url: OMNIAVATAR_MALE_V1_ASSET_URL,
    character: 'male-luxury-festival',
    expectedWeights: [1, 0],
  },
  {
    url: OMNIAVATAR_FEMALE_V1_ASSET_URL,
    character: 'female-plurr-warehouse',
    expectedWeights: [0, 1],
  },
];

async function summarize(asset: V2Case): Promise<OmniAvatarV2AssetSummary> {
  const document = await new NodeIO().read(resolve(process.cwd(), `public${asset.url}`));
  const root = document.getRoot();
  const nodes = root.listNodes();
  const skins = root.listSkins();
  const joints = skins[0]?.listJoints().map((joint) => joint.getName()) ?? [];
  const sceneExtras = (root.listScenes()[0]?.getExtras() ?? {}) as Record<string, unknown>;
  const bodyNode = nodes.find((node) => node.getName() === 'AvatarBody');
  const bodyMesh = bodyNode?.getMesh();
  const bodyMorphNames = (bodyMesh?.getExtras().targetNames ?? []) as string[];
  const bodyNames = nodes
    .filter((node) => node.getName() === 'AvatarBody' && node.getMesh())
    .map((node) => node.getName());

  const uvMissing: string[] = [];
  let triangles = 0;
  let weightMin: number | null = null;
  let weightMax: number | null = null;
  let outOfTolerance = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (!prim.listSemantics().includes('TEXCOORD_0')) uvMissing.push(mesh.getName());
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      triangles += indices ? indices.getCount() / 3 : position ? position.getCount() / 3 : 0;
      const weights = prim.getAttribute('WEIGHTS_0');
      if (weights) {
        const arr = weights.getArray() as ArrayLike<number>;
        let sum = 0;
        for (let i = 0; i < arr.length; i += 1) {
          sum += arr[i];
          if ((i + 1) % 4 === 0) {
            if (weightMin === null || sum < weightMin) weightMin = sum;
            if (weightMax === null || sum > weightMax) weightMax = sum;
            if (sum < 0.999 || sum > 1.001) outOfTolerance += 1;
            sum = 0;
          }
        }
      }
    }
  }

  return {
    contract: String(sceneExtras.avatarContract ?? ''),
    character: String(sceneExtras.avatarCharacter ?? ''),
    expectedCharacter: asset.character,
    skeletonName: skins[0]?.getName() ?? '',
    jointNames: joints,
    bodyNames,
    bodyMorphNames,
    bodyDefaultWeights: (bodyMesh?.getWeights() as number[] | null) ?? null,
    expectedBodyDefaultWeights: asset.expectedWeights,
    uvMissingMeshes: [...new Set(uvMissing)],
    materials: root.listMaterials().map((material) => material.getName()),
    textureCount: root.listTextures().length,
    weightMinSum: weightMin,
    weightMaxSum: weightMax,
    weightOutOfTolerance: outOfTolerance,
    triangles: Math.round(triangles),
    triangleBudget: 60000,
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      channels: animation.listChannels().length,
    })),
    // Recorded from Blender: the bind is still the inherited A-pose.
    restPoseStatus: 'a-pose',
  };
}

describe('OmniAvatar v2 golden-case assets', () => {
  it.each(CASES)('validates $character against the strict v2 gate', async (asset) => {
    const summary = await summarize(asset);
    const result = validateOmniAvatarV2Asset(summary);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    // Foundation catalog + A-pose bind are known, visible, non-blocking.
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('carries distinct character identities and morph defaults', async () => {
    const [male, female] = await Promise.all(CASES.map(summarize));
    expect(male.character).toBe('male-luxury-festival');
    expect(female.character).toBe('female-plurr-warehouse');
    expect(male.bodyDefaultWeights).toEqual([1, 0]);
    expect(female.bodyDefaultWeights).toEqual([0, 1]);
    expect(male.skeletonName).toBe(MODULAR_AVATAR_SKELETON_NAME);
    expect(findMissingCanonicalJoints(male.jointNames)).toEqual([]);
    expect(male.jointNames).toHaveLength(OMNIAVATAR_CANONICAL_JOINTS.length);
  });

  it('deforms distinct body geometry through the morph defaults', async () => {
    for (const asset of CASES) {
      const document = await new NodeIO().read(resolve(process.cwd(), `public${asset.url}`));
      const body = document
        .getRoot()
        .listNodes()
        .find((node) => node.getName() === 'AvatarBody')
        ?.getMesh();
      const prim = body?.listPrimitives()[0];
      const targets = prim?.listTargets() ?? [];
      expect(targets.length).toBe(2);
      for (const target of targets) {
        const delta = target.getAttribute('POSITION')?.getArray() as ArrayLike<number>;
        let displaced = 0;
        let sum = 0;
        for (let i = 0; i < delta.length; i += 3) {
          const magnitude = Math.hypot(delta[i], delta[i + 1], delta[i + 2]);
          sum += magnitude;
          if (magnitude > 1e-6) displaced += 1;
        }
        // Both morphs move a five-figure vertex count by centimeters.
        expect(displaced).toBeGreaterThan(10000);
        expect(sum / (delta.length / 3)).toBeGreaterThan(0.005);
      }
    }
  });

  it('grounds soles from the measured manifest offset', () => {
    for (const name of ['OA_male_luxury_v1', 'OA_female_plurr_v1']) {
      const manifest = JSON.parse(
        readFileSync(
          resolve(process.cwd(), `assets-src/avatars/omniavatar-v2/${name}.manifest.json`),
          'utf8',
        ),
      ) as { ground: { minYMeters: number; offsetMeters: number } };
      expect(manifest.ground.minYMeters).toBeLessThan(0);
      expect(manifest.ground.offsetMeters).toBeCloseTo(-manifest.ground.minYMeters, 9);
      // Soles land within a tenth of a millimeter of local zero.
      expect(manifest.ground.minYMeters + manifest.ground.offsetMeters).toBeCloseTo(0, 4);
    }
  });

  it('shares one rest-pose skeleton across both foundations', () => {
    const poses = ['OA_male_luxury_v1', 'OA_female_plurr_v1'].map(
      (name) =>
        JSON.parse(
          readFileSync(
            resolve(process.cwd(), `assets-src/avatars/omniavatar-v2/${name}.rest-pose.json`),
            'utf8',
          ),
        ) as { bone_count: number; bones: { name: string }[] },
    );
    for (const pose of poses) expect(pose.bone_count).toBe(56);
    expect(poses[0].bones.map((bone) => bone.name)).toEqual(
      poses[1].bones.map((bone) => bone.name),
    );
    expect(poses[0].bones.map((bone) => bone.name)).toEqual([...OMNIAVATAR_CANONICAL_JOINTS]);
  });

  it('advertises the v2 contract version and asset URLs', () => {
    expect(OMNIAVATAR_CONTRACT_VERSION_V2).toBe('omnirave-avatar/2');
    expect(OMNIAVATAR_MALE_V1_ASSET_URL).toContain('male-luxury-festival-v1.glb');
    expect(OMNIAVATAR_FEMALE_V1_ASSET_URL).toContain('female-plurr-warehouse-v1.glb');
  });
});
