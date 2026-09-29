/** Transfer two native hair surfaces while retaining other geometry and motion. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { validateBytes } from 'gltf-validator';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const study = path.join(root, 'assets-src/avatars/complete-pair-study');
const pass = path.join(study, 'visual-reference-pass-20260911');
const publicDir = path.join(root, 'public/assets/avatars/complete-pair');
const input = process.argv.includes('--baseline') ? path.join(pass, 'hair-before') : publicDir;
const mapping = JSON.parse(await fs.readFile(path.join(pass, 'hairline-vertex-mapping.json'), 'utf8'));
const native = JSON.parse(await fs.readFile(path.join(pass, 'hairline-native-validation.json'), 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const {generateTangents}=createRequire(import.meta.url)('mikktspace');
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

function scalpTextureCoordinates(document, primitive, uv) {
  const buffer=document.getRoot().listBuffers()[0];
  const replaceAttribute=(semantic,accessor)=>{
    const previous=primitive.getAttribute(semantic);
    primitive.setAttribute(semantic,accessor);
    if(previous&&previous.listParents().every(p=>p.propertyType==='Root'))previous.dispose();
  };
  const texcoord=document.createAccessor().setType('VEC2').setArray(new Float32Array(uv.flat())).setBuffer(buffer);
  replaceAttribute('TEXCOORD_0',texcoord);
  const indices=primitive.getIndices(), originalIndices=indices.getArray(), revised=new Uint32Array(originalIndices);
  const originalCount=primitive.getAttribute('POSITION').getCount(), duplicates=new Map();
  for(let i=0;i<revised.length;i+=3){
    const values=[uv[revised[i]][0],uv[revised[i+1]][0],uv[revised[i+2]][0]];
    if(Math.max(...values)-Math.min(...values)<=.5)continue;
    for(let j=0;j<3;j++)if(values[j]<.5){
      const source=originalIndices[i+j];
      if(!duplicates.has(source))duplicates.set(source,originalCount+duplicates.size);
      revised[i+j]=duplicates.get(source);
    }
  }
  for(const semantic of primitive.listSemantics()){
    const accessor=primitive.getAttribute(semantic), raw=accessor.getArray(), size=accessor.getElementSize();
    assert(accessor.listParents().every(p=>p===primitive||p.propertyType==='Root'),`${semantic}: shared scalp accessor`);
    const expanded=new raw.constructor((originalCount+duplicates.size)*size);expanded.set(raw);
    for(const [source,dest] of duplicates)expanded.set(raw.subarray(source*size,(source+1)*size),dest*size);
    assert.deepEqual(expanded.subarray(0,raw.length),raw,'Existing scalp attributes changed while splitting UV seam');
    accessor.setArray(expanded);
  }
  for(const [,dest] of duplicates){const value=texcoord.getElement(dest,[]);texcoord.setElement(dest,[value[0]+1,value[1]]);}
  indices.setArray(revised);
  // MikkTSpace receives the exact normals and restored per-corner UVs.
  const expand=semantic=>Float32Array.from(Array.from(revised).flatMap(i=>primitive.getAttribute(semantic).getElement(i,[])));
  const corners=generateTangents(expand('POSITION'),expand('NORMAL'),expand('TEXCOORD_0'));
  const count=primitive.getAttribute('POSITION').getCount(), sum=new Float32Array(count*4);
  for(let i=0;i<revised.length;i++){const vertex=revised[i];for(let c=0;c<3;c++)sum[vertex*4+c]+=corners[i*4+c];sum[vertex*4+3]=corners[i*4+3];}
  for(let i=0;i<count;i++){
    const normal=primitive.getAttribute('NORMAL').getElement(i,[]), t=Array.from(sum.subarray(i*4,i*4+3));
    const dot=t.reduce((s,x,j)=>s+x*normal[j],0), projected=unit(t.map((x,j)=>x-dot*normal[j]));
    sum.set(projected,i*4);
  }
  replaceAttribute('TANGENT',document.createAccessor().setType('VEC4').setArray(sum).setBuffer(buffer));
  return duplicates.size;
}

const report={};
for(const suffix of ['', '-lod1', '-lod2']) {
  const filename=`female${suffix}.glb`, document=await io.read(path.join(input,filename));
  const before=retained(document), rows={};
  for(const [name,data] of Object.entries(mapping)) {
    const node=document.getRoot().listNodes().find(n=>n.getName()===name);
    assert(node?.getSkin(), name);
    let count=0, maximumSourceError=0, seamVertices=0;
    for(const p of node.getMesh().listPrimitives()) {
      assert.equal(p.listTargets().length,0, 'Hairline must not change secondary-motion morphs');
      const position=p.getAttribute('POSITION'), normal=p.getAttribute('NORMAL'), tangent=p.getAttribute('TANGENT');
      const uv=[];
      for(let i=0;i<position.getCount();i++) {
        const {index,distance}=indices.get(name)(position.getElement(i,[]));
        maximumSourceError=Math.max(maximumSourceError,distance);
        position.setElement(i,data.after[index]);
        if(data.uv)uv.push(data.uv[index]);
        if(normal)normal.setElement(i,rotate(normal.getElement(i,[]),data.beforeNormals[index],data.afterNormals[index]));
        if(tangent){const t=tangent.getElement(i,[]);tangent.setElement(i,[...rotate(t.slice(0,3),data.beforeNormals[index],data.afterNormals[index]),t[3]]);}
        count++;
      }
      if(data.uv)seamVertices+=scalpTextureCoordinates(document,p,uv);
    }
    rows[name]={vertices:count,duplicatedUVSeamVertices:seamVertices,maximumSourceErrorMm:maximumSourceError*1000};
  }
  // Distance exports rename the untextured cap to a palette material. Resolve
  // the native material from its owning surface, without touching that palette.
  const materialOwners={
    'Complete scalp':'Complete female scalp.001',
    'PLURR swept scalp groom':'PLURR swept dark scalp hair',
  };
  for(const [nodeName,materialName] of Object.entries(materialOwners)) {
    assert(native.materials[materialName],`Missing native material: ${materialName}`);
    const node=document.getRoot().listNodes().find(n=>n.getName()===nodeName);
    for(const primitive of node.getMesh().listPrimitives()) {
      const source=primitive.getMaterial();
      assert(source,`${nodeName}: missing material`);
      if(source.getName()!==materialName)primitive.setMaterial(source.clone().setName(materialName));
    }
  }
  const changedMaterials=[];
  for(const mat of document.getRoot().listMaterials()) {
    const value=native.materials[mat.getName()]; if(!value)continue;
    changedMaterials.push(mat.getName());
    mat.setBaseColorFactor(value.baseColor).setRoughnessFactor(value.roughness);
    const specular=mat.getExtension('KHR_materials_specular')??document.createExtension(KHRMaterialsSpecular).createSpecular();
    specular.setSpecularFactor(value.specular); mat.setExtension('KHR_materials_specular',specular);
    const texture=async(file,label)=>{
      assert.equal(path.basename(file),file);
      const size=suffix==='-lod2'?512:suffix==='-lod1'?1024:2048;
      return document.createTexture('Reference scalp '+label).setMimeType('image/webp')
        .setImage(await sharp(await fs.readFile(path.join(study,file))).resize(size,size).webp({lossless:true}).toBuffer());
    };
    if(value.colorTexture){
      mat.setBaseColorTexture(await texture(value.colorTexture,'fibers')).setAlphaMode('MASK').setAlphaCutoff(value.alphaCutoff);
      mat.getBaseColorTextureInfo().setTexCoord(0);
    }
    if(value.normalTexture&&suffix!=='-lod2'){
      mat.setNormalTexture(await texture(value.normalTexture,'normal'));
      mat.getNormalTextureInfo().setTexCoord(0);
    }
  }
  assert.deepEqual(changedMaterials.sort(),Object.keys(native.materials).sort(),'A hair material was not updated');
  assert.equal(retained(document),before,`${filename}: unrelated data changed`);
  const result=await io.writeBinary(document);
  const validation=await validateBytes(result,{maxIssues:1000});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages.filter(m=>m.severity===0)));
  assert.equal(retained(await io.readBinary(result)),before,`${filename}: unrelated data changed in serialization`);
  await fs.writeFile(path.join(publicDir,filename),result);
  report[filename]={changedHairSurfaces:rows,changedHairMaterials:changedMaterials,retainedDataHash:before,otherMeshesUVsWeightsMorphsSkeletonAnimationsAndOriginalTexturesPreserved:true,
    bytes:result.length,sha256:hash(result),gltfErrors:0,gltfWarnings:validation.issues.numWarnings};
  console.log(filename,'hairline updated; all other geometry and animation retained');
}
await fs.writeFile(path.join(pass,'hairline-portable-validation.json'),JSON.stringify(report,null,2)+'\n');
