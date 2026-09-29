import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'face-wisp-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const changed=new Set(['PLURR pony strands 0','PLURR pony strands 2','PLURR loose brunette front locks','PLURR pony strands 3']),report={};
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
assert.deepEqual(current.materials,previous.materials);
const FRONT='PLURR loose brunette front locks';
// Blender chooses quad diagonals after the free curves change. The native
// audit proves fixed quad topology/UVs; the exported triangle ordering must
// match the newly evaluated native addition, rather than the old diagonals.
const additionContract=a=>a.name===FRONT?Object.fromEntries(Object.entries(a).filter(([k])=>!['positions','normals','uv','indices'].includes(k))):a;
assert.deepEqual(current.additions.map(additionContract),previous.additions.map(additionContract));
const front=current.additions.find(a=>a.name===FRONT),oldFront=previous.additions.find(a=>a.name===FRONT);
assert.deepEqual(front.uv.map(v=>v.join(',')).sort(),oldFront.uv.map(v=>v.join(',')).sort());
assert.equal(front.indices.length,oldFront.indices.length);
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
   const a=oldP[i],b=newP[i];
   if(n.getName()===FRONT){
    assert.deepEqual(Array.from(b.getIndices().getArray()),front.indices);
    for(const [semantic,field] of [['POSITION','positions'],['NORMAL','normals'],['TEXCOORD_0','uv'],['COLOR_0','colors']]){
     const actual=b.getAttribute(semantic).getArray(),expected=new Float32Array(front[field].flat());
     assert(actual.every(Number.isFinite));assert.deepEqual(actual,expected,`${name} front ${semantic}`);
    }
   }else{assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;}
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&['POSITION','NORMAL','TANGENT'].includes(s))continue;
    if(n.getName()===FRONT&&s==='TEXCOORD_0')continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    const old=a.listTargets()[ti].getAttribute(s),now=b.listTargets()[ti].getAttribute(s);
    if(n.getName()==='PLURR pony strands 3'){
     assert.equal(old.getCount(),now.getCount());const av=old.getArray(),bv=now.getArray();assert(bv.every(Number.isFinite));
     if(s==='POSITION')assert(Math.max(...av.map((x,i)=>Math.abs(x-bv[i])))<3e-7,'Green tuft secondary displacement changed');
    }else{assert.equal(ah(old),ah(now));morphs++;}
   }
   if(changed.has(n.getName())){
    if(n.getName()===FRONT){
     assert.notEqual(ah(a.getAttribute('POSITION')),ah(b.getAttribute('POSITION')));
     positions[FRONT]={vertices:front.positions.length,triangles:front.indices.length/3,nativeGeometryUVColorsAndTriangleLayoutVerified:true};
     continue;
    }
    const old=a.getAttribute('POSITION'),now=b.getAttribute('POSITION');assert.equal(old.getCount(),now.getCount());
    let count=0,max=0;
    for(let vi=0;vi<now.getCount();vi++){
     const q=now.getElement(vi,[]),v=old.getElement(vi,[]);assert(q.every(Number.isFinite));
     const delta=Math.hypot(...q.map((x,k)=>x-v[k]));if(delta>1e-7)count++;max=Math.max(max,delta);
    }
    if(count===0){
     // The distance mesh omits the cheek cards from these shared meshes.
     // Require exact retained geometry there, rather than demanding that
     // the unchanged long pony receive an unrelated edit.
     assert(suffix==='-lod2'&&['PLURR pony strands 0','PLURR pony strands 2'].includes(n.getName()));
     for(const s of ['POSITION','NORMAL','TANGENT'])if(a.getAttribute(s))assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)));
    }
    positions[n.getName()]={changedVertices:count,maximumMovementMm:max*1000,...(count===0?{editedCheekCardsOmittedAtThisLod:true}:{})};
   }
  }
 }
 assert.equal(Object.keys(positions).length,4);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,positions,
  allTextureBytesRetained:true,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-face-wisp-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
