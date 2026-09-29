import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'fiber-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const native=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const mapping=JSON.parse(await fs.readFile(path.join(p,'female-vertex-mapping.json'),'utf8'));
const names=new Set(['PLURR swept scalp groom','PLURR loose brunette front locks']),report={};
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const colors={};
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;
  const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(s==='COLOR_0'&&names.has(n.getName()))continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)));morphs++;
   }
   if(!names.has(n.getName()))continue;
   const attr=b.getAttribute('COLOR_0');assert(attr);assert.equal(attr.getCount(),b.getAttribute('POSITION').getCount());
   const expected=n.getName()==='PLURR swept scalp groom'?mapping[n.getName()].addedColors:native.additions.find(a=>a.name===n.getName()).colors;
   const key=c=>Array.from(new Float32Array(c)).join(',');const palette=new Set(expected.map(key));
   for(let vi=0;vi<attr.getCount();vi++)assert(palette.has(key(attr.getElement(vi,[]))),`${name}: unexpected tint`);
   if(n.getName()==='PLURR loose brunette front locks')assert.deepEqual(Array.from(attr.getArray()),Array.from(new Float32Array(expected.flat())));
   const material=b.getMaterial(),m=native.materials[material.getName()];assert.deepEqual(material.getBaseColorFactor(),m.color);
   assert.equal(material.getNormalScale(),m.normalScale);assert.equal(material.getAlphaCutoff(),.32);
   assert.equal(hash(material.getBaseColorTexture().getImage()),hash(await fs.readFile(path.join(p,m.texture))));
   assert.equal(hash(material.getNormalTexture().getImage()),hash(await fs.readFile(path.join(p,m.normalTexture))));
   colors[n.getName()]={vertices:attr.getCount(),paletteVerified:true,materialAndTextureBytesVerified:true};
  }
 }
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,colors,
  textureImagesAdded:after.getRoot().listTextures().length-before.getRoot().listTextures().length};
}
await fs.writeFile(path.join(d,'portable-fiber-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
