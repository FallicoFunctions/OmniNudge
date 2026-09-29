/** Transfer pony coverage while retaining the rig, motion and other meshes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { validateBytes } from 'gltf-validator';


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const study = path.join(root, 'assets-src/avatars/complete-pair-study');
const pass = path.join(study, 'launch-release-20260913/pony-coverage');
const publicDir = path.join(root, 'public/assets/avatars/complete-pair');
const input = path.join(pass, 'before');
const mapping = JSON.parse(await fs.readFile(path.join(pass, 'vertex-mapping.json'), 'utf8'));
const native = JSON.parse(await fs.readFile(path.join(pass, 'native-validation.json'), 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const hash = data => createHash('sha256').update(data).digest('hex');
const bytes = accessor => new Uint8Array(accessor.getArray().buffer, accessor.getArray().byteOffset, accessor.getArray().byteLength);

function retained(document) {
  const r = document.getRoot(), edited = new Set(), scalpMeshes = new Set();
  for (const node of r.listNodes()) if (mapping[node.getName()]) {
    const scalp=!!mapping[node.getName()].uv;
    if(scalp)scalpMeshes.add(node.getMesh());
    for (const p of node.getMesh().listPrimitives()) {
      for (const s of scalp?p.listSemantics():['POSITION', 'NORMAL', 'TANGENT']) {
        if (p.getAttribute(s)) edited.add(p.getAttribute(s));
      }
      if(scalp)edited.add(p.getIndices());
    }
  }
  return hash(JSON.stringify({
    accessors: r.listAccessors().filter(a => !edited.has(a)).map(a => [a.getType(), a.getComponentType(), a.getNormalized(), hash(bytes(a))]).sort(),
    nodes: r.listNodes().map(n => [n.getName(), n.getMatrix(), n.getWeights(), n.getExtras(), n.listChildren().map(c=>c.getName()), n.getSkin()?.getName(), n.getMesh()?.getName()]),
    skins: r.listSkins().map(s => [s.getName(), s.listJoints().map(j=>j.getName())]),
    meshes: r.listMeshes().map(m => [m.getName(), m.getWeights(), m.listPrimitives().map(p => [scalpMeshes.has(m)?'retained scalp with restored UV seam':p.listSemantics(), p.listTargets().map(t=>t.listSemantics()), p.getIndices()?.getCount()])]),
    animation: r.listAnimations().map(a => [a.getName(), a.listChannels().map(c => [c.getTargetNode().getName(), c.getTargetPath(), c.getSampler().getInterpolation()])]),
    textures: r.listTextures().filter(t=>!t.getName().startsWith('Reference scalp ')).map(t => [t.getName(), t.getMimeType(), hash(t.getImage())]),
  }));
}

const unit = v => { const length = Math.hypot(...v); assert(length > 1e-8); return v.map(x=>x/length); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function rotate(value, from, to) {
  from=unit(from); to=unit(to);
  const axis=cross(from,to), cosine=from.reduce((s,x,i)=>s+x*to[i],0);
  assert(cosine > -.95, 'Unexpected hair normal reversal');
  const first=cross(axis,value), second=cross(axis,first);
  return unit(value.map((x,i)=>x+first[i]+second[i]/(1+cosine)));
}

const indices = new Map();
const grid = p => p.map(v=>Math.round(v*1e6));
for (const [name, data] of Object.entries(mapping)) {
  const buckets=new Map();
  data.before.forEach((p,i)=>{const k=grid(p).join(','); if(!buckets.has(k))buckets.set(k,[]); buckets.get(k).push(i);});
  indices.set(name, point => {
    const [x,y,z]=grid(point); let index=-1, distance=Infinity;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++) {
      for(const i of buckets.get([x+dx,y+dy,z+dz].join(','))??[]) {
        const d=Math.hypot(...point.map((v,j)=>v-data.before[i][j]));
        if(d<distance){index=i;distance=d;}
      }
    }
    assert(index>=0 && distance<.000002, `${name}: no native vertex for ${point} (${distance})`);
    return {index,distance};
  });
}

const report = {};
for(const suffix of ['', '-lod1', '-lod2']) {
  const filename=`female${suffix}.glb`, document=await io.read(path.join(input,filename));
  const before=retained(document), rows={};
  for(const [name,data] of Object.entries(mapping)) {
    const node=document.getRoot().listNodes().find(n=>n.getName()===name);
    assert(node?.getSkin(),name);let count=0,maximumSourceError=0;
    for(const p of node.getMesh().listPrimitives()) {
      const position=p.getAttribute('POSITION'), normal=p.getAttribute('NORMAL'), tangent=p.getAttribute('TANGENT');
      for(let i=0;i<position.getCount();i++) {
        const {index,distance}=indices.get(name)(position.getElement(i,[]));
        maximumSourceError=Math.max(maximumSourceError,distance);
        position.setElement(i,data.after[index]);
        if(normal)normal.setElement(i,rotate(normal.getElement(i,[]),data.beforeNormals[index],data.afterNormals[index]));
        if(tangent){const t=tangent.getElement(i,[]);tangent.setElement(i,[...rotate(t.slice(0,3),data.beforeNormals[index],data.afterNormals[index]),t[3]]);}
        count++;
      }
    }
    rows[name]={vertices:count,maximumSourceErrorMm:maximumSourceError*1000};
  }
  for(const [owner,value] of Object.entries(native.materials)) {
    const node=document.getRoot().listNodes().find(n=>n.getName()===owner);
    // LOD2 omits the fine inner fibers by design.
    if(!node) {assert(suffix==='-lod2'&&owner==='PLURR pony surface fibers',owner);continue;}
    for(const p of node.getMesh().listPrimitives()) {
      const original=p.getMaterial();
      const exclusive=document.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).every(q=>q===p||q.getMaterial()!==original);
      const mat=exclusive?original:original.clone();p.setMaterial(mat);
      mat.setBaseColorFactor(value.color).setRoughnessFactor(value.roughness);
    }
  }
  assert.equal(retained(document),before,filename+': unrelated data changed');
  const result=await io.writeBinary(document);
  const validation=await validateBytes(result,{maxIssues:1000});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages.filter(m=>m.severity===0)));
  assert.equal(retained(await io.readBinary(result)),before,filename+': unrelated data changed in serialization');
  await fs.writeFile(path.join(publicDir,filename),result);
  report[filename]={hair:rows,otherGeometryUVsWeightsMorphsSkeletonAnimationsAndTexturesPreserved:true,bytes:result.length,sha256:hash(result),gltfErrors:0};
  console.log(filename,'pony coverage updated; geometry count and movement retained');
}
await fs.writeFile(path.join(pass,'portable-validation.json'),JSON.stringify(report,null,2)+'\n');
