import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';

const root=process.cwd();
const study=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const pass=path.join(study,'iris-tone-pass');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const old=[1,.46,.24,1], next=[.48,.20,.12,1];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report=JSON.parse(await fs.readFile(path.join(study,'female-portable-validation.json'),'utf8'));
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']){
 const document=await io.read(path.join(pass,'before',name));
 const iris=document.getRoot().listMaterials().find(material=>material.getName()==='Launch female iris');
 assert(iris,name+': iris material missing');
 assert.deepEqual(iris.getBaseColorFactor(),old,name+': unexpected prior iris tint');
 iris.setBaseColorFactor(next);
 const bytes=await io.writeBinary(document);
 const validation=await validateBytes(bytes,{maxIssues:1000});
 assert.equal(validation.issues.numErrors,0,name+': invalid glTF');
 await fs.writeFile(path.join(root,'public/assets/avatars/complete-pair',name),bytes);
 report[name]={...report[name],irisTone:{previousFactor:old,newFactor:next,material:'Launch female iris',addedTextures:0,changedGeometry:0},sha256:sha(bytes),gltfErrors:0};
 console.log(name,'iris material updated; zero glTF errors');
}
await fs.writeFile(path.join(study,'female-portable-validation.json'),JSON.stringify(report,null,2)+'\n');
