/** Add one head-skinned, vertex-colored earring mesh to each female detail level. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'earring-pass');
const raw=await fs.readFile(path.join(d,'earring-geometry.json'));
const shape=JSON.parse(raw),native=JSON.parse(await fs.readFile(path.join(d,'native-earring-validation.json'),'utf8'));
const h=b=>createHash('sha256').update(b).digest('hex');
assert.equal(h(raw),native.geometryPayloadSha256);assert.equal(shape.mesh,native.mesh);
const n=shape.positions.length;assert.equal(n,native.vertices);assert.equal(shape.normals.length,n);assert.equal(shape.colors.length,n);assert.equal(shape.indices.length%3,0);
assert(shape.indices.every(v=>Number.isInteger(v)&&v>=0&&v<n));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),report=JSON.parse(await fs.readFile(path.join(p,'female-portable-validation.json'),'utf8'));
const transfer=v=>[v[0],v[2],-v[1]];
const flatten=(rows,convert=x=>x)=>new Float32Array(rows.flatMap(convert));
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const file=path.join(root,'public/assets/avatars/complete-pair',name),doc=await io.read(file),r=doc.getRoot();
 assert(!r.listNodes().some(x=>x.getName()===shape.mesh),'Earrings already present');
 const buffer=r.listBuffers()[0],skeleton=r.listNodes().find(x=>x.getName()==='AvatarSkeleton');
 const skin=r.listSkins().find(x=>x.getName()==='AvatarSkeleton');assert(skeleton&&skin);assert.equal(skin.listJoints()[shape.headJointIndex].getName(),'head');
 const mat=doc.createMaterial('PLURR reference ear enamel').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.30).setMetallicFactor(.16);
 const a=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
 const joint=new Uint8Array(n*4),weight=new Float32Array(n*4);for(let i=0;i<n;i++){joint[i*4]=shape.headJointIndex;weight[i*4]=1;}
 const primitive=doc.createPrimitive().setMaterial(mat).setIndices(a('SCALAR',new Uint16Array(shape.indices)))
  .setAttribute('POSITION',a('VEC3',flatten(shape.positions,transfer)))
  .setAttribute('NORMAL',a('VEC3',flatten(shape.normals,transfer)))
  .setAttribute('COLOR_0',a('VEC4',flatten(shape.colors)))
  .setAttribute('JOINTS_0',a('VEC4',joint))
  .setAttribute('WEIGHTS_0',a('VEC4',weight));
 const mesh=doc.createMesh(shape.mesh+' mesh').addPrimitive(primitive);
 const node=doc.createNode(shape.mesh).setMesh(mesh).setSkin(skin).setExtras({completePairStudy:true,avatarSlot:'accessories',avatarOptionId:'plurr-earrings',avatarAssetKind:'slot',avatarPartRole:'accessories',launchCharacter:'female'});
 skeleton.addChild(node);
 const bytes=await io.writeBinary(doc),check=await validateBytes(bytes,{maxIssues:1000});assert.equal(check.issues.numErrors,0,JSON.stringify(check.issues.messages));
 await fs.writeFile(file,bytes);report[name]={...report[name],earrings:{mesh:shape.mesh,vertices:n,triangles:shape.indices.length/3,headJointIndex:shape.headJointIndex,oneDrawCall:true},sha256:h(bytes),gltfErrors:0};
 console.log(name,'reference earrings exported; zero glTF errors');
}
await fs.writeFile(path.join(p,'female-portable-validation.json'),JSON.stringify(report,null,2)+'\n');
