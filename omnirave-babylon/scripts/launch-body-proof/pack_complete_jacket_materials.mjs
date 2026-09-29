/** Pack constant zipper regions without discarding skinning or corrective morphs. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { validateBytes } from 'gltf-validator';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const report={};
const srgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
const descriptor=m=>({name:m.getName(),color:m.getBaseColorFactor(),roughness:m.getRoughnessFactor(),metalness:m.getMetallicFactor(),doubleSided:m.getDoubleSided()});
const topology=d=>d.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount(),0);
const animationDigest=d=>createHash('sha256').update(JSON.stringify(d.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().map(c=>[c.getTargetNode().getName(),c.getTargetPath()]),samplers:a.listSamplers().map(s=>[s.getInterpolation(),Array.from(s.getInput().getArray()),Array.from(s.getOutput().getArray())])})))).digest('hex');
for(const sex of ['male','female']){
  const file=path.join(root,`public/assets/avatars/complete-pair/${sex}.glb`);
  const d=await io.read(file),r=d.getRoot();
  const nodes=r.listNodes().filter(n=>n.getExtras().jacketFinishAttachment&&n.getMesh().listPrimitives().length>1);
  assert.deepEqual(nodes.map(n=>n.getName()).sort(),[
    'Jacket detail - left hip pocket','Jacket detail - right hip pocket',
    'Jacket detail - left sleeve utility pocket','Jacket detail - main zipper tracks',
  ].sort(),`${sex}: expected four unpacked zipper assemblies`);
  const indexCount=topology(d),animationHash=animationDigest(d);
  const mats=[...new Set(nodes.flatMap(n=>n.getMesh().listPrimitives().map(p=>p.getMaterial())))];
  const regions=mats.map(descriptor);
  for(const m of mats){
    assert.equal(m.listExtensions().length,0);
    assert.equal(m.getAlphaMode(),'OPAQUE');assert.equal(m.getBaseColorFactor()[3],1);
    assert.deepEqual(m.getEmissiveFactor(),[0,0,0]);
    for(const getter of ['getBaseColorTexture','getMetallicRoughnessTexture','getNormalTexture','getOcclusionTexture','getEmissiveTexture'])assert.equal(m[getter](),null);
    assert.equal(m.getDoubleSided(),mats[0].getDoubleSided());
  }
  const tile=16,width=tile*mats.length,height=tile;
  const color=Buffer.alloc(width*height*3),mr=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const region=regions[Math.floor(x/tile)],i=(y*width+x)*3;
    for(let c=0;c<3;c++)color[i+c]=Math.round(srgb(region.color[c])*255);
    mr[i]=255;mr[i+1]=Math.round(region.roughness*255);mr[i+2]=Math.round(region.metalness*255);
  }
  const texture=async(name,raw)=>d.createTexture(name).setMimeType('image/png').setImage(await sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer()).setExtras({jacketConstantAtlas:true});
  const mat=d.createMaterial(`${sex} packed jacket hardware`).setBaseColorFactor([1,1,1,1]).setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(mats[0].getDoubleSided()).setBaseColorTexture(await texture('Jacket hardware color atlas',color)).setMetallicRoughnessTexture(await texture('Jacket hardware PBR atlas',mr)).setExtras({jacketMaterialRegions:regions});
  // Constant UVs select tile centers; nearest filtering prevents cross-region mip blending.
  for(const info of [mat.getBaseColorTextureInfo(),mat.getMetallicRoughnessTextureInfo()])info.setMinFilter(9728).setMagFilter(9728);
  const merged=[];
  for(const node of nodes){
    const mesh=node.getMesh(),prims=mesh.listPrimitives(),first=prims[0];
    const semantics=first.listSemantics().sort();assert(!semantics.includes('TEXCOORD_0'));
    const targets=first.listTargets().length;
    for(const p of prims){assert.equal(p.getMode(),4);assert.deepEqual(p.listSemantics().sort(),semantics);assert.equal(p.listTargets().length,targets);assert.equal(p.listExtensions().length,0);}
    const concat=(accessors)=>{
      const src=accessors[0];
      for(const a of accessors){assert.equal(a.getType(),src.getType());assert.equal(a.getNormalized(),src.getNormalized());assert.equal(a.getComponentType(),src.getComponentType());}
      const out=new (src.getArray().constructor)(accessors.reduce((s,a)=>s+a.getArray().length,0));let offset=0;
      for(const a of accessors){out.set(a.getArray(),offset);assert.deepEqual(out.subarray(offset,offset+a.getArray().length),a.getArray());offset+=a.getArray().length;}
      return d.createAccessor().setType(src.getType()).setNormalized(src.getNormalized()).setArray(out).setBuffer(r.listBuffers()[0]);
    };
    const joined=d.createPrimitive().setMode(4).setMaterial(mat);
    for(const s of semantics)joined.setAttribute(s,concat(prims.map(p=>p.getAttribute(s))));
    for(let i=0;i<targets;i++){
      const target=d.createPrimitiveTarget(),ts=first.listTargets()[i].listSemantics().sort();
      for(const p of prims)assert.deepEqual(p.listTargets()[i].listSemantics().sort(),ts);
      for(const s of ts)target.setAttribute(s,concat(prims.map(p=>p.listTargets()[i].getAttribute(s))));
      joined.addTarget(target);
    }
    const indices=[],uv=[];let vertexOffset=0;
    for(const p of prims){
      const count=p.getAttribute('POSITION').getCount(),tileIndex=mats.indexOf(p.getMaterial());
      for(const index of p.getIndices().getArray())indices.push(index+vertexOffset);
      for(let i=0;i<count;i++)uv.push((tileIndex+.5)/mats.length,.5);
      vertexOffset+=count;
    }
    joined.setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(r.listBuffers()[0]));
    joined.setAttribute('TEXCOORD_0',d.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(r.listBuffers()[0]));
    for(const p of prims){mesh.removePrimitive(p);p.dispose();}mesh.addPrimitive(joined);
    node.setExtras({...node.getExtras(),jacketMaterialRegions:regions,jacketMaterialPacking:'constant-atlas-v1'});
    merged.push({name:node.getName(),before:prims.length,after:1,morphTargets:targets,vertices:vertexOffset,indices:indices.length});
  }
  assert.equal(topology(d),indexCount);assert.equal(animationDigest(d),animationHash);
  await d.transform(prune({keepLeaves:true}));
  const bytes=await io.writeBinary(d),reloaded=await io.readBinary(bytes);
  assert.equal(topology(reloaded),indexCount);assert.equal(animationDigest(reloaded),animationHash);
  for(const entry of merged){
    const n=reloaded.getRoot().listNodes().find(n=>n.getName()===entry.name),p=n.getMesh().listPrimitives()[0];
    assert(n.getSkin());assert.equal(p.listTargets().length,entry.morphTargets);assert.equal(p.getAttribute('POSITION').getCount(),entry.vertices);
    for(const semantic of [...semanticsFor(n),'TEXCOORD_0']){
      const original=d.getRoot().listNodes().find(o=>o.getName()===entry.name).getMesh().listPrimitives()[0].getAttribute(semantic);
      assert.deepEqual(p.getAttribute(semantic).getArray(),original.getArray());
    }
    const original=d.getRoot().listNodes().find(o=>o.getName()===entry.name).getMesh().listPrimitives()[0];
    assert.deepEqual(p.getIndices().getArray(),original.getIndices().getArray());
    for(let i=0;i<entry.morphTargets;i++)for(const s of p.listTargets()[i].listSemantics())assert.deepEqual(p.listTargets()[i].getAttribute(s).getArray(),original.listTargets()[i].getAttribute(s).getArray());
  }
  const validation=await validateBytes(bytes,{maxIssues:2000});assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
  await fs.writeFile(file,bytes);
  report[sex]={merged,regions,triangles:indexCount/3,animationHash,attributeAndMorphRoundTrip:'bit-identical',gltfErrors:0,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),quantization:'8-bit sRGB base color; 8-bit linear roughness/metalness',drawCallsSaved:merged.reduce((s,e)=>s+e.before-e.after,0)};
  console.log(JSON.stringify(report[sex]));
}
function semanticsFor(n){return n.getMesh().listPrimitives()[0].listSemantics().filter(s=>s!=='TEXCOORD_0');}
await fs.writeFile(path.join(root,'assets-src/avatars/complete-pair-study/jacket-material-packing.json'),JSON.stringify(report,null,2)+'\n');
