/**
 * Detail 1 keeps the full model's face. The venue never loads detail 0 (it
 * measured about 665 MB per body), and the player judged the reduced face
 * unacceptable: fewer head vertices, 1024 face images and palette-merged eyes.
 * This copies the detail-0 head/body mesh, eyes, irises, brows and lashes,
 * with their materials and 2048 images, onto the committed detail-1 file.
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'public/assets/avatars/complete-pair');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const FACE_NODES = ['AvatarBody', 'AvatarEye_l', 'AvatarEye_r', 'AvatarEyebrows', 'AvatarEyelashes', 'AvatarIris_l', 'AvatarIris_r'];

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

  await lod.transform(unpartition());
  const bytes = await io.writeBinary(lod);
  const validation = await validateBytes(bytes, { maxIssues: 2000 });
  assert.equal(validation.issues.numErrors, 0, `${sex}-lod1: ${JSON.stringify(validation.issues.messages.filter(m => m.severity === 0).slice(0, 5))}`);
  await fs.writeFile(path.join(assets, `${sex}-lod1.glb`), bytes);
  console.log(`${sex}-lod1.glb: full-detail face, ${(bytes.length / 1048576).toFixed(1)} MiB`);
}
