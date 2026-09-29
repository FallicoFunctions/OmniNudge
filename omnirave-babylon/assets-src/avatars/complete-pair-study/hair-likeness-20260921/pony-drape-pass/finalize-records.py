from pathlib import Path
import json,hashlib,gzip,struct,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-drape-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-pony-drape-validation.json');dye=read(d/'native-root-dye-validation.json');portable=read(d/'portable-pony-drape-validation.json')
motion=read(p/'female-motion-validation.json');clearance=read(p/'female-cascade-clearance.json');contact=read(d/'crown-contact-validation.json')
assert native['unchangedOtherMeshContracts']==58 and native['cards']==310
assert dye['unchangedMeshContracts']==61
assert len(clearance['samples'])==31 and clearance['minimumBodyClearanceMm']>0 and clearance['minimumJacketClearanceMm']>0
assert clearance['maximumStrandEdgeBodyIntersections']==clearance['maximumStrandEdgeJacketIntersections']==0
assert len(contact['samples'])==9 and contact['minimumBodyClearanceMm']>0 and contact['maximumBodyEdgeIntersections']==0
assert motion['movementSamples']==27 and len(motion['attachments'])==7
assert not read(d/'browser-errors.json')
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['build','motion','clearance','contact','portable','export','delivery']:shutil.copy2('/tmp/female-pony-drape-'+suffix+'.log',d/(suffix+'.log'))
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
summary['femaleCrownFlowContinuation']['nativeSource']='pony-drape-pass/before/female-hair-refined.blend'
summary['femalePonyDrapeContinuation']={'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Shortened 310 rear pony cards into 12 shoulder-length tiers, retaining the first nine pairs and every front/cheek card','Blended irregular magenta streaks through the upper pony and inner fibers using retained texture images'],
 'nativeValidation':native,'pigmentValidation':dye,'portableValidation':portable,'motionValidation':motion,'clearance':clearance,'crownContactValidation':contact,'deliveryGrowth':growth,
 'evidenceDirectory':'pony-drape-pass/','browserErrors':0,'visualAssessment':'The rear silhouette now falls near the shoulder instead of flaring far backward. Fine longer flyaways remain, and the smooth bridge above the tie is still visible. Overall likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female pony-drape pass: idle hair/profile, run 10 and walk 18; zero browser errors']
summary['browserErrors']=0;write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femalePonyDrapePass']={'nativeRecord':'hair-likeness-20260921/pony-drape-pass/native-pony-drape-validation.json','exportRecord':'hair-likeness-20260921/pony-drape-pass/portable-pony-drape-validation.json','unchangedOtherMeshContracts':58,'changedRearCards':310,'retainedRootPairs':9,'motionSamples':27,'attachmentPoses':7,'clearancePoses':31,'crownContactPoses':9,'minimumCrownClearanceMm':contact['minimumBodyClearanceMm'],'minimumBodyClearanceMm':clearance['minimumBodyClearanceMm'],'minimumJacketClearanceMm':clearance['minimumJacketClearanceMm'],'bodyStrandEdgeIntersections':0,'jacketStrandEdgeIntersections':0,'browserErrors':0,'addedGeometry':0}
scripts=['refine_reference_hair.py','refine_female_root_dye.py','refine_female_rear_drape.py','refine_female_pony_clearance.py']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]
for f in owned:
 b=f.read_bytes();state['files'][str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name;previous=old.read_text() if old.exists() else '';current=new.read_text()
 if name=='refine_reference_hair.py':
  previous=current.replace('        from refine_female_root_dye import blend_pony_roots\n        blend_pony_roots(mapping,report,materials)\n        from refine_female_rear_drape import drape_rear_pony\n        drape_rear_pony(mapping,report,apply_geometry)\n','')
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff));print('Female source and three lossless deliveries synchronized. Download growth:',json.dumps(growth))
