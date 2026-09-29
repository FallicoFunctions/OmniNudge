/** Transfer the Blender hair revision to every LOD without re-exporting outfits. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { validateBytes } from 'gltf-validator';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const sex=process.argv[2]??'female';assert(['male','female'].includes(sex));
const mapping=JSON.parse(await fs.readFile(path.join(pass,`${sex}-vertex-mapping.json`),'utf8'));
const native=JSON.parse(await fs.readFile(path.join(pass,`${sex}-native-validation.json`),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash=data=>createHash('sha256').update(data).digest('hex');
const arrayHash=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));

function retained(doc) {
  const r=doc.getRoot(),changed=new Set();
  for(const n of r.listNodes()) if(mapping[n.getName()]) for(const p of n.getMesh().listPrimitives())
    for(const semantic of ['POSITION','NORMAL','TANGENT']) if(p.getAttribute(semantic))changed.add(p.getAttribute(semantic));
  return hash(JSON.stringify({
    accessors:r.listAccessors().filter(a=>!changed.has(a)).map(a=>[a.getType(),a.getNormalized(),arrayHash(a)]).sort(),
    nodes:r.listNodes().map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getSkin()?.getName(),n.getMesh()?.getName(),n.listChildren().map(c=>c.getName())]),
    animations:r.listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation()])]),
    skins:r.listSkins().map(s=>s.listJoints().map(j=>j.getName())),
    materials:r.listMaterials().filter(m=>!native.materials[m.getName()]).map(m=>[m.getName(),m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor()]),
    textures:r.listTextures().filter(t=>t.getName()!=='Reference hair resolved fibers').map(t=>[t.getName(),hash(t.getImage())]),
  }));
}
const unit=v=>{const l=Math.hypot(...v);assert(l>1e-9);return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function rotate(v,from,to) {
  from=unit(from);to=unit(to);const cosine=from.reduce((s,x,i)=>s+x*to[i],0);
  if(cosine<-.9999) {const axis=unit(cross(from,Math.abs(from[0])<.8?[1,0,0]:[0,1,0]));const dot=axis.reduce((s,x,i)=>s+x*v[i],0);return unit(v.map((x,i)=>2*dot*axis[i]-x));}
  const axis=cross(from,to),a=cross(axis,v),b=cross(axis,a);
  return unit(v.map((x,i)=>x+a[i]+b[i]/(1+cosine)));
}
const matchers={};
for(const [name,data] of Object.entries(mapping)) {
  const buckets=new Map(),grid=p=>p.map(x=>Math.round(x*1e6));
  data.before.forEach((p,i)=>{const k=grid(p).join(',');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);});
  matchers[name]=p=>{
    const [x,y,z]=grid(p);let index=-1,distance=Infinity;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const i of buckets.get([x+dx,y+dy,z+dz].join(','))??[]) {
      const d=Math.hypot(...p.map((v,j)=>v-data.before[i][j]));if(d<distance){distance=d;index=i;}
    }
    assert(index>=0&&distance<.000002,`${name}: missing native vertex ${p}`);return index;
  };
}
const report={};
for(const suffix of ['','-lod1','-lod2']) {
  const filename=`${sex}${suffix}.glb`,doc=await io.read(path.join(pass,'before',filename));
  const before=retained(doc),rows={};
  for(const [name,data] of Object.entries(mapping)) {
    const node=doc.getRoot().listNodes().find(n=>n.getName()===name);
    if(!node){assert(suffix==='-lod2',name);continue;}
    assert(node.getSkin(),name);
    let count=0;
    for(const p of node.getMesh().listPrimitives()) {
      const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),tangent=p.getAttribute('TANGENT');
      for(let i=0;i<pos.getCount();i++) {
        const j=matchers[name](pos.getElement(i,[]));pos.setElement(i,data.after[j]);
        if(normal)normal.setElement(i,rotate(normal.getElement(i,[]),data.beforeNormals[j],data.afterNormals[j]));
        if(tangent){const t=tangent.getElement(i,[]);tangent.setElement(i,[...rotate(t.slice(0,3),data.beforeNormals[j],data.afterNormals[j]),t[3]]);}
        count++;
      }
    }
    rows[name]=count;
  }
  const textures=new Map();
  for(const [name,value] of Object.entries(native.materials)) {
    const material=doc.getRoot().listMaterials().find(m=>m.getName()===name);if(!material)continue;
    material.setBaseColorFactor(value.color).setRoughnessFactor(value.roughness);
    if(value.specular!==undefined)material.getExtension('KHR_materials_specular')?.setSpecularFactor(value.specular);
    if(value.texture){
      if(!textures.has(value.texture))textures.set(value.texture,doc.createTexture('Reference hair resolved fibers').setMimeType('image/png').setImage(await fs.readFile(path.join(pass,value.texture))));
      material.setBaseColorTexture(textures.get(value.texture)).setAlphaMode('MASK').setAlphaCutoff(value.alphaCutoff).setDoubleSided(true);
    }
  }
  assert.equal(retained(doc),before,`${filename}: unrelated data changed`);
  const bytes=await io.writeBinary(doc),validation=await validateBytes(bytes,{maxIssues:1000});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages.filter(m=>m.severity===0)));
  assert.equal(retained(await io.readBinary(bytes)),before,`${filename}: serialization changed retained data`);
  await fs.writeFile(path.join(root,'public/assets/avatars/complete-pair',filename),bytes);
  report[filename]={verticesUpdated:rows,sha256:hash(bytes),gltfErrors:0,preservedOutfitsRigAnimationsWeightsMorphDeltas:true};
  console.log(filename,'hair revision applied; other geometry and animation preserved');
}
await fs.writeFile(path.join(pass,`${sex}-portable-validation.json`),JSON.stringify(report,null,2)+'\n');
