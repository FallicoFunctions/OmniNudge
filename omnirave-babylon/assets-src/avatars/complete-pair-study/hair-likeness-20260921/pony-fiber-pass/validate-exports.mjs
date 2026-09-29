import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'pony-fiber-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const key=v=>Array.from(new Float32Array(v)).join(',');
const names=new Set(['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2']),report={};
const native=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const mapping=JSON.parse(await fs.readFile(path.join(p,'female-vertex-mapping.json'),'utf8'));
const expected={};
for(const name of names){
 const m=mapping[name],byPosition=new Map();
 m.after.forEach((v,i)=>{const k=key(v);if(!byPosition.has(k))byPosition.set(k,new Set());byPosition.get(k).add(key(m.addedColors[i]));});
 expected[name]=byPosition;
}
const structure=doc=>({
 nodes:doc.getRoot().listNodes().map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getSkin()?.getName(),n.listChildren().map(c=>c.getName())]),
 skins:doc.getRoot().listSkins().map(s=>[s.listJoints().map(n=>n.getName()),ah(s.getInverseBindMatrices())]),
 animations:doc.getRoot().listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation(),ah(c.getSampler().getInput()),ah(c.getSampler().getOutput())])]),
});
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const colors={};
 assert.deepEqual(structure(after),structure(before));
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 assert.deepEqual(after.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),before.getRoot().listTextures().map(t=>hash(t.getImage())).sort());
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;
  const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(names.has(n.getName())&&s==='COLOR_0')continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.deepEqual(b.listSemantics().filter(s=>s!=='COLOR_0'),a.listSemantics().filter(s=>s!=='COLOR_0'));
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)));morphs++;
   }
   if(!names.has(n.getName()))continue;
   const attr=b.getAttribute('COLOR_0'),pos=b.getAttribute('POSITION');assert(attr);assert.equal(attr.getCount(),pos.getCount());
   for(let vi=0;vi<attr.getCount();vi++)assert(expected[n.getName()].get(key(pos.getElement(vi,[])))?.has(key(attr.getElement(vi,[]))),`${name} ${n.getName()} ${vi}: native pigment mismatch`);
   const mat=b.getMaterial(),value=native.materials[mat.getName()];assert.deepEqual(mat.getBaseColorFactor(),value.color);
   assert.equal(mat.getRoughnessFactor(),value.roughness);assert.equal(mat.getNormalScale(),value.normalScale);
   assert.equal(mat.getAlphaCutoff(),.32);assert.equal(mat.getExtension('KHR_materials_specular').getSpecularFactor(),value.specular);
   assert.equal(hash(mat.getBaseColorTexture().getImage()),hash(await fs.readFile(path.join(p,value.texture))));
   assert.equal(hash(mat.getNormalTexture().getImage()),hash(await fs.readFile(path.join(p,value.normalTexture))));
   colors[n.getName()]={vertices:attr.getCount(),pigmentAtEveryNativePositionVerified:true,materialAndTextureBytesVerified:true};
  }
 }
 assert.equal(Object.keys(colors).length,3);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,colors,
  skeletonAndAnimationBytesRetained:true,allTextureBytesRetained:true,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-pony-fiber-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
