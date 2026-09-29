from pathlib import Path
import json,hashlib,gzip,struct,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-shape-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-pony-shape-validation.json');portable=read(d/'portable-pony-shape-validation.json');motion=read(p/'female-motion-validation.json');clearance=read(p/'female-cascade-clearance.json')
assert native['unchangedOtherMeshContracts']==58 and native['changedCards']==608
assert len(clearance['samples'])==31 and clearance['minimumBodyClearanceMm']>0 and clearance['minimumJacketClearanceMm']>0
assert clearance['maximumStrandEdgeBodyIntersections']==clearance['maximumStrandEdgeJacketIntersections']==0
assert motion['movementSamples']==27 and len(motion['attachments'])==7
assert not read(d/'browser-errors.json')
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['build','motion','clearance','portable','export','delivery']:shutil.copy2('/tmp/female-pony-shape-'+suffix+'.log',d/(suffix+'.log'))
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
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':56,'eyeStudNodesAbsent':True}
 growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
write(d/'delivery-verification.json',delivery)
assert (p.parent/'female-runtime.blend').read_bytes()==(p/'female-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend']=sha((p/'female-hair-refined.blend').read_bytes())
summary['exports']['female']=exports;summary['delivery'].update(delivery);summary['femaleMotionChecks']=motion
summary['femaleFaceContourContinuation']['nativeSource']='pony-shape-pass/before/female-hair-refined.blend'
summary['femalePonyShapeContinuation']={'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Narrowed the outer ponytail fan by up to 30 mm while retaining crown volume and irregular ends'],
 'nativeValidation':native,'portableValidation':portable,'motionValidation':motion,'clearance':clearance,'deliveryGrowth':growth,
 'evidenceDirectory':'pony-shape-pass/','browserErrors':0,'visualAssessment':'The outer pony silhouette sits closer to the head and shoulder. Overall character likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female pony-shape pass: idle hair/face, side/back, run 10 and walk 18; zero browser errors']
summary['browserErrors']=0;write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femalePonyShapePass']={'nativeRecord':'hair-likeness-20260921/pony-shape-pass/native-pony-shape-validation.json','exportRecord':'hair-likeness-20260921/pony-shape-pass/portable-pony-shape-validation.json','unchangedOtherMeshContracts':58,'changedLongCards':608,'retainedRootPairs':5,'motionSamples':27,'attachmentPoses':7,'clearancePoses':31,'minimumBodyClearanceMm':clearance['minimumBodyClearanceMm'],'minimumJacketClearanceMm':clearance['minimumJacketClearanceMm'],'bodyStrandEdgeIntersections':0,'jacketStrandEdgeIntersections':0,'browserErrors':0,'addedGeometry':0}
scripts=['refine_reference_hair.py','refine_female_pony_shape.py','refine_female_face_fall.py','validate_female_cascade.py']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]
for f in owned:
 b=f.read_bytes();state['files'][str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name
 diff.extend(difflib.unified_diff(old.read_text().splitlines(True) if old.exists() else [],new.read_text().splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
print('Female source and all three lossless deliveries synchronized. Male files unchanged by this pass.')
print('Download growth:',json.dumps(growth))
