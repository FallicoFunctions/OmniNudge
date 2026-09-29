import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'root-transition-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const ah=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const NAME='PLURR swept scalp groom',report={};
const previous=JSON.parse(await fs.readFile(path.join(d,'before/female-native-validation.json'),'utf8'));
const current=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
assert.deepEqual(current.materials,previous.materials);assert.deepEqual(current.additions,previous.additions);
const capMaterial=Object.entries(current.materials).find(([n,m])=>m.texture==='reference-female-hairline.png')[0];
const oldTextureHash=hash(await fs.readFile(path.join(d,'before/reference-female-hairline.png')));
const newTextureHash=hash(await fs.readFile(path.join(p,'reference-female-hairline.png')));assert.notEqual(oldTextureHash,newTextureHash);
const mapping=JSON.parse(await fs.readFile(path.join(p,'female-vertex-mapping.json'),'utf8'))[NAME];
const buckets=new Map(),grid=q=>q.map(v=>Math.round(v*1e6));
mapping.after.forEach((q,i)=>{const k=grid(q).join(',');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);});
function matchUV(point,uv){
 const [x,y,z]=grid(point);let good=false;
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const i of buckets.get([x+dx,y+dy,z+dz].join(','))??[]){
  if(Math.hypot(...point.map((v,k)=>v-mapping.after[i][k]))<2e-6&&Math.hypot(...uv.map((v,k)=>v-mapping.addedUv[i][k]))<2e-6)good=true;
 }
 assert(good,'Exported scalp UV/position pair missing from native mapping');
}
for(const suffix of ['','-lod1','-lod2']){
 const file=`female${suffix}.glb`,a=await io.read(path.join(d,'before',file)),b=await io.read(path.join(root,'public/assets/avatars/complete-pair',file));
 const nodes=new Map(b.getRoot().listNodes().map(n=>[n.getName(),n]));let attributes=0,indices=0,morphs=0,changedVertices=0,changedUVs=0;
 assert.equal(a.getRoot().listNodes().length,b.getRoot().listNodes().length);
 assert.equal(a.getRoot().listTextures().length,b.getRoot().listTextures().length);
 const ta=a.getRoot().listTextures().map(t=>hash(t.getImage())),tb=b.getRoot().listTextures().map(t=>hash(t.getImage()));
 assert.equal(ta.filter(h=>h===oldTextureHash).length,1);assert.equal(tb.filter(h=>h===newTextureHash).length,1);
 assert.deepEqual(ta.filter(h=>h!==oldTextureHash).sort(),tb.filter(h=>h!==newTextureHash).sort());
 assert.equal(hash(b.getRoot().listMaterials().find(m=>m.getName()===capMaterial).getBaseColorTexture().getImage()),newTextureHash);
 for(const n of a.getRoot().listNodes()){
  if(!n.getMesh())continue;const old=n.getMesh().listPrimitives(),now=nodes.get(n.getName()).getMesh().listPrimitives();assert.equal(old.length,now.length);
  for(let i=0;i<old.length;i++){
   const x=old[i],y=now[i];assert.equal(ah(x.getIndices()),ah(y.getIndices()));indices++;
   assert.deepEqual(x.listSemantics(),y.listSemantics());
   for(const s of x.listSemantics()){
    if(n.getName()===NAME&&['POSITION','NORMAL','TANGENT','TEXCOORD_0'].includes(s))continue;
    assert.equal(ah(x.getAttribute(s)),ah(y.getAttribute(s)),`${file} ${n.getName()} ${s}`);attributes++;
   }
   assert.equal(x.listTargets().length,y.listTargets().length);
   for(let ti=0;ti<x.listTargets().length;ti++)for(const s of x.listTargets()[ti].listSemantics()){
    assert.equal(ah(x.listTargets()[ti].getAttribute(s)),ah(y.listTargets()[ti].getAttribute(s)));morphs++;
   }
   if(n.getName()===NAME){
    const po=x.getAttribute('POSITION'),pn=y.getAttribute('POSITION'),uo=x.getAttribute('TEXCOORD_0'),un=y.getAttribute('TEXCOORD_0');
    assert.equal(po.getCount(),pn.getCount());
    for(let j=0;j<pn.getCount();j++){
     const point=pn.getElement(j,[]),uv=un.getElement(j,[]);assert(point.every(Number.isFinite));assert(uv.every(v=>v>=0&&v<=1));matchUV(point,uv);
     if(Math.hypot(...point.map((v,k)=>v-po.getElement(j,[])[k]))>1e-7)changedVertices++;
     if(Math.hypot(...uv.map((v,k)=>v-uo.getElement(j,[])[k]))>1e-7)changedUVs++;
    }
   }
  }
 }
 assert(changedVertices>0&&changedUVs>0);
 report[file]={unchangedAttributes:attributes,unchangedIndexBuffers:indices,unchangedMorphAttributes:morphs,changedVertices,changedUVs,
  replacedTextures:1,addedGeometry:0,addedMaterials:0,addedTextures:0,nativeUvPositionPairsMatch:true};
}
await fs.writeFile(path.join(d,'portable-root-transition-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
