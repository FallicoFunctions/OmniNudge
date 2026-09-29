/** Transfer reference hair and the optional face field without re-exporting outfits. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { validateBytes } from 'gltf-validator';
import { applyFaceContour } from './apply_female_face_contour.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const sex=process.argv[2]??'female';assert(['male','female'].includes(sex));
const mapping=JSON.parse(await fs.readFile(path.join(pass,`${sex}-vertex-mapping.json`),'utf8'));
const native=JSON.parse(await fs.readFile(path.join(pass,`${sex}-native-validation.json`),'utf8'));
const additionNames=new Set((native.additions??[]).map(a=>a.name));
const removalNames=new Set(native.removedObjects??[]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash=data=>createHash('sha256').update(data).digest('hex');
const arrayHash=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));

function retained(doc) {
  const r=doc.getRoot(),changed=new Set();
  for(const n of r.listNodes()) {
    if(native.faceContour?.mesh===n.getName())for(const p of n.getMesh().listPrimitives()) {
      for(const s of ['POSITION','NORMAL','TANGENT'])if(p.getAttribute(s))changed.add(p.getAttribute(s));
      for(const t of p.listTargets())for(const s of ['POSITION','NORMAL'])if(t.getAttribute(s))changed.add(t.getAttribute(s));
    }
    if(mapping[n.getName()]) for(const p of n.getMesh().listPrimitives()) {
      for(const semantic of ['POSITION','NORMAL','TANGENT']) if(p.getAttribute(semantic))changed.add(p.getAttribute(semantic));
      if(mapping[n.getName()].addedUv&&p.getAttribute('TEXCOORD_0'))changed.add(p.getAttribute('TEXCOORD_0'));
      if(mapping[n.getName()].addedColors&&p.getAttribute('COLOR_0'))changed.add(p.getAttribute('COLOR_0'));
      if(mapping[n.getName()].morphs)for(const t of p.listTargets())for(const s of t.listSemantics())changed.add(t.getAttribute(s));
    }
    if(additionNames.has(n.getName())||removalNames.has(n.getName()))for(const p of n.getMesh()?.listPrimitives()??[]) {
      p.listAttributes().forEach(a=>changed.add(a));changed.add(p.getIndices());
      p.listTargets().forEach(t=>t.listAttributes().forEach(a=>changed.add(a)));
    }
  }
  return hash(JSON.stringify({
    accessors:r.listAccessors().filter(a=>!changed.has(a)).map(a=>[a.getType(),a.getNormalized(),arrayHash(a)]).sort(),
    nodes:r.listNodes().filter(n=>!additionNames.has(n.getName())&&!removalNames.has(n.getName())).map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getSkin()?.getName(),n.getMesh()?.getName(),n.listChildren().filter(c=>!additionNames.has(c.getName())&&!removalNames.has(c.getName())).map(c=>c.getName())]),
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
  const removedAccessors=new Set();
  for(const name of removalNames) {
    const node=doc.getRoot().listNodes().find(n=>n.getName()===name);assert(node,`Missing removal target: ${name}`);
    const mesh=node.getMesh(),primitives=mesh?.listPrimitives()??[];
    for(const animation of doc.getRoot().listAnimations())assert(!animation.listChannels().some(c=>c.getTargetNode()===node),`Animated removal target: ${name}`);
    for(const p of primitives){p.listAttributes().forEach(a=>removedAccessors.add(a));if(p.getIndices())removedAccessors.add(p.getIndices());p.listTargets().forEach(t=>t.listAttributes().forEach(a=>removedAccessors.add(a)));}
    node.dispose();mesh?.dispose();primitives.forEach(p=>p.dispose());
  }
  for(const a of removedAccessors){assert(a.listParents().every(p=>p.propertyType==='Root'),'Removed studs share an accessor with retained geometry');a.dispose();}
  for(const [name,data] of Object.entries(mapping)) {
    const node=doc.getRoot().listNodes().find(n=>n.getName()===name);
    if(!node){assert(suffix==='-lod2',name);continue;}
    assert(node.getSkin(),name);
    let count=0;
    for(const p of node.getMesh().listPrimitives()) {
      const pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),tangent=p.getAttribute('TANGENT');
      let uv=p.getAttribute('TEXCOORD_0');
      if(data.addedUv&&!uv){uv=doc.createAccessor().setType('VEC2').setArray(new Float32Array(pos.getCount()*2)).setBuffer(pos.getBuffer());p.setAttribute('TEXCOORD_0',uv);}
      let colors=p.getAttribute('COLOR_0');
      if(data.addedColors&&!colors){colors=doc.createAccessor().setType('VEC4').setArray(new Float32Array(pos.getCount()*4)).setBuffer(pos.getBuffer());p.setAttribute('COLOR_0',colors);}
      for(let i=0;i<pos.getCount();i++) {
        const j=matchers[name](pos.getElement(i,[]));pos.setElement(i,data.after[j]);
        if(data.addedUv)uv.setElement(i,data.addedUv[j]);
        if(data.addedColors)colors.setElement(i,data.addedColors[j]);
        if(normal)normal.setElement(i,rotate(normal.getElement(i,[]),data.beforeNormals[j],data.afterNormals[j]));
        if(tangent){const t=tangent.getElement(i,[]);tangent.setElement(i,[...rotate(t.slice(0,3),data.beforeNormals[j],data.afterNormals[j]),t[3]]);}
        if(data.morphs)for(const [ti,target] of p.listTargets().entries()) {
          const name=node.getMesh().getExtras().targetNames[ti],shape=data.morphs[name];assert(shape,name);
          target.getAttribute('POSITION').setElement(i,shape.position[j]);
          if(target.getAttribute('NORMAL')) {
            const base=normal.getElement(i,[]),nativeTarget=data.afterNormals[j].map((v,k)=>v+shape.normal[j][k]);
            const posed=rotate(nativeTarget,data.afterNormals[j],base);
            target.getAttribute('NORMAL').setElement(i,posed.map((v,k)=>v-base[k]));
          }
        }
        count++;
      }
    }
    rows[name]=count;
  }
  const textures=new Map();
  for(const addition of native.additions??[])doc.createMaterial(addition.material).setMetallicFactor(0)
    .setExtension('KHR_materials_specular',doc.createExtension(KHRMaterialsSpecular).createSpecular());
  for(const [name,value] of Object.entries(native.materials)) {
    const material=doc.getRoot().listMaterials().find(m=>m.getName()===name);if(!material)continue;
    material.setBaseColorFactor(value.color).setRoughnessFactor(value.roughness);
    if(value.specular!==undefined)material.getExtension('KHR_materials_specular')?.setSpecularFactor(value.specular);
    if(value.texture){
      if(!textures.has(value.texture))textures.set(value.texture,doc.createTexture('Reference hair resolved fibers').setMimeType('image/png').setImage(await fs.readFile(path.join(pass,value.texture))));
      material.setBaseColorTexture(textures.get(value.texture)).setAlphaMode(value.opaque?'OPAQUE':'MASK').setAlphaCutoff(value.alphaCutoff??.5).setDoubleSided(true);
    }
    if(value.normalTexture){
      if(!textures.has(value.normalTexture))textures.set(value.normalTexture,doc.createTexture('Reference hair resolved fibers').setMimeType('image/png').setImage(await fs.readFile(path.join(pass,value.normalTexture))));
      material.setNormalTexture(textures.get(value.normalTexture)).setNormalScale(value.normalScale);
    }
  }
  for(const a of native.additions??[]) {
    const r=doc.getRoot(),skin=r.listSkins().find(s=>s.getName()==='AvatarSkeleton');assert(skin);
    const head=skin.listJoints().findIndex(j=>j.getName()==='head');assert(head>=0);
    const buffer=r.listBuffers()[0],count=a.positions.length;
    const attr=(type,values,ArrayType=Float32Array)=>doc.createAccessor().setType(type).setArray(new ArrayType(values.flat())).setBuffer(buffer);
    const joints=Array.from({length:count},()=>[head,0,0,0]),weights=Array.from({length:count},()=>[1,0,0,0]);
    const primitive=doc.createPrimitive().setAttribute('POSITION',attr('VEC3',a.positions)).setAttribute('NORMAL',attr('VEC3',a.normals))
      .setAttribute('TEXCOORD_0',attr('VEC2',a.uv)).setAttribute('JOINTS_0',attr('VEC4',joints,Uint16Array)).setAttribute('WEIGHTS_0',attr('VEC4',weights))
      .setIndices(attr('SCALAR',a.indices,Uint16Array)).setMaterial(r.listMaterials().find(m=>m.getName()===a.material));
    if(a.colors){
      assert(a.colors.length===count&&a.colors.every(c=>c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1)),`${a.name}: invalid vertex colors`);
      primitive.setAttribute('COLOR_0',attr('VEC4',a.colors));
    }
    const node=doc.createNode(a.name).setMesh(doc.createMesh(a.name).addPrimitive(primitive)).setSkin(skin).setExtras(a.extras);
    r.listNodes().find(n=>n.getName()==='AvatarSkeleton').addChild(node);
    rows[a.name]=count;
  }
  const faceContour=native.faceContour?applyFaceContour(doc,native.faceContour):null;
  assert.equal(retained(doc),before,`${filename}: unrelated data changed`);
  const bytes=await io.writeBinary(doc),validation=await validateBytes(bytes,{maxIssues:1000});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages.filter(m=>m.severity===0)));
  assert.equal(retained(await io.readBinary(bytes)),before,`${filename}: serialization changed retained data`);
  await fs.writeFile(path.join(root,'public/assets/avatars/complete-pair',filename),bytes);
  report[filename]={verticesUpdated:rows,faceContour,sha256:hash(bytes),gltfErrors:0,preservedOutfitsRigAnimationsWeights:true,
    addedHairMeshes:[...additionNames],removedObjects:[...removalNames],rescaledHairMorphs:Object.keys(mapping).filter(n=>mapping[n].morphs)};
  console.log(filename,'reference revision applied; rig, outfits and animation preserved');
}
await fs.writeFile(path.join(pass,`${sex}-portable-validation.json`),JSON.stringify(report,null,2)+'\n');
