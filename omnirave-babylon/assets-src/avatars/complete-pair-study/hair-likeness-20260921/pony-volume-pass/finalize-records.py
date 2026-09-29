from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib

r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-volume-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')

native=read(d/'native-pony-volume-validation.json');portable=read(d/'portable-pony-volume-validation.json')
assert native['unchangedOtherMeshContracts']==58 and native['reshapedCards']==852
clearance=read(p/'female-cascade-clearance.json')
assert clearance['minimumBodyClearanceMm']>0 and clearance['minimumJacketClearanceMm']>0
assert clearance['maximumStrandEdgeJacketIntersections']==0
assert all(v['addedTextureImages']==0 for v in portable.values())
assert not read(d/'browser-errors.json')
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {
 'build.log':'/tmp/female-pony-volume-build.log',
 'native-motion-clearance-and-render.log':'/tmp/female-pony-volume-checks.log',
 'portable-checks.log':'/tmp/female-pony-volume-portable-validation.log',
 'export.log':'/tmp/female-pony-volume-export.log',
 'delivery.log':'/tmp/female-pony-volume-compression.log',
}.items():shutil.copy2(source,d/name)
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json','female-cascade-clearance.json']:
 shutil.copy2(p/name,d/name)

manifest=read(r/'src/player/completeAvatarDownloads.json');before=read(d/'before/completeAvatarDownloads.json')
delivery={};exports={sex:read(p/f'{sex}-portable-validation.json') for sex in ['female','male']};growth={}
for name,entry in manifest.items():
 f=r/'public/assets/avatars/complete-pair'/name;b=f.read_bytes();z=f.with_suffix(f.suffix+'.gz').read_bytes();digest=sha(b)
 assert gzip.decompress(z)==b
 assert entry=={'bytes':len(b),'gzipBytes':len(z),'sha256':digest}
 sex=name.split('-')[0].split('.')[0]
 assert exports[sex][name]['sha256']==digest and exports[sex][name]['gltfErrors']==0
 doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
 assert not any(n.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for n in doc.get('nodes',[]))
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':len(doc['skins'][0]['joints'])}
 if name.startswith('female'):
  delivery[name]['eyeStudNodesAbsent']=True
  growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
 else:assert entry==before[name]
write(d/'delivery-verification.json',delivery)
for sex in ['female','male']:
 assert (p.parent/f'{sex}-runtime.blend').read_bytes()==(p/f'{sex}-hair-refined.blend').read_bytes()

summary=read(p/'validation-summary.json')
summary['nativeFiles']={f'{sex}-hair-refined.blend':sha((p/f'{sex}-hair-refined.blend').read_bytes()) for sex in ['female','male']}
summary['exports']=exports;summary['delivery']=delivery
summary['femalePonyFiberContinuation']['nativeSource']='pony-volume-pass/before/female-hair-refined.blend'
summary['femaleMotionChecks']=read(p/'female-motion-validation.json')
summary['femalePonyVolumeContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['852 long pony cards follow rounded, alternating broad waves','Continuous card roll and differing inner/outer wave amplitudes fill each group in depth','Two smoothing passes reduce angular bends; real edges are fitted beside the ear and collar'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,
 'motionValidation':summary['femaleMotionChecks'],'clearance':clearance,
 'evidenceDirectory':'pony-volume-pass/','browserErrors':0,
 'visualAssessment':'Fuller side and rear silhouette with smoother waves; broader reference likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female pony-volume pass: hair view idle 1, run 10 and walk 18, plus frontal face close-up and rear view; zero browser errors']
summary['browserErrors']=0
write(p/'validation-summary.json',summary)

state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()}
state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femalePonyWavePass']['clearanceRecord']='hair-likeness-20260921/pony-wave-pass/female-cascade-clearance.json'
state['checks']['referenceHair']['femalePonyVolumePass']={
 'nativeRecord':'hair-likeness-20260921/pony-volume-pass/native-pony-volume-validation.json',
 'exportRecord':'hair-likeness-20260921/pony-volume-pass/portable-pony-volume-validation.json',
 'clearanceRecord':'hair-likeness-20260921/female-cascade-clearance.json',
 'unchangedOtherMeshContracts':58,'reshapedCards':native['reshapedCards'],'roundedGuideGroups':26,'rearTipCorrectedCards':native['rearTipCorrectedCards'],'sampledClearancePoses':31,
 'minimumBodyClearanceMm':clearance['minimumBodyClearanceMm'],
 'minimumJacketClearanceMm':clearance['minimumJacketClearanceMm'],
 'addedGeometry':0,'addedTextureImages':0}
scripts=['refine_reference_hair.py','refine_female_pony_volume.py','validate_female_pony_volume.py']
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
if Path(__file__).resolve()!=(d/'finalize-records.py').resolve():shutil.copy2(__file__,d/'finalize-records.py')
print('Verified all six deliveries; female source synchronized, male files unchanged.')
print('Native mesh contracts retained:',native['unchangedOtherMeshContracts'])
print('Compressed download growth:',json.dumps(growth))
