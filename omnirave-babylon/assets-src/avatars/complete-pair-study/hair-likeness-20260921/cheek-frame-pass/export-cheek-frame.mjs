/** Add the six head-skinned brunette cheek cards as one primitive. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';

const root=process.cwd();
const study=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const pass=path.join(study,'cheek-frame-pass');
const shape=JSON.parse(await fs.readFile(path.join(pass,'cheek-frame-geometry.json'),'utf8'));
const native=JSON.parse(await fs.readFile(path.join(pass,'native-preservation.json'),'utf8'));
assert.equal(shape.mesh,native.newMesh);
const count=shape.positions.length;
assert.equal(count,504);
assert.equal(shape.indices.length,648*3);
for(const channel of ['normals','uvs','colors'])assert.equal(shape[channel].length,count);
assert(shape.indices.every(index=>Number.isInteger(index)&&index>=0&&index<count));
const transfer=v=>[v[0],v[2],-v[1]];
const flatten=(rows,convert=x=>x)=>new Float32Array(rows.flatMap(convert));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report=JSON.parse(await fs.readFile(path.join(study,'female-portable-validation.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const file=path.join(root,'public/assets/avatars/complete-pair',name);
 const doc=await io.read(path.join(pass,'before',name));
 const r=doc.getRoot();
 assert(!r.listNodes().some(node=>node.getName()===shape.mesh));
 if(name==='female-lod2.glb'){
  const bytes=await io.writeBinary(doc);
  const validation=await validateBytes(bytes,{maxIssues:1000});
  assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages));
  await fs.writeFile(file,bytes);
  report[name]={...report[name],cheekFrame:{omittedAtDistance:true,vertices:0,triangles:0,addedDrawCalls:0},sha256:sha(bytes),gltfErrors:0};
  console.log(name,'distant cheek detail omitted; zero glTF errors');
  continue;
 }
 const count=name==='female-lod1.glb'?252:shape.positions.length;
 const indices=[];
 for(let triangle=0;triangle<shape.indices.length;triangle+=3){
  const tri=shape.indices.slice(triangle,triangle+3);
  if(tri.every(vertex=>vertex<count))indices.push(...tri);
 }
 assert.equal(indices.length,name==='female-lod1.glb'?972:shape.indices.length);
 const skeleton=r.listNodes().find(node=>node.getName()==='AvatarSkeleton');
 const skin=r.listSkins().find(candidate=>candidate.getName()==='AvatarSkeleton');
 assert(skeleton&&skin);
 assert.equal(skin.listJoints()[44].getName(),'head');
 const material=r.listMaterials().find(candidate=>candidate.getName()===shape.material);
 assert(material);
 const buffer=r.listBuffers()[0];
 const attr=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
 const joints=new Uint8Array(count*4),weights=new Float32Array(count*4);
 for(let vertex=0;vertex<count;vertex++){joints[vertex*4]=44;weights[vertex*4]=1;}
 const primitive=doc.createPrimitive().setMaterial(material)
  .setIndices(attr('SCALAR',new Uint16Array(indices)))
  .setAttribute('POSITION',attr('VEC3',flatten(shape.positions.slice(0,count),transfer)))
  .setAttribute('NORMAL',attr('VEC3',flatten(shape.normals.slice(0,count),transfer)))
  .setAttribute('TEXCOORD_0',attr('VEC2',flatten(shape.uvs.slice(0,count))))
  .setAttribute('COLOR_0',attr('VEC4',flatten(shape.colors.slice(0,count))))
  .setAttribute('JOINTS_0',attr('VEC4',joints))
  .setAttribute('WEIGHTS_0',attr('VEC4',weights));
 const mesh=doc.createMesh(shape.mesh).addPrimitive(primitive);
 const node=doc.createNode(shape.mesh).setMesh(mesh).setSkin(skin).setExtras({completePairStudy:true,avatarSlot:'hair',avatarOptionId:'plurr-pony',avatarAssetKind:'slot',avatarPartRole:'hair',launchCharacter:'female'});
 skeleton.addChild(node);
 const bytes=await io.writeBinary(doc);
 const validation=await validateBytes(bytes,{maxIssues:1000});
 assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues.messages));
 await fs.writeFile(file,bytes);
 report[name]={...report[name],cheekFrame:{mesh:shape.mesh,vertices:count,triangles:indices.length/3,headJointIndex:44,addedDrawCalls:1,addedMaterials:0,addedTextures:0},sha256:sha(bytes),gltfErrors:0};
 console.log(name,'cheek frame exported; zero glTF errors');
}
await fs.writeFile(path.join(study,'female-portable-validation.json'),JSON.stringify(report,null,2)+'\n');
