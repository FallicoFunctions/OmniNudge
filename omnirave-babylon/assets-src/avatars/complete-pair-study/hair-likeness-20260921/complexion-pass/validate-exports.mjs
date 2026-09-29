import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';

const root = process.cwd();
const study = path.join(root, 'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const out = path.join(study, 'complexion-pass');
const record = JSON.parse(await fs.readFile(path.join(study, 'female-native-validation.json'), 'utf8')).complexionFinish;
const source = await fs.readFile(path.join(study, record.sourceTexture));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const accessorHash = accessor => hash(new Uint8Array(accessor.getArray().buffer, accessor.getArray().byteOffset, accessor.getArray().byteLength));
function stableDocument(bytes) {
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  delete json.buffers;
  delete json.bufferViews;
  for (const accessor of json.accessors ?? []) delete accessor.bufferView;
  for (const image of json.images ?? []) delete image.bufferView;
  return json;
}
const report = {};
for (const name of ['female.glb', 'female-lod1.glb', 'female-lod2.glb']) {
  const oldBytes = await fs.readFile(path.join(out, 'before', name));
  const newBytes = await fs.readFile(path.join(root, 'public/assets/avatars/complete-pair', name));
  const old = (await io.readBinary(oldBytes)).getRoot();
  const now = (await io.readBinary(newBytes)).getRoot();
  assert.deepEqual(stableDocument(newBytes), stableDocument(oldBytes), `${name}: scene graph changed`);
  assert.equal(old.listAccessors().length, now.listAccessors().length);
  for (let i = 0; i < old.listAccessors().length; i++) assert.equal(accessorHash(old.listAccessors()[i]), accessorHash(now.listAccessors()[i]), `${name}: accessor ${i}`);
  assert.equal(old.listTextures().length, now.listTextures().length);
  let unchangedTextures = 0;
  for (let i = 0; i < old.listTextures().length; i++) {
    const a = old.listTextures()[i], b = now.listTextures()[i];
    assert.equal(a.getName(), b.getName());
    if (a.getName() !== record.texture) { assert.equal(hash(a.getImage()), hash(b.getImage()), `${name}: unrelated texture`); unchangedTextures++; }
  }
  const face = now.listTextures().find(t => t.getName() === record.texture);
  const metadata = await sharp(Buffer.from(face.getImage())).metadata();
  const quality = metadata.width >= 2048 ? 92 : metadata.width >= 1024 ? 88 : 82;
  const expected = await sharp(source).resize(metadata.width, metadata.height).removeAlpha().webp({quality}).toBuffer();
  assert.equal(hash(face.getImage()), hash(expected), `${name}: face image mismatch`);
  report[name] = {sha256: hash(newBytes), unchangedAccessors: old.listAccessors().length, unchangedTextures, unchangedSceneGraph: true, faceImageMatch: true, imageSize: [metadata.width, metadata.height]};
  console.log(name, JSON.stringify(report[name]));
}
await fs.writeFile(path.join(out, 'portable-complexion-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('COMPLEXION_EXPORTS_OK');
