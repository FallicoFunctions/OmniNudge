from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib

r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-wave-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')

native=read(d/'native-pony-wave-validation.json');portable=read(d/'portable-pony-wave-validation.json')
assert native['unchangedOtherMeshContracts']==58 and native['outerLayerCards']==212
clearance=read(p/'female-cascade-clearance.json')
assert clearance['minimumBodyClearanceMm']>0 and clearance['minimumJacketClearanceMm']>0
assert clearance['maximumStrandEdgeJacketIntersections']==0
assert all(v['addedTextureImages']==0 for v in portable.values())
assert not read(d/'browser-errors.json')
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {
 'build.log':'/tmp/female-pony-wave-build.log',
 'motion-checks.log':'/tmp/female-pony-wave-motion.log',
 'clearance.log':'/tmp/female-pony-wave-clearance.log',
 'native-checks.log':'/tmp/female-pony-wave-validation.log',
 'portable-checks.log':'/tmp/female-pony-wave-portable-validation.log',
 'render.log':'/tmp/female-pony-wave-render.log',
 'export.log':'/tmp/female-pony-wave-export.log',
 'delivery.log':'/tmp/female-pony-wave-compression.log',
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
summary['femaleHairlineContinuation']['nativeSource']='pony-wave-pass/before/female-hair-refined.blend'
summary['femaleMotionChecks']=read(p/'female-motion-validation.json')
summary['femalePonyWaveContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,
 'changes':['Nine outer pony groups with staggered lengths and gently turning tips','More space beside the ear and less uniform lower grouping','Rear strand tips fitted outside the folded hood across authored poses'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,
 'motionValidation':summary['femaleMotionChecks'],'clearance':clearance,
 'evidenceDirectory':'pony-wave-pass/','browserErrors':0,
 'visualAssessment':'Clearer layered pony silhouette; broader reference likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female pony-wave pass: hair view idle 1, run 10 and walk 18, plus frontal face close-up and rear view; zero browser errors']
summary['browserErrors']=0
write(p/'validation-summary.json',summary)

state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()}
state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femaleEndsPass']['record']='hair-likeness-20260921/pony-wave-pass/before/female-cascade-clearance.json'
state['checks']['referenceHair']['femalePonyWavePass']={
 'nativeRecord':'hair-likeness-20260921/pony-wave-pass/native-pony-wave-validation.json',
 'exportRecord':'hair-likeness-20260921/pony-wave-pass/portable-pony-wave-validation.json',
 'clearanceRecord':'hair-likeness-20260921/female-cascade-clearance.json',
 'unchangedOtherMeshContracts':58,'reshapedCards':native['reshapedCards'],'outerLayerCards':212,'rearTipCorrectedCards':native['rearTipCorrectedCards'],'sampledClearancePoses':31,
 'minimumBodyClearanceMm':clearance['minimumBodyClearanceMm'],
 'minimumJacketClearanceMm':clearance['minimumJacketClearanceMm'],
 'addedGeometry':0,'addedTextureImages':0}
scripts=['refine_reference_hair.py','refine_female_cascade.py','refine_female_pony_clearance.py','validate_female_cascade.py','validate_female_pony_waves.py']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend']
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
