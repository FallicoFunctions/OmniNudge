import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'crown-accent-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const green='PLURR pony strands 3',changed=new Set([green,'Polished female flyaways']),report={};
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const previous=await read(path.join(d,'before/female-native-validation.json')),current=await read(path.join(p,'female-native-validation.json'));
const mapping=await read(path.join(p,'female-vertex-mapping.json')),priorMapping=await read(path.join(d,'before/female-vertex-mapping.json'));
assert.deepEqual(current.additions,previous.additions);assert.deepEqual(current.faceContour,previous.faceContour);
const materialName=current.meshes.crownAccents.changedMaterial;
for(const [name,value] of Object.entries(current.materials)){
 const expected={...previous.materials[name]};if(name===materialName)Object.assign(expected,{color:[.48,.72,.25,1],roughness:.70,specular:.16});assert.deepEqual(value,expected);
}
const grid=p=>p.map(x=>Math.round(x*1e6));const buckets={};
for(const name of changed){const b=new Map();priorMapping[name].after.forEach((p,i)=>{const k=grid(p).join(',');if(!b.has(k))b.set(k,[]);b.get(k).push(i);});buckets[name]=b;}
const anims=doc=>doc.getRoot().listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation(),ah(c.getSampler().getInput()),ah(c.getSampler().getOutput())])]);
const structure=doc=>doc.getRoot().listNodes().map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getSkin()?.getName(),n.listChildren().map(c=>c.getName())]);
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,before=await io.read(path.join(d,'before',name)),after=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 assert.deepEqual(anims(after),anims(before));assert.deepEqual(structure(after),structure(before));
 const nodes=new Map(after.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0;const positions={},updatedMorphs=[];
 assert.equal(after.getRoot().listMaterials().length,before.getRoot().listMaterials().length);
 assert.deepEqual(after.getRoot().listTextures().map(t=>hash(t.getImage())).sort(),before.getRoot().listTextures().map(t=>hash(t.getImage())).sort());
 for(const n of before.getRoot().listNodes()){
  if(!n.getMesh())continue;const next=nodes.get(n.getName());assert(next?.getMesh());
  const oldP=n.getMesh().listPrimitives(),newP=next.getMesh().listPrimitives();assert.equal(oldP.length,newP.length);
  for(let i=0;i<oldP.length;i++){
   const a=oldP[i],b=newP[i];assert.equal(ah(a.getIndices()),ah(b.getIndices()));indices++;
   const added=b.listSemantics().filter(s=>!a.listSemantics().includes(s));assert.deepEqual(added,n.getName()===green?['COLOR_0']:[]);
   for(const s of a.listSemantics()){
    if(changed.has(n.getName())&&['POSITION','NORMAL','TANGENT'].includes(s))continue;
    assert.equal(ah(a.getAttribute(s)),ah(b.getAttribute(s)),`${name} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(a.listTargets().length,b.listTargets().length);
   for(let ti=0;ti<a.listTargets().length;ti++)for(const s of a.listTargets()[ti].listSemantics()){
    const old=a.listTargets()[ti].getAttribute(s),now=b.listTargets()[ti].getAttribute(s);
    if(changed.has(n.getName())){
     assert.equal(old.getCount(),now.getCount());const x=old.getArray(),y=now.getArray();let drift=0;
     for(let k=0;k<x.length;k++){assert(Number.isFinite(y[k]));drift=Math.max(drift,Math.abs(y[k]-x[k]));}
     if(s==='POSITION')assert(drift<1e-7,`${name}: changed relative motion ${n.getName()} ${drift}`);
     else if(s==='NORMAL')for(let vi=0;vi<now.getCount();vi++){
      const base=b.getAttribute('NORMAL').getElement(vi,[]),delta=now.getElement(vi,[]);assert(Math.abs(Math.hypot(...base.map((q,k)=>q+delta[k]))-1)<2e-6);
     }
     updatedMorphs.push({mesh:n.getName(),target:ti,semantic:s,maximumComponentChange:drift});
    }else{assert.equal(ah(old),ah(now));morphs++;}
   }
   if(changed.has(n.getName())){
    const old=a.getAttribute('POSITION'),now=b.getAttribute('POSITION'),data=mapping[n.getName()];assert.equal(old.getCount(),now.getCount());let count=0,max=0;
    const colors=n.getName()===green?b.getAttribute('COLOR_0'):null;
    for(let vi=0;vi<now.getCount();vi++){
     const q=now.getElement(vi,[]),v=old.getElement(vi,[]),[x,y,z]=grid(v);assert(q.every(Number.isFinite));let candidates=[];
     for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)candidates.push(...(buckets[n.getName()].get([x+dx,y+dy,z+dz].join(','))??[]));
     candidates=candidates.filter(j=>v.every((t,k)=>Math.abs(t-priorMapping[n.getName()].after[j][k])<2e-6)&&q.every((t,k)=>Math.abs(t-data.after[j][k])<2e-7));
     assert(candidates.length,`${name} ${n.getName()} ${vi}: native position mismatch`);
     if(colors){const c=colors.getElement(vi,[]);assert(c.every(t=>Number.isFinite(t)&&t>=0&&t<=1)&&c[3]===1);assert(candidates.some(j=>c.every((t,k)=>Math.abs(t-data.addedColors[j][k])<2e-7)));}
     const delta=Math.hypot(...q.map((t,k)=>t-v[k]));if(delta>1e-7)count++;max=Math.max(max,delta);
    }
    assert(count>0);positions[n.getName()]={changedVertices:count,maximumMovementMm:max*1000,nativePositionsMatched:true,nativeTintMatched:!!colors};
   }
  }
 }
 assert.equal(Object.keys(positions).length,2);
 report[name]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,positions,updatedMorphs,
  allTextureBytesRetained:true,animationCurvesRetained:true,addedColorAttributes:[green],addedNodes:0,addedMaterials:0,addedTextureImages:0};
}
await fs.writeFile(path.join(d,'portable-crown-accent-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
