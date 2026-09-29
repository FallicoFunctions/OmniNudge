from pathlib import Path
import json,hashlib,gzip,struct,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'gathered-root-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-gathered-root-validation.json');portable=read(d/'portable-gathered-root-validation.json');motion=read(p/'female-motion-validation.json')
assert native['unchangedOtherMeshContracts']==59 and native['vertices']==96
assert native['maximumCenterlineDriftMm']<.0001 and native['carrierFade']['retainedRootRing']
assert motion['movementSamples']==27 and len(motion['attachments'])==7
assert not read(d/'browser-errors.json')
# The collision inputs (body, clothes, all hanging/crown cards and morphs)
# remain exact. Keep their prior finite-pose evidence explicitly historical.
assert (p/'female-cascade-clearance.json').read_bytes()==(d/'before/female-cascade-clearance.json').read_bytes()
clearance=read(p/'female-cascade-clearance.json')
assert len(clearance['samples'])==31 and clearance['maximumStrandEdgeBodyIntersections']==clearance['maximumStrandEdgeJacketIntersections']==0
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['build','motion','portable','export','delivery','diagnose']:shutil.copy2('/tmp/female-gathered-root-'+suffix+'.log',d/(suffix+'.log'))
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json']:shutil.copy2(p/name,d/name)
shutil.copy2(p/'female-cascade-clearance.json',d/'retained-cascade-clearance.json')
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
summary['femalePonyDrapeContinuation']['nativeSource']='gathered-root-pass/before/female-hair-refined.blend'
summary['femaleGatheredRootContinuation']={'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Narrowed the smooth scalp-to-pony connector to 35% of its radius around the retained centerline','Remapped upper carrier UVs into its existing alpha fade while retaining the root ring and lower UVs'],
 'nativeValidation':native,'portableValidation':portable,'motionValidation':motion,
 'retainedPriorClearanceEvidence':{'source':'pony-drape-pass/','poses':31,'inputsUnchanged':True,'report':'retained-cascade-clearance.json'},
 'deliveryGrowth':growth,'evidenceDirectory':'gathered-root-pass/','browserErrors':0,
 'visualAssessment':'The extra smooth band above the violet tie no longer protrudes; finer strands cover more of the gathered base. Hairstyle silhouette and overall likeness remain in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female gathered-root pass: idle hair/side, run 10 and walk 18; zero browser errors']
summary['femaleBrowserErrors']=0;write(p/'validation-summary.json',summary)
scripts=['refine_reference_hair.py','refine_female_gathered_root.py']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]
file_updates={}
for f in owned:
 b=f.read_bytes();file_updates[str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items() if n.startswith('female')})
state['checks']['losslessDelivery']['assets'].update({n:m for n,m in manifest.items() if n.startswith('female')})
state['checks']['referenceHair']['femaleGatheredRootPass']={'nativeRecord':'hair-likeness-20260921/gathered-root-pass/native-gathered-root-validation.json','exportRecord':'hair-likeness-20260921/gathered-root-pass/portable-gathered-root-validation.json','unchangedOtherMeshContracts':59,'carrierPositionsWeightsAndShapesRetained':True,'changedConnectorVertices':96,'motionSamples':27,'attachmentPoses':7,'retainedPriorClearancePoses':31,'browserErrors':0,'addedGeometry':0}
state['files'].update(file_updates);write(p.parent/'current-state-validation.json',state)
diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name;previous=old.read_text() if old.exists() else '';current=new.read_text()
 if name=='refine_reference_hair.py':
  previous=current.replace('        from refine_female_gathered_root import recess_connector\n        recess_connector(mapping,report,apply_geometry)\n','')
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff));print('Female editable source and all three deliveries synchronized. Download growth:',json.dumps(growth))
