import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';
import {applyFaceSurface} from '../../../../../scripts/launch-body-proof/apply_female_face_surface.mjs';
const root=process.cwd(),p=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const record=JSON.parse(await fs.readFile(path.join(p,'female-native-validation.json'),'utf8')).faceSurface;
const report=JSON.parse(await fs.readFile(path.join(p,'female-portable-validation.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const file=path.join(root,'public/assets/avatars/complete-pair',name),doc=await io.read(file);
 const faceSurface=await applyFaceSurface(doc,record,p),bytes=await io.writeBinary(doc),validation=await validateBytes(bytes,{maxIssues:1000});
 assert.equal(validation.issues.numErrors,0);
 await fs.writeFile(file,bytes);
 report[name]={...report[name],faceSurface,sha256:createHash('sha256').update(bytes).digest('hex'),gltfErrors:0};
 console.log(name,'material delivery refreshed; zero glTF errors');
}
await fs.writeFile(path.join(p,'female-portable-validation.json'),JSON.stringify(report,null,2)+'\n');
