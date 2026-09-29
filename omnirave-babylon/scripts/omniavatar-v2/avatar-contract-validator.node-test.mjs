import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

import { evaluateAvatarSnapshot, quarantineMatch } from './avatar-contract-validator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(await readFile(resolve(here, '../../assets-src/avatars/omniavatar-v2/avatar-contract.v2.json')));
const quarantine = JSON.parse(await readFile(resolve(here, '../../assets-src/avatars/omniavatar-v2/quarantine.json')));

function validSnapshot() {
  const slotNodes = contract.requiredNodes.map((name) => ({
    name,
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    meshName: name === 'AvatarBody' ? 'AvatarBody' : null,
  }));
  return {
    path: '/tmp/OA_fixture_ready.glb',
    fileBytes: 1024,
    sceneCount: 1,
    hasDefaultScene: true,
    extensionsUsed: [],
    unusedResources: {},
    sceneExtras: {
      avatarContract: contract.contract,
      avatarCharacter: 'fixture',
      avatarSourceBlend: 'fixture.blend',
      avatarExportDate: '2026-09-04T00:00:00Z',
    },
    nodes: slotNodes,
    skins: [{
      name: 'AvatarSkeleton',
      joints: [...contract.requiredJoints, ...Array.from({ length: 31 }, (_, index) => `extra_${index}`)],
      inverseBindCount: 56,
    }],
    animations: contract.requiredAnimations.map((name) => ({ name, channels: 1, samplers: 1 })),
    meshes: [{
      name: 'AvatarBody',
      nodeNames: ['AvatarBody'],
      morphTargets: [...contract.requiredMorphTargets],
      primitives: [{
        mode: 4,
        triangles: 12000,
        vertexCount: 36000,
        attributes: ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'],
        material: 'OA_Fixture_Body_Skin',
        skinned: true,
        expectsSkin: true,
        weights: { minSum: 1, maxSum: 1, maxInfluences: 4, outOfTolerance: 0, nonFinite: 0, negative: 0, overOne: 0 },
        maxJointIndex: 55,
      }],
    }],
    materials: [{
      name: 'OA_Fixture_Body_Skin',
      exemptions: [],
      exemptionReason: '',
      textures: { baseColor: true, normal: true, metallicRoughness: true },
    }],
    textures: [
      { name: 'base', bytes: 100, mimeType: 'image/webp', size: [1024, 1024] },
      { name: 'normal', bytes: 100, mimeType: 'image/webp', size: [1024, 1024] },
      { name: 'roughness', bytes: 100, mimeType: 'image/webp', size: [1024, 1024] },
    ],
  };
}

test('accepts a contract-complete snapshot', () => {
  const report = evaluateAvatarSnapshot(validSnapshot(), contract, quarantine);
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.summary.errors, 0);
});

test('fails closed on ambiguous, unused, empty, and malformed resources', () => {
  const snapshot = validSnapshot();
  snapshot.nodes.push({ ...snapshot.nodes[0] });
  snapshot.unusedResources = { meshes: ['decoy-valid-body'] };
  snapshot.animations[0].channels = 0;
  snapshot.meshes[0].primitives[0].vertexCount = 0;
  snapshot.meshes[0].primitives[0].weights.negative = 1;
  snapshot.materials[0].exemptions = ['normal'];
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  const codes = new Set(report.findings.map((item) => item.code));
  assert.equal(report.verdict, 'FAIL');
  for (const code of [
    'node.duplicate_name', 'scene.unused_resource', 'animation.empty', 'primitive.empty',
    'skin.weight_value', 'material.exemption_undocumented',
  ]) assert.ok(codes.has(code), `expected ${code}`);
});

test('rejects skin binding mismatches and unverifiable texture dimensions', () => {
  const snapshot = validSnapshot();
  snapshot.meshes[0].primitives[0].skinned = false;
  snapshot.textures[0].size = null;
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  const codes = new Set(report.findings.map((item) => item.code));
  assert.ok(codes.has('skin.binding_mismatch'));
  assert.ok(codes.has('texture.dimension_unknown'));
});

test('rejects unsupported extensions and unnamed or duplicate joints', () => {
  const snapshot = validSnapshot();
  snapshot.extensionsUsed = ['KHR_unreviewed_extension'];
  snapshot.skins[0].joints[1] = snapshot.skins[0].joints[0];
  snapshot.textures[0].name = '';
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  const codes = new Set(report.findings.map((item) => item.code));
  assert.ok(codes.has('extension.unsupported'));
  assert.ok(codes.has('skin.joint_name'));
  assert.ok(codes.has('texture.name_missing'));
});

test('fails closed for missing rig, texture, UV, animation, and morph data', () => {
  const snapshot = validSnapshot();
  snapshot.skins[0].joints = ['pelvis'];
  snapshot.skins[0].inverseBindCount = 0;
  snapshot.animations = [];
  snapshot.meshes[0].morphTargets = [];
  snapshot.meshes[0].primitives[0].attributes = ['POSITION', 'JOINTS_0', 'WEIGHTS_0'];
  snapshot.meshes[0].primitives[0].weights = { minSum: 0.5, maxSum: 1, maxInfluences: 4, outOfTolerance: 1 };
  snapshot.materials[0].textures.normal = false;
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  const codes = new Set(report.findings.map((item) => item.code));
  assert.equal(report.verdict, 'FAIL');
  assert.ok(codes.has('skin.joint_count'));
  assert.ok(codes.has('animation.required_missing'));
  assert.ok(codes.has('morph.required_missing'));
  assert.ok(codes.has('primitive.attribute_missing'));
  assert.ok(codes.has('skin.weight_sum'));
  assert.ok(codes.has('material.texture_missing'));
});

test('rejects known experimental workfiles from production', () => {
  assert.equal(quarantineMatch('/tmp/OA_male_luxury_v2_muse_face05.blend', quarantine)?.status, 'rejected');
  const snapshot = validSnapshot();
  snapshot.path = '/tmp/OA_male_luxury_v3_headtopo02.blend';
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.findings.some((item) => item.code === 'asset.quarantined'));
});

test('rejects an export whose source workfile is quarantined', () => {
  const snapshot = validSnapshot();
  snapshot.path = '/tmp/renamed-to-look-ready.glb';
  snapshot.sceneExtras.avatarSourceBlend = '/work/OA_male_luxury_v2_muse_face05.blend';
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.findings.some((item) => item.code === 'asset.quarantined'));
});

test('CLI rejects external GLB resource URIs before the document loader sees them', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'omniavatar-glb-test-'));
  try {
    const jsonText = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: 0, uri: 'file:///etc/passwd' }],
    });
    const jsonLength = Math.ceil(Buffer.byteLength(jsonText) / 4) * 4;
    const totalLength = 12 + 8 + jsonLength;
    const glb = Buffer.alloc(totalLength, 0x20);
    glb.write('glTF', 0, 'ascii');
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(totalLength, 8);
    glb.writeUInt32LE(jsonLength, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    glb.write(jsonText, 20, 'utf8');
    const input = resolve(directory, 'external-uri.glb');
    await writeFile(input, glb);

    const result = spawnSync(process.execPath, [resolve(here, 'validate-avatar-glb.mjs'), input], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /external buffer and image URIs are forbidden/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
