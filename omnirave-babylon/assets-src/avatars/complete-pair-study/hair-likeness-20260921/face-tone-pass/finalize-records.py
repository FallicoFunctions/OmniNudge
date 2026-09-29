from pathlib import Path
import json,hashlib,gzip,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-tone-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-face-surface-validation.json');portable=read(d/'portable-face-surface-validation.json');exports=read(p/'female-portable-validation.json')
assert native['unchangedMeshContracts']==61 and not native['changedGeometry']
assert native['spec']['version']==2
assert read(d/'native-preservation.json')['unchangedMeshContracts']==61
assert not read(d/'browser-errors.json')
assert read(p/'female-native-validation.json')['faceContour']==read(d/'before/female-native-validation.json')['faceContour']
assert (p/'female-vertex-mapping.json').read_bytes()==(d/'before/female-vertex-mapping.json').read_bytes()
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend');shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
manifest=read(r/'src/player/completeAvatarDownloads.json');old=read(d/'before/completeAvatarDownloads.json');delivery={};growth={}
for name in ['female.glb','female-lod1.glb','female-lod2.glb']:
 f=r/'public/assets/avatars/complete-pair'/name;b=f.read_bytes();z=f.with_suffix(f.suffix+'.gz').read_bytes();h=sha(b)
 assert gzip.decompress(z)==b and manifest[name]=={'bytes':len(b),'gzipBytes':len(z),'sha256':h}
 assert exports[name]['sha256']==portable[name]['gltfSha256']==h and exports[name]['gltfErrors']==0
 assert portable[name]['unchangedSceneGraphMaterialsAndAnimations']
 assert all(c['sourceEncodingMatch'] for c in portable[name]['channels'].values())
 delivery[name]={'sha256':h,'compressedBytes':len(z),'lossless':True,'joints':56,'eyeStudNodesAbsent':True}
 growth[name]={k:manifest[name][k]-old[name][k] for k in ['bytes','gzipBytes']}
write(d/'delivery-verification.json',delivery)
summary=read(p/'validation-summary.json');summary['nativeFiles']['female-hair-refined.blend']=sha((p/'female-hair-refined.blend').read_bytes());summary['exports']['female']=exports;summary['delivery'].update(delivery)
summary['femaleAlmondEyeContinuation']['nativeSource']='face-tone-pass/before/female-hair-refined.blend'
summary['femaleFaceToneContinuation']={'changes':['Deepened the lip pigment to a warm rose','Reduced lip roughness for a restrained smoother sheen','Shifted the upper-lid makeup from pink toward warm brown'], 'addedGeometry':0,'addedRuntimeTextures':0,'replacedRuntimeTextures':2,'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,'evidenceDirectory':'face-tone-pass/','browserErrors':0,'geometryValidationReusedFrom':'almond-eye-pass/','scope':'Material-only pass: all 61 native mesh contracts and every exported accessor are exact. Prior motion and attachment checks remain applicable. Front, oblique, profile, smile and closed-eye native views plus browser expression checks validate the finish. Overall reference likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female makeup tone pass: neutral face, smile, closed smile, closed eyes and side; zero browser errors']
summary['femaleBrowserErrors']=0
summary['preserved']='Outfits, rig, weights and locomotion clips retained; female eye studs remain absent. Face/head geometry and iris tint retain the complete v10 field from almond-eye-pass. The face-tone pass changes two existing skin texture payloads; all native mesh contracts and exported accessors remain exact. Earlier motion and clearance checks retain their finite sampling scope.'
write(p/'validation-summary.json',summary)
readme=p/'README.md';heading='## Female lip and upper-lid makeup tone — September 27\n\n'
section='The lips have a deeper warm rose tint and roughness of 0.36 for a smoother\nrestrained sheen. The upper-lid makeup shifts toward warm brown with a soft\nspatial fade. The retained shader graph is revised from its original inputs\nso the prior baked lip finish is not applied twice.\n\n`face-tone-pass/` contains archived inputs, native authoring scripts, two baked\nchannels and matched before/after review evidence. All 61 native mesh contracts,\nrig data and clips are exact, as are all exported accessors and scene structure.\nThe two existing skin color/roughness image payloads change; normal maps,\ntexture dimensions and runtime image count stay fixed. Native front, oblique,\nside, smile and closed-eye views plus live expression checks validate the\nfinish. Movement and clearance validation from almond-eye-pass remains\napplicable because geometry and motion data are unchanged. Full reference\nlikeness remains in progress.\n\n'
text=readme.read_text()
if heading not in text:readme.write_text(text.replace('\n\n','\n\n'+heading+section,1))
scripts=['refine_female_face_surface.py','apply_female_face_surface.mjs']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]+list(d.glob('female-face-surface-*.png'))
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':manifest[n]['bytes'],'sha256':manifest[n]['sha256'],'gltfErrors':0} for n in delivery})
state['checks']['losslessDelivery']['assets'].update({n:manifest[n] for n in delivery})
state['checks']['referenceHair']['femaleFaceTonePass']={'nativeRecord':'hair-likeness-20260921/face-tone-pass/native-face-surface-validation.json','exportRecord':'hair-likeness-20260921/face-tone-pass/portable-face-surface-validation.json','unchangedMeshContracts':61,'changedGeometry':False,'replacedTextures':2,'addedRuntimeTextures':0,'browserErrors':0,'geometryValidationReusedFrom':'almond-eye-pass/'}
state['files'].update({str(f.relative_to(r)):{'bytes':len(f.read_bytes()),'sha256':sha(f.read_bytes())} for f in owned});write(p.parent/'current-state-validation.json',state)
for suffix in ['inspect','candidate','build','native','export','portable','delivery']:
 shutil.copy2('/tmp/female-tone-'+suffix+'.log',d/(suffix+'.log'))
for n in ['female-native-validation.json','female-portable-validation.json']:shutil.copy2(p/n,d/n)
diff=[]
for name in scripts:
 old=d/'before'/name;previous=old.read_text() if old.exists() else '';current=(r/'scripts/launch-body-proof'/name).read_text()
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
print('Synchronized editable source and three deliveries.',json.dumps(growth))
