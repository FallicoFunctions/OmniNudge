from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'crown-settle-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')
native=read(d/'native-crown-settle-validation.json');portable=read(d/'portable-crown-settle-validation.json')
assert native['unchangedOtherMeshContracts']==55
assert native['minimumSkinClearanceMm']>1.5 and native['maximumVerticesInFrontOfLens']==0
assert sum(v['extendedCheekCards'] for v in native['meshes'].values())==8
assert not read(d/'browser-errors.json')
clearance=read(p/'female-cascade-clearance.json');upper=read(d/'upper-span-clearance.json')
assert len(upper['samples'])==31 and upper['minimumBodyClearanceMm']>0
assert upper['maximumStrandEdgeBodyIntersections']==0 and upper['maximumStrandEdgeJacketIntersections']==0
assert len(clearance['samples'])==31 and clearance['minimumBodyClearanceMm']>0
assert clearance['minimumJacketClearanceMm']>0 and clearance['maximumStrandEdgeJacketIntersections']==0
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {'build.log':'build','native-motion.log':'checks','portable-checks.log':'portable-validation','export.log':'export','delivery.log':'compression'}.items():
 shutil.copy2('/tmp/female-crown-settle-'+source+'.log',d/name)
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json','female-cascade-clearance.json']:shutil.copy2(p/name,d/name)
manifest=read(r/'src/player/completeAvatarDownloads.json');before=read(d/'before/completeAvatarDownloads.json')
delivery={};exports={sex:read(p/f'{sex}-portable-validation.json') for sex in ['female','male']};growth={}
for name,entry in manifest.items():
 f=r/'public/assets/avatars/complete-pair'/name;b=f.read_bytes();z=f.with_suffix(f.suffix+'.gz').read_bytes();digest=sha(b)
 assert gzip.decompress(z)==b
 assert entry=={'bytes':len(b),'gzipBytes':len(z),'sha256':digest}
 sex=name.split('-')[0].split('.')[0]
 assert exports[sex][name]['sha256']==digest and exports[sex][name]['gltfErrors']==0
 doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
 assert len(doc['skins'][0]['joints'])==56
 assert not any(n.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for n in doc.get('nodes',[]))
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':56,'eyeStudNodesAbsent':True}
 if name.startswith('female'):growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
 else:assert entry==before[name]
write(d/'delivery-verification.json',delivery)
for sex in ['female','male']:assert (p.parent/f'{sex}-runtime.blend').read_bytes()==(p/f'{sex}-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']={f'{sex}-hair-refined.blend':sha((p/f'{sex}-hair-refined.blend').read_bytes()) for sex in ['female','male']}
summary['exports']=exports;summary['delivery']=delivery
summary['femaleLooseLockContinuation']['nativeSource']='crown-settle-pass/before/female-hair-refined.blend'
summary['femaleMotionChecks']=read(p/'female-motion-validation.json')
summary['femaleCrownSettleContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Gently settled the upper pony toward the crown through all six existing layers','Extended eight existing cheek wisps with retained roots and slightly fuller midsections'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,
 'motionValidation':summary['femaleMotionChecks'],'cascadeValidation':clearance,'upperSpanValidation':upper,
 'reusedClearanceRecords':['root-transition-pass/native-root-transition-validation.json'],
 'evidenceDirectory':'crown-settle-pass/','browserErrors':0,
 'visualAssessment':'The upper arch sits slightly closer to the crown, with a gradual fall and longer fine cheek framing. The sharper first candidate was rejected. Overall hairstyle and facial likeness remain in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female crown-settle pass: idle hair and face close-ups, side and back full-body views, hair run 10 and walk 18; zero browser errors']
summary['browserErrors']=0;write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()}
state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femaleCrownSettlePass']={
 'nativeRecord':'hair-likeness-20260921/crown-settle-pass/native-crown-settle-validation.json',
 'exportRecord':'hair-likeness-20260921/crown-settle-pass/portable-crown-settle-validation.json',
 'unchangedOtherMeshContracts':55,'sampledPonyPoses':31,'sampledUpperSpanPoses':31,
 'minimumUpperBodyClearanceMm':upper['minimumBodyClearanceMm'],'upperBodyEdgeIntersections':0,
 'minimumBodyClearanceMm':clearance['minimumBodyClearanceMm'],
 'minimumJacketClearanceMm':clearance['minimumJacketClearanceMm'],
 'changedVertexRestExpressionSecondaryPoses':9,'minimumChangedVertexSkinClearanceMm':native['minimumSkinClearanceMm'],
 'changedCheekVerticesInFrontOfLens':0,'extendedCheekCards':8,
 'strandEdgeJacketIntersections':0,'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'reusedClearanceRecords':['femaleRootTransitionPass']}
scripts=['refine_reference_hair.py','refine_female_crown_settle.py','validate_female_crown_settle.py']
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
print('All six deliveries verified; female source synchronized; male unchanged.')
print('Retained other meshes:',native['unchangedOtherMeshContracts'],'; download growth:',json.dumps(growth))
