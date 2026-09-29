import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'temple-flow-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const changed=new Set(['PLURR loose brunette front locks']),report={};
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
assert.deepEqual(current.materials,previous.materials);
assert.deepEqual(current.additions.filter(a=>a.name!=='PLURR loose brunette front locks'),previous.additions.filter(a=>a.name!=='PLURR loose brunette front locks'));
const newFront=current.additions.find(a=>a.name==='PLURR loose brunette front locks'),oldFront=previous.additions.find(a=>a.name===newFront.name);assert.deepEqual(newFront.indices,oldFront.indices);assert.deepEqual(newFront.uv,oldFront.uv);
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const positions={};
 assert.equal(after.getRoot().listNodes().length,before.getRoot().listNodes().length);
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 const oldTextures=before.getRoot().listTextures(),newTextures=after.getRoot().listTextures();assert.equal(newTextures.length,oldTextures.length);
 const preserved=oldTextures.filter(t=>newTextures.some(n=>hash(t.getImage())===hash(n.getImage())));assert.equal(preserved.length,oldTextures.length-1);
 const oldCap=before.getRoot().listNodes().find(n=>n.getName()==='Complete scalp').getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture();
 const newCap=nodes.get('Complete scalp').getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture();
 assert.notEqual(hash(oldCap.getImage()),hash(newCap.getImage()));
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;
  const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&['POSITION','NORMAL','TANGENT','COLOR_0'].includes(s))continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)));morphs++;
   }
   if(changed.has(n.getName())){
    const old=a.getAttribute('POSITION'),now=b.getAttribute('POSITION');assert.equal(old.getCount(),now.getCount());
    let count=0,max=0;
    for(let vi=0;vi<now.getCount();vi++){
     const q=now.getElement(vi,[]),v=old.getElement(vi,[]);assert(q.every(Number.isFinite));
     const delta=Math.hypot(...q.map((x,k)=>x-v[k]));if(delta>1e-7)count++;max=Math.max(max,delta);
    }
    assert(count>0,`${name} ${n.getName()}: no updated positions`);
    const oc=a.getAttribute('COLOR_0'),nc=b.getAttribute('COLOR_0'); assert.equal(oc.getCount(),nc.getCount()); let tinted=0;
    for(let vi=0;vi<nc.getCount();vi++){const x=oc.getElement(vi,[]),y=nc.getElement(vi,[]); assert(y.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.equal(x[3],y[3]);for(let k=0;k<3;k++)assert(y[k]>=x[k]-1e-7);if(y.some((v,k)=>Math.abs(v-x[k])>1e-7))tinted++;} assert(tinted>0);
    positions[n.getName()]={changedVertices:count,maximumMovementMm:max*1000,brighterVertices:tinted};
   }
  }
 }
 assert.equal(Object.keys(positions).length,1);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,positions,
  unchangedTextureImages:preserved.length,changedTextureImages:1,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-temple-flow-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
