from pathlib import Path
import json,hashlib,gzip,struct,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-head-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-face-contour-validation.json');portable=read(d/'portable-face-contour-validation.json');motion=read(p/'female-motion-validation.json');clearance=read(p/'female-cascade-clearance.json')
assert native['spec']['version']==2 and native['unchangedOtherMeshContracts']==60 and len(native['poses'])==7
assert native['minimumTriangleNormalDot']>.95 and native['minimumTriangleAreaRatio']>.60
assert motion['movementSamples']==27 and len(motion['attachments'])==7 and motion['validatedFaceContour']==native
assert len(clearance['samples'])==31 and clearance['maximumStrandEdgeBodyIntersections']==clearance['maximumStrandEdgeJacketIntersections']==0
assert not read(d/'browser-errors.json')
assert (p/'female-vertex-mapping.json').read_bytes()==(d/'before/female-vertex-mapping.json').read_bytes()
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['build','motion','portable','export','delivery','inspect','cascade']:shutil.copy2('/tmp/female-face-head-'+suffix+'.log',d/(suffix+'.log'))
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json','female-cascade-clearance.json']:shutil.copy2(p/name,d/name)
manifest=read(r/'src/player/completeAvatarDownloads.json');before=read(d/'before/completeAvatarDownloads.json');exports=read(p/'female-portable-validation.json');delivery={};growth={}
for name,entry in manifest.items():
 if not name.startswith('female'):continue
 f=r/'public/assets/avatars/complete-pair'/name;b=f.read_bytes();z=f.with_suffix(f.suffix+'.gz').read_bytes();digest=sha(b)
 assert gzip.decompress(z)==b and entry=={'bytes':len(b),'gzipBytes':len(z),'sha256':digest}
 assert exports[name]['sha256']==digest and exports[name]['gltfErrors']==0
 doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
 assert len(doc['skins'][0]['joints'])==56
 assert not any(n.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for n in doc['nodes'])
 iris=next(m for m in doc['materials'] if m['name']=='Launch female iris')
 assert iris['pbrMetallicRoughness']['baseColorFactor']==native['spec']['irisColorFactor']
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':56,'eyeStudNodesAbsent':True}
 growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
write(d/'delivery-verification.json',delivery)
assert (p.parent/'female-runtime.blend').read_bytes()==(p/'female-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend']=sha((p/'female-hair-refined.blend').read_bytes())
summary['exports']['female']=exports;summary['delivery'].update(delivery);summary['femaleMotionChecks']=motion
summary['femaleCrownAccentContinuation']['nativeSource']='face-head-pass/before/female-hair-refined.blend'
summary['femaleFaceHeadContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Tapered lower jaw and rounded its corners','Shortened and recessed the chin slightly','Reduced nose and lip projection, widened the mouth and softened its corners','Added modest cheek fullness','Warm brown iris shader tint'],
 'nativeValidation':native,'portableValidation':portable,'motionValidation':motion,'cascadeClearanceValidation':clearance,
 'deliveryGrowth':growth,'evidenceDirectory':'face-head-pass/','browserErrors':0,
 'visualAssessment':'The lower face and profile are softer and the eyes now read brown. This improves several proportion differences; full reference likeness remains in progress.',
 'scope':'Seven expression poses, 27 movement samples, seven attachment poses and 31 hanging-hair poses; finite samples do not prove continuous collision freedom.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female face/head pass: neutral, smile, closed smile, curious, run 10 and walk 18; zero browser errors']
summary['femaleBrowserErrors']=0
summary['preserved']='Outfits, rig, weights and locomotion clips retained; two female eye-stud meshes remain absent. Female face/head geometry and iris shader tint are revised in face-head-pass. Other mesh contracts and all texture image bytes remain exact; expression shapes follow the face field.'
summary['scope']='Reference hair revisions and the female face/head likeness field; historical validation records retain their own input scope.'
write(p/'validation-summary.json',summary)
readme=p/'README.md';heading='## Female face and head — September 27\n\n'
section='''The lower jaw now has a gentler taper with rounder corners, while the chin is
slightly shorter and less projected. Local fields soften the nose profile,
add modest cheek fullness, and make the mouth wider and less pouty. A shared
iris shader multiplier changes olive green to warm brown without modifying
the texture image. The field is rebuilt from the original body each time,
then applied to every expression and to each independently simplified LOD.
The previous smile travel scale is retained. No geometry, materials or image
textures are added. All 60 other native mesh contracts and the complete hair
mapping are unchanged.

`face-head-pass/` archives the prior source/deliveries, fixed front/profile/
oblique views, seven expression checks, runtime screenshots and validation.
The three exports preserve unrelated accessors, topology, weights, UVs,
animations and texture bytes. Full-eye closure covers over 99% of the iris
samples. The 27 motion samples, seven attachment poses and fresh 31-pose
hanging-hair check pass. Front locks clear the face by at least 2.96 mm in
those attachment poses. These are finite checks; likeness remains in progress.

'''
text=readme.read_text()
if heading not in text:readme.write_text(text.replace('\n\n','\n\n'+heading+section,1))
scripts=['refine_female_face_contour.py','apply_female_face_contour.mjs','apply_reference_hair.mjs']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]
file_updates={}
for f in owned:
 b=f.read_bytes();file_updates[str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femaleFaceHeadPass']={'nativeRecord':'hair-likeness-20260921/face-head-pass/native-face-contour-validation.json','exportRecord':'hair-likeness-20260921/face-head-pass/portable-face-contour-validation.json','unchangedOtherMeshContracts':60,'changedBodyVertices':native['changedVertices'],'maximumRevisionDisplacementMm':native['maximumRevisionDisplacementMm'],'expressionPoses':7,'motionSamples':27,'attachmentPoses':7,'hangingHairClearancePoses':31,'browserErrors':0,'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0}
state['files'].update(file_updates);write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name;current=new.read_text();previous=old.read_text()
 if name=='apply_reference_hair.mjs':
  previous=current.replace("native.faceContour?.spec.version>=2&&m.getName()==='Launch female iris'?null:m.getBaseColorFactor()","m.getBaseColorFactor()")
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
print('Female editable source and all three deliveries synchronized. Download growth:',json.dumps(growth))
