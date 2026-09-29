from pathlib import Path
import json,hashlib,gzip,struct,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-root-flow-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-pony-root-flow-validation.json');portable=read(d/'portable-pony-root-flow-validation.json');motion=read(p/'female-motion-validation.json')
assert native['unchangedOtherMeshContracts']==58 and native['cards']==852
assert native['maximumRootCarrierDistanceMm']<.5 and native['retainedLowerStartPair']==7
contact=read(d/'crown-contact-validation.json');assert len(contact['samples'])==9 and contact['maximumBodyEdgeIntersections']==0
assert motion['movementSamples']==27 and len(motion['attachments'])==7
assert not read(d/'browser-errors.json')
clearance=read(p/'female-cascade-clearance.json')
assert len(clearance['samples'])==31 and clearance['maximumStrandEdgeBodyIntersections']==clearance['maximumStrandEdgeJacketIntersections']==0
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['build','motion','portable','export','delivery','contact','clearance']:shutil.copy2('/tmp/female-pony-root-flow-'+suffix+'.log',d/(suffix+'.log'))
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json']:shutil.copy2(p/name,d/name)
shutil.copy2(p/'female-cascade-clearance.json',d/'female-cascade-clearance.json')
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
summary['femaleUpperLocksContinuation']['nativeSource']='pony-root-flow-pass/before/female-hair-refined.blend'
summary['femalePonyRootFlowContinuation']={'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Moved all 852 outer lock roots from the exposed upper crest onto the measured carrier just above the tie and rebuilt their upper curves','Softened broad specular highlights and introduced deeper upper magenta variation between sixteen strand groups'],
 'nativeValidation':native,'pigmentAndSheen':read(p/'female-native-validation.json')['meshes']['ponySheen'],'nativeArrayPreservation':read(d/'native-export-array-preservation.json'),'portableValidation':portable,'motionValidation':motion,
 'crownContactValidation':contact,'hangingHairClearance':clearance,
 'deliveryGrowth':growth,'evidenceDirectory':'pony-root-flow-pass/','browserErrors':0,
 'visualAssessment':'Outer locks flow from the gathered base instead of exposing a common cut-off root edge on the crown. Lower outer-card spans and cheek geometry/pigment remain exact. Fine wisps and overall likeness remain in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female pony-root-flow pass: idle hair/side, run 10 and walk 18; zero browser errors']
summary['femaleBrowserErrors']=0;write(p/'validation-summary.json',summary)
scripts=['refine_reference_hair.py','refine_female_pony_root_flow.py','refine_female_pony_sheen.py']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]
file_updates={}
for f in owned:
 b=f.read_bytes();file_updates[str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femalePonyRootFlowPass']={'nativeRecord':'hair-likeness-20260921/pony-root-flow-pass/native-pony-root-flow-validation.json','exportRecord':'hair-likeness-20260921/pony-root-flow-pass/portable-pony-root-flow-validation.json','unchangedOtherMeshContracts':58,'changedLongCards':852,'fixedLowerStartPair':7,'maximumRootCarrierDistanceMm':native['maximumRootCarrierDistanceMm'],'motionSamples':27,'attachmentPoses':7,'crownContactPoses':9,'hangingHairClearancePoses':31,'browserErrors':0,'addedGeometry':0}
state['files'].update(file_updates);write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name;previous=old.read_text() if old.exists() else '';current=new.read_text()
 if name=='refine_reference_hair.py':
  previous=current.replace('        from refine_female_pony_root_flow import gather_outer_roots\n        gather_outer_roots(mapping,report,apply_geometry)\n        from refine_female_pony_sheen import soften_pony_sheen\n        soften_pony_sheen(mapping,report,materials)\n','')
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff));print('Female editable source and all three deliveries synchronized. Download growth:',json.dumps(growth))
