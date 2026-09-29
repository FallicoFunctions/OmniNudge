import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const root=process.cwd();
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921/iris-tone-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ah=a=>sha(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const af=a=>JSON.stringify([a.getType(),a.getComponentType(),a.getNormalized(),ah(a)]);
const sorted=values=>values.sort((a,b)=>a.localeCompare(b));
const reports={};
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const old=(await io.read(path.join(pass,'before',name))).getRoot();
 const now=(await io.read(path.join(root,'public/assets/avatars/complete-pair',name))).getRoot();
 assert.deepEqual(sorted(old.listAccessors().map(af)),sorted(now.listAccessors().map(af)),name+': geometry or morph accessor changed');
 assert.deepEqual(sorted(old.listTextures().map(t=>JSON.stringify([t.getName(),sha(t.getImage())]))),sorted(now.listTextures().map(t=>JSON.stringify([t.getName(),sha(t.getImage())]))),name+': texture changed');
 assert.equal(now.listMaterials().length,old.listMaterials().length);
 const originalMaterials=new Map(old.listMaterials().map(m=>[m.getName(),m]));
 for(const material of now.listMaterials()){
  const prior=originalMaterials.get(material.getName());
  assert(prior,name+': unexpected material '+material.getName());
  assert.deepEqual([material.getRoughnessFactor(),material.getMetallicFactor(),material.getAlphaMode(),material.getAlphaCutoff(),material.getDoubleSided()],
                   [prior.getRoughnessFactor(),prior.getMetallicFactor(),prior.getAlphaMode(),prior.getAlphaCutoff(),prior.getDoubleSided()]);
  if(material.getName()==='Launch female iris'){
   assert.deepEqual(prior.getBaseColorFactor(),[1,.46,.24,1]);
   assert.deepEqual(material.getBaseColorFactor(),[.48,.20,.12,1]);
  }else assert.deepEqual(material.getBaseColorFactor(),prior.getBaseColorFactor(),material.getName()+': unexpected color change');
 }
 const nodeSignature=n=>JSON.stringify([n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getSkin()?.getName(),n.getMesh()?.getName(),sorted(n.listChildren().map(c=>c.getName()))]);
 assert.deepEqual(sorted(old.listNodes().map(nodeSignature)),sorted(now.listNodes().map(nodeSignature)),name+': node/skin hierarchy changed');
 assert.equal(now.listSkins().length,old.listSkins().length);
 assert.equal(now.listAnimations().length,old.listAnimations().length);
 assert.equal(now.listMeshes().length,old.listMeshes().length);
 assert(now.listNodes().some(node=>node.getName()==='PLURR neon ear drops'),name+': earrings missing');
 reports[name]={unchangedAccessors:old.listAccessors().length,unchangedTextures:old.listTextures().length,unchangedNodes:old.listNodes().length,unchangedMeshes:old.listMeshes().length,changedMaterial:'Launch female iris',earringsRetained:true};
 console.log(name,JSON.stringify(reports[name]));
}
await fs.writeFile(path.join(pass,'portable-iris-validation.json'),JSON.stringify(reports,null,2)+'\n');
