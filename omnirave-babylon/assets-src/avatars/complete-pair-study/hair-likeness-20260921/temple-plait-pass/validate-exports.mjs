import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'temple-plait-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const BRAID='PLURR reference temple braid',GROOM='PLURR swept scalp groom',changed=new Set([BRAID,GROOM]),report={};
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const withoutBraid=o=>Object.fromEntries(Object.entries(o).filter(([k])=>k!==BRAID));
assert.deepEqual(withoutBraid(current.materials),withoutBraid(previous.materials));
assert.deepEqual(current.additions.filter(a=>a.name!==BRAID),previous.additions.filter(a=>a.name!==BRAID));
const braid=current.additions.find(a=>a.name===BRAID),oldBraid=previous.additions.find(a=>a.name===BRAID);
assert.deepEqual(braid.uv.map(v=>v.join(',')).sort(),oldBraid.uv.map(v=>v.join(',')).sort());
assert.equal(braid.indices.length,oldBraid.indices.length);
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const positions={};
 assert.equal(after.getRoot().listNodes().length,before.getRoot().listNodes().length);
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 assert.deepEqual(after.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),before.getRoot().listTextures().map(t=>hash(t.getImage())).sort());
 const material=after.getRoot().listMaterials().find(m=>m.getName()===BRAID);
 assert.deepEqual(material.getBaseColorFactor(),current.materials[BRAID].color);
 assert.equal(material.getRoughnessFactor(),current.materials[BRAID].roughness);
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;
  const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];
   if(n.getName()===BRAID){
    assert.deepEqual(Array.from(b.getIndices().getArray()),braid.indices);
    for(const [semantic,field] of [['POSITION','positions'],['NORMAL','normals'],['TEXCOORD_0','uv']]){
     const actual=b.getAttribute(semantic).getArray(),expected=new Float32Array(braid[field].flat());
     assert(actual.every(Number.isFinite));assert.deepEqual(actual,expected,`${name} braid ${semantic}`);
    }
   }else{assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;}
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&['POSITION','NORMAL','TANGENT'].includes(s))continue;
    if(n.getName()===BRAID&&s==='TEXCOORD_0')continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)),`${name} ${n.getName()} morph ${s}`);morphs++;
   }
   if(changed.has(n.getName())){
    const old=a.getAttribute('POSITION'),now=b.getAttribute('POSITION');assert.equal(old.getCount(),now.getCount());
    if(n.getName()===BRAID){positions[BRAID]={vertices:braid.positions.length,triangles:braid.indices.length/3,nativeArraysMatch:true};continue;}
    let count=0,max=0;
    for(let vi=0;vi<now.getCount();vi++){
     const q=now.getElement(vi,[]),v=old.getElement(vi,[]);assert(q.every(Number.isFinite));
     const delta=Math.hypot(...q.map((x,k)=>x-v[k]));if(delta>1e-7)count++;max=Math.max(max,delta);
    }
    assert(count>0);positions[GROOM]={changedVertices:count,maximumMovementMm:max*1000};
   }
  }
 }
 assert.equal(Object.keys(positions).length,2);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,positions,
  allTextureBytesRetained:true,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-temple-plait-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
