import { repairDegenerateTangents } from './repair_complete_tangents.mjs';
/** Store the same MikkTSpace basis used by the native normal-map baker. */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsIridescence } from '@gltf-transform/extensions';
import { tangents, unweld, weld, prune } from '@gltf-transform/functions';
import sharp from 'sharp';
const { generateTangents } = createRequire(import.meta.url)('mikktspace');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const sex of ['male','female']) {
  const file = new URL(`../../public/assets/avatars/complete-pair/${sex}.glb`, import.meta.url).pathname;
  const document = await io.read(file);
  // Blender's exporter currently omits its thin-film inputs. Preserve the
  // authored coating in the portable glTF extension, with linear G thickness.
  const films = document.createExtension(KHRMaterialsIridescence);
  for (const material of document.getRoot().listMaterials()) {
    const extras = material.getExtras();
    if (extras.launchTransmissionTexture) {
      const name = String(extras.launchTransmissionTexture);
      if (name !== path.basename(name)) throw new Error('Transmission image must be a local study filename.');
      const transmission = material.getExtension('KHR_materials_transmission');
      if (!transmission?.getTransmissionTexture()) throw new Error('Expected exported transmission texture.');
      const source = new URL(`../../assets-src/avatars/complete-pair-study/${name}`, import.meta.url);
      // Lossy encoding can leak light through the opaque knit at small UV
      // islands. Retain the native linear scalar image and exported UV binding.
      transmission.getTransmissionTexture().setImage(await sharp(await fs.readFile(source)).webp({lossless:true}).toBuffer()).setMimeType('image/webp');
    }
    const sheen = material.getExtension('KHR_materials_sheen');
    if (sheen && extras.launchSheenWeight !== undefined) {
      // Blender's export retains the sheen tint but drops its separate weight.
      const weight = Number(extras.launchSheenWeight);
      sheen.setSheenColorFactor([weight, weight, weight]);
    }
    if (!extras.launchFilmTexture) continue;
    const name = String(extras.launchFilmTexture);
    if (name !== path.basename(name)) throw new Error('Film image must be a local study filename.');
    const source = new URL(`../../assets-src/avatars/complete-pair-study/${name}`, import.meta.url);
    const image = await sharp(await fs.readFile(source)).webp({lossless:true}).toBuffer();
    const texture = document.createTexture(name).setImage(image).setMimeType('image/webp');
    const film = films.createIridescence()
      .setIridescenceFactor(Number(extras.launchFilmIntensity))
      .setIridescenceIOR(Number(extras.launchFilmIOR))
      .setIridescenceThicknessMinimum(Number(extras.launchFilmMinimumNm))
      .setIridescenceThicknessMaximum(Number(extras.launchFilmMaximumNm))
      .setIridescenceThicknessTexture(texture);
    film.getIridescenceThicknessTextureInfo().setTexCoord(material.getNormalTextureInfo()?.getTexCoord() ?? 0);
    if (extras.launchFilmMask) {
      film.setIridescenceTexture(texture);
      film.getIridescenceTextureInfo().setTexCoord(material.getNormalTextureInfo()?.getTexCoord() ?? 0);
    }
    material.setExtension('KHR_materials_iridescence', film);
  }
  await document.transform(unweld(),tangents({ generateTangents }), weld(), prune({ keepLeaves: true }));
  const tangentFallbackVertices = repairDegenerateTangents(document, sex);
  await document.transform(prune({ keepLeaves: true }));
  await io.write(file, document);
  console.log(`${sex}: baked tangent basis stored; ${tangentFallbackVertices} degenerate tangent fallbacks`);
}
