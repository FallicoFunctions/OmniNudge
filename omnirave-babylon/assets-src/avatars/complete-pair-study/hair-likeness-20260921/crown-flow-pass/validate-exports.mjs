import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'crown-flow-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const changed=new Set(['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2','PLURR pony surface fibers','Polished female flyaways']),report={};
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const materialChanges=new Set(current.meshes.crownFlow.softenedCrownMaterials);
assert.deepEqual(Object.keys(current.materials),Object.keys(previous.materials));
for(const [name,value] of Object.entries(previous.materials)){
 if(materialChanges.has(name)){
  assert.deepEqual(current.materials[name],{...value,roughness:.72,specular:.12,normalTexture:'female-brunette-fiber-normal.png',normalScale:.78});
 }else assert.deepEqual(current.materials[name],value);
}
assert.deepEqual(current.additions,previous.additions);
assert.deepEqual(current.faceContour,previous.faceContour);
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const positions={};
 assert.equal(after.getRoot().listNodes().length,before.getRoot().listNodes().length);
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 assert.deepEqual(after.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),before.getRoot().listTextures().map(t=>hash(t.getImage())).sort());
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;
  const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&['POSITION','NORMAL','TANGENT'].includes(s))continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    const old=a.listTargets()[ti].getAttribute(s),now=b.listTargets()[ti].getAttribute(s);
    if(n.getName()==='Polished female flyaways'){
     assert.equal(old.getCount(),now.getCount());
     const x=old.getArray(),y=now.getArray();let drift=0;
     for(let k=0;k<x.length;k++){assert(Number.isFinite(y[k]));drift=Math.max(drift,Math.abs(y[k]-x[k]));}
     // Relative offsets remain unchanged within native float32 rounding.
     // Normals are recomputed for the reshaped, previously scaled morphs.
     if(s==='POSITION')assert(drift<3e-7,`${name} ${n.getName()} ${s}: ${drift}`);
    }else{assert.equal(ah(old),ah(now));morphs++;}
   }
   if(changed.has(n.getName())){
    const old=a.getAttribute('POSITION'),now=b.getAttribute('POSITION');assert.equal(old.getCount(),now.getCount());
    let count=0,max=0;
    for(let vi=0;vi<now.getCount();vi++){
     const q=now.getElement(vi,[]),v=old.getElement(vi,[]);assert(q.every(Number.isFinite));
     const delta=Math.hypot(...q.map((x,k)=>x-v[k]));if(delta>1e-7)count++;max=Math.max(max,delta);
    }
    assert(count>0,`${name} ${n.getName()}: no updated positions`);
    positions[n.getName()]={changedVertices:count,maximumMovementMm:max*1000};
   }
  }
 }
 assert.equal(Object.keys(positions).length,5);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,positions,
  allTextureBytesRetained:true,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-crown-flow-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
