/** Verify that portable trim roughness and film masks survive all six GLBs. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';

const study=new URL('../../assets-src/avatars/complete-pair-study/',import.meta.url);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report={};
for(const sex of ['male','female'])for(const level of [0,1,2]){
  const name=sex+(level?`-lod${level}`:'');
  const bytes=await fs.readFile(new URL(`../../public/assets/avatars/complete-pair/${name}.glb`,import.meta.url));
  const doc=await io.readBinary(bytes);const node=doc.getRoot().listNodes().find(n=>n.getName()==='Structured armhole jacket');
  assert.equal(node.getExtras().knitFinish,'continuous-rest-mask-v1');
  assert.equal(node.getMesh().listPrimitives().length,1,`${name}: split knit material`);
  const mat=node.getMesh().listPrimitives()[0].getMaterial();const tex=mat.getMetallicRoughnessTexture();assert(tex);
  assert.equal(mat.getRoughnessFactor(),1);
  const tc=mat.getMetallicRoughnessTextureInfo().getTexCoord();assert.equal(tc,mat.getBaseColorTextureInfo().getTexCoord());
  const actual=await sharp(Buffer.from(tex.getImage())).extractChannel(1).raw().toBuffer({resolveWithObject:true});
  const source=mat.getExtras().launchReferenceSurfaceFinish?`${sex}-reference-jacket-roughness.png`:`${sex}-knit-roughness.png`;
  const expected=await sharp(await fs.readFile(new URL(source,study))).resize(actual.info.width,actual.info.height).extractChannel(0).raw().toBuffer();
  assert.equal(actual.data.length,expected.length);
  const errors=Float32Array.from(actual.data,(v,i)=>Math.abs(v-expected[i])/255);errors.sort();
  const mean=errors.reduce((a,b)=>a+b,0)/errors.length,p99=errors[Math.floor(errors.length*.99)];
  assert(mean<.015&&p99<.04,`${name}: roughness differs from native bake (${mean}, ${p99})`);
  let coverage=null;
  if(sex==='female'){
    const film=mat.getExtension('KHR_materials_iridescence');assert(film);
    assert.equal(film.getIridescenceTexture(),film.getIridescenceThicknessTexture());
    assert.equal(film.getIridescenceTextureInfo().getTexCoord(),tc);
    const image=await sharp(Buffer.from(film.getIridescenceTexture().getImage())).extractChannel(0).raw().toBuffer();
    const knit=image.filter(v=>v<10).length,foil=image.filter(v=>v>245).length;
    assert(knit>100&&foil>100,`${name}: film must include both uncoated knit and coated foil`);
    coverage={knitTexels:knit,foilTexels:foil};
  }
  report[name]={sha256:createHash('sha256').update(bytes).digest('hex'),roughnessSize:[actual.info.width,actual.info.height],roughnessMeanAbsoluteError:mean,roughness99PercentileError:p99,filmCoverage:coverage};
}
await fs.writeFile(new URL('knit-runtime-validation.json',study),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
