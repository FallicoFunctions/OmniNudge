// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { transformAsset } from './transform-asset.mjs';

let directory;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'asset-transform-test-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const attribute = (name, type, values) => doc.createAccessor(name)
    .setBuffer(buffer).setType(type).setArray(new Float32Array(values));
  const pixels = Buffer.alloc(2050 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = (i / 4) % 256; pixels[i + 1] = 128; pixels[i + 2] = 80; pixels[i + 3] = 255;
  }
  const png = await sharp(pixels, { raw: { width: 2050, height: 4, channels: 4 } }).png().toBuffer();
  const texture = doc.createTexture('skin').setImage(png).setMimeType('image/png');
  const material = doc.createMaterial('skin').setBaseColorTexture(texture);
  const primitive = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', attribute('positions', 'VEC3', [0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setAttribute('NORMAL', attribute('normals', 'VEC3', [0, 0, 1, 0, 0, 1, 0, 0, 1]))
    .setAttribute('TANGENT', attribute('tangents', 'VEC4', [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]))
    .setAttribute('TEXCOORD_0', attribute('uv', 'VEC2', [0, 0, 1, 0, 0, 1]));
  primitive.addTarget(doc.createPrimitiveTarget('smile')
    .setAttribute('POSITION', attribute('smile', 'VEC3', [0, 0, 0, 0.1, 0, 0, 0, 0, 0])));
  const mesh = doc.createMesh('avatar').addPrimitive(primitive).setWeights([0.25])
    .setExtras({ targetNames: ['smile'] });
  const node = doc.createNode('Avatar').setMesh(mesh);
  const parent = doc.createNode('Root').setTranslation([1, 2, 3]).addChild(node);
  doc.createScene('Scene').addChild(parent);
  const sampler = doc.createAnimationSampler().setInterpolation('LINEAR')
    .setInput(attribute('time', 'SCALAR', [0, 1, 2]))
    .setOutput(attribute('translation', 'VEC3', [0, 0, 0, 1, 0, 0, 2, 0, 0]));
  const channel = doc.createAnimationChannel().setTargetNode(node)
    .setTargetPath('translation').setSampler(sampler);
  doc.createAnimation('Walk').addSampler(sampler).addChannel(channel);
  const file = path.join(directory, 'source.glb');
  await io.write(file, doc);
  return file;
}

describe('asset transform profiles', () => {
  for (const [profile, width] of [['modular-avatar', 1024], ['complete-avatar', 2048]]) {
    it(`${profile} preserves hierarchy, morphs and animation while compressing textures`, async () => {
      const input = await fixture();
      const output = path.join(directory, `${profile}.glb`);
      await transformAsset(profile, input, output);
      const doc = await io.read(output);
      const root = doc.getRoot();
      const parent = root.listScenes()[0].listChildren()[0];
      expect(parent.getName()).toBe('Root');
      expect(parent.getTranslation()).toEqual([1, 2, 3]);
      expect(parent.listChildren()[0].getName()).toBe('Avatar');
      const mesh = parent.listChildren()[0].getMesh();
      expect(mesh.getWeights()).toEqual([0.25]);
      expect(mesh.getExtras().targetNames).toEqual(['smile']);
      expect(mesh.listPrimitives()[0].listTargets()).toHaveLength(1);
      expect(root.listAnimations().map(a => a.getName())).toEqual(['Walk']);
      const times = root.listAnimations()[0].listSamplers()[0].getInput().getArray();
      expect(times[0]).toBe(0);
      expect(times[times.length - 1]).toBe(2);
      const texture = root.listTextures()[0];
      expect(texture.getMimeType()).toBe('image/webp');
      expect((await sharp(texture.getImage()).metadata()).width).toBe(width);
      expect(doc.hasExtension('KHR_draco_mesh_compression')).toBe(false);
    });
  }

  it('compresses and decodes geometry without recompressing the decoded output', async () => {
    const input = await fixture();
    const compressed = path.join(directory, 'compressed.glb');
    const decoded = path.join(directory, 'decoded.glb');
    await transformAsset('draco', input, compressed);
    expect((await io.readAsJSON(compressed)).json.extensionsRequired).toContain('KHR_draco_mesh_compression');
    await transformAsset('decode', compressed, decoded);
    const doc = await io.read(decoded);
    expect(doc.hasExtension('KHR_draco_mesh_compression')).toBe(false);
    const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const tangents = primitive.getAttribute('TANGENT').getArray();
    for (let i = 0; i < tangents.length; i += 4) {
      expect(Math.hypot(...tangents.slice(i, i + 3))).toBeCloseTo(1, 3);
      expect(Math.abs(tangents[i + 3])).toBeCloseTo(1, 3);
    }
  });

  it('rejects unknown profiles before opening or writing files', async () => {
    await expect(transformAsset('unknown', 'missing.glb', path.join(directory, 'out.glb')))
      .rejects.toThrow('Unknown asset transform');
  });
});
