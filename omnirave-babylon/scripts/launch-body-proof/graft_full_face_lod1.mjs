/**
 * Detail 1 keeps the full model's face. The venue never loads detail 0 (it
 * measured about 665 MB per body), and the player judged the reduced face
 * unacceptable: fewer head vertices, 1024 face images and palette-merged eyes.
 * This copies the detail-0 head/body mesh, eyes, irises, brows and lashes,
 * with their materials and 2048 images, onto the committed detail-1 file.
 * It also fixes two red marks at the eye corners in the skin image: the
 * saturated red lines painted along the eye openings, and the bright red
 * socket interiors behind the eyeballs, which show where an eyeball does not
 * fill the outer corner. The socket interiors become a deep shadow.
 * The rest of detail 1 is untouched. Re-running is safe: the source is always
 * the detail-0 file.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, unpartition } from '@gltf-transform/functions';
import { validateBytes } from 'gltf-validator';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'public/assets/avatars/complete-pair');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const FACE_NODES = ['AvatarBody', 'AvatarEye_l', 'AvatarEye_r', 'AvatarEyebrows', 'AvatarEyelashes', 'AvatarIris_l', 'AvatarIris_r'];

// The painted line is pink-red (blue close to green) or a deep red; both
// characters' skin and eye shadow are orange-brown (blue well below green).
const isRed = (data, k) => {
  const r = data[k], g = data[k + 1], b = data[k + 2];
  return (r - g > 55 && b >= g * .82) || (r > 70 && g < r * .35);
};
const isOpening = (data, k) => data[k] * .3 + data[k + 1] * .59 + data[k + 2] * .11 < 80;

/** Replace red texels beside the dark eye openings with their normal neighbours. */
async function removeEyeOpeningRed(texture, label) {
  const { data, info } = await sharp(Buffer.from(texture.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, at = (x, y) => (y * W + x) * 4, fixed = Buffer.from(data);
  let count = 0;
  // The eye openings of this UV layout, both characters.
  for (let y = Math.round(.45 * H); y < .59 * H; y++) for (let x = Math.round(.81 * W); x < .87 * W; x++) {
    if (!isRed(data, at(x, y))) continue;
    let opening = false;
    for (let dy = -3; dy <= 3 && !opening; dy++) for (let dx = -3; dx <= 3; dx++) if (isOpening(data, at(x + dx, y + dy))) { opening = true; break; }
    if (!opening) continue;
    const sum = [0, 0, 0]; let n = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const k = at(x + dx, y + dy); if (isRed(data, k)) continue;
      sum[0] += data[k]; sum[1] += data[k + 1]; sum[2] += data[k + 2]; n++;
    }
    if (!n) continue;
    const k = at(x, y); for (let c = 0; c < 3; c++) fixed[k + c] = Math.round(sum[c] / n);
    count++;
  }
  assert(count > 20, `${label}: expected the red eye-opening lines`);
  // The socket interiors are two red ovals in their own UV island
  // (u 0-0.16, v 0.36-0.46); their skin-coloured rims stay.
  let socket = 0;
  for (let y = Math.round(.36 * H); y < .46 * H; y++) for (let x = 0; x < .16 * W; x++) {
    const k = at(x, y);
    if (!(fixed[k] > 80 && fixed[k + 1] < fixed[k] * .58)) continue;
    fixed[k] = Math.round(fixed[k] * .3); fixed[k + 1] = Math.round(fixed[k + 1] * .3); fixed[k + 2] = Math.round(fixed[k + 2] * .3);
    socket++;
  }
  assert(socket > 5000, `${label}: expected the red eye-socket interiors`);
  texture.setImage(await sharp(fixed, { raw: { width: W, height: H, channels: 4 } }).removeAlpha().webp({ quality: 92 }).toBuffer()).setMimeType('image/webp');
  return count + socket;
}

const unused = property => property.listParents().every(parent => parent.propertyType === 'Root');

for (const sex of ['male', 'female']) {
  const full = await io.read(path.join(assets, `${sex}.glb`));
  const lod = await io.read(path.join(assets, `${sex}-lod1.glb`));
  const [skin] = lod.getRoot().listSkins();
  assert.deepEqual(skin.listJoints().map(j => j.getName()), full.getRoot().listSkins()[0].listJoints().map(j => j.getName()),
    `${sex}: the skeletons must match joint for joint`);

  const sources = FACE_NODES.map(name => {
    const node = full.getRoot().listNodes().find(n => n.getName() === name);
    assert(node?.getMesh(), `${sex}.glb: missing ${name}`);
    return node;
  });
  const copies = copyToDocument(lod, full, sources.map(node => node.getMesh()));
  const replaced = new Set();
  for (const source of sources) {
    const target = lod.getRoot().listNodes().find(n => n.getName() === source.getName());
    assert(target, `${sex}-lod1.glb: missing ${source.getName()}`);
    assert.equal(target.getParentNode()?.getName(), source.getParentNode()?.getName());
    if (target.getMesh()) replaced.add(target.getMesh());
    target.setMesh(copies.get(source.getMesh())).setSkin(skin).setMatrix(source.getMatrix());
    target.setExtras({ ...target.getExtras(), avatarFullDetailFace: true });
  }

  // Release only what the replaced detail-1 face parts owned.
  const materials = new Set(), accessors = new Set();
  for (const mesh of replaced) {
    if (lod.getRoot().listNodes().some(n => n.getMesh() === mesh)) continue;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial()) materials.add(primitive.getMaterial());
      for (const a of [primitive.getIndices(), ...primitive.listAttributes(), ...primitive.listTargets().flatMap(t => t.listAttributes())]) if (a) accessors.add(a);
      primitive.listTargets().forEach(t => t.dispose()); primitive.dispose();
    }
    mesh.dispose();
  }
  for (const a of accessors) if (unused(a)) a.dispose();
  for (const material of materials) {
    if (!unused(material)) continue;
    const textures = lod.getGraph().listChildren(material).filter(c => c.propertyType === 'Texture');
    material.dispose();
    for (const t of textures) if (unused(t)) t.dispose();
  }

  const skinImage = lod.getRoot().listNodes().find(n => n.getName() === 'AvatarBody').getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture();
  const redTexels = await removeEyeOpeningRed(skinImage, `${sex}-lod1`);
  await lod.transform(unpartition());
  const bytes = await io.writeBinary(lod);
  const validation = await validateBytes(bytes, { maxIssues: 2000 });
  assert.equal(validation.issues.numErrors, 0, `${sex}-lod1: ${JSON.stringify(validation.issues.messages.filter(m => m.severity === 0).slice(0, 5))}`);
  await fs.writeFile(path.join(assets, `${sex}-lod1.glb`), bytes);
  console.log(`${sex}-lod1.glb: full-detail face, ${redTexels} red eye texels removed, ${(bytes.length / 1048576).toFixed(1)} MiB`);
}
