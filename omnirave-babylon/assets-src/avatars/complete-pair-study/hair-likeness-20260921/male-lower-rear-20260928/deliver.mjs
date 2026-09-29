/** Verify the lower rear hair edit and deliver male files without touching female entries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const root=process.cwd();
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const folder=path.join(pass,'male-lower-rear-20260928');
const output=path.join(root,'public/assets/avatars/complete-pair');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const accessor=a=>a&&[a.getType(),a.getNormalized(),sha(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength))];
const changedNames=new Set(['Complete scalp','Luxury retained swept groom','Polished male rooted hairline','Male layered side strands']);

function snapshot(doc){
  const r=doc.getRoot();
  return {
    nodes:r.listNodes().map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getSkin()?.getName(),n.getMesh()?.getName(),n.listChildren().map(c=>c.getName())]),
    meshes:r.listNodes().filter(n=>n.getMesh()).map(n=>[n.getName(),n.getMesh().getExtras(),n.getMesh().listPrimitives().map(p=>({
      attributes:p.listSemantics().sort().map(s=>[s,changedNames.has(n.getName())&&['POSITION','NORMAL','TANGENT'].includes(s)?null:accessor(p.getAttribute(s))]),
      indices:accessor(p.getIndices()),material:p.getMaterial()?.getName(),
      targets:p.listTargets().map(t=>t.listSemantics().sort().map(s=>[s,changedNames.has(n.getName())?null:accessor(t.getAttribute(s))]))
    }))]),
    materials:r.listMaterials().map(m=>[m.getName(),m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor(),m.getAlphaMode(),m.getAlphaCutoff(),m.getDoubleSided(),m.getNormalScale(),m.getExtension('KHR_materials_specular')?.getSpecularFactor()]),
    textures:r.listTextures().map(t=>[t.getName(),sha(t.getImage())]).sort(),
    skins:r.listSkins().map(s=>[s.getName(),s.listJoints().map(j=>j.getName()),accessor(s.getInverseBindMatrices())]),
    animations:r.listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation(),accessor(c.getSampler().getInput()),accessor(c.getSampler().getOutput())])])
  };
}
const portable=JSON.parse(fs.readFileSync(path.join(pass,'male-portable-validation.json'),'utf8'));
const motion=JSON.parse(fs.readFileSync(path.join(pass,'male-motion-validation.json'),'utf8'));
assert.equal(motion.movementSamples,27);assert(motion.maxHeadRelativeDriftMm<.01);
assert(Object.values(motion.attachments).every(p=>p.maxScalpRootDistanceMm<3));
const entries={},report={};
for(const suffix of ['','-lod1','-lod2']){
  const name=`male${suffix}.glb`,destination=path.join(output,name),bytes=fs.readFileSync(destination);
  assert.equal(portable[name].sha256,sha(bytes));assert.equal(portable[name].gltfErrors,0);
  const before=await io.read(path.join(folder,'before',name));
  const after=await io.read(destination);
  assert.deepEqual(snapshot(after),snapshot(before),`${name}: unrelated rig, outfit, texture, material, or animation changed`);
  let changed=0;
  for(const node of after.getRoot().listNodes()){
    if(!changedNames.has(node.getName()))continue;
    const old=before.getRoot().listNodes().find(n=>n.getName()===node.getName());assert(old);
    const a=node.getMesh().listPrimitives()[0].getAttribute('POSITION');
    const b=old.getMesh().listPrimitives()[0].getAttribute('POSITION');
    if(accessor(a)[2]!==accessor(b)[2])changed++;
  }
  assert(changed>=3,`${name}: expected rear hair geometry changes`);
  const compressed=gzipSync(bytes,{level:9});assert(gunzipSync(compressed).equals(bytes));
  fs.writeFileSync(destination+'.gz',compressed);
  entries[name]={bytes:bytes.length,gzipBytes:compressed.length,sha256:sha(bytes)};
  report[name]={...entries[name],changedHairMeshes:changed,gltfErrors:0,retainedOutfitRigAnimationsMaterialsAndTextures:true,gzipRoundtrip:true};
  console.log(name,'rear hair verified and compressed');
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
assert(written,'Concurrent manifest update; rerun delivery');
fs.copyFileSync(path.join(pass,'male-hair-refined.blend'),path.join(pass,'../male-runtime.blend'));
fs.writeFileSync(path.join(folder,'delivery-verification.json'),JSON.stringify({assets:report,
  nativeSourceSha256:sha(fs.readFileSync(path.join(pass,'male-hair-refined.blend'))),
  manifestUpdate:'male entries only',motionValidation:motion},null,2)+'\n');
console.log('MALE_LOWER_REAR_DELIVERY_VERIFIED');
