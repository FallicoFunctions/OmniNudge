import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'hairline-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const native=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const edited='PLURR loose brunette front locks',addition=native.additions.find(a=>a.name===edited),report={};
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0,geometryEdits=0;
 assert.equal(after.getRoot().listNodes().length,before.getRoot().listNodes().length);
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 assert.equal(after.getRoot().listTextures().length,before.getRoot().listTextures().length);
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;
  const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(n.getName()===edited&&['POSITION','NORMAL','COLOR_0'].includes(s))continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)));morphs++;
   }
   if(n.getName()===edited){
    for(const [semantic,key] of [['POSITION','positions'],['NORMAL','normals'],['COLOR_0','colors']])
     assert.deepEqual(Array.from(b.getAttribute(semantic).getArray()),Array.from(new Float32Array(addition[key].flat())));
    assert.notEqual(ah(a.getAttribute('POSITION')),ah(b.getAttribute('POSITION')));geometryEdits++;
   }
   if(n.getName()==='Complete scalp'){
    const m=b.getMaterial(),expected=native.materials[m.getName()];
    assert.equal(hash(m.getBaseColorTexture().getImage()),hash(await fs.readFile(path.join(p,expected.texture))));
    assert.notEqual(hash(m.getBaseColorTexture().getImage()),hash(a.getMaterial().getBaseColorTexture().getImage()));
    assert.equal(m.getAlphaCutoff(),a.getMaterial().getAlphaCutoff());
   }
  }
 }
 assert.equal(geometryEdits,1);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,
  frontGeometryMatchesNative:true,scalpTextureMatchesNative:true,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-hairline-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
