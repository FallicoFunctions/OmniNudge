/** Check that the authored shell and hood coating survives all detail levels. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';
const study=new URL('../../assets-src/avatars/complete-pair-study/',import.meta.url);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report={};const heroOnly=process.argv.includes('--hero-only');
const settings=JSON.parse(await fs.readFile(new URL('visual-reference-pass-20260911/surface-parameters.json',study),'utf8')).female;
async function compare(texture,file,channel=null){
  assert(texture,`Missing ${file}`);
  let pipeline=sharp(Buffer.from(texture.getImage()));
  pipeline=channel===null?pipeline.removeAlpha():pipeline.extractChannel(channel);
  const actual=await pipeline.raw().toBuffer({resolveWithObject:true});
  let expected=sharp(await fs.readFile(new URL(file,study))).resize(actual.info.width,actual.info.height);
  expected=channel===null?expected.removeAlpha():expected.extractChannel(0);
  const bytes=await expected.raw().toBuffer();assert.equal(bytes.length,actual.data.length);
  const errors=Float32Array.from(actual.data,(v,i)=>Math.abs(v-bytes[i])/255).sort();
  const mean=errors.reduce((a,b)=>a+b,0)/errors.length,p99=errors[Math.floor(errors.length*.99)];
  assert(mean<.02&&p99<.065,`${file}: material image changed (${mean}, ${p99})`);
  return {size:[actual.info.width,actual.info.height],meanAbsoluteError:mean,p99AbsoluteError:p99};
}
for(const level of heroOnly?[0]:[0,1,2]){
  const name='female'+(level?`-lod${level}`:'');const bytes=await fs.readFile(new URL(`../../public/assets/avatars/complete-pair/${name}.glb`,import.meta.url));const doc=await io.readBinary(bytes);const rows={};
  for(const [nodeName,label] of [['Structured armhole jacket','coat'],['PLURR folded hood','hood']]){
    const node=doc.getRoot().listNodes().find(n=>n.getName()===nodeName);assert(node,nodeName);
    const primitives=node.getMesh().listPrimitives();assert.equal(primitives.length,1,nodeName);
    const mat=primitives[0].getMaterial();assert.equal(mat.getExtras().launchPolymerFinish,true);
    const revised=!!mat.getExtras().launchReferenceSurfaceFinish,part=label==='coat'?'jacket':label;
    const substrate=mat.getExtras().launchTransmission?'transmission':'foil',shellMetal=revised?settings.jacketMetallic:substrate==='transmission'?.12:.48;
    if(mat.getMetallicRoughnessTexture())assert.equal(mat.getMetallicFactor(),1);
    else {assert.equal(label,'hood');assert(Math.abs(mat.getMetallicFactor()-shellMetal)<.005);assert(Math.abs(mat.getRoughnessFactor()-(revised?settings.jacketRoughness:.23))<.005);}
    assert.deepEqual(mat.getBaseColorFactor(),[1,1,1,1]);
    const coat=mat.getExtension('KHR_materials_clearcoat');const film=mat.getExtension('KHR_materials_iridescence');assert(coat&&film);
    assert.equal(coat.getClearcoatFactor(),1);assert(Math.abs(coat.getClearcoatRoughnessFactor()-.10)<1e-6);
    assert.equal(film.getIridescenceFactor(),1);assert.equal(film.getIridescenceIOR(),revised?settings.filmIOR:1.65);
    assert.equal(film.getIridescenceThicknessMinimum(),revised?settings.filmMinimumNm:270);assert.equal(film.getIridescenceThicknessMaximum(),revised?settings.filmMaximumNm:650);
    if(mat.getMetallicRoughnessTexture())assert.equal(mat.getBaseColorTextureInfo().getTexCoord(),mat.getMetallicRoughnessTextureInfo().getTexCoord());
    assert.equal(mat.getBaseColorTextureInfo().getTexCoord(),coat.getClearcoatTextureInfo().getTexCoord());
    rows[nodeName]={color:await compare(mat.getBaseColorTexture(),revised?`female-reference-${part}-color.png`:`female-${substrate}-${label}-color.png`),metallic:mat.getMetallicRoughnessTexture()?await compare(mat.getMetallicRoughnessTexture(),revised?`female-reference-${part}-metallic.png`:`female-${substrate}-${label}-metal.png`,2):{constant:mat.getMetallicFactor(),expected:shellMetal},clearcoat:await compare(coat.getClearcoatTexture(),revised?`female-reference-${part}-coat.png`:`female-foil-${label}-coat.png`,0),filmRangeNm:[film.getIridescenceThicknessMinimum(),film.getIridescenceThicknessMaximum()],normalTexture:!!mat.getNormalTexture()};
    if(revised)rows[nodeName].film=await compare(film.getIridescenceThicknessTexture(),`female-reference-${part}-film.png`);
    if(level<2)assert(mat.getNormalTexture());
  }
  report[name]={sha256:createHash('sha256').update(bytes).digest('hex'),materials:rows};
}
await fs.writeFile(new URL(heroOnly?'foil-runtime-hero-validation.json':'foil-runtime-validation.json',study),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
