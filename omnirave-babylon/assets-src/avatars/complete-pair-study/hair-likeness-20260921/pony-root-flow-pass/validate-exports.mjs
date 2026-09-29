import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'pony-root-flow-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const changed=new Set(['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2']),report={};
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const mapping=JSON.parse(await fs.readFile(path.join(p,'female-vertex-mapping.json'),'utf8'));
const priorMapping=JSON.parse(await fs.readFile(path.join(d,'before/female-vertex-mapping.json'),'utf8'));
const changedMaterials=new Set(current.meshes.ponySheen.changedMaterials);
assert.deepEqual(current.additions,previous.additions);assert.deepEqual(current.faceContour,previous.faceContour);
for(const [name,mat] of Object.entries(current.materials)){
 const expected={...previous.materials[name]};
 if(changedMaterials.has(name))Object.assign(expected,{roughness:.76,specular:.09});
 assert.deepEqual(mat,expected,name);
}
// Match delivered positions and tint through the preceding native vertices.
const grid=p=>p.map(x=>Math.round(x*1e6));const buckets={};
for(const name of changed){
 const data=priorMapping[name],b=new Map();
 data.after.forEach((p,i)=>{const k=grid(p).join(',');if(!b.has(k))b.set(k,[]);b.get(k).push(i);});buckets[name]=b;
}
const rawJson=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString('utf8'));
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,beforeFile=path.join(d,'before',name),afterFile=path.join(root,'public/assets/avatars/complete-pair',name);
 const before=await io.read(beforeFile),after=await io.read(afterFile),oldJson=rawJson(await fs.readFile(beforeFile)),newJson=rawJson(await fs.readFile(afterFile));
 for(const m of oldJson.materials)if(changedMaterials.has(m.name)){
  m.pbrMetallicRoughness.roughnessFactor=.76;m.extensions.KHR_materials_specular.specularFactor=.09;
 }
 for(const n of oldJson.nodes){
  if(!changed.has(n.name))continue;
  for(const primitive of oldJson.meshes[n.mesh].primitives){
   const accessor=primitive.attributes.POSITION;
   oldJson.accessors[accessor].min=newJson.accessors[accessor].min;
   oldJson.accessors[accessor].max=newJson.accessors[accessor].max;
  }
 }
 assert.deepEqual(newJson,oldJson,`${name}: unexpected structural/material JSON change`);
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const tint={};
 assert.deepEqual(after.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),before.getRoot().listTextures().map(t=>hash(t.getImage())).sort());
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&['POSITION','NORMAL','TANGENT'].includes(s))continue;
    if(changed.has(n.getName())&&s==='COLOR_0'){
     const old=a.getAttribute(s),now=b.getAttribute(s),pos=b.getAttribute('POSITION'),data=mapping[n.getName()];
     assert.equal(old.getCount(),now.getCount());let count=0,max=0;
     for(let vi=0;vi<now.getCount();vi++){
      const point=a.getAttribute('POSITION').getElement(vi,[]),nextPoint=pos.getElement(vi,[]),q=now.getElement(vi,[]),v=old.getElement(vi,[]),[x,y,z]=grid(point);let candidates=[];
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)candidates.push(...(buckets[n.getName()].get([x+dx,y+dy,z+dz].join(','))??[]));
      candidates=candidates.filter(j=>Math.hypot(...point.map((t,k)=>t-priorMapping[n.getName()].after[j][k]))<2e-6);
      const matched=candidates.some(j=>q.every((t,k)=>Math.abs(t-data.addedColors[j][k])<2e-7)&&nextPoint.every((t,k)=>Math.abs(t-data.after[j][k])<2e-7));
      assert(matched,`${name}: native position/tint mismatch ${n.getName()} ${vi}`);
      assert(q.every(t=>Number.isFinite(t)&&t>=0&&t<=1));assert.equal(q[3],v[3]);
      const delta=Math.max(...q.map((t,k)=>Math.abs(t-v[k])));if(delta>1e-7)count++;max=Math.max(max,delta);
     }
     assert(count>0);tint[n.getName()]={changedColorVertices:count,maximumComponentChange:max,nativeTintAndPositionsMatched:true};continue;
    }
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)));morphs++;
   }
  }
 }
 assert.equal(Object.keys(tint).length,3);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,tint,
  allUnrelatedGeometryAndAnimationRetained:true,allTextureBytesRetained:true,alphaCoverageRetained:true,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-pony-root-flow-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
