from pathlib import Path
import difflib
import gzip
import hashlib
import json
import shutil
import struct

root = Path.cwd()
study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir = study / 'iris-tone-pass'
read = lambda file: json.loads(file.read_text())
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
sha = lambda data: hashlib.sha256(data).hexdigest()

native = read(pass_dir / 'native-preservation.json')
portable = read(pass_dir / 'portable-iris-validation.json')
contour = read(study / 'female-native-validation.json')['faceContour']
motion = read(study / 'female-motion-validation.json')
assert native['unchangedMeshContracts'] == 62
assert native['unchangedPackedImages'] == 93
assert native['unchangedBones'] == 56 and native['unchangedActions'] == 3
assert native['unchangedMaterialSet'] == 69
assert contour['spec']['irisColorFactor'] == [.48, .20, .12, 1]
assert motion['validatedFaceContour'] == contour and motion['movementSamples'] == 27
assert not read(pass_dir / 'browser-errors.json')
assert (study / 'female-vertex-mapping.json').read_bytes() == (pass_dir / 'before/female-vertex-mapping.json').read_bytes()

shutil.copy2(study / 'female-hair-refined.blend', study.parent / 'female-runtime.blend')
for label in ['candidate', 'native', 'export', 'portable', 'delivery']:
    shutil.copy2('/tmp/female-iris-' + label + '.log', pass_dir / (label + '.log'))
for name in ['female-native-validation.json', 'female-portable-validation.json', 'female-motion-validation.json']:
    shutil.copy2(study / name, pass_dir / name)

manifest = read(root / 'src/player/completeAvatarDownloads.json')
previous = read(pass_dir / 'before/completeAvatarDownloads.json')
exports = read(study / 'female-portable-validation.json')
delivery = {}
growth = {}
for name in ['female.glb', 'female-lod1.glb', 'female-lod2.glb']:
    file = root / 'public/assets/avatars/complete-pair' / name
    data = file.read_bytes()
    zipped = file.with_suffix(file.suffix + '.gz').read_bytes()
    digest = sha(data)
    assert gzip.decompress(zipped) == data
    assert manifest[name] == {'bytes': len(data), 'gzipBytes': len(zipped), 'sha256': digest}
    assert exports[name]['sha256'] == digest and exports[name]['gltfErrors'] == 0
    document = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    assert len(document['skins'][0]['joints']) == 56
    assert sum(node.get('name') == 'PLURR neon ear drops' for node in document['nodes']) == 1
    assert not any(node.get('name') in ['PLURR face gems -1', 'PLURR face gems 1'] for node in document['nodes'])
    iris = next(material for material in document['materials'] if material['name'] == 'Launch female iris')
    assert iris['pbrMetallicRoughness']['baseColorFactor'] == [.48, .20, .12, 1]
    assert portable[name]['changedMaterial'] == 'Launch female iris' and portable[name]['earringsRetained']
    delivery[name] = {'sha256': digest, 'compressedBytes': len(zipped), 'lossless': True, 'joints': 56, 'earringsRetained': True, 'eyeStudNodesAbsent': True}
    growth[name] = {key: manifest[name][key] - previous[name][key] for key in ['bytes', 'gzipBytes']}
write(pass_dir / 'delivery-verification.json', delivery)
assert (study.parent / 'female-runtime.blend').read_bytes() == (study / 'female-hair-refined.blend').read_bytes()

summary = read(study / 'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend'] = sha((study / 'female-hair-refined.blend').read_bytes())
summary['exports']['female'] = exports
summary['delivery'].update(delivery)
summary['femaleMotionChecks'] = motion
summary['femaleIrisToneContinuation'] = {
    'change': 'Deepened the female iris to dark warm brown to match the reference more closely.',
    'previousColorFactor': [1, .46, .24, 1],
    'newColorFactor': [.48, .20, .12, 1],
    'nativePreservation': 'iris-tone-pass/native-preservation.json',
    'portableValidation': 'iris-tone-pass/portable-iris-validation.json',
    'evidenceDirectory': 'iris-tone-pass/',
    'browserErrors': 0,
    'scope': 'Only the existing iris material color factor changes; all geometry, morphs, textures, rig data, animations and other materials are retained.',
}
summary.setdefault('browserViews', []).append('Female iris tone pass: neutral face with open eyes; zero browser errors')
summary['femaleBrowserErrors'] = 0
summary['preserved'] = 'Female face contour v11 and all 62 native mesh contracts, 93 packed images, 56 bones and three animation actions remain exact. Only the existing iris material tone changes; earrings and eye-stud removal remain intact.'
write(study / 'validation-summary.json', summary)

readme = study / 'README.md'
heading = '## Female dark brown irises — September 28\n\n'
section = (
    'The irises now use a deeper warm-brown tint, closer to the reference eyes.\n'
    'The tint changes one existing material and adds no textures or geometry.\n'
    'All 62 mesh contracts, 93 packed images, 56 bones and three actions remain\n'
    'unchanged. Each exported detail level validates and retains the earrings.\n'
    '`iris-tone-pass/` contains the prior inputs, native render, and preservation\n'
    'and portable validation records. Overall likeness remains in progress.\n\n'
)
text = readme.read_text()
if heading not in text:
    readme.write_text(text.replace('\n\n', '\n\n' + heading + section, 1))

owned = [root / 'src/player/completeAvatarDownloads.json', study.parent / 'female-runtime.blend', study / 'female-hair-refined.blend', study / 'README.md', study / 'female-native-validation.json', study / 'female-vertex-mapping.json', root / 'scripts/launch-body-proof/refine_female_face_contour.py']
owned += list((root / 'public/assets/avatars/complete-pair').glob('female*.glb*'))
state = read(study.parent / 'current-state-validation.json')
state['checks']['gltfFiles'].update({name: {'bytes': manifest[name]['bytes'], 'sha256': manifest[name]['sha256'], 'gltfErrors': 0} for name in delivery})
state['checks']['losslessDelivery']['assets'].update({name: manifest[name] for name in delivery})
state['checks']['referenceHair']['femaleIrisTonePass'] = {'nativeRecord': 'hair-likeness-20260921/iris-tone-pass/native-preservation.json', 'portableRecord': 'hair-likeness-20260921/iris-tone-pass/portable-iris-validation.json', 'unchangedMeshContracts': 62, 'unchangedPackedImages': 93, 'browserErrors': 0, 'addedGeometry': 0, 'addedTextureImages': 0}
state['files'].update({str(file.relative_to(root)): {'bytes': len(file.read_bytes()), 'sha256': sha(file.read_bytes())} for file in owned})
write(study.parent / 'current-state-validation.json', state)

script = root / 'scripts/launch-body-proof/refine_female_face_contour.py'
diff = difflib.unified_diff((pass_dir / 'before' / script.name).read_text().splitlines(True), script.read_text().splitlines(True), fromfile='before/' + script.name, tofile=script.name)
(pass_dir / 'authoring-changes.patch').write_text(''.join(diff))
print('Female iris source and three deliveries synchronized.', json.dumps(growth))
