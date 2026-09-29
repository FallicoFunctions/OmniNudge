/** Transfer Blender's authored lip finish without touching mesh or rig data. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function applyFaceSurface(doc, record, sourceDirectory) {
  assert.equal(record.spec.version, 1);
  const material = doc.getRoot().listMaterials().find(m => m.getName() === record.material);
  assert(material, 'Missing facial skin material');
  const report = {};
  for (const [channel, source] of Object.entries(record.channels)) {
    assert(['baseColor', 'roughness'].includes(channel));
    const texture = channel === 'baseColor' ? material.getBaseColorTexture() : material.getMetallicRoughnessTexture();
    assert.equal(texture?.getName(), source.texture);
    // Shared image replacement must not silently modify another material.
    assert(texture.listParents().every(p => p.propertyType === 'Root' || p === material));
    const input = await fs.readFile(path.join(sourceDirectory, source.file));
    assert.equal(hash(input), record.sourceTextureHashes[channel]);
    const previous = await sharp(Buffer.from(texture.getImage())).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const {width, height, channels} = previous.info;
    assert.equal(channels, 3);
    let bytes;
    const colorQuality = width >= 2048 ? 92 : width >= 1024 ? 88 : 82;
    if (channel === 'baseColor') {
      bytes = await sharp(input).resize(width, height).removeAlpha().webp({quality: colorQuality}).toBuffer();
    } else {
      const roughness = await sharp(input).resize(width, height).extractChannel(0).raw().toBuffer();
      assert.equal(roughness.length, width * height);
      // glTF owns roughness in green. Retain metallic and occlusion bytes.
      const packed = Buffer.from(previous.data);
      for (let i = 0; i < roughness.length; i++) packed[3 * i + 1] = roughness[i];
      bytes = await sharp(packed, {raw: {width, height, channels: 3}}).webp({lossless: true}).toBuffer();
    }
    texture.setImage(bytes).setMimeType('image/webp');
    report[channel] = {texture: texture.getName(), width, height, ...(channel === 'baseColor' ? {colorQuality} : {lossless: true}), sha256: hash(bytes)};
  }
  return report;
}
