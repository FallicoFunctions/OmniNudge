from pathlib import Path
import shutil,json,hashlib,gzip,struct,difflib

r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'fiber-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')

native=read(d/'native-fiber-validation.json');portable=read(d/'portable-fiber-validation.json')
assert native['unchangedMeshContracts']==61 and native['alphaCoverageIdentical']
assert all(v['textureImagesAdded']==2 for v in portable.values())
assert not read(d/'browser-errors.json')
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {
 'build.log':'/tmp/female-fiber-build.log',
 'native-checks.log':'/tmp/female-fiber-validation.log',
 'portable-checks.log':'/tmp/female-fiber-portable-validation.log',
 'render.log':'/tmp/female-fiber-render.log',
 'export.log':'/tmp/female-fiber-export.log',
 'delivery.log':'/tmp/female-fiber-compression.log',
}.items():shutil.copy2(source,d/name)
for name in ['female-native-validation.json','female-portable-validation.json']:
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
summary['femaleFrontWaveContinuation']['nativeSource']='fiber-pass/before/female-hair-refined.blend'
summary['femaleFiberContinuation']={
 'addedGeometry':0,'addedMaterials':0,'addedTextureImages':2,'addedVertexColorAttributes':2,
 'changes':['Subtle pigment variation between brunette locks','Fiber normals aligned to each curved strand'],
 'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,
 'motionValidation':'Reuses preceding front-wave finite pose and clearance reports: geometry, UVs, skin weights and all shape coordinates are exactly retained.',
 'evidenceDirectory':'fiber-pass/','browserErrors':0,
 'visualAssessment':'Subtle shading improvement; broader reference likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+[
 'Female fiber pass: hair view idle 1, run 10 and walk 18, plus frontal face close-up; zero browser errors']
summary['browserErrors']=0
write(p/'validation-summary.json',summary)

state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()}
state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femaleFiberPass']={
 'nativeRecord':'hair-likeness-20260921/fiber-pass/native-fiber-validation.json',
 'exportRecord':'hair-likeness-20260921/fiber-pass/portable-fiber-validation.json',
 'unchangedMeshContracts':61,'alphaCoverageIdentical':True,'addedGeometry':0,
 'addedTextureImages':2,'motionClearanceReusedFrom':'femaleFrontWavePass'}
scripts=['refine_reference_hair.py','refine_female_crown.py','refine_brunette_fibers.py','apply_reference_hair.mjs','validate_female_fibers.py']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))
owned+=[r/'scripts/launch-body-proof'/n for n in scripts]
owned+=[p/'female-brunette-fibers.png',p/'female-brunette-fiber-normal.png']
for f in owned:
 b=f.read_bytes();state['files'][str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
write(p.parent/'current-state-validation.json',state)

diff=[]
for name in scripts:
 old=d/'before'/name;new=r/'scripts/launch-body-proof'/name
 diff.extend(difflib.unified_diff(old.read_text().splitlines(True) if old.exists() else [],new.read_text().splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
shutil.copy2(__file__,d/'finalize-records.py')
print('Verified all six deliveries; female source synchronized, male files unchanged.')
print('Native mesh contracts retained:',native['unchangedMeshContracts'])
print('Compressed download growth:',json.dumps(growth))
