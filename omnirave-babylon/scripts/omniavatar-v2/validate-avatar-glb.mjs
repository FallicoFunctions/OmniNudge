#!/usr/bin/env node
import { NodeIO } from '@gltf-transform/core';
import { open, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateAvatarSnapshot } from './avatar-contract-validator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const defaultContract = resolve(here, '../../assets-src/avatars/omniavatar-v2/avatar-contract.v2.json');
const defaultQuarantine = resolve(here, '../../assets-src/avatars/omniavatar-v2/quarantine.json');

function parseArgs(argv) {
  const result = { input: '', contract: defaultContract, quarantine: defaultQuarantine, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--') && !result.input) result.input = value;
    else if (value === '--contract') result.contract = argv[++index];
    else if (value === '--quarantine') result.quarantine = argv[++index];
    else if (value === '--output') result.output = argv[++index];
    else throw new Error(`Unknown or incomplete argument: ${value}`);
  }
  if (!result.input) throw new Error('Usage: validate-avatar-glb.mjs <avatar.glb> [--output report.json]');
  return result;
}

function trianglesForPrimitive(primitive) {
  const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
  if (primitive.getMode() === 4) return Math.floor(count / 3);
  if (primitive.getMode() === 5 || primitive.getMode() === 6) return Math.max(0, count - 2);
  return 0;
}

function weightSummary(weightsAccessor, tolerance) {
  if (!weightsAccessor) return null;
  const array = weightsAccessor.getArray();
  const width = weightsAccessor.getElementSize();
  let minSum = Infinity;
  let maxSum = -Infinity;
  let maxInfluences = 0;
  let outOfTolerance = 0;
  let nonFinite = 0;
  let negative = 0;
  let overOne = 0;
  for (let offset = 0; offset < array.length; offset += width) {
    let sum = 0;
    let influences = 0;
    for (let component = 0; component < width; component += 1) {
      const value = array[offset + component];
      if (!Number.isFinite(value)) nonFinite += 1;
      if (value < 0) negative += 1;
      if (value > 1) overOne += 1;
      sum += value;
      if (value > 1e-6) influences += 1;
    }
    minSum = Math.min(minSum, sum);
    maxSum = Math.max(maxSum, sum);
    maxInfluences = Math.max(maxInfluences, influences);
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > tolerance) outOfTolerance += 1;
  }
  return { minSum, maxSum, maxInfluences, outOfTolerance, nonFinite, negative, overOne };
}

function maxJointIndex(jointsAccessor) {
  if (!jointsAccessor) return -1;
  let maximum = -1;
  for (const value of jointsAccessor.getArray()) maximum = Math.max(maximum, value);
  return maximum;
}

async function readEmbeddedGLTFJSON(path, fileBytes) {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(12);
    const headerRead = await handle.read(header, 0, header.length, 0);
    if (headerRead.bytesRead !== header.length) throw new Error('GLB header is truncated.');
    if (header.subarray(0, 4).toString('ascii') !== 'glTF') {
      throw new Error('Input is not a binary glTF file (missing glTF magic bytes).');
    }
    if (header.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 GLB files are supported.');
    if (header.readUInt32LE(8) !== fileBytes) throw new Error('GLB header length does not match the uploaded file.');

    let offset = 12;
    while (offset + 8 <= fileBytes) {
      const chunkHeader = Buffer.alloc(8);
      const chunkHeaderRead = await handle.read(chunkHeader, 0, 8, offset);
      if (chunkHeaderRead.bytesRead !== 8) throw new Error('GLB chunk header is truncated.');
      const chunkLength = chunkHeader.readUInt32LE(0);
      const chunkType = chunkHeader.readUInt32LE(4);
      if (chunkLength > fileBytes - offset - 8) throw new Error('GLB contains an invalid chunk length.');
      if (chunkType === 0x4e4f534a) {
        const json = Buffer.alloc(chunkLength);
        const jsonRead = await handle.read(json, 0, chunkLength, offset + 8);
        if (jsonRead.bytesRead !== chunkLength) throw new Error('GLB JSON chunk is truncated.');
        return JSON.parse(json.toString('utf8').replace(/\u0000+$/g, '').trimEnd());
      }
      offset += 8 + chunkLength;
    }
    throw new Error('GLB contains no JSON chunk.');
  } finally {
    await handle.close();
  }
}

function collectSceneNodes(scene) {
  const nodes = new Set();
  const visit = (node) => {
    if (nodes.has(node)) return;
    nodes.add(node);
    for (const child of node.listChildren()) visit(child);
  };
  for (const child of scene?.listChildren() ?? []) visit(child);
  return nodes;
}

function resourceName(value, fallback) {
  return value.getName?.() || value.getURI?.() || fallback;
}

