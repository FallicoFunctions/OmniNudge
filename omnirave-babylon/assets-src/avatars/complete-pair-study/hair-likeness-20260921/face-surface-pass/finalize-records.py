from pathlib import Path
import json,hashlib,gzip,shutil,difflib
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-surface-pass'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(f):return json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
native=read(d/'native-face-surface-validation.json');portable=read(d/'portable-face-surface-validation.json');exports=read(p/'female-portable-validation.json')
assert native['unchangedMeshContracts']==61 and not native['changedGeometry']
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
summary['femaleNoseLipContinuation']['nativeSource']='face-surface-pass/before/female-hair-refined.blend'
summary['femaleFaceSurfaceContinuation']={'changes':['Reshaped broad lip pigment border with a feathered transition into skin','Kept a fuller lower lip and softened the rose tone','Raised lip roughness to a satin finish'], 'addedGeometry':0,'addedRuntimeTextures':0,'replacedRuntimeTextures':2,'nativeValidation':native,'portableValidation':portable,'deliveryGrowth':growth,'evidenceDirectory':'face-surface-pass/','browserErrors':0,'geometryValidationReusedFrom':'nose-lip-pass/','scope':'Material-only pass: all 61 native mesh contracts and every exported accessor are exact. Prior motion and attachment checks remain applicable. Front, oblique, profile, smile and closed-eye native views plus browser expression checks validate the finish. Overall reference likeness remains in progress.'}
summary['browserViews']=[v for v in summary['browserViews'] if not v.startswith('Female')]+['Female lip surface pass: neutral face, smile, closed smile, side and full outfit; zero browser errors']
summary['femaleBrowserErrors']=0
summary['preserved']='Outfits, rig, weights and locomotion clips retained; female eye studs remain absent. Face/head geometry and iris tint are documented in earlier passes. The face-surface pass changes two existing skin texture payloads; all native mesh contracts and exported accessors remain exact.'
write(p/'validation-summary.json',summary)
readme=p/'README.md';heading='## Female lip surface finish — September 27\n\n'
section='The lip pigment now follows a narrower upper border and a fuller lower lip,\nwith a feathered transition into the nearby skin. The lip roughness is raised\nto 0.43 for a satin sheen. The normal map and all geometry are unchanged.\n\n`face-surface-pass/` contains archived inputs, diagnostic renders, the native\nshader authoring script, two baked channels and before/after evidence. The\n61 native mesh contracts remain exact, as do all exported accessors, scene\nstructure and animation data. Only the two existing skin color/roughness\nimage payloads change; texture dimensions and runtime image count stay fixed.\nNative front, oblique, side, smile and closed-eye views were inspected, followed\nby live preview expression checks. Previous movement and attachment validation\nremains applicable because this pass changes no geometry or motion data. Full\nreference likeness remains in progress.\n\n'
text=readme.read_text()
if heading not in text:readme.write_text(text.replace('\n\n','\n\n'+heading+section,1))
scripts=['refine_female_face_surface.py','apply_female_face_surface.mjs','apply_reference_hair.mjs']
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))+[r/'scripts/launch-body-proof'/n for n in scripts]+list(d.glob('female-face-surface-*.png'))
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':manifest[n]['bytes'],'sha256':manifest[n]['sha256'],'gltfErrors':0} for n in delivery})
state['checks']['losslessDelivery']['assets'].update({n:manifest[n] for n in delivery})
state['checks']['referenceHair']['femaleFaceSurfacePass']={'nativeRecord':'hair-likeness-20260921/face-surface-pass/native-face-surface-validation.json','exportRecord':'hair-likeness-20260921/face-surface-pass/portable-face-surface-validation.json','unchangedMeshContracts':61,'changedGeometry':False,'replacedTextures':2,'addedRuntimeTextures':0,'browserErrors':0,'geometryValidationReusedFrom':'nose-lip-pass/'}
state['files'].update({str(f.relative_to(r)):{'bytes':len(f.read_bytes()),'sha256':sha(f.read_bytes())} for f in owned});write(p.parent/'current-state-validation.json',state)
for suffix in ['diagnose','inspect','build','build-final','export','portable','delivery']:
 shutil.copy2('/tmp/female-face-surface-'+suffix+'.log',d/(suffix+'.log'))
for n in ['female-native-validation.json','female-portable-validation.json']:shutil.copy2(p/n,d/n)
for n in ['diagnose','inspect']:shutil.copy2('/tmp/female-face-surface-'+n+'.py',d/(n+'.py'))
diff=[]
for name in scripts:
 old=d/'before'/name;previous=old.read_text() if old.exists() else '';current=(r/'scripts/launch-body-proof'/name).read_text()
 diff.extend(difflib.unified_diff(previous.splitlines(True),current.splitlines(True),fromfile='before/'+name,tofile=name))
(d/'authoring-changes.patch').write_text(''.join(diff))
print('Synchronized editable source and three deliveries.',json.dumps(growth))
