/** Verify thin-sheet transmission and opaque trim in every portable detail. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
const study=new URL('../../assets-src/avatars/complete-pair-study/',import.meta.url);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),report={};
const settings=JSON.parse(await fs.readFile(new URL('visual-reference-pass-20260911/surface-parameters.json',study),'utf8')).female;
for(const level of process.argv.includes('--hero-only')?[0]:[0,1,2]){
  const name=`female${level?`-lod${level}`:''}`;
  const bytes=await fs.readFile(new URL(`../../public/assets/avatars/complete-pair/${name}.glb`,import.meta.url));
  const doc=await io.readBinary(bytes),materials={};
  for(const [nodeName,label,value] of [['Structured armhole jacket','coat',.85],['PLURR folded hood','hood',.70]]){
    const node=doc.getRoot().listNodes().find(n=>n.getName()===nodeName),mat=node.getMesh().listPrimitives()[0].getMaterial();
    assert.equal(mat.getExtras().launchTransmission,true);assert.equal(mat.getAlphaMode(),'OPAQUE');
    assert.equal(mat.getBaseColorFactor()[3],1);assert.equal(mat.getExtension('KHR_materials_volume'),null);
    const transmission=mat.getExtension('KHR_materials_transmission');assert(transmission);
    const texture=transmission.getTransmissionTexture();
    if(!texture){
      assert.equal(label,'hood');assert(Math.abs(transmission.getTransmissionFactor()-value)<.005);
      materials[nodeName]={constant:transmission.getTransmissionFactor(),expected:value};continue;
    }
    assert.equal(transmission.getTransmissionFactor(),1);
    assert.equal(transmission.getTransmissionTextureInfo().getTexCoord(),mat.getBaseColorTextureInfo().getTexCoord());
    const actual=await sharp(Buffer.from(texture.getImage())).extractChannel(0).raw().toBuffer({resolveWithObject:true});
    const revised=!!mat.getExtras().launchReferenceSurfaceFinish;
    const source=revised?`female-reference-${label==='coat'?'jacket':label}-transmission.png`:`female-transmission-${label}.png`;
    const expected=await sharp(await fs.readFile(new URL(source,study))).resize(actual.info.width,actual.info.height).extractChannel(0).raw().toBuffer();
    assert.equal(actual.data.length,expected.length);
    const errors=Float32Array.from(actual.data,(v,i)=>Math.abs(v-expected[i])/255).sort();
    const mean=errors.reduce((a,b)=>a+b,0)/errors.length,p99=errors[Math.floor(errors.length*.99)];
    assert(mean<.02&&p99<.065,`${name} ${label}: transmission changed (${mean}, ${p99})`);
    let trim=0,leaks=0,shell=0;
    for(let i=0;i<expected.length;i++){
      if(expected[i]===0){trim++;if(actual.data[i]>20)leaks++;}
      if(expected[i]>(revised?settings.jacketTransmission*255*.95:200))shell++;
    }
    if(label==='coat'){assert(trim>100);assert(shell>1000);assert.equal(leaks,0,'Opaque knit has transmission leaks');}
    materials[nodeName]={size:[actual.info.width,actual.info.height],meanAbsoluteError:mean,p99AbsoluteError:p99,opaqueTexels:trim,opaqueTexelsOver008:leaks,shellTexels:shell};
  }
  report[name]={sha256:createHash('sha256').update(bytes).digest('hex'),thinSheet:true,materials};
}
await fs.writeFile(new URL(process.argv.includes('--hero-only')?'transmission-runtime-hero-validation.json':'transmission-runtime-validation.json',study),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
