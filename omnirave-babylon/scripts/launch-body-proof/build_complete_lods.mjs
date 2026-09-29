import { repairDegenerateTangents } from './repair_complete_tangents.mjs';
/** Offline distance meshes retain the original rig and garment corrective channels. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, palette, simplifyPrimitive, textureCompress, weld, unweld, tangents, joinPrimitives } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { validateBytes } from 'gltf-validator';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const publicDir=path.join(root,'public/assets/avatars/complete-pair');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const report={};
const { generateTangents }=createRequire(import.meta.url)('mikktspace');

function mergeRigidPanels(document) {
  const groups=new Map();
  const root=document.getRoot();
  const animated=new Set(root.listAnimations().flatMap(a=>a.listChannels().map(c=>c.getTargetNode())));
  for(const node of root.listNodes()){
    const mesh=node.getMesh();
    if(!mesh || animated.has(node) || mesh.listPrimitives().some(p=>p.listTargets().length))continue;
    for(const primitive of mesh.listPrimitives()){
      const key=JSON.stringify([root.listSkins().indexOf(node.getSkin()),root.listNodes().indexOf(node.getParentNode()),node.getMatrix(),node.getExtras().avatarSlot,root.listMaterials().indexOf(primitive.getMaterial()),primitive.listSemantics().sort().map(s=>[s,primitive.getAttribute(s).getType(),primitive.getAttribute(s).getComponentType(),primitive.getAttribute(s).getNormalized()])]);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push({node,mesh,primitive});
    }
  }
  for(const rows of groups.values()){
    if(rows.length<2)continue;
    const joined=joinPrimitives(rows.map(r=>r.primitive));
    rows[0].mesh.addPrimitive(joined);
    for(const {mesh,primitive} of rows){mesh.removePrimitive(primitive);primitive.dispose();}
    for(const {node,mesh} of rows)if(!mesh.listPrimitives().length)node.setMesh(null).setSkin(null);
  }
}


function thinStrands(document, primitive, every) {
  const position=primitive.getAttribute('POSITION');
  const index=primitive.getIndices();
  if(!index)return;
  const ids=index.getArray();
  const parent=new Int32Array(position.getCount());
  for(let i=0;i<parent.length;i++)parent[i]=i;
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<ids.length;i+=3){parent[find(ids[i+1])]=find(ids[i]);parent[find(ids[i+2])]=find(ids[i]);}
  const component=new Map();let count=0;
  for(let i=0;i<parent.length;i++){const key=find(i);if(!component.has(key))component.set(key,count++);}
  // Solid scalp shells are never removed. A strand primitive has many islands.
  if(count<30)return;
  const selected=[];
  for(let i=0;i<ids.length;i+=3)if(component.get(find(ids[i]))%every===0)selected.push(ids[i],ids[i+1],ids[i+2]);
  primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(selected)));
  compactPrimitive(primitive);
}

function thinMainZipperTeeth(document, node, primitive, every) {
  // Recover actual connected pieces across the normal/atlas UV splits.
  // Only small, closed tooth meshes are thinned; backing and end stops stay.
  const position=primitive.getAttribute('POSITION'), values=position.getArray(), ids=primitive.getIndices().getArray();
  const parent=Int32Array.from({length:position.getCount()},(_,i)=>i), canonical=new Map(), vertex=new Int32Array(position.getCount());
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<vertex.length;i++){
    const key=`${values[i*3]},${values[i*3+1]},${values[i*3+2]}`;
    if(!canonical.has(key))canonical.set(key,i);vertex[i]=canonical.get(key);
  }
  for(let i=0;i<ids.length;i+=3){const a=find(vertex[ids[i]]);parent[find(vertex[ids[i+1]])]=a;parent[find(vertex[ids[i+2]])]=a;}
  const pieces=new Map();
  for(const i of canonical.values()){
    const key=find(i);if(!pieces.has(key))pieces.set(key,{key,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],vertices:0});
    const p=pieces.get(key);p.vertices++;
    for(let j=0;j<3;j++){p.min[j]=Math.min(p.min[j],values[i*3+j]);p.max[j]=Math.max(p.max[j],values[i*3+j]);}
  }
  const teeth=[...pieces.values()].filter(p=>p.vertices===32&&Math.hypot(...p.max.map((x,i)=>x-p.min[i]))<.004);
  const authored=JSON.parse(node.getExtras().attachmentComponents).filter(c=>c.kind==='tooth').length;
  assert.equal(teeth.length,authored,'Main zipper tooth geometry does not match its authored components');
  const removed=new Set();
  for(const sign of [-1,1]){
    const row=teeth.filter(p=>Math.sign(p.min[0]+p.max[0])===sign).sort((a,b)=>(a.min[1]+a.max[1])-(b.min[1]+b.max[1]));
    assert(row.length>100);
    row.forEach((p,i)=>{if(i%every!==0&&i!==row.length-1)removed.add(p.key);});
  }
  // Exported coordinates are Y-up, with the garment front toward +Z.
  const toothKeys=new Set(teeth.map(p=>p.key)), caps=new Map();
  const faceNormal=i=>{
    const a=ids[i]*3,b=ids[i+1]*3,c=ids[i+2]*3;
    const ab=[values[b]-values[a],values[b+1]-values[a+1],values[b+2]-values[a+2]], ac=[values[c]-values[a],values[c+1]-values[a+1],values[c+2]-values[a+2]];
    return [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  };
  for(let i=0;i<ids.length;i+=3){
    const key=find(vertex[ids[i]]);if(!toothKeys.has(key)||removed.has(key))continue;
    const n=faceNormal(i),area=Math.hypot(...n);
    if(n[2]>area*.1&&(!caps.has(key)||caps.get(key).area<area))caps.set(key,{area,normal:n.map(x=>x/area)});
  }
  assert.equal(caps.size,teeth.length-removed.size);
  const capCandidates=new Map();
  for(let i=0;i<ids.length;i+=3){
    const key=find(vertex[ids[i]]);if(!caps.has(key))continue;
    const n=faceNormal(i),area=Math.hypot(...n),normal=caps.get(key).normal;
    if(!capCandidates.has(key))capCandidates.set(key,[]);
    capCandidates.get(key).push({face:i,cosine:n.reduce((sum,x,j)=>sum+x*normal[j],0)/area});
  }
  const capFaces=new Set();let minimumCapCoherence=1;
  for(const list of capCandidates.values()){
    // Binding can gently warp a cap. Recover its six-triangle fan through
    // connectivity and normal coherence instead of a strict plane threshold.
    const incident=new Map();
    for(const {face} of list)for(let j=0;j<3;j++){const v=vertex[ids[face+j]];if(!incident.has(v))incident.set(v,[]);incident.get(v).push(face);}
    let best;
    for(const [anchor,star] of incident){
      if(star.length!==9)continue;
      const other=face=>[vertex[ids[face]],vertex[ids[face+1]],vertex[ids[face+2]]].filter(v=>v!==anchor);
      const adjacent=new Map(star.map(face=>[face,star.filter(f=>f!==face&&other(face).some(v=>other(f).includes(v)))]));
      if([...adjacent.values()].some(a=>a.length!==2))continue;
      const order=[star[0]];let previous=-1;
      while(order.length<9){const current=order.at(-1),next=adjacent.get(current).find(f=>f!==previous);if(order.includes(next))break;order.push(next);previous=current;}
      if(order.length!==9)continue;
      for(let start=0;start<9;start++){
        const faces=Array.from({length:6},(_,i)=>order[(start+i)%9]);
        const normals=faces.map(face=>{const n=faceNormal(face),size=Math.hypot(...n);return n.map(x=>x/size);});
        const mean=[0,1,2].map(j=>normals.reduce((sum,n)=>sum+n[j],0));const length=Math.hypot(...mean);mean.forEach((x,j)=>mean[j]=x/length);
        if(mean[2]<.1)continue;
        const coherence=Math.min(...normals.map(n=>n.reduce((sum,x,j)=>sum+x*mean[j],0)));
        if(!best||coherence>best.coherence)best={faces,coherence};
      }
    }
    assert(best&&best.coherence>.8,'A retained tooth needs a coherent front fan');
    minimumCapCoherence=Math.min(minimumCapCoherence,best.coherence);
    const vertices=new Set(best.faces.flatMap(face=>[vertex[ids[face]],vertex[ids[face+1]],vertex[ids[face+2]]]));
    assert.equal(vertices.size,8);best.faces.forEach(face=>capFaces.add(face));
  }
  const selected=[],capTriangles=new Map();let removedTriangles=0,flattenedFaces=0,tapeFaces=0;
  for(let i=0;i<ids.length;i+=3){
    const key=find(vertex[ids[i]]);
    if(removed.has(key)){removedTriangles++;continue;}
    const n=faceNormal(i),area=Math.hypot(...n);let retain=true;
    if(caps.has(key)){
      retain=capFaces.has(i);
      if(retain)capTriangles.set(key,(capTriangles.get(key)??0)+1);
    }else if(pieces.get(key).vertices>32){
      // Subpixel tape thickness and tooth sidewalls do not affect the distant
      // silhouette. Keep the original visible surface and its exact skin/morph
      // data; the existing double-sided material supplies its reverse face.
      retain=n[2]>0;if(retain)tapeFaces++;
    }
    if(retain)selected.push(ids[i],ids[i+1],ids[i+2]);else flattenedFaces++;
  }
  assert.equal(removedTriangles,removed.size*60,'Thinning must remove complete 60-triangle teeth');
  assert.equal(capTriangles.size,caps.size);assert([...capTriangles.values()].every(count=>count===6),JSON.stringify([...capTriangles].filter(([key,count])=>count!==6).slice(0,6).map(([key,count])=>({count,piece:pieces.get(key),cap:caps.get(key)}))));
  assert(tapeFaces>1000);assert(primitive.getMaterial().getDoubleSided());
  const targets=primitive.listTargets().length;assert.equal(targets,14);
  primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(selected)));
  compactPrimitive(primitive);assert.equal(primitive.listTargets().length,targets);
  const result={sourceTeeth:teeth.length,retainedTeeth:teeth.length-removed.size,every,removedTriangles,flattenedFaces,minimumCapCoherence,retainedToothTriangles:[...capTriangles.values()].reduce((a,b)=>a+b,0),tapeSurface:"original front surface with double-sided material"};
  node.setExtras({...node.getExtras(),distanceZipperTeeth:result});return result;
}

function mergeJacketDetails(document) {
  const r=document.getRoot(), nodes=r.listNodes().filter(n=>n.getExtras().jacketFinishAttachment);
  assert.equal(nodes.length,8);const groups=new Map();
  for(const node of nodes){
    const mesh=node.getMesh();assert.equal(mesh.listPrimitives().length,1);
    const primitive=mesh.listPrimitives()[0], key=r.listMaterials().indexOf(primitive.getMaterial());
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({node,mesh,primitive});
  }
  assert.deepEqual([...groups.values()].map(g=>g.length).sort(),[4,4]);
  const result=[];
  for(const rows of groups.values()){
    const first=rows[0], semantics=first.primitive.listSemantics().sort(), targets=first.primitive.listTargets().length;
    assert.equal(targets,14);
    for(const row of rows){
      assert.equal(row.node.getParentNode(),first.node.getParentNode());assert.equal(row.node.getSkin(),first.node.getSkin());
      assert.deepEqual(row.node.getMatrix(),first.node.getMatrix());assert.deepEqual(row.node.getWeights(),first.node.getWeights());
      assert.deepEqual(row.mesh.getExtras().targetNames,first.mesh.getExtras().targetNames);
      assert.deepEqual(row.primitive.listSemantics().sort(),semantics);assert.equal(row.primitive.listTargets().length,targets);
      assert.equal(row.primitive.getMode(),4);
    }
    for(const animation of r.listAnimations()){
      const channels=animation.listChannels().filter(c=>c.getTargetNode()===first.node);
      assert.equal(channels.length,1);assert.equal(channels[0].getTargetPath(),'weights');const reference=channels[0].getSampler();
      for(const row of rows.slice(1)){
        const channels=animation.listChannels().filter(c=>c.getTargetNode()===row.node);
        assert.equal(channels.length,1);assert.equal(channels[0].getTargetPath(),'weights');const sampler=channels[0].getSampler();
        assert.equal(sampler.getInterpolation(),reference.getInterpolation());
        assert.deepEqual(sampler.getInput().getArray(),reference.getInput().getArray());
        assert.deepEqual(sampler.getOutput().getArray(),reference.getOutput().getArray());
        animation.removeChannel(channels[0]);channels[0].dispose();
      }
    }
    const concat=accessors=>{
      const src=accessors[0];
      for(const a of accessors){assert.equal(a.getType(),src.getType());assert.equal(a.getComponentType(),src.getComponentType());assert.equal(a.getNormalized(),src.getNormalized());}
      const data=new (src.getArray().constructor)(accessors.reduce((sum,a)=>sum+a.getArray().length,0));let offset=0;
      for(const a of accessors){data.set(a.getArray(),offset);assert.deepEqual(data.subarray(offset,offset+a.getArray().length),a.getArray());offset+=a.getArray().length;}
      return document.createAccessor().setType(src.getType()).setNormalized(src.getNormalized()).setArray(data).setBuffer(r.listBuffers()[0]);
    };
    const joined=document.createPrimitive().setMode(4).setMaterial(first.primitive.getMaterial());
    for(const name of semantics)joined.setAttribute(name,concat(rows.map(row=>row.primitive.getAttribute(name))));
    for(let i=0;i<targets;i++){
      const names=first.primitive.listTargets()[i].listSemantics().sort(), target=document.createPrimitiveTarget();
      for(const row of rows)assert.deepEqual(row.primitive.listTargets()[i].listSemantics().sort(),names);
      for(const name of names)target.setAttribute(name,concat(rows.map(row=>row.primitive.listTargets()[i].getAttribute(name))));
      joined.addTarget(target);
    }
    const indices=[];let offset=0;
    for(const row of rows){for(const index of row.primitive.getIndices().getArray())indices.push(index+offset);offset+=row.primitive.getAttribute('POSITION').getCount();}
    joined.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(r.listBuffers()[0]));
    assert.equal(indices.length,rows.reduce((sum,row)=>sum+row.primitive.getIndices().getCount(),0));
    first.mesh.removePrimitive(first.primitive);first.mesh.addPrimitive(joined);
    const names=rows.map(row=>row.node.getName());
    first.node.setExtras({...first.node.getExtras(),distanceJacketMembers:names});
    for(const row of rows.slice(1))row.node.dispose();
    for(const row of rows)row.primitive.dispose();
    result.push({members:names,drawCallsBefore:rows.length,drawCallsAfter:1,vertices:offset,triangles:indices.length/3,correctives:targets,attributeAndMorphConcatenation:'bit-identical',animationSamplerEquivalence:'exact across all three clips'});
  }
  return result;
}

function checkAnimations(document, label) {
  const r=document.getRoot();
  if(r.listSkins().length!==1||r.listSkins()[0].listJoints().length!==56)throw new Error(`${label}: changed skeleton`);
  if(r.listAnimations().map(a=>a.getName()).sort().join()!=='idle,run,walk')throw new Error(`${label}: missing clips`);
  for(const animation of r.listAnimations()){
    for(const node of r.listNodes().filter(n=>n.getMesh()?.listPrimitives().some(p=>p.listTargets().length))){
      const names = node.getMesh().getExtras().targetNames ?? [];
      if (names.length && names.every(name => /^(Expression_|Secondary_)/.test(name))) continue;
      if(!animation.listChannels().some(c=>c.getTargetNode()===node&&c.getTargetPath()==='weights'))throw new Error(`${label}: missing corrective`);
    }
  }
}

for(const sex of ['male','female']){
  for(const level of [1,2]){
    const document=await io.read(path.join(publicDir,`${sex}.glb`));
    const r=document.getRoot();
    const before=r.listMeshes().flatMap(m=>m.listPrimitives()).reduce((s,p)=>s+p.getIndices().getCount()/3,0);
    await document.transform(weld());
    let zipperTeeth;
    for(const node of r.listNodes()){
      const mesh=node.getMesh();if(!mesh)continue;
      const slot=node.getExtras().avatarSlot;
      for(const primitive of mesh.listPrimitives()){
        if(node.getName()==='Jacket detail - main zipper tracks')zipperTeeth=thinMainZipperTeeth(document,node,primitive,level===1?4:8);
        const hair=slot==='hair';
        const gatheredJacket=node.getName()==='Structured armhole jacket';
        if(hair&&level===2&&/groom|strands|flyaways|hairline/i.test(mesh.getName()))thinStrands(document,primitive,3);
        const ratio=hair?(level===1?.25:.09):slot==='body'?(level===1?.62:.28):gatheredJacket?(level===1?.20:.08):(level===1?.48:.20);
        const error=slot==='body'?(level===1?.0008:.003):hair?(level===1?.01:.035):gatheredJacket?(level===1?.0035:.009):(level===1?.0025:.007);
        simplifyPrimitive(primitive,{simplifier:MeshoptSimplifier,ratio,error,lockBorder:slot==='body'});
      }
      node.setExtras({...node.getExtras(),avatarDetailLevel:level});
    }
    // Reuse equivalent materials and packed scalar colors where possible.
    await document.transform(palette({min:3}),dedup(),prune({keepLeaves:true}));
    mergeRigidPanels(document);
    const jacketMerges=mergeJacketDetails(document);
    if(level===1)await document.transform(unweld(),tangents({generateTangents,overwrite:true}),weld());
    if(level===2)for(const material of r.listMaterials())material.setNormalTexture(null);
    const hardwareAtlases = r.listTextures().filter(t=>t.getExtras().jacketConstantAtlas).map(t=>({texture:t,image:Buffer.from(t.getImage())}));
    assert.equal(hardwareAtlases.length,2,`${sex}-lod${level}: missing hardware atlases`);
    // Chroma compression can change the independently authored roughness and
    // film-coverage channels at a knit seam. Keep these small scalar maps
    // lossless after resizing while color/normal textures use the usual path.
    const knitMaterials=r.listNodes().filter(n=>n.getExtras().knitFinish).flatMap(n=>n.getMesh().listPrimitives().map(p=>p.getMaterial()));
    const knitScalars=[...new Set(knitMaterials.flatMap(m=>[m.getMetallicRoughnessTexture(),m.getExtension('KHR_materials_clearcoat')?.getClearcoatTexture(),m.getExtension('KHR_materials_iridescence')?.getIridescenceTexture(),m.getExtension('KHR_materials_transmission')?.getTransmissionTexture()]).filter(Boolean))].map(texture=>({texture,image:Buffer.from(texture.getImage())}));
    for(const {texture} of knitScalars)texture.setName(`Knit scalar - ${texture.getName()}`);
    // Repeated lossy encoding discolors the pale film beside small UV islands.
    const polymerColors=[...new Set(r.listMaterials().filter(m=>m.getExtras().launchPolymerFinish).map(m=>m.getBaseColorTexture()).filter(Boolean))].map(texture=>({texture,image:Buffer.from(texture.getImage())}));
    for(const {texture} of polymerColors)texture.setName(`Polymer color - ${texture.getName()}`);
    await document.transform(textureCompress({encoder:sharp,pattern:/^(?!Jacket hardware|Knit scalar|Polymer color).+/,targetFormat:'webp',resize:level===1?[1024,1024]:[512,512],quality:level===1?88:82}),prune({keepLeaves:true}));
    for(const {texture,image} of [...knitScalars,...polymerColors]){
      const size=level===1?1024:512;
      texture.setImage(await sharp(image).resize(size,size,{fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toBuffer()).setMimeType('image/webp');
    }
    for(const {texture,image} of hardwareAtlases){
      assert.equal(texture.getMimeType(),'image/png');
      assert(Buffer.from(texture.getImage()).equals(image),`${sex}-lod${level}: hardware atlas changed`);
    }
    const tangentFallbackVertices = repairDegenerateTangents(document, `${sex}-lod${level}`);
    checkAnimations(document,`${sex}-lod${level}`);
    const bytes=await io.writeBinary(document);
    const validation=await validateBytes(bytes,{maxIssues:2000});
    if(validation.issues.numErrors)throw new Error(`${sex} LOD ${level}: ${JSON.stringify(validation.issues)}`);
    const asset=path.join(publicDir,`${sex}-lod${level}.glb`);await fs.writeFile(asset,bytes);
    const triangles=r.listMeshes().flatMap(m=>m.listPrimitives()).reduce((s,p)=>s+p.getIndices().getCount()/3,0);
    report[`${sex}-lod${level}`]={zipperTeeth,jacketMerges,asset:path.relative(root,asset),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles,sourceTriangles:before,reductionPercent:100*(1-triangles/before),tangentFallbackVertices,materials:r.listMaterials().length,bones:56,clips:3,gltfErrors:validation.issues.numErrors,warningCodes:[...new Set(validation.issues.messages.filter(m=>m.severity===1).map(m=>m.code))]};
    console.log(JSON.stringify(report[`${sex}-lod${level}`]));
  }
}
await fs.writeFile(path.join(root,'assets-src/avatars/complete-pair-study/lod-validation.json'),JSON.stringify(report,null,2)+'\n');
