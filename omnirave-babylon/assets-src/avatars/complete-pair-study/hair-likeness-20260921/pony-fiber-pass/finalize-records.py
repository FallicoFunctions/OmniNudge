"""Synchronize the inspected pony material pass and record its delivery."""
from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'pony-fiber-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')
native=read(d/'native-pony-fiber-validation.json');portable=read(d/'portable-pony-fiber-validation.json')
assert native['unchangedMeshContracts']==61 and native['alphaCoverageIdentical']
assert native['preservedCheekPigmentVertices']==1224 and native['additionalTextureImages']==0
assert not read(d/'browser-errors.json')
assert read(d/'browser-verification.json')['errors']==0
for v in portable.values():assert v['addedTextureImages']==0 and v['skeletonAndAnimationBytesRetained'] and v['allTextureBytesRetained']
for name in ['female-motion-validation.json','female-cascade-clearance.json']:
 assert (p/name).read_bytes()==(d/'before'/name).read_bytes()
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {'build.log':'/tmp/female-pony-fiber-build.log','native-checks-and-render.log':'/tmp/female-pony-fiber-native.log',
 'portable-checks.log':'/tmp/female-pony-fiber-portable-validation.log','export.log':'/tmp/female-pony-fiber-export.log',
 'delivery.log':'/tmp/female-pony-fiber-compression.log'}.items():shutil.copy2(source,d/name)
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
 if sex=='female':
  delivery[name]['eyeStudNodesAbsent']=True
  growth[name]={k:entry[k]-before[name][k] for k in ['bytes','gzipBytes']}
 else:assert entry==before[name]
write(d/'delivery-verification.json',delivery)
for sex in ['female','male']:
 assert (p.parent/f'{sex}-runtime.blend').read_bytes()==(p/f'{sex}-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']={f'{sex}-hair-refined.blend':sha((p/f'{sex}-hair-refined.blend').read_bytes()) for sex in ['female','male']}
summary['exports']=exports;summary['delivery']=delivery
summary['femalePonyWaveContinuation']['nativeSource']='pony-fiber-pass/before/female-hair-refined.blend'
summary['femalePonyFiberContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,'addedVertexColorAttributes':1,
 'changes':['Consistent brunette-to-magenta pigment on all 852 long pony cards','Staggered dye boundaries and darker individual locks','Softer broad highlights using the existing fiber-aligned normal texture'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,
 'motionClearanceReusedFrom':'femalePonyWaveContinuation',
 'evidenceDirectory':'pony-fiber-pass/','browserErrors':0,
 'visualAssessment':'More coherent magenta color and softer ribbon highlights; overall reference likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female pony-fiber pass: hair idle 1, run 10 and walk 18, face and rear idle 1; zero browser errors']
summary['browserErrors']=0
write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()}
state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femalePonyFiberPass']={
 'nativeRecord':'hair-likeness-20260921/pony-fiber-pass/native-pony-fiber-validation.json',
 'exportRecord':'hair-likeness-20260921/pony-fiber-pass/portable-pony-fiber-validation.json',
 'unchangedMeshContracts':61,'alphaCoverageIdentical':True,'preservedCheekPigmentVertices':1224,
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,'addedVertexColorAttributes':1,
 'motionClearanceReusedFrom':'femalePonyWavePass'}
scripts=['refine_reference_hair.py','refine_female_dye.py','validate_female_pony_fibers.py']
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
print('All six deliveries verified; active source synchronized. Male delivery unchanged.')
print('Retained native mesh contracts:',native['unchangedMeshContracts'])
print('Female download growth:',json.dumps(growth))
