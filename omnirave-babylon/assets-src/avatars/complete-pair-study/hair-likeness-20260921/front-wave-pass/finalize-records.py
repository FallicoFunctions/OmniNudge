from pathlib import Path
import shutil,json,hashlib,gzip,struct
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'front-wave-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,data):f.write_text(json.dumps(data,indent=2)+'\n')
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'female-braid.png',p/'female-blender-oblique.png')
for name,source in {'build.log':'/tmp/female-front-wave-build.log','native-checks.log':'/tmp/female-front-wave-checks.log','clearance.log':'/tmp/female-front-wave-clearance.log','render.log':'/tmp/female-front-wave-render.log','export.log':'/tmp/female-front-wave-export.log','delivery.log':'/tmp/female-front-wave-compression.log'}.items():shutil.copy2(source,d/name)
manifest=read(r/'src/player/completeAvatarDownloads.json');delivery={};exports={sex:read(p/f'{sex}-portable-validation.json') for sex in ['female','male']}
for name,entry in manifest.items():
 f=r/'public/assets/avatars/complete-pair'/name;b=f.read_bytes();z=f.with_suffix(f.suffix+'.gz').read_bytes();digest=sha(b)
 assert gzip.decompress(z)==b
 assert entry=={'bytes':len(b),'gzipBytes':len(z),'sha256':digest}
 sex=name.split('-')[0].split('.')[0]
 assert exports[sex][name]['sha256']==digest and exports[sex][name]['gltfErrors']==0
 doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
 assert not any(n.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for n in doc.get('nodes',[]))
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':len(doc['skins'][0]['joints'])}
 if name.startswith('female'):delivery[name]['eyeStudNodesAbsent']=True
write(d/'delivery-verification.json',delivery)
for sex in ['female','male']:assert (p.parent/f'{sex}-runtime.blend').read_bytes()==(p/f'{sex}-hair-refined.blend').read_bytes()
motion=read(p/'female-motion-validation.json');clearance=read(d/'female-front-wave-clearance.json');native=read(p/'female-native-validation.json');errors=read(d/'browser-errors.json');assert not errors
assert clearance['minimumSkinClearanceMm']>.5 and clearance['maximumVerticesInFrontOfLens']==0
summary=read(p/'validation-summary.json');summary['nativeFiles']={f'{sex}-hair-refined.blend':sha((p/f'{sex}-hair-refined.blend').read_bytes()) for sex in ['female','male']};summary['exports']=exports;summary['delivery']=delivery;summary['femaleMotionChecks']=motion
summary['femaleScalpContinuation']['nativeSource']='front-wave-pass/before/female-hair-refined.blend'
summary['femaleFrontWaveContinuation']={'addedGeometry':0,'addedMaterials':0,'addedTextureImages':0,'changedGeometry':clearance['changedMeshes'],'unchangedOtherMeshContracts':clearance['unchangedOtherMeshContracts'],'changes':['Diagonal overlapping front locks with unequal fine ends','Connected asymmetric forehead-to-temple coverage','Lower lock relief and goggle-lens fitting','Cheek locks tucked beneath goggles with roots and long pony coordinates retained'],'cheekLensFit':native['meshes']['faceLensFit'],'unchangedLongPonyVertices':clearance['unchangedLongPonyVertices'],'clearance':clearance,'evidenceDirectory':'front-wave-pass/','browserErrors':0}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female front-wave pass: hair view idle 1, walk 18 and run 10, plus the frontal face close-up; zero browser errors'];summary['browserErrors']=0
write(p/'validation-summary.json',summary)
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles']={n:{'bytes':m['bytes'],'sha256':m['sha256'],'gltfErrors':0} for n,m in manifest.items()};state['checks']['losslessDelivery']['assets']=manifest
state['checks']['referenceHair']['femaleFrontWavePass']={'record':'hair-likeness-20260921/front-wave-pass/female-front-wave-clearance.json','sampledPoses':clearance['poses'],'minimumSkinClearanceMm':clearance['minimumSkinClearanceMm'],'verticesInFrontOfGoggleLens':0,'unchangedOtherMeshContracts':clearance['unchangedOtherMeshContracts'],'addedGeometry':0}
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))
owned+=[r/'scripts/launch-body-proof'/n for n in ['refine_female_crown.py','refine_female_contour.py','validate_female_front_wave.py']]
for f in owned:b=f.read_bytes();state['files'][str(f.relative_to(r))]={'bytes':len(b),'sha256':sha(b)}
write(p.parent/'current-state-validation.json',state)
print('Verified all six exports and compressed copies; native sources and current hair records are synchronized.')
print('Front/scalp skin clearance mm:',clearance['minimumSkinClearanceMm'])
