import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const d=path.dirname(new URL(import.meta.url).pathname),root=process.cwd(),p=path.dirname(d);
const h=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>h(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const af=a=>JSON.stringify([a.getType(),a.getComponentType(),a.getNormalized(),ah(a)]);
const source=JSON.parse(await fs.readFile(path.join(d,'earring-geometry.json'),'utf8'));
const native=JSON.parse(await fs.readFile(path.join(d,'native-earring-validation.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),report={};
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const old=await io.read(path.join(d,'before',name)),now=await io.read(path.join(root,'public/assets/avatars/complete-pair',name));
 const a=old.getRoot(),b=now.getRoot(),oldNodes=a.listNodes(),newNodes=b.listNodes();
 assert.equal(b.listAccessors().length,a.listAccessors().length+6,name+': accessory accessor count');
 const originalAccessors=new Map();
 for(const accessor of a.listAccessors())originalAccessors.set(af(accessor),(originalAccessors.get(af(accessor))??0)+1);
 let addedAccessors=0;
 for(const accessor of b.listAccessors()){
  const key=af(accessor),remaining=originalAccessors.get(key)??0;
  if(remaining)originalAccessors.set(key,remaining-1);
  else addedAccessors++;
 }
 assert.equal(addedAccessors,6,name+': unexpected new accessor data');
 assert([...originalAccessors.values()].every(count=>count===0),name+': original accessor changed');
 assert.equal(b.listTextures().length,a.listTextures().length);
 for(let i=0;i<a.listTextures().length;i++)assert.equal(h(a.listTextures()[i].getImage()),h(b.listTextures()[i].getImage()),name+': texture changed');
 assert.equal(b.listMaterials().length,a.listMaterials().length+1);
 for(let i=0;i<a.listMaterials().length;i++){
  const x=a.listMaterials()[i],y=b.listMaterials()[i];assert.deepEqual([x.getName(),x.getBaseColorFactor(),x.getRoughnessFactor(),x.getMetallicFactor()],[y.getName(),y.getBaseColorFactor(),y.getRoughnessFactor(),y.getMetallicFactor()]);
 }
 assert.equal(newNodes.length,oldNodes.length+1);
 for(const x of oldNodes){
  const y=newNodes.find(n=>n.getName()===x.getName());assert(y,x.getName());
  assert.deepEqual([y.getMatrix(),y.getExtras(),y.getWeights(),y.getSkin()?.getName()],[x.getMatrix(),x.getExtras(),x.getWeights(),x.getSkin()?.getName()],x.getName());
 }
 assert.equal(b.listSkins().length,a.listSkins().length);assert.equal(b.listAnimations().length,a.listAnimations().length);
 const oldMeshNames=a.listMeshes().map(x=>x.getName());assert.equal(b.listMeshes().length,oldMeshNames.length+1);
 const n=newNodes.find(x=>x.getName()===source.mesh);assert(n&&n.getSkin());assert.equal(n.listParents().find(x=>x.propertyType==='Node')?.getName(),'AvatarSkeleton');
 assert.deepEqual(n.getExtras(),{completePairStudy:true,avatarSlot:'accessories',avatarOptionId:'plurr-earrings',avatarAssetKind:'slot',avatarPartRole:'accessories',launchCharacter:'female'});
 const prim=n.getMesh().listPrimitives()[0];assert.equal(n.getMesh().listPrimitives().length,1);assert.equal(prim.getMaterial().getName(),'PLURR reference ear enamel');
 const pos=prim.getAttribute('POSITION'),normal=prim.getAttribute('NORMAL'),color=prim.getAttribute('COLOR_0'),joint=prim.getAttribute('JOINTS_0'),weight=prim.getAttribute('WEIGHTS_0');
 assert.equal(pos.getCount(),source.positions.length);assert.equal(prim.getIndices().getCount(),source.indices.length);
 let maxPositionError=0,maxNormalError=0,maxColorError=0;
 for(let i=0;i<source.positions.length;i++){
  const p=pos.getElement(i,[]),v=source.positions[i],q=[v[0],v[2],-v[1]];
  maxPositionError=Math.max(maxPositionError,...q.map((x,k)=>Math.abs(x-p[k])));
  const nn=normal.getElement(i,[]),nv=source.normals[i],en=[nv[0],nv[2],-nv[1]];
  maxNormalError=Math.max(maxNormalError,...en.map((x,k)=>Math.abs(x-nn[k])));
  maxColorError=Math.max(maxColorError,...source.colors[i].map((x,k)=>Math.abs(x-color.getElement(i,[])[k])));
  assert.deepEqual(joint.getElement(i,[]),[native.headJointIndex,0,0,0]);assert.deepEqual(weight.getElement(i,[]),[1,0,0,0]);
 }
 assert(maxPositionError<1.2e-7&&maxNormalError<1.2e-7&&maxColorError<1.2e-7,{maxPositionError,maxNormalError,maxColorError});
 assert.deepEqual(Array.from(prim.getIndices().getArray()),source.indices);
 report[name]={addedMesh:source.mesh,addedVertices:pos.getCount(),addedTriangles:source.indices.length/3,oneDrawCall:true,addedMaterials:1,addedTextures:0,preservedOriginalAccessors:a.listAccessors().length,preservedOriginalTextures:a.listTextures().length,maximumNativePositionErrorMm:maxPositionError*1000,maximumNativeNormalError:maxNormalError,maximumNativeColorError:maxColorError,headJointIndex:native.headJointIndex};
 console.log(name,JSON.stringify(report[name]));
}
await fs.writeFile(path.join(d,'portable-earring-validation.json'),JSON.stringify(report,null,2)+'\n');
