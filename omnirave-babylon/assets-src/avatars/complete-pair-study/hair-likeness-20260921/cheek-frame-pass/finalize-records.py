from pathlib import Path
import gzip
import hashlib
import json
import shutil
import struct

root=Path.cwd()
study=root/'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir=study/'cheek-frame-pass'
read=lambda file:json.loads(file.read_text())
write=lambda file,value:file.write_text(json.dumps(value,indent=2)+'\n')
sha=lambda data:hashlib.sha256(data).hexdigest()

native=read(pass_dir/'native-preservation.json')
portable=read(pass_dir/'portable-cheek-frame-validation.json')
browser_errors=read(pass_dir/'browser-errors.json')
assert not browser_errors
assert native['unchangedOtherMeshContracts']==62 and native['unchangedPackedImages']==93
assert native['unchangedBones']==56 and native['unchangedActions']==3
assert native['movementSamples']==27 and native['expressionSamples']==7
assert native['minimumSkinClearanceMm']>3 and native['minimumEarringClearanceMm']>45
assert native['maximumHeadRelativeDriftMm']<.01
assert portable['female.glb']['vertices']==504 and portable['female.glb']['triangles']==648
assert portable['female-lod1.glb']['vertices']==252 and portable['female-lod1.glb']['triangles']==324
assert portable['female-lod2.glb']['omittedAtDistance']
assert (study/'female-vertex-mapping.json').read_bytes()==(pass_dir/'before/female-vertex-mapping.json').read_bytes()

shutil.copy2(study/'female-hair-refined.blend',study.parent/'female-runtime.blend')
shutil.copy2(pass_dir/'after-oblique.png',study/'female-blender-oblique.png')
for label,logfile in {
    'build':'/tmp/female-cheek-lock-build.log',
    'native':'/tmp/female-cheek-native.log',
    'export':'/tmp/female-cheek-export.log',
    'portable':'/tmp/female-cheek-portable.log',
    'delivery':'/tmp/female-cheek-delivery.log',
}.items():
    shutil.copy2(logfile,pass_dir/(label+'.log'))
for name in ['female-native-validation.json','female-portable-validation.json','female-motion-validation.json']:
    shutil.copy2(study/name,pass_dir/name)

manifest=read(root/'src/player/completeAvatarDownloads.json')
previous=read(pass_dir/'before/completeAvatarDownloads.json')
exports=read(study/'female-portable-validation.json')
delivery={};growth={}
for name in ['female.glb','female-lod1.glb','female-lod2.glb']:
    file=root/'public/assets/avatars/complete-pair'/name
    raw=file.read_bytes();compressed=file.with_suffix(file.suffix+'.gz').read_bytes();digest=sha(raw)
    assert gzip.decompress(compressed)==raw
    assert manifest[name]=={'bytes':len(raw),'gzipBytes':len(compressed),'sha256':digest}
    assert exports[name]['sha256']==digest and exports[name]['gltfErrors']==0
    doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    assert len(doc['skins'][0]['joints'])==56
    assert sum(node.get('name')=='PLURR neon ear drops' for node in doc['nodes'])==1
    expected=0 if name=='female-lod2.glb' else 1
    assert sum(node.get('name')=='PLURR right cheek frame' for node in doc['nodes'])==expected
    assert not any(node.get('name') in ['PLURR face gems -1','PLURR face gems 1'] for node in doc['nodes'])
    assert portable[name]['earringsRetained']
    delivery[name]={'sha256':digest,'compressedBytes':len(compressed),'lossless':True,'joints':56,'cheekFrameVertices':portable[name]['vertices'],'earringsRetained':True,'eyeStudNodesAbsent':True}
    growth[name]={key:manifest[name][key]-previous[name][key] for key in ['bytes','gzipBytes']}
write(pass_dir/'delivery-verification.json',delivery)
assert (study.parent/'female-runtime.blend').read_bytes()==(study/'female-hair-refined.blend').read_bytes()

summary=read(study/'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend']=sha((study/'female-hair-refined.blend').read_bytes())
summary['exports']['female']=exports
summary['delivery'].update(delivery)
summary['femaleCheekFrameContinuation']={
    'change':'Added dark brunette cards down the exposed temple and cheek to improve the reference hair framing.',
    'nativePreservation':'cheek-frame-pass/native-preservation.json',
    'portableValidation':'cheek-frame-pass/portable-cheek-frame-validation.json',
    'evidenceDirectory':'cheek-frame-pass/',
    'nativeMovementSamples':27,'nativeExpressionSamples':7,
    'minimumSkinClearanceMm':native['minimumSkinClearanceMm'],
    'minimumEarringClearanceMm':native['minimumEarringClearanceMm'],
    'closeTriangles':648,'mediumTriangles':324,'distantTriangles':0,
    'addedTextures':0,'addedMaterials':0,'browserErrors':0,
    'scope':'One additional skinned hair primitive in close and medium detail, no added primitive in distant detail. Sampled clearance is not continuous collision proof.',
}
summary.setdefault('browserViews',[]).append('Female cheek frame pass: neutral face, hair view, running head pose; zero browser errors')
summary['femaleBrowserErrors']=0
summary['preserved']='The 62 earlier native meshes, 93 packed images, 56 bones and three animation actions remain exact. New cheek-framing hair shares the existing brunette material and head bone; the distant detail level remains unchanged.'
write(study/'validation-summary.json',summary)

readme=study/'README.md'
heading='## Female cheek-framing brunette locks — September 28\n\n'
section=(
    'The exposed side of the female face now has six fine brunette cards that\n'
    'fall from under the goggles toward the cheek. They share the existing hair\n'
    'material and head bone. The close model adds 648 triangles, the medium\n'
    'model uses three cards and 324 triangles, and the distant model omits this\n'
    'small detail. No textures or materials are added.\n\n'
    '`cheek-frame-pass/` retains the prior source and deliveries, native\n'
    'front/oblique/profile renders, browser views and validation records. The\n'
    '62 earlier meshes and 93 packed images remain exact. Twenty-seven\n'
    'movement samples and seven expression samples check head attachment,\n'
    'skin and earring clearance. These are finite samples; overall likeness\n'
    'remains in progress.\n\n'
)
text=readme.read_text()
if heading not in text:readme.write_text(text.replace('\n\n','\n\n'+heading+section,1))

owned=[root/'src/player/completeAvatarDownloads.json',study.parent/'female-runtime.blend',study/'female-hair-refined.blend',study/'README.md',study/'female-native-validation.json',study/'female-vertex-mapping.json']
owned+=list((root/'public/assets/avatars/complete-pair').glob('female*.glb*'))
state=read(study.parent/'current-state-validation.json')
state['checks']['gltfFiles'].update({name:{'bytes':manifest[name]['bytes'],'sha256':manifest[name]['sha256'],'gltfErrors':0} for name in delivery})
state['checks']['losslessDelivery']['assets'].update({name:manifest[name] for name in delivery})
state['checks']['referenceHair']['femaleCheekFramePass']={
    'nativeRecord':'hair-likeness-20260921/cheek-frame-pass/native-preservation.json',
    'portableRecord':'hair-likeness-20260921/cheek-frame-pass/portable-cheek-frame-validation.json',
    'addedMaterials':0,'addedTextures':0,'movementSamples':27,'expressionSamples':7,'browserErrors':0,
}
state['files'].update({str(file.relative_to(root)):{'bytes':len(file.read_bytes()),'sha256':sha(file.read_bytes())} for file in owned})
write(study.parent/'current-state-validation.json',state)
print('Female cheek frame source and three deliveries synchronized.',json.dumps(growth))
