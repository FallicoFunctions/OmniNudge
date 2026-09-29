import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'pony-drape-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const inner='PLURR pony surface fibers',changed=new Set(['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2',inner]);
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const material=current.meshes.rootDye.changedMaterial,report={};
assert.deepEqual(Object.keys(current.materials),Object.keys(previous.materials));
for(const [name,value] of Object.entries(previous.materials))assert.deepEqual(current.materials[name],name===material?{...value,color:[.92,.025,.34,1]}:value);
assert.deepEqual(current.additions,previous.additions);assert.deepEqual(current.faceContour,previous.faceContour);
const animations=doc=>doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation(),ah(c.getSampler().getInput()),ah(c.getSampler().getOutput())])}));
for(const suffix of ['','-lod1','-lod2']){
 const filename=`female${suffix}.glb`,before=await io.read(path.join(d,'before',filename)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',filename));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const colors={},positions={};
 assert.equal(after.getRoot().listNodes().length,before.getRoot().listNodes().length);
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 assert.deepEqual(after.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),before.getRoot().listTextures().map(t=>hash(t.getImage())).sort());
 assert.deepEqual(animations(after),animations(before));
 for(const n of before.getRoot().listNodes()){
  const next=nodes.get(n.getName());assert(next);assert.deepEqual(next.getMatrix(),n.getMatrix());assert.deepEqual(next.getWeights(),n.getWeights());
  if(!n.getMesh())continue;
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&(s==='COLOR_0'||(n.getName()!==inner&&['POSITION','NORMAL','TANGENT'].includes(s))))continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${filename} ${n.getName()} ${s}`);attributes++;
   }
   assert.deepEqual(b.listSemantics().sort(),[...new Set([...a.listSemantics(),...(n.getName()===inner?['COLOR_0']:[])])].sort());
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    assert.equal(ah(a.listTargets()[ti].getAttribute(s)),ah(b.listTargets()[ti].getAttribute(s)),`${filename} ${n.getName()} ${ti} ${s}`);morphs++;
   }
   const ma=a.getMaterial(),mb=b.getMaterial();assert.equal(ma.getName(),mb.getName());
   assert.deepEqual(mb.getBaseColorFactor(),ma.getName()===material?[.92,.025,.34,1]:ma.getBaseColorFactor());
   for(const getter of ['getRoughnessFactor','getMetallicFactor','getAlphaMode','getAlphaCutoff','getDoubleSided','getNormalScale'])assert.deepEqual(mb[getter](),ma[getter]());
   if(changed.has(n.getName())){
    const old=a.getAttribute('COLOR_0'),now=b.getAttribute('COLOR_0');assert(now);let count=0;
    const oldBase=ma.getBaseColorFactor(),newBase=mb.getBaseColorFactor();
    for(let vi=0;vi<now.getCount();vi++){
     const q=now.getElement(vi,[]),v=old?old.getElement(vi,[]):[1,1,1,1];assert(q.every(x=>Number.isFinite(x)&&x>=0&&x<=1));assert.equal(q[3],v[3]);
     if(q.slice(0,3).some((x,k)=>Math.abs(x*newBase[k]-v[k]*oldBase[k])>1e-6))count++;
    }
    assert(count>0);colors[n.getName()]={changedPigmentVertices:count,addedColorAttribute:!old};
    if(n.getName()!==inner){
     const x=a.getAttribute('POSITION'),y=b.getAttribute('POSITION');let moved=0,max=0;
     assert.equal(x.getCount(),y.getCount());
     for(let vi=0;vi<y.getCount();vi++){
      const q=y.getElement(vi,[]),v=x.getElement(vi,[]);assert(q.every(Number.isFinite));
      const distance=Math.hypot(...q.map((z,k)=>z-v[k]));if(distance>1e-7)moved++;max=Math.max(max,distance);
     }
     assert(moved>0);positions[n.getName()]={changedVertices:moved,maximumMovementMm:max*1000};
    }
   }
  }
 }
 assert.equal(Object.keys(colors).length,4);
 report[filename]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,allAnimationCurvesRetained:true,allTextureBytesRetained:true,colors,positions,addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-pony-drape-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
