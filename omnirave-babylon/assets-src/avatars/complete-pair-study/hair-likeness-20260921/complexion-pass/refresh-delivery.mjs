import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';
import sharp from 'sharp';

const root = process.cwd();
const study = path.join(root, 'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const out = path.join(study, 'complexion-pass');
const assets = path.join(root, 'public/assets/avatars/complete-pair');
const manifestFile = path.join(root, 'src/player/completeAvatarDownloads.json');
const record = JSON.parse(await fs.readFile(path.join(study, 'female-native-validation.json'), 'utf8')).complexionFinish;
const source = await fs.readFile(path.join(study, record.sourceTexture));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(source), record.sourceTextureSha256);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report = {};
const updates = {};
for (const name of ['female.glb', 'female-lod1.glb', 'female-lod2.glb']) {
  const file = path.join(assets, name);
  const document = await io.read(file);
  const material = document.getRoot().listMaterials().find(m => m.getName() === 'Launch female skin.002');
  assert(material, `${name}: skin material missing`);
  const texture = material.getBaseColorTexture();
  assert.equal(texture?.getName(), record.texture);
  const previous = await sharp(Buffer.from(texture.getImage())).metadata();
  const {width, height} = previous;
  const quality = width >= 2048 ? 92 : width >= 1024 ? 88 : 82;
  const encoded = await sharp(source).resize(width, height).removeAlpha().webp({quality}).toBuffer();
  texture.setImage(encoded).setMimeType('image/webp');
  const bytes = await io.writeBinary(document);
  const gltf = await validateBytes(bytes, {maxIssues: 1000});
  assert.equal(gltf.issues.numErrors, 0, `${name}: glTF validation errors`);
  await fs.writeFile(file, bytes);
  const zip = gzipSync(bytes, {level: 9});
  assert(gunzipSync(zip).equals(bytes));
  await fs.writeFile(file + '.gz', zip);
  updates[name] = {bytes: bytes.length, gzipBytes: zip.length, sha256: hash(bytes)};
  report[name] = {sha256: updates[name].sha256, gltfErrors: 0, complexion: {texture: record.texture, width, height, quality, sha256: hash(encoded)}};
  console.log(name, 'face color refreshed', width, height, 'zero glTF errors');
}
await fs.writeFile(path.join(study, 'female-portable-validation.json'), JSON.stringify({...JSON.parse(await fs.readFile(path.join(study, 'female-portable-validation.json'), 'utf8')), ...report}, null, 2) + '\n');
let committed = false;
for (let attempt = 0; attempt < 5 && !committed; attempt++) {
  const fresh = await fs.readFile(manifestFile, 'utf8');
  const temp = manifestFile + `.complexion-${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify({...JSON.parse(fresh), ...updates}, null, 2) + '\n');
  if (await fs.readFile(manifestFile, 'utf8') !== fresh) { await fs.unlink(temp); continue; }
  await fs.rename(temp, manifestFile);
  committed = true;
}
assert(committed, 'Concurrent download manifest change');
console.log('COMPLEXION_DELIVERY_OK');
