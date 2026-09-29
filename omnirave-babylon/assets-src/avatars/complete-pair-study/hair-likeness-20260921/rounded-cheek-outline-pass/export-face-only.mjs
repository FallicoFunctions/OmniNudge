/** Rebuild the three facial meshes from original arrays while retaining the current outfit and finish. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';
import {applyFaceContour} from '../../../../../scripts/launch-body-proof/apply_female_face_contour.mjs';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921'),d=path.join(p,'rounded-cheek-outline-pass');
const native=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8'));
const report=JSON.parse(await fs.readFile(path.join(d,'before/female-portable-validation.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']) {
 const baseline=await io.read(path.join(p,'before',name));
 const current=await io.read(path.join(d,'before',name));
 for(const meshName of [native.faceContour.mesh,...native.faceContour.companionMeshes]) {
  const a=baseline.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh();
  const b=current.getRoot().listNodes().find(n=>n.getName()===meshName).getMesh();
  assert.deepEqual(a.getExtras().targetNames,b.getExtras().targetNames);
  assert.equal(a.listPrimitives().length,b.listPrimitives().length);
  for(let i=0;i<a.listPrimitives().length;i++) {
   const ap=a.listPrimitives()[i],bp=b.listPrimitives()[i];
   function restore(aa,bb) {assert.equal(aa.getCount(),bb.getCount());assert.equal(aa.getType(),bb.getType());bb.setArray(aa.getArray().slice());}
   for(const semantic of ['POSITION','NORMAL','TANGENT'])if(ap.getAttribute(semantic))restore(ap.getAttribute(semantic),bp.getAttribute(semantic));
   assert.equal(ap.listTargets().length,bp.listTargets().length);
   for(let j=0;j<ap.listTargets().length;j++)for(const semantic of ['POSITION','NORMAL'])if(ap.listTargets()[j].getAttribute(semantic))restore(ap.listTargets()[j].getAttribute(semantic),bp.listTargets()[j].getAttribute(semantic));
  }
 }
 const originalIris=baseline.getRoot().listMaterials().find(m=>m.getName()==='Launch female iris');
 current.getRoot().listMaterials().find(m=>m.getName()==='Launch female iris').setBaseColorFactor(originalIris.getBaseColorFactor());
 const faceContour=applyFaceContour(current,native.faceContour);
 const bytes=await io.writeBinary(current),validation=await validateBytes(bytes,{maxIssues:1000});
 assert.equal(validation.issues.numErrors,0);
 await fs.writeFile(path.join(root,'public/assets/avatars/complete-pair',name),bytes);
 report[name]={...report[name],faceContour,sha256:createHash('sha256').update(bytes).digest('hex'),gltfErrors:0};
 console.log(name,'facial field updated; zero glTF errors');
}
await fs.writeFile(path.join(p,'female-portable-validation.json'),JSON.stringify(report,null,2)+'\n');