async function inspectGLB(path, contract) {
  const maxFileBytes = contract.budgets.maxFileBytes;
  const fileInfo = await stat(path);
  if (!fileInfo.isFile()) throw new Error('Input must be a regular file.');
  if (fileInfo.size <= 0 || fileInfo.size > maxFileBytes) {
    throw new Error(`Input size ${fileInfo.size} is outside 1..${maxFileBytes} bytes.`);
  }
  const json = await readEmbeddedGLTFJSON(path, fileInfo.size);
  const externalResources = [
    ...(json.buffers ?? []).filter((buffer) => typeof buffer.uri === 'string'),
    ...(json.images ?? []).filter((image) => typeof image.uri === 'string'),
  ];
  if (externalResources.length > 0) {
    throw new Error('Uploaded GLB must be self-contained; external buffer and image URIs are forbidden.');
  }

  const document = await new NodeIO().read(path);
  const root = document.getRoot();
  const scenes = root.listScenes();
  const defaultScene = root.getDefaultScene();
  const sceneNodes = collectSceneNodes(defaultScene);
  const nodes = [...sceneNodes];
  const activeMeshes = new Set(nodes.map((node) => node.getMesh()).filter(Boolean));
  const activeSkins = new Set(nodes.map((node) => node.getSkin()).filter(Boolean));
  const activeMaterials = new Set();
  for (const mesh of activeMeshes) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial()) activeMaterials.add(primitive.getMaterial());
    }
  }
  const activeTextures = new Set();
  for (const material of activeMaterials) {
    for (const texture of [
      material.getBaseColorTexture(), material.getNormalTexture(),
      material.getMetallicRoughnessTexture(), material.getOcclusionTexture(),
      material.getEmissiveTexture(),
    ]) if (texture) activeTextures.add(texture);
  }
  const nodeInstancesByMesh = new Map();
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const instances = nodeInstancesByMesh.get(mesh) ?? [];
    instances.push({ name: node.getName(), skinName: node.getSkin()?.getName() ?? null });
    nodeInstancesByMesh.set(mesh, instances);
  }

  return {
    path,
    fileBytes: fileInfo.size,
    sceneCount: scenes.length,
    hasDefaultScene: Boolean(defaultScene),
    extensionsUsed: json.extensionsUsed ?? [],
    sceneExtras: defaultScene?.getExtras() ?? {},
    unusedResources: {
      nodes: root.listNodes().filter((value) => !sceneNodes.has(value)).map((value) => resourceName(value, '(unnamed node)')),
      meshes: root.listMeshes().filter((value) => !activeMeshes.has(value)).map((value) => resourceName(value, '(unnamed mesh)')),
      skins: root.listSkins().filter((value) => !activeSkins.has(value)).map((value) => resourceName(value, '(unnamed skin)')),
      materials: root.listMaterials().filter((value) => !activeMaterials.has(value)).map((value) => resourceName(value, '(unnamed material)')),
      textures: root.listTextures().filter((value) => !activeTextures.has(value)).map((value) => resourceName(value, '(unnamed texture)')),
    },
    nodes: nodes.map((node) => ({
      name: node.getName(),
      translation: [...node.getTranslation()],
      rotation: [...node.getRotation()],
      scale: [...node.getScale()],
      meshName: node.getMesh()?.getName() ?? null,
      skinName: node.getSkin()?.getName() ?? null,
    })),
    skins: [...activeSkins].map((skin) => ({
      name: skin.getName(),
      joints: skin.listJoints().map((joint) => joint.getName()),
      inverseBindCount: skin.getInverseBindMatrices()?.getCount() ?? 0,
    })),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      channels: animation.listChannels().length,
      samplers: animation.listSamplers().length,
    })),
    meshes: [...activeMeshes].map((mesh) => ({
      name: mesh.getName(),
      nodeNames: (nodeInstancesByMesh.get(mesh) ?? []).map((instance) => instance.name),
      morphTargets: Array.isArray(mesh.getExtras()?.targetNames) ? mesh.getExtras().targetNames : [],
      primitives: mesh.listPrimitives().map((primitive) => {
        const joints = primitive.getAttribute('JOINTS_0');
        const weights = primitive.getAttribute('WEIGHTS_0');
        const instances = nodeInstancesByMesh.get(mesh) ?? [];
        return {
          mode: primitive.getMode(),
          triangles: trianglesForPrimitive(primitive),
          vertexCount: primitive.getAttribute('POSITION')?.getCount() ?? 0,
          attributes: primitive.listSemantics(),
          material: primitive.getMaterial()?.getName() ?? null,
          skinned: Boolean(joints && weights),
          expectsSkin: instances.some((instance) => instance.skinName),
          weights: weightSummary(weights, contract.budgets.weightSumTolerance),
          maxJointIndex: maxJointIndex(joints),
        };
      }),
    })),
    materials: [...activeMaterials].map((material) => ({
      name: material.getName(),
      exemptions: Array.isArray(material.getExtras()?.omniAvatarTextureExemptions)
        ? material.getExtras().omniAvatarTextureExemptions
        : [],
      exemptionReason: typeof material.getExtras()?.[contract.textureExemptionReasonExtra] === 'string'
        ? material.getExtras()[contract.textureExemptionReasonExtra].trim()
        : '',
      textures: {
        baseColor: Boolean(material.getBaseColorTexture()),
        normal: Boolean(material.getNormalTexture()),
        metallicRoughness: Boolean(material.getMetallicRoughnessTexture()),
      },
    })),
    textures: [...activeTextures].map((texture) => ({
      name: texture.getName() || texture.getURI() || '(unnamed)',
      bytes: texture.getImage()?.byteLength ?? 0,
      mimeType: texture.getMimeType(),
      size: texture.getSize(),
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(args.input);
  const contract = JSON.parse(await readFile(resolve(args.contract), 'utf8'));
  const quarantine = JSON.parse(await readFile(resolve(args.quarantine), 'utf8'));
  const snapshot = await inspectGLB(input, contract);
  const report = evaluateAvatarSnapshot(snapshot, contract, quarantine);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(resolve(args.output), json, { flag: 'wx' });
  process.stdout.write(json);
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
