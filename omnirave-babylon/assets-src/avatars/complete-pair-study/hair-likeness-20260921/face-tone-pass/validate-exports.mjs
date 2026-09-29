import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
const d=path.dirname(new URL(import.meta.url).pathname),root=process.cwd();
const record=JSON.parse(await fs.readFile(path.join(d,'native-face-surface-validation.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),hash=b=>createHash('sha256').update(b).digest('hex');
const accessorHash=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
const mutable=new Set(Object.values(record.channels).map(x=>x.texture));
function stableBytes(b) {
 const doc=JSON.parse(Buffer.from(b).subarray(20,20+Buffer.from(b).readUInt32LE(12)).toString());
 // Buffer offsets/sizes depend on the two changed image payloads. Every accessor
 // is compared below; all other serialized fields must remain exactly equal.
 delete doc.buffers;delete doc.bufferViews;
 for(const a of doc.accessors??[])delete a.bufferView;
 for(const i of doc.images??[])delete i.bufferView;
 return doc;
}
const report={};
for(const name of ['female.glb','female-lod1.glb','female-lod2.glb']) {
 const beforeBytes=await fs.readFile(path.join(d,'before',name)),bytes=await fs.readFile(path.join(root,'public/assets/avatars/complete-pair',name));
 const before=await io.readBinary(beforeBytes),now=await io.readBinary(bytes),a=before.getRoot(),b=now.getRoot();
 assert.deepEqual(stableBytes(beforeBytes),stableBytes(bytes),name+': unrelated serialized fields');
 assert.equal(a.listAccessors().length,b.listAccessors().length);
 for(let i=0;i<a.listAccessors().length;i++)assert.equal(accessorHash(a.listAccessors()[i]),accessorHash(b.listAccessors()[i]),name+': changed geometry, weights or animation');
 assert.equal(a.listTextures().length,b.listTextures().length);
 let kept=0;
 for(let i=0;i<a.listTextures().length;i++)if(!mutable.has(a.listTextures()[i].getName())){assert.equal(hash(a.listTextures()[i].getImage()),hash(b.listTextures()[i].getImage()));kept++;}
 const channels={};
 for(const [channel,s] of Object.entries(record.channels)) {
  const tex=b.listTextures().find(t=>t.getName()===s.texture),old=a.listTextures().find(t=>t.getName()===s.texture);
  const actual=await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const src=await fs.readFile(path.join(d,'..',s.file));
  let expected;
  if(channel==='baseColor'){
   const quality=actual.info.width>=2048?92:actual.info.width>=1024?88:82;
   const encoded=await sharp(src).resize(actual.info.width,actual.info.height).removeAlpha().webp({quality}).toBuffer();
   expected=await sharp(encoded).removeAlpha().raw().toBuffer();
  }
  else {
   const oldPixels=await sharp(Buffer.from(old.getImage())).removeAlpha().raw().toBuffer();
   const rough=await sharp(src).resize(actual.info.width,actual.info.height).extractChannel(0).raw().toBuffer();
   expected=Buffer.from(oldPixels);for(let i=0;i<rough.length;i++)expected[i*3+1]=rough[i];
  }
  assert(actual.data.equals(expected),name+': baked material does not match delivery');
  channels[channel]={width:actual.info.width,height:actual.info.height,sourceEncodingMatch:true,lossless:channel==='roughness'};
 }
 report[name]={gltfSha256:hash(bytes),unchangedAccessors:a.listAccessors().length,unchangedTextures:kept,unchangedSceneGraphMaterialsAndAnimations:true,channels};
 console.log(name,JSON.stringify(report[name]));
}
await fs.writeFile(path.join(d,'portable-face-surface-validation.json'),JSON.stringify(report,null,2)+'\n');
