import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {warp} from '../../../../../scripts/launch-body-proof/apply_female_face_contour.mjs';
const d=path.dirname(new URL(import.meta.url).pathname),root=process.cwd();
const record=JSON.parse(await fs.readFile(path.join(d,'native-face-contour-validation.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=a=>createHash('sha256').update(a).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
function retained(doc){
 const r=doc.getRoot(),changed=new Set();
 // The body, brows and lashes retain the complete face field.
 for(const name of [record.mesh,...record.companionMeshes]) {
 const body=r.listNodes().find(n=>n.getName()===name);
 for(const p of body.getMesh().listPrimitives()){
  for(const s of ['POSITION','NORMAL','TANGENT'])if(p.getAttribute(s))changed.add(p.getAttribute(s));
  for(const t of p.listTargets())for(const s of ['POSITION','NORMAL'])if(t.getAttribute(s))changed.add(t.getAttribute(s));
 }
 }
 return hash(JSON.stringify({accessors:r.listAccessors().filter(a=>!changed.has(a)).map(a=>[a.getType(),a.getNormalized(),ah(a)]).sort(),textures:r.listTextures().map(t=>[t.getName(),hash(t.getImage())]),nodes:r.listNodes().map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getSkin()?.getName(),n.listChildren().map(c=>c.getName())]),materials:r.listMaterials().map(m=>[m.getName(),m.getName()==='Launch female iris'?null:m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor(),m.getAlphaMode(),m.getAlphaCutoff()])}));
}
const report={};
for(const suffix of ['','-lod1','-lod2']){
 const name=`female${suffix}.glb`,old=await io.read(path.join(d,'before',name)),now=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 assert.equal(retained(old),retained(now),name+': unrelated data changed');
 for(const meshName of record.companionMeshes){
  const a=old.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh(),b=now.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh();
  assert.deepEqual(a.getExtras(),b.getExtras());assert.equal(a.listPrimitives().length,b.listPrimitives().length);
  for(let i=0;i<a.listPrimitives().length;i++){
   const ap=a.listPrimitives()[i],bp=b.listPrimitives()[i];
   assert.equal(ah(ap.getIndices()),ah(bp.getIndices()));assert.deepEqual(ap.listSemantics(),bp.listSemantics());
   for(const semantic of ap.listSemantics())assert.equal(ah(ap.getAttribute(semantic)),ah(bp.getAttribute(semantic)),meshName+': '+semantic);
   assert.equal(ap.listTargets().length,bp.listTargets().length);
   for(let j=0;j<ap.listTargets().length;j++)for(const semantic of ap.listTargets()[j].listSemantics())assert.equal(ah(ap.listTargets()[j].getAttribute(semantic)),ah(bp.listTargets()[j].getAttribute(semantic)),meshName+': morph '+semantic);
  }
 }

 const baseline=await io.read(path.join(d,'../before',name));
 const meshReport={};
 for(const meshName of [record.mesh,...record.companionMeshes]) {
 const a=baseline.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh().listPrimitives()[0],b=now.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh().listPrimitives()[0];
 const ap=a.getAttribute('POSITION'),bp=b.getAttribute('POSITION');assert.equal(ap.getCount(),bp.getCount());
 let maxError=0,maxMorphError=0,changed=0,maxNormalError=0,protectedCount=0;
 for(let i=0;i<ap.getCount();i++){
  const p=ap.getElement(i,[]),q=bp.getElement(i,[]),expected=warp(p,record.spec);
  maxError=Math.max(maxError,...q.map((v,k)=>Math.abs(v-expected[k])));
  if(p.some((v,k)=>v!==q[k]))changed++;
  if(p[1]>=1.652||p[1]<=1.47){assert.deepEqual(p,q);protectedCount++;}
  for(const [j,t]of a.listTargets().entries()){
   const delta=t.getAttribute('POSITION').getElement(i,[]),newDelta=b.listTargets()[j].getAttribute('POSITION').getElement(i,[]);
   const expectedTarget=warp(p.map((v,k)=>v+delta[k]),record.spec);
   const oldNormal=t.getAttribute('NORMAL')?.getElement(i,[]);
   if(delta.every(v=>v===0)&&oldNormal?.every(v=>v===0))assert(b.listTargets()[j].getAttribute('NORMAL').getElement(i,[]).every(v=>v===0),'Inactive morph normals must stay zero');
   const scale=baseline.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh().getExtras().targetNames[j]==='Expression_Smile'?record.spec.smileScale:1;
   maxMorphError=Math.max(maxMorphError,...newDelta.map((v,k)=>Math.abs(v-(expectedTarget[k]-expected[k])*scale)));
  }
  const n=b.getAttribute('NORMAL').getElement(i,[]);assert(n.every(Number.isFinite));maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(...n)-1));
 }
 assert(maxError<1.3e-7&&maxMorphError<2e-7,{maxError,maxMorphError});assert(maxNormalError<2e-6);
 meshReport[meshName]={vertices:ap.getCount(),changedVertices:changed,protectedVertices:protectedCount,maxNativeFieldErrorMm:maxError*1000,maxMorphFieldErrorMm:maxMorphError*1000,maxUnitNormalError:maxNormalError};
 }
 const oldIris=baseline.getRoot().listMaterials().find(m=>m.getName()==='Launch female iris'),iris=now.getRoot().listMaterials().find(m=>m.getName()==='Launch female iris');
 assert.deepEqual(iris.getBaseColorFactor(),oldIris.getBaseColorFactor().map((v,i)=>v*record.spec.irisColorFactor[i]));
 report[name]={meshes:meshReport,irisColorFactor:iris.getBaseColorFactor(),unchangedHairOutfitsRigAnimationsWeightsUvsTextures:true,unchangedBrowLashGeometryAndMorphs:true};
 console.log(name,JSON.stringify(report[name]));
}
await fs.writeFile(path.join(d,'portable-face-contour-validation.json'),JSON.stringify(report,null,2)+'\n');
