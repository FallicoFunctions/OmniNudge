/** Validate the actual delivered GLBs and preserve a compact build report. */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateBytes } from 'gltf-validator';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const study = path.join(root, 'assets-src/avatars/complete-pair-study');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const reports = {};
for (const character of ['male', 'female']) {
  const asset = path.join(root, 'public/assets/avatars/complete-pair', `${character}.glb`);
  const bytes = new Uint8Array(await readFile(asset));
  const validation = await validateBytes(bytes, { maxIssues: 2000 });
  if (validation.issues.numErrors) throw new Error(`${character}: glTF validation errors`);
  const document = await io.readBinary(bytes);
  const tree = document.getRoot();
  const skins = tree.listSkins();
  if (skins.length !== 1 || skins[0].listJoints().length !== 56) throw new Error(`${character}: skeleton mismatch`);
  const animations = tree.listAnimations();
  if (animations.map(a => a.getName()).sort().join() !== 'idle,run,walk') throw new Error(`${character}: missing movement clip`);
  const controlled = node => {
    const names = node.getMesh()?.getExtras().targetNames ?? [];
    return names.length > 0 && names.every(name => /^(Expression_|Secondary_)/.test(name));
  };
  for (const node of tree.listNodes().filter(controlled)) {
    if (node.getWeights().some(w => Math.abs(w) > 1e-7)) throw new Error(`${character}: facial/groom defaults must be neutral`);
  }
  const morphNodes = tree.listNodes().filter(node => node.getMesh()?.listPrimitives().some(p => p.listTargets().length) && !controlled(node));
  const expressionNames = [...new Set(tree.listMeshes().flatMap(mesh => mesh.getExtras().targetNames ?? []).filter(name => /^(Expression_|Secondary_)/.test(name)))];
  for (const name of ['Expression_BlinkLeft', 'Expression_BlinkRight', 'Expression_Smile', 'Expression_BrowLift', 'Secondary_HairSide', 'Secondary_HairBack']) {
    if (!expressionNames.includes(name)) throw new Error(`${character}: missing ${name}`);
  }
  const clips = [];
  for (const animation of animations) {
    const channels = animation.listChannels();
    const morphChannels = channels.filter(c => c.getTargetPath() === 'weights');
    for (const node of morphNodes) {
      if (!morphChannels.some(c => c.getTargetNode() === node)) throw new Error(`${character}: missing ${animation.getName()} corrective on ${node.getName()}`);
    }
    let loopError = 0;
    for (const channel of channels) {
      const sampler = channel.getSampler();
      const input = sampler.getInput();
      const output = sampler.getOutput();
      const data = output.getArray();
      const stride = data.length / input.getCount();
      for (const value of data) if (!Number.isFinite(value)) throw new Error(`${character}: nonfinite animation`);
      for (let i = 0; i < stride; i++) loopError = Math.max(loopError, Math.abs(data[i] - data[data.length - stride + i]));
    }
    if (loopError > 0.0001) throw new Error(`${character}: ${animation.getName()} does not loop (${loopError})`);
    clips.push({ name: animation.getName(), correctiveChannels: morphChannels.length, maximumLoopError: loopError });
  }
  const slots = [...new Set(tree.listNodes().map(n => n.getExtras().avatarSlot).filter(Boolean))].sort();
  for (const slot of ['body','hair','top','jacket','bottoms','shoes','accessories']) if (!slots.includes(slot)) throw new Error(`${character}: missing ${slot}`);
  const outfitDetails = tree.listNodes().filter(n => n.getExtras().outfitDetailCarrier);
  if (outfitDetails.length !== (character === 'male' ? 5 : 8)) throw new Error(`${character}: missing constructed outfit pieces`);
  if (!outfitDetails.some(n => n.getName() === 'Launch constructed neck jewelry' && n.getExtras().outfitDetailCarrier === 'AvatarBody' && n.getExtras().neckJewelryLayers === 3)) throw new Error(`${character}: missing body-bound layered neck jewelry`);
  if (character === 'female' && !outfitDetails.some(n => n.getName() === 'PLURR hood binding' && n.getExtras().outfitDetailCarrier === 'PLURR folded hood')) throw new Error('Female collar binding must follow its fitted hood.');
  for (const node of outfitDetails) {
    if (!node.getMesh() || node.getSkin() !== skins[0]) throw new Error(`${character}: unbound outfit piece ${node.getName()}`);
    if (!tree.listNodes().some(n => n.getName() === node.getExtras().outfitDetailCarrier)) throw new Error(`${character}: missing carrier for ${node.getName()}`);
  }
  const jacketDetails = tree.listNodes().filter(n => n.getExtras().jacketFinishAttachment);
  if (jacketDetails.length !== 8 || jacketDetails.some(n => n.getExtras().jacketFinishAttachment !== 'Structured armhole jacket' || !n.getMesh() || n.getSkin() !== skins[0])) throw new Error(`${character}: missing surface-bound jacket fittings`);
  const openingDetails = jacketDetails.filter(n => n.getExtras().mainOpeningConstruction === 'separated-tracks-v1');
  if (openingDetails.map(n => n.getName()).sort().join('|') !== ['Jacket detail - main zipper pull', 'Jacket detail - main zipper tracks'].join('|')
    || openingDetails.some(n => n.getMesh().listPrimitives().some(p => p.listTargets().length !== 14))) throw new Error(`${character}: missing main zipper construction or correctives`);
  if (character === 'female') {
    for (const node of jacketDetails.filter(n => /pocket$|main zipper tracks$/.test(n.getName()))) {
      const primitives = node.getMesh().listPrimitives();
      const packed = node.getExtras().jacketMaterialPacking === 'constant-atlas-v1';
      if (packed && (primitives.length !== 1 || !primitives[0].getMaterial().getBaseColorTexture() || !primitives[0].getMaterial().getMetallicRoughnessTexture())) throw new Error(`${character}: incomplete zipper atlas`);
      const materials = packed ? node.getExtras().jacketMaterialRegions.map(r => r.name) : primitives.map(p => p.getMaterial()?.getName() ?? '');
      if (!materials.some(n => n.includes('graphite zipper tape')) || !materials.some(n => n.includes('pale gold zipper teeth'))) throw new Error(`${character}: zipper material regions lost on ${node.getName()}`);
    }
  }
  for (const material of tree.listMaterials()) {
    const sheen = material.getExtension('KHR_materials_sheen');
    const weight = material.getExtras().launchSheenWeight;
    if (sheen && weight !== undefined && sheen.getSheenColorFactor().some(c => Math.abs(c-weight)>1e-6)) throw new Error(`${character}: exported sheen lost its authored strength`);
  }
  const authoredFilms = tree.listMaterials().filter(m => m.getExtras().launchFilmTexture).map(material => {
    const film = material.getExtension('KHR_materials_iridescence');
    const extras = material.getExtras();
    if (!film?.getIridescenceThicknessTexture()?.getImage()?.length
      || film.getIridescenceThicknessMinimum() !== extras.launchFilmMinimumNm
      || film.getIridescenceThicknessMaximum() !== extras.launchFilmMaximumNm
      || film.getIridescenceIOR() !== extras.launchFilmIOR) throw new Error(`${character}: incomplete authored coating on ${material.getName()}`);
    if (extras.launchFilmMask && (film.getIridescenceTexture() !== film.getIridescenceThicknessTexture()
      || film.getIridescenceTextureInfo().getTexCoord() !== film.getIridescenceThicknessTextureInfo().getTexCoord())) throw new Error(`${character}: missing knit/foil coating coverage`);
    return {material:material.getName(), minimumNm:film.getIridescenceThicknessMinimum(), maximumNm:film.getIridescenceThicknessMaximum(), ior:film.getIridescenceIOR(), textureBytes:film.getIridescenceThicknessTexture().getImage().length};
  });
  if (character === 'female' && authoredFilms.length !== 2) throw new Error('Female jacket and hood must retain their authored coating.');
  const triangles = tree.listMeshes().flatMap(m => m.listPrimitives()).reduce((sum,p) => sum + (p.getIndices()?.getCount() ?? 0)/3,0);
  const warningCodes = [...new Set(validation.issues.messages.filter(m=>m.severity===1).map(m=>m.code))];
  const unexpected = warningCodes.filter(code => code !== 'NODE_SKINNED_MESH_NON_ROOT');
  if (unexpected.length) throw new Error(`${character}: unexpected warnings: ${unexpected.join(', ')}`);
  const native = path.join(study, `${character}-runtime.blend`);
  reports[character] = {
    asset: path.relative(root,asset), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    native: path.relative(root,native), nativeBytes:(await stat(native)).size,
    nativeSha256:createHash('sha256').update(await readFile(native)).digest('hex'),
    triangles, bones:skins[0].listJoints().length, meshes:tree.listMeshes().length, materials:tree.listMaterials().length,
    slots, clips, expressionNames, authoredFilms, outfitDetails:outfitDetails.map(n=>({name:n.getName(),carrier:n.getExtras().outfitDetailCarrier})), jacketDetails:jacketDetails.map(n=>({name:n.getName(),carrier:n.getExtras().jacketFinishAttachment})), gltfErrors:validation.issues.numErrors, gltfWarnings:validation.issues.numWarnings, warningCodes,
  };
}
await writeFile(path.join(study,'runtime-validation.json'), JSON.stringify({
  status:'Expressive complete candidates available in local viewer and venue, including independent eyelids, smile/brow controls, secondary hair motion and distance meshes. Visual acceptance and broader device testing remain.',
  characters:reports,
  warningExplanation:'Skinned mesh nodes share their armature parent. glTF skinning uses the joint matrices; Babylon motion and hierarchy were inspected in the local viewer and venue.',
},null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
