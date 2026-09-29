from pathlib import Path
import json,hashlib,gzip,struct,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'lip-volume-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-face-contour-validation.json');portable=read(d/'portable-face-contour-validation.json');motion=read(p/'female-motion-validation.json');clearance=read(p/'female-cascade-clearance.json')
assert native['spec']['version']==8 and native['unchangedOtherMeshContracts']==58 and len(native['poses'])==10
assert native['minimumTriangleNormalDot']>.90 and native['minimumTriangleAreaRatio']>.55
assert motion['movementSamples']==27 and len(motion['attachments'])==7 and motion['validatedFaceContour']==native
assert len(clearance['samples'])==31 and clearance['maximumStrandEdgeBodyIntersections']==clearance['maximumStrandEdgeJacketIntersections']==0
assert len(native['facialAttachments'])==6
assert native['companionMeshes']==['AvatarEyebrows','AvatarEyelashes']
revision=read(d/'native-revision-preservation.json')
assert revision['unchangedOtherGeometryIncludingAllShapeKeys']==58
assert revision['unchangedPackedImages']>0
assert revision['unchangedOrbitalCompanionGeometryIncludingAllShapeKeys']==2
assert not read(d/'browser-errors.json')
assert (p/'female-vertex-mapping.json').read_bytes()==(d/'before/female-vertex-mapping.json').read_bytes()
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['build','motion','portable','export','delivery','cascade']:shutil.copy2('/tmp/female-lip-'+suffix+'.log',d/(suffix+'.log'))
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
summary['femaleJawContinuation']['nativeSource']='lip-volume-pass/before/female-hair-refined.blend'
summary['femaleLipVolumeContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Restored upper and lower lip height through a gentler compression','Released lower lip projection and shaped the central upper curve','Lifted the corners slightly to relax the resting mouth'],
 'nativeValidation':native,'revisionPreservation':revision,'portableValidation':portable,'motionValidation':motion,'cascadeClearanceValidation':clearance,
 'deliveryGrowth':growth,'evidenceDirectory':'lip-volume-pass/','browserErrors':0,
 'visualAssessment':'The lips have more central volume, with a clearer upper curve and less downward corners. Matched clay and skin renders support the shape comparison. Full reference likeness remains in progress.',
 'scope':'Ten expression poses, six facial-attachment poses, 27 movement samples, seven hair-attachment poses and 31 hanging-hair poses; finite samples do not prove continuous collision freedom.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female lip volume pass: neutral face, curious, smile, closed eyes, run 10 and walk 18; zero browser errors']
summary['femaleBrowserErrors']=0
summary['preserved']='Outfits, rig, weights and locomotion clips retained; two female eye-stud meshes remain absent. Female face/head geometry and iris shader tint are documented in face-head-pass. The body, brows and lashes follow the field introduced in eye-mouth-pass. The brow and lash geometry from orbital-shape-pass remains exact; the jaw revision is documented in jaw-balance-pass and the lip volume revision in lip-volume-pass; all 58 other native mesh contracts and packed texture image bytes remain exact. The lip finish from face-surface-pass is retained.'
summary['scope']='Reference hair revisions and the female face/head likeness field; historical validation records retain their own input scope.'
write(p/'validation-summary.json',summary)
readme=p/'README.md';heading='## Female lip shape and volume — September 27\n\n'
section='The lips retain more height, with a fuller lower lip, a clearer central\nupper curve and slightly raised corners. The continuous skin field follows\nevery expression. The preceding jaw, brow and eye revisions remain intact.\n\n`lip-volume-pass/` retains the previous editable source and deliveries, matched\nskin and clay views, ten expression samples, six facial-attachment checks and\nlive preview captures. Fifty-eight other native mesh contracts, brow and lash\narrays and all packed image bytes remain exact. Twenty-seven movement samples,\nseven hair-attachment poses and 31 hanging-hair poses pass. The three exported\ndetail levels match the native field. These checks cover finite samples; full\nreference likeness remains in progress.\n\n'
text=readme.read_text()
if heading not in text:readme.write_text(text.replace('\n\n','\n\n'+heading+section,1))
scripts=['refine_female_face_contour.py','apply_female_face_contour.mjs']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]
file_updates={}
for f in owned:
 b=f.read_bytes();file_updates[str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femaleLipVolumePass']={'nativeRecord':'hair-likeness-20260921/lip-volume-pass/native-face-contour-validation.json','exportRecord':'hair-likeness-20260921/lip-volume-pass/portable-face-contour-validation.json','unchangedOtherMeshContracts':58,'changedBodyVertices':native['changedVertices'],'maximumRevisionDisplacementMm':native['maximumRevisionDisplacementMm'],'expressionPoses':10,'facialAttachmentPoses':6,'motionSamples':27,'attachmentPoses':7,'hangingHairClearancePoses':31,'browserErrors':0,'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0}
state['files'].update(file_updates);write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name;current=new.read_text();previous=old.read_text()
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
print('Female editable source and all three deliveries synchronized. Download growth:',json.dumps(growth))
