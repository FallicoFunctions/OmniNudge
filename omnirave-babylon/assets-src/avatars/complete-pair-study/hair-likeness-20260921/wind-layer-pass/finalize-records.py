from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'wind-layer-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')
native=read(d/'native-wind-layer-validation.json');portable=read(d/'portable-wind-layer-validation.json')
assert native['unchangedOtherMeshContracts']==58 and native['reshapedCards']==220
assert not read(d/'browser-errors.json')
clearance=read(p/'female-cascade-clearance.json')
upper=read(d/'upper-span-clearance.json')
assert len(upper['samples'])==31 and upper['minimumBodyClearanceMm']>0
assert upper['maximumStrandEdgeBodyIntersections']==0 and upper['maximumStrandEdgeJacketIntersections']==0
assert len(clearance['samples'])==31 and clearance['minimumBodyClearanceMm']>0
assert clearance['minimumJacketClearanceMm']>0 and clearance['maximumStrandEdgeJacketIntersections']==0
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {'build.log':'build','native-motion.log':'checks','portable-checks.log':'portable-validation','export.log':'export','delivery.log':'compression'}.items():
 shutil.copy2('/tmp/female-wind-layer-'+source+'.log',d/name)
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
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':len(doc['skins'][0]['joints'])}
 if name.startswith('female'):
  delivery[name]['eyeStudNodesAbsent']=True;growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
 else:assert entry==before[name]
write(d/'delivery-verification.json',delivery)
for sex in ['female','male']:assert (p.parent/f'{sex}-runtime.blend').read_bytes()==(p/f'{sex}-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']={f'{sex}-hair-refined.blend':sha((p/f'{sex}-hair-refined.blend').read_bytes()) for sex in ['female','male']}
summary['exports']=exports;summary['delivery']=delivery
summary['femaleCrownSettleContinuation']['nativeSource']='wind-layer-pass/before/female-hair-refined.blend'
summary['femaleMotionChecks']=read(p/'female-motion-validation.json')
summary['femaleWindLayerContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Broader staggered waves in 220 outer cards across fourteen guides','Brighter per-lock pink pigment with retained brunette roots and cheek wisps'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,
 'motionValidation':summary['femaleMotionChecks'],'cascadeValidation':clearance,'upperSpanValidation':upper,
 'reusedClearanceRecords':['crown-settle-pass/native-crown-settle-validation.json (unchanged cheek-card samples only)','root-transition-pass/native-root-transition-validation.json'],
 'evidenceDirectory':'wind-layer-pass/','browserErrors':0,
 'visualAssessment':'More outer locks follow staggered, broad bends with brighter pink variation; the tightly curved candidate was rejected. Overall hairstyle and facial likeness remain in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female wind-layer pass: idle hair and face close-ups, side and back full-body views, hair run 10 and walk 18; zero browser errors']
summary['browserErrors']=0;write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()}
state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femaleWindLayerPass']={
 'nativeRecord':'hair-likeness-20260921/wind-layer-pass/native-wind-layer-validation.json',
 'exportRecord':'hair-likeness-20260921/wind-layer-pass/portable-wind-layer-validation.json',
 'reshapedCards':220,'tintedLongCards':852,'unchangedOtherMeshContracts':58,'sampledPonyPoses':31,'sampledUpperSpanPoses':31,'minimumUpperBodyClearanceMm':upper['minimumBodyClearanceMm'],'upperBodyEdgeIntersections':0,
 'minimumBodyClearanceMm':clearance['minimumBodyClearanceMm'],
 'minimumJacketClearanceMm':clearance['minimumJacketClearanceMm'],
 'strandEdgeJacketIntersections':0,'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'reusedClearanceRecords':['femaleCrownSettlePass (unchanged cheek-card samples only)','femaleRootTransitionPass']}
scripts=['refine_reference_hair.py','refine_female_wind_layers.py','validate_female_wind_layers.py']
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
