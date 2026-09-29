/** Verify this male-only revision and merge only male download records. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const root=process.cwd();
const pass=path.join(root,'assets-src/avatars/complete-pair-study/hair-likeness-20260921');
const folder=path.join(pass,'male-rear-transition-20260926');
const names=new Set(['Complete scalp','Polished male rooted hairline','Luxury retained swept groom']);
const mapping=JSON.parse(fs.readFileSync(path.join(pass,'male-vertex-mapping.json'),'utf8'));
const output=path.join(root,'public/assets/avatars/complete-pair');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hash=b=>createHash('sha256').update(b).digest('hex');
const arrayHash=a=>hash(new Uint8Array(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength));
function retained(doc) {
  const r=doc.getRoot(), changed=new Set(), coloredPrimitives=new Set();
  for (const node of r.listNodes()) if(names.has(node.getName()))
    for(const p of node.getMesh().listPrimitives()) {
      coloredPrimitives.add(p);
      for(const s of ['COLOR_0']) if(p.getAttribute(s)) changed.add(p.getAttribute(s));
    }
  return {
    accessors:r.listAccessors().filter(a=>!changed.has(a)).map(a=>[a.getType(),a.getNormalized(),arrayHash(a)]).sort(),
    nodes:r.listNodes().map(n=>[n.getName(),n.getMatrix(),n.getWeights(),n.getExtras(),n.getMesh()?.getName(),n.getSkin()?.getName(),n.listChildren().map(c=>c.getName())]),
    skins:r.listSkins().map(s=>[s.getName(),s.listJoints().map(j=>j.getName())]),
    meshes:r.listMeshes().map(m=>[m.getName(),m.getExtras(),m.listPrimitives().map(p=>[p.listSemantics().filter(s=>!(coloredPrimitives.has(p)&&s==='COLOR_0')),p.getMaterial()?.getName(),p.listTargets().map(t=>t.listSemantics())])]),
    materials:r.listMaterials().map(m=>[m.getName(),m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor(),m.getAlphaMode(),m.getAlphaCutoff(),m.getDoubleSided(),m.getNormalScale(),m.getExtension('KHR_materials_specular')?.getSpecularFactor()]),
    textures:r.listTextures().map(t=>[t.getName(),hash(t.getImage())]),
    animations:r.listAnimations().map(a=>[a.getName(),a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath(),c.getSampler().getInterpolation()])])
  };
}
const native=JSON.parse(fs.readFileSync(path.join(folder,'native-checks.json'),'utf8'));
assert.equal(native.exactGeometryMeshes,43);
assert(native.originalMaterialsUVsWeightsMorphsTransformsAndColorsExact);
assert(native.nativeShaderFactorsMatchGltfVertexFactors);
const motion=JSON.parse(fs.readFileSync(path.join(pass,'male-motion-validation.json'),'utf8'));
assert.equal(motion.movementSamples,27);
const portable=JSON.parse(fs.readFileSync(path.join(pass,'male-portable-validation.json'),'utf8'));
const entries={}, report={};
for (const suffix of ['', '-lod1', '-lod2']) {
  const name=`male${suffix}.glb`, destination=path.join(output,name);
  const bytes=fs.readFileSync(destination);
  assert.equal(portable[name].sha256,hash(bytes)); assert.equal(portable[name].gltfErrors,0);
  const before=await io.read(path.join(folder,'before',name));
  const after=await io.read(destination);
  assert.deepEqual(retained(after),retained(before),`${name}: data outside the three vertex-color arrays changed`);
  let verifiedColorVertices=0;
  for(const n of after.getRoot().listNodes()) if(names.has(n.getName())) {
    const expected=mapping[n.getName()],lookup=new Map();
    for(let i=0;i<expected.after.length;i++) {
      const key=expected.after[i].map(Math.fround).join(',');
      if(!lookup.has(key))lookup.set(key,[]);
      lookup.get(key).push(expected.addedColors[i]);
    }
    for(const p of n.getMesh().listPrimitives()) {
      const pos=p.getAttribute('POSITION'),colors=p.getAttribute('COLOR_0');
      assert(colors&&colors.getType()==='VEC4'&&colors.getCount()===pos.getCount());
      for(let i=0;i<pos.getCount();i++) {
        const variants=lookup.get(pos.getElement(i,[]).join(','));
        const actual=colors.getElement(i,[]);
        assert(variants?.some(v=>v.every((x,j)=>Math.abs(x-actual[j])<1e-7)),`${name}: vertex factor does not match Blender`);
        verifiedColorVertices++;
      }
    }
  }
  assert.notEqual(hash(bytes),hash(fs.readFileSync(path.join(folder,'before',name))));
  const compressed=gzipSync(bytes,{level:9}); assert(gunzipSync(compressed).equals(bytes));
  fs.writeFileSync(destination+'.gz',compressed);
  entries[name]={bytes:bytes.length,gzipBytes:compressed.length,sha256:hash(bytes)};
  report[name]={...entries[name],gltfErrors:0,verifiedColorVertices,allGeometryAndOriginalAttributesExact:true,retainedOutfitRigAnimationMaterialsTexturesUVsWeights:true,gzipRoundtrip:true};
  console.log(name,'verified and compressed');
}
// Read at the last possible moment: the original chat owns the female entries.
const manifest=path.join(root,'src/player/completeAvatarDownloads.json');
let written=false;
for(let attempt=0;attempt<5&&!written;attempt++) {
  const fresh=fs.readFileSync(manifest,'utf8');
  const merged={...JSON.parse(fresh),...entries};
  const temp=manifest+`.male-${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(merged,null,2)+'\n');
  if(fs.readFileSync(manifest,'utf8')!==fresh){fs.unlinkSync(temp);continue;}
  fs.renameSync(temp,manifest);written=true;
}
assert(written,'Concurrent manifest update; rerun delivery to merge male entries');
fs.copyFileSync(path.join(pass,'male-hair-refined.blend'),path.join(pass,'../male-runtime.blend'));
for(const name of ['male-native-validation.json','male-motion-validation.json','male-portable-validation.json'])
  fs.copyFileSync(path.join(pass,name),path.join(folder,name));
fs.writeFileSync(path.join(folder,'delivery-verification.json'),JSON.stringify({assets:report,nativeSourceSha256:hash(fs.readFileSync(path.join(pass,'male-hair-refined.blend'))),manifestUpdate:'male entries only'},null,2)+'\n');
console.log('MALE_DELIVERY_VERIFIED');
