/** Verify the added rigged male side layer and deliver all three detail levels. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const root=process.cwd();
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const folder=path.join(pass,'male-layered-sides-20260928');
const output=path.join(root,'public/assets/avatars/complete-pair');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash=b=>createHash('sha256').update(b).digest('hex');
const arrayHash=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const newName='Male layered side strands',newMaterial='Male matte side fibers';
function retained(doc){
  const r=doc.getRoot(),node=r.listNodes().find(n=>n.getName()===newName);
  const mesh=node?.getMesh(),removed=new Set();
  for(const primitive of mesh?.listPrimitives()??[]){
    primitive.listAttributes().forEach(a=>removed.add(a));
    if(primitive.getIndices())removed.add(primitive.getIndices());
  }
  return {
    accessors:r.listAccessors().filter(a=>!removed.has(a)).map(a=>[a.getType(),a.getNormalized(),arrayHash(a)]).sort(),
    nodes:r.listNodes().filter(n=>n!==node).map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getMesh()?.getName(),n.getSkin()?.getName(),n.listChildren().filter(c=>c!==node).map(c=>c.getName())]),
    skins:r.listSkins().map(s=>[s.getName(),s.listJoints().map(j=>j.getName())]),
    meshes:r.listMeshes().filter(m=>m!==mesh).map(m=>[m.getName(),m.getExtras(),m.listPrimitives().map(p=>[p.listSemantics(),p.getMaterial()?.getName(),p.listTargets().map(t=>t.listSemantics())])]),
    materials:r.listMaterials().filter(m=>m.getName()!==newMaterial).map(m=>[m.getName(),m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor(),m.getAlphaMode(),m.getAlphaCutoff(),m.getDoubleSided(),m.getNormalScale(),m.getExtension('KHR_materials_specular')?.getSpecularFactor()]),
    textures:r.listTextures().map(t=>[t.getName(),hash(t.getImage())]),
    animations:r.listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation()])])
  };
}
const native=JSON.parse(fs.readFileSync(path.join(folder,'native-checks.json'),'utf8'));
assert(native.cards>=250&&native.mappingExact&&native.headWeightsExact);
const authored=JSON.parse(fs.readFileSync(path.join(pass,'male-native-validation.json'),'utf8'));
assert.equal(authored.additions.length,1);assert.equal(authored.additions[0].name,newName);
const motion=JSON.parse(fs.readFileSync(path.join(pass,'male-motion-validation.json'),'utf8'));
assert.equal(motion.movementSamples,27);
const portable=JSON.parse(fs.readFileSync(path.join(pass,'male-portable-validation.json'),'utf8'));
const entries={},report={};
for(const suffix of ['','-lod1','-lod2']){
  const name=`male${suffix}.glb`,destination=path.join(output,name),bytes=fs.readFileSync(destination);
  assert.equal(portable[name].sha256,hash(bytes));assert.equal(portable[name].gltfErrors,0);
  const before=await io.read(path.join(folder,'before',name));
  const after=await io.read(destination);
  assert.deepEqual(retained(after),retained(before),`${name}: retained data changed`);
  const r=after.getRoot(),node=r.listNodes().find(n=>n.getName()===newName);
  assert(node&&node.getSkin());
  assert.equal(node.getSkin().getName(),'AvatarSkeleton');
  assert.equal(node.getMesh().listPrimitives().length,1);
  const primitive=node.getMesh().listPrimitives()[0];
  assert.equal(primitive.getMaterial()?.getName(),newMaterial);
  assert.equal(primitive.getAttribute('POSITION').getCount(),authored.additions[0].positions.length);
  assert.equal(primitive.getAttribute('JOINTS_0').getCount(),authored.additions[0].positions.length);
  assert.equal(primitive.getIndices().getCount(),authored.additions[0].indices.length);
  const material=primitive.getMaterial();
  assert(Math.abs(material.getRoughnessFactor()-.86)<1e-6);
  assert(Math.abs(material.getExtension('KHR_materials_specular')?.getSpecularFactor()-.09)<1e-6);
  assert.equal(material.getAlphaMode(),'MASK');assert.equal(material.getDoubleSided(),true);
  assert.equal(hash(material.getBaseColorTexture().getImage()),hash(fs.readFileSync(path.join(pass,'male-reference-hair-fibers.png'))));
  assert.equal(hash(material.getNormalTexture().getImage()),hash(fs.readFileSync(path.join(pass,'male-reference-fiber-normal.png'))));
  assert.notEqual(hash(bytes),hash(fs.readFileSync(path.join(folder,'before',name))));
  const compressed=gzipSync(bytes,{level:9});assert(gunzipSync(compressed).equals(bytes));
  fs.writeFileSync(destination+'.gz',compressed);
  entries[name]={bytes:bytes.length,gzipBytes:compressed.length,sha256:hash(bytes)};
  report[name]={...entries[name],gltfErrors:0,newCards:native.cards,retainedRigOutfitExistingHairAnimationMaterialsAndTextures:true,gzipRoundtrip:true};
  console.log(name,'new side hair verified and compressed');
}
const manifest=path.join(root,'src/player/completeAvatarDownloads.json');
let written=false;
for(let attempt=0;attempt<5&&!written;attempt++){
  const fresh=fs.readFileSync(manifest,'utf8'),merged={...JSON.parse(fresh),...entries};
  const temp=manifest+`.male-${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(merged,null,2)+'\n');
  if(fs.readFileSync(manifest,'utf8')!==fresh){fs.unlinkSync(temp);continue;}
  fs.renameSync(temp,manifest);written=true;
}
assert(written,'Concurrent manifest update; rerun delivery to merge male entries');
fs.copyFileSync(path.join(pass,'male-hair-refined.blend'),path.join(pass,'../male-runtime.blend'));
for(const name of ['male-native-validation.json','male-motion-validation.json','male-portable-validation.json'])
  fs.copyFileSync(path.join(pass,name),path.join(folder,name));
fs.writeFileSync(path.join(folder,'delivery-verification.json'),JSON.stringify({assets:report,
  nativeSourceSha256:hash(fs.readFileSync(path.join(pass,'male-hair-refined.blend'))),
  manifestUpdate:'male entries only'},null,2)+'\n');
console.log('MALE_LAYERED_SIDES_DELIVERY_VERIFIED');
