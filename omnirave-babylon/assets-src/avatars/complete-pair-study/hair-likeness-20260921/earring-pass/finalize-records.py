from pathlib import Path
import json,hashlib,gzip,struct,shutil
r=Path.cwd();p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'earring-pass'
read=lambda f:json.loads(f.read_text())
def write(f,v):f.write_text(json.dumps(v,indent=2)+'\n')
sha=lambda b:hashlib.sha256(b).hexdigest()
native=read(d/'native-earring-validation.json');preserve=read(d/'native-preservation.json');portable=read(d/'portable-earring-validation.json')
assert not read(d/'browser-errors.json')
assert native['vertices']==124 and native['headJointIndex']==44 and native['unchangedExistingMeshContracts']==61
assert preserve['unchangedMeshContracts']==61 and preserve['unchangedBones']==56 and preserve['unchangedActions']==3
assert len(preserve['movementSamples'])==27 and preserve['minimumFreeDropSkinDistanceMm']>2
assert len(preserve['expressionPoses'])>=6 and preserve['maximumHeadRelativeDriftMm']<.02
assert (p/'female-vertex-mapping.json').read_bytes()==(d/'before/female-vertex-mapping.json').read_bytes()
shutil.copy2(p/'female-hair-refined.blend',p.parent/'female-runtime.blend')
shutil.copy2(d/'after-oblique.png',p/'female-blender-oblique.png')
for suffix in ['candidate','build','native','export','portable','delivery']:
 shutil.copy2('/tmp/female-earring-'+suffix+'.log',d/(suffix+'.log'))
for name in ['female-native-validation.json','female-portable-validation.json']:
 shutil.copy2(p/name,d/name)
manifest=read(r/'src/player/completeAvatarDownloads.json');old=read(d/'before/completeAvatarDownloads.json');exports=read(p/'female-portable-validation.json')
delivery={};growth={}
for name in ['female.glb','female-lod1.glb','female-lod2.glb']:
 file=r/'public/assets/avatars/complete-pair'/name;data=file.read_bytes();z=file.with_suffix(file.suffix+'.gz').read_bytes();digest=sha(data)
 assert gzip.decompress(z)==data and manifest[name]=={'bytes':len(data),'gzipBytes':len(z),'sha256':digest}
 assert exports[name]['sha256']==digest and exports[name]['gltfErrors']==0
 doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
 assert len(doc['skins'][0]['joints'])==56
 assert sum(node.get('name')==native['mesh'] for node in doc['nodes'])==1
 assert not any(n.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for n in doc['nodes'])
 assert portable[name]['addedVertices']==native['vertices'] and portable[name]['oneDrawCall']
 delivery[name]={'sha256':digest,'compressedBytes':len(z),'lossless':True,'joints':56,'eyeStudNodesAbsent':True,'earringMeshPresent':True}
 growth[name]={key:manifest[name][key]-old[name][key] for key in ['bytes','gzipBytes']}
write(d/'delivery-verification.json',delivery)
assert (p.parent/'female-runtime.blend').read_bytes()==(p/'female-hair-refined.blend').read_bytes()
summary=read(p/'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend']=sha((p/'female-hair-refined.blend').read_bytes())
summary['exports']['female']=exports;summary['delivery'].update(delivery)
summary['femaleFaceToneContinuation']['nativeSource']='earring-pass/before/female-hair-refined.blend'
summary['femaleEarringContinuation']={
 'change':'Added the missing asymmetric lime and cyan-magenta ear drops from the female reference as one head-skinned, vertex-colored accessory mesh.',
 'addedMeshes':1,'addedMaterials':1,'addedImages':0,'headJointIndex':44,
 'nativeValidation':native,'nativePreservation':preserve,'portableValidation':portable,'deliveryGrowth':growth,
 'evidenceDirectory':'earring-pass/','browserErrors':0,
 'scope':'One measured ear attachment per side, 27 sampled movement frames, named expressions and three exported detail levels. Sampled clearance does not prove continuous contact.'}
summary.setdefault('browserViews',[]).append('Female earring pass: face, side, smile, closed eyes and three-quarter movement; zero browser errors')
summary['femaleBrowserErrors']=0
summary['preserved']='Female face contour v10 and surface finish v2, all 61 earlier mesh contracts, 56 bones, three animation clips and 93 packed image payloads remain exact. One head-skinned vertex-colored accessory mesh adds no runtime textures. Earlier sampled hair checks retain their input scope.'
write(p/'validation-summary.json',summary)
readme=p/'README.md';heading='## Female reference ear drops — September 27\n\n'
section='The reference has a long lime drop beside one cheek and a shorter cool-toned\ndrop on the other side. Both are now one head-weighted, vertex-colored mesh,\nso the pair adds one draw call and no image textures. Each clasp enters the\nmeasured ear lobe; the luminous lengths overlap their clasps by at least 5 mm.\n\n`earring-pass/` retains the previous editable source, all three exports,\nmatched front/oblique/profile renders, geometry data and native/portable checks.\nAll 61 existing meshes, 56 rest bones, three animation actions and packed\nimages are exact. Twenty-seven movement samples and expression poses verify\nhead attachment, and the three glTF detail levels validate. The clearance\nmeasurements cover finite samples; full reference likeness remains in progress.\n\n'
text=readme.read_text()
if heading not in text:readme.write_text(text.replace('\n\n','\n\n'+heading+section,1))
owned=[r/'src/player/completeAvatarDownloads.json',p.parent/'female-runtime.blend',p/'female-hair-refined.blend',p/'README.md',p/'female-native-validation.json',p/'female-vertex-mapping.json']
owned+=list((r/'public/assets/avatars/complete-pair').glob('female*.glb*'))
owned+=list(d.glob('*.py'))+list(d.glob('*.mjs'))+[d/'earring-geometry.json']
state=read(p.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({n:{'bytes':manifest[n]['bytes'],'sha256':manifest[n]['sha256'],'gltfErrors':0} for n in delivery})
state['checks']['losslessDelivery']['assets'].update({n:manifest[n] for n in delivery})
state['checks']['referenceHair']['femaleEarringPass']={'nativeRecord':'hair-likeness-20260921/earring-pass/native-earring-validation.json','portableRecord':'hair-likeness-20260921/earring-pass/portable-earring-validation.json','addedMeshes':1,'addedMaterials':1,'addedImages':0,'movementSamples':27,'browserErrors':0}
state['files'].update({str(f.relative_to(r)):{'bytes':len(f.read_bytes()),'sha256':sha(f.read_bytes())} for f in owned})
write(p.parent/'current-state-validation.json',state)
print('Synchronized female source and three ear-adorned deliveries.',json.dumps(growth))
