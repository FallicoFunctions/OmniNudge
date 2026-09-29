/** Transfer the native fabric finish to all six GLBs without rebuilding meshes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsIridescence, KHRMaterialsSheen, KHRMaterialsSpecular, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { validateBytes } from 'gltf-validator';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const study = path.join(root, 'assets-src/avatars/complete-pair-study');
const pass = path.join(study, 'visual-reference-pass-20260911');
const output = path.join(root, 'public/assets/avatars/complete-pair');
const input = process.argv.includes('--baseline') ? path.join(pass, 'before') : output;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = document => {
  const r = document.getRoot();
  return hash(JSON.stringify({
    accessors: r.listAccessors().map(a => [a.getType(), a.getComponentType(), a.getNormalized(), hash(new Uint8Array(a.getArray().buffer, a.getArray().byteOffset, a.getArray().byteLength))]).sort(),
    nodes: r.listNodes().map(n => [n.getName(), n.getMatrix(), n.getWeights(), n.listChildren().map(c => c.getName()), n.getSkin()?.getName(), n.getMesh()?.getName()]),
    meshes: r.listMeshes().map(m => [m.getName(), m.getWeights(), m.listPrimitives().map(p => [p.listSemantics(), p.listTargets().map(t => t.listSemantics()), p.getIndices()?.getCount()])]),
    animations: r.listAnimations().map(a => [a.getName(), a.listChannels().map(c => [c.getTargetNode().getName(), c.getTargetPath()])]),
  }));
};

const selected = process.argv.includes('--sex') ? process.argv[process.argv.indexOf('--sex') + 1] : null;
assert(selected === null || ['male', 'female'].includes(selected), '--sex must be male or female');
const reports = selected ? JSON.parse(await fs.readFile(path.join(pass, 'portable-surface-validation.json'), 'utf8')) : {};
for (const sex of selected ? [selected] : ['male', 'female']) {
  const native = JSON.parse(await fs.readFile(path.join(pass, `${sex}-native-surface-validation.json`), 'utf8'));
  for (const suffix of ['', '-lod1', '-lod2']) {
    const filename = `${sex}${suffix}.glb`;
    const document = await io.read(path.join(input, filename));
    const before = digest(document);
    const maximum = suffix === '-lod2' ? 512 : suffix === '-lod1' ? 1024 : 2048;
    const changed = [];
    const textureCache = new Map();
    const raw = async (channel, width, height, component = 0) => {
      if (channel.factor !== undefined) return Buffer.alloc(width * height, Math.round(channel.factor * 255));
      assert.equal(path.basename(channel.image), channel.image);
      return sharp(await fs.readFile(path.join(study, channel.image))).resize(width, height).removeAlpha().extractChannel(component).raw().toBuffer();
    };
    const texture = async (name, source, linear = false) => {
      const key = `${name}:${linear}`;
      if (textureCache.has(key)) return textureCache.get(key);
      const sourcePath = path.join(study, source);
      assert.equal(path.basename(source), source);
      const bytes = await sharp(await fs.readFile(sourcePath)).resize(maximum, maximum, { fit: 'inside', withoutEnlargement: true }).webp({ lossless: true }).toBuffer();
      const result = document.createTexture(name).setImage(bytes).setMimeType('image/webp');
      textureCache.set(key, result);
      return result;
    };
    for (const material of document.getRoot().listMaterials()) {
      const values = native.materials[material.getName()];
      if (!values) continue;
      const base = values['Base Color'];
      if (base.factor !== undefined) material.setBaseColorFactor(base.factor);
      else if (base.image.includes('-reference-')) {
        const uv = material.getBaseColorTextureInfo()?.getTexCoord() ?? 0;
        material.setBaseColorTexture(await texture(base.image, base.image));
        material.setBaseColorFactor([1, 1, 1, 1]);
        material.getBaseColorTextureInfo().setTexCoord(uv);
      }
      const rough = values.Roughness, metal = values.Metallic;
      if (rough.image || metal.image) {
        const source = rough.image ?? metal.image;
        const meta = await sharp(path.join(study, source)).metadata();
        const scale = Math.min(1, maximum / Math.max(meta.width, meta.height));
        const width = Math.round(meta.width * scale), height = Math.round(meta.height * scale);
        const [g, b] = await Promise.all([raw(rough, width, height), raw(metal, width, height)]);
        const bytes = Buffer.alloc(width * height * 3);
        for (let i = 0; i < g.length; i++) { bytes[i * 3] = 255; bytes[i * 3 + 1] = g[i]; bytes[i * 3 + 2] = b[i]; }
        const uv = material.getMetallicRoughnessTextureInfo()?.getTexCoord() ?? material.getNormalTextureInfo()?.getTexCoord() ?? 0;
        const map = document.createTexture(`${material.getName()} reference finish`).setMimeType('image/webp')
          .setImage(await sharp(bytes, { raw: { width, height, channels: 3 } }).webp({ lossless: true }).toBuffer());
        material.setMetallicFactor(1).setRoughnessFactor(1).setMetallicRoughnessTexture(map);
        material.getMetallicRoughnessTextureInfo().setTexCoord(uv);
      } else material.setRoughnessFactor(rough.factor).setMetallicFactor(metal.factor);

      const coat = material.getExtension('KHR_materials_clearcoat') ?? document.createExtension(KHRMaterialsClearcoat).createClearcoat();
      const coatWeight = values['Coat Weight'];
      if (coatWeight.image && coatWeight.image.includes('-reference-')) {
        const uv = coat.getClearcoatTextureInfo()?.getTexCoord() ?? material.getNormalTextureInfo()?.getTexCoord() ?? 0;
        coat.setClearcoatFactor(1).setClearcoatTexture(await texture(coatWeight.image, coatWeight.image, true));
        coat.getClearcoatTextureInfo().setTexCoord(uv);
      } else if (coatWeight.factor !== undefined) coat.setClearcoatFactor(coatWeight.factor);
      coat.setClearcoatRoughnessFactor(values['Coat Roughness'].factor);
      material.setExtension('KHR_materials_clearcoat', coat);
      const specular = material.getExtension('KHR_materials_specular') ?? document.createExtension(KHRMaterialsSpecular).createSpecular();
      specular.setSpecularFactor(Math.min(1, values['Specular IOR Level'].factor * 2));
      material.setExtension('KHR_materials_specular', specular);
      const sheen = material.getExtension('KHR_materials_sheen') ?? document.createExtension(KHRMaterialsSheen).createSheen();
      sheen.setSheenColorFactor([values.sheenWeight, values.sheenWeight, values.sheenWeight]);
      material.setExtension('KHR_materials_sheen', sheen);
      const transmissionValue = values['Transmission Weight'];
      if (transmissionValue.image?.includes('-reference-')) {
        const transmission = material.getExtension('KHR_materials_transmission') ?? document.createExtension(KHRMaterialsTransmission).createTransmission();
        const uv = transmission.getTransmissionTextureInfo()?.getTexCoord() ?? material.getNormalTextureInfo()?.getTexCoord() ?? 0;
        transmission.setTransmissionFactor(1).setTransmissionTexture(await texture(transmissionValue.image, transmissionValue.image, true));
        transmission.getTransmissionTextureInfo().setTexCoord(uv);
        material.setExtension('KHR_materials_transmission', transmission);
        material.setExtras({ ...material.getExtras(), launchTransmissionTexture: transmissionValue.image });
      }
      material.setExtras({ ...material.getExtras(), launchSheenWeight: values.sheenWeight, launchReferenceSurfaceFinish: '20260911' });
      if (values.film) {
        const f = values.film;
        const film = material.getExtension('KHR_materials_iridescence') ?? document.createExtension(KHRMaterialsIridescence).createIridescence();
        const uv = film.getIridescenceThicknessTextureInfo()?.getTexCoord() ?? material.getNormalTextureInfo()?.getTexCoord() ?? 0;
        const map = await texture(f.Texture, f.Texture, true);
        film.setIridescenceFactor(f.Intensity).setIridescenceIOR(f.IOR)
          .setIridescenceThicknessMinimum(f.MinimumNm).setIridescenceThicknessMaximum(f.MaximumNm)
          .setIridescenceThicknessTexture(map);
        film.getIridescenceThicknessTextureInfo().setTexCoord(uv);
        if (f.Mask) { film.setIridescenceTexture(map); film.getIridescenceTextureInfo().setTexCoord(uv); }
        material.setExtension('KHR_materials_iridescence', film);
        material.setExtras({ ...material.getExtras(), ...Object.fromEntries(Object.entries(f).map(([k,v]) => ['launchFilm'+k,v])), launchReferenceFilm: true });
      }
      changed.push(material.getName());
    }
    assert(changed.some(name => /bomber|iridescent foil/.test(name)), filename);
    assert(changed.some(name => /cargo fabric|splattered nylon/.test(name)), filename);
    await document.transform(prune({ keepLeaves: true, keepAttributes: true, keepIndices: true }));
    assert.equal(digest(document), before, `${filename}: geometry or animation changed`);
    const bytes = await io.writeBinary(document);
    const result = await validateBytes(new Uint8Array(bytes), { maxIssues: 1000 });
    assert.equal(result.issues.numErrors, 0, JSON.stringify(result.issues.messages));
    await fs.writeFile(path.join(output, filename), bytes);
    reports[filename] = { changedMaterials: changed, bytes: bytes.length, geometryAndAnimationHash: before, geometryAndAnimationUnchanged: true, gltfErrors: result.issues.numErrors, gltfWarnings: result.issues.numWarnings };
    console.log(filename, changed.length, 'materials; geometry/animation unchanged; valid glTF');
  }
}
await fs.writeFile(path.join(pass, 'portable-surface-validation.json'), JSON.stringify(reports, null, 2) + '\n');
