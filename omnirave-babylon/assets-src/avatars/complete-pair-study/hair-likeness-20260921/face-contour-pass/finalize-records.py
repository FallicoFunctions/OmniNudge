from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-contour-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')
native=read(d/'native-face-contour-validation.json');portable=read(d/'portable-face-contour-validation.json')
assert native['unchangedOtherMeshContracts']==60 and len(native['poses'])==7
assert native['minimumTriangleNormalDot']>.95 and native['minimumTriangleAreaRatio']>.70
assert not read(d/'browser-errors.json')
motion=read(p/'female-motion-validation.json')
assert motion['movementSamples']==27 and motion['preservedNonHairMeshes']==48
assert motion['validatedFaceContour']==native
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for target,source in {'build.log':'build','native-motion.log':'motion','portable-checks.log':'portable','export.log':'export','delivery.log':'delivery'}.items():
 shutil.copy2('/tmp/female-face-contour-'+source+'.log',d/target)
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json']:shutil.copy2(p/name,d/name)
manifest=read(r/'src/player/completeAvatarDownloads.json');before=read(d/'before/completeAvatarDownloads.json')
delivery={};exports={sex:read(p/f'{sex}-portable-validation.json') for sex in ['female','male']};growth={}
for name,entry in manifest.items():
 if not name.startswith('female'):continue
 f=r/'public/assets/avatars/complete-pair'/name;b=f.read_bytes();z=f.with_suffix(f.suffix+'.gz').read_bytes();digest=sha(b)
 assert gzip.decompress(z)==b
 assert entry=={'bytes':len(b),'gzipBytes':len(z),'sha256':digest}
 sex=name.split('-')[0].split('.')[0]
 assert exports[sex][name]['sha256']==digest and exports[sex][name]['gltfErrors']==0
 doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
 assert len(doc['skins'][0]['joints'])==56
 assert not any(n.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for n in doc.get('nodes',[]))
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':56}
 if name.startswith('female'):
  delivery[name]['eyeStudNodesAbsent']=True;growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
write(d/'delivery-verification.json',delivery)
assert (p.parent/'female-runtime.blend').read_bytes()==(p/'female-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend']=sha((p/'female-hair-refined.blend').read_bytes())
summary['exports']['female']=exports['female'];summary['delivery'].update(delivery)
summary['femaleCrownBreakupContinuation']['nativeSource']='face-contour-pass/before/female-hair-refined.blend'
summary['femaleMotionChecks']=motion
summary['femaleFaceContourContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Softer lower-jaw taper','Reduced lip projection and vertical fullness; relaxed mouth corners','Reduced the smile morph to 55% of its earlier travel'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,'motionValidation':motion,
 'evidenceDirectory':'face-contour-pass/','browserErrors':0,
 'visualAssessment':'A modest refinement of the jaw and neutral mouth. Overall female likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female face-contour pass: neutral face/hair, soft smile, closed eyes, hair run 10 and walk 18; zero browser errors']
summary['browserErrors']=0
summary['preserved']='Outfits, rig, weights and locomotion clips retained; two female eye-stud meshes removed. Female lower-face geometry and the smile morph are revised explicitly in face-contour-pass. Blink and brow deltas remain exact. Earlier hair changes retain their documented root and secondary-motion contracts.'
summary['scope']='Reference hair revisions and a localized female face-contour field; historical validation records retain their own input scope.'
write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femaleFaceContourPass']={
 'nativeRecord':'hair-likeness-20260921/face-contour-pass/native-face-contour-validation.json',
 'exportRecord':'hair-likeness-20260921/face-contour-pass/portable-face-contour-validation.json',
 'unchangedOtherMeshContracts':60,'changedBodyVertices':native['changedVertices'],'maximumDisplacementMm':native['maximumDisplacementMm'],
 'expressionPoses':7,'motionSamples':27,'hairAttachmentPoses':7,'preservedNonHairMeshes':48,
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,'browserErrors':0}
scripts=['refine_reference_hair.py','validate_reference_hair.py','apply_reference_hair.mjs','refine_female_face_contour.py','apply_female_face_contour.mjs']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))
owned+=[r/'scripts/launch-body-proof'/n for n in scripts]
for f in owned:
 b=f.read_bytes();state['files'][str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name
 diff.extend(difflib.unified_diff(old.read_text().splitlines(True) if old.exists() else [],new.read_text().splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
print('Three female deliveries verified; female source synchronized. Concurrent male work left to its owner.')
print('Download growth:',json.dumps(growth))
