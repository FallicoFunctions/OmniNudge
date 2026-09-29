import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const root=process.cwd();
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921/cheek-frame-pass');
const shape=JSON.parse(await fs.readFile(path.join(pass,'cheek-frame-geometry.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ah=a=>sha(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const af=a=>JSON.stringify([a.getType(),a.getComponentType(),a.getNormalized(),ah(a)]);
const transfer=v=>[v[0],v[2],-v[1]];
const report={};
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const old=(await io.read(path.join(pass,'before',name))).getRoot();
 const now=(await io.read(path.join(root,'public/assets/avatars/complete-pair',name))).getRoot();
 const expectedVertices=name==='female-lod2.glb'?0:name==='female-lod1.glb'?252:504;
 assert.equal(now.listAccessors().length,old.listAccessors().length+(expectedVertices?7:0));
 const originals=new Map();
 for(const a of old.listAccessors())originals.set(af(a),(originals.get(af(a))??0)+1);
 let additions=0;
 for(const a of now.listAccessors()){const key=af(a),count=originals.get(key)??0;if(count)originals.set(key,count-1);else additions++;}
 assert.equal(additions,expectedVertices?7:0,name+': unexpected added accessor');
 assert([...originals.values()].every(count=>count===0),name+': original accessor altered');
 assert.deepEqual(now.listTextures().map(t=>[t.getName(),sha(t.getImage())]),old.listTextures().map(t=>[t.getName(),sha(t.getImage())]),name+': texture changed');
 assert.equal(now.listMaterials().length,old.listMaterials().length);
 assert.deepEqual(now.listMaterials().map(m=>[m.getName(),m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor()]),old.listMaterials().map(m=>[m.getName(),m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor()]));
 assert.equal(now.listNodes().length,old.listNodes().length+(expectedVertices?1:0));
 assert.equal(now.listMeshes().length,old.listMeshes().length+(expectedVertices?1:0));
 assert.equal(now.listSkins().length,old.listSkins().length);
 assert.equal(now.listAnimations().length,old.listAnimations().length);
 assert(now.listNodes().some(n=>n.getName()==='PLURR neon ear drops'));
 if(!expectedVertices){
  assert(!now.listNodes().some(n=>n.getName()===shape.mesh));
  report[name]={omittedAtDistance:true,vertices:0,triangles:0,addedDrawCalls:0,addedMaterials:0,addedTextures:0,preservedOriginalAccessors:old.listAccessors().length,earringsRetained:true};
  console.log(name,JSON.stringify(report[name]));
  continue;
 }
 const node=now.listNodes().find(candidate=>candidate.getName()===shape.mesh);
 assert(node&&node.getSkin());
 assert.equal(node.listParents().find(parent=>parent.propertyType==='Node')?.getName(),'AvatarSkeleton');
 assert.deepEqual(node.getExtras(),{completePairStudy:true,avatarSlot:'hair',avatarOptionId:'plurr-pony',avatarAssetKind:'slot',avatarPartRole:'hair',launchCharacter:'female'});
 const primitive=node.getMesh().listPrimitives()[0];
 assert.equal(node.getMesh().listPrimitives().length,1);
 assert.equal(primitive.getMaterial().getName(),shape.material);
 const channels=[['POSITION','positions',transfer],['NORMAL','normals',transfer],['TEXCOORD_0','uvs',x=>x],['COLOR_0','colors',x=>x]];
 let largestError=0;
 for(const [semantic,key,convert] of channels){
  const accessor=primitive.getAttribute(semantic);assert.equal(accessor.getCount(),expectedVertices);
  for(let vertex=0;vertex<expectedVertices;vertex++){
   const expected=convert(shape[key][vertex]),actual=accessor.getElement(vertex,[]);
   largestError=Math.max(largestError,...expected.map((x,index)=>Math.abs(x-actual[index])));
  }
 }
 assert(largestError<1.2e-7,{name,largestError});
 const selectedIndices=[];
 for(let triangle=0;triangle<shape.indices.length;triangle+=3){const tri=shape.indices.slice(triangle,triangle+3);if(tri.every(vertex=>vertex<expectedVertices))selectedIndices.push(...tri);}
 assert.deepEqual(Array.from(primitive.getIndices().getArray()),selectedIndices);
 for(let vertex=0;vertex<expectedVertices;vertex++){
  assert.deepEqual(primitive.getAttribute('JOINTS_0').getElement(vertex,[]),[44,0,0,0]);
  assert.deepEqual(primitive.getAttribute('WEIGHTS_0').getElement(vertex,[]),[1,0,0,0]);
 }
 report[name]={addedMesh:shape.mesh,vertices:expectedVertices,triangles:selectedIndices.length/3,addedDrawCalls:1,addedMaterials:0,addedTextures:0,preservedOriginalAccessors:old.listAccessors().length,maximumNativeAttributeError:largestError,earringsRetained:true};
 console.log(name,JSON.stringify(report[name]));
}
await fs.writeFile(path.join(pass,'portable-cheek-frame-validation.json'),JSON.stringify(report,null,2)+'\n');
