from pathlib import Path
import gzip
import hashlib
import json
import shutil

root = Path.cwd()
study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
out = study / 'complexion-pass'
read = lambda file: json.loads(file.read_text())
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
sha = lambda data: hashlib.sha256(data).hexdigest()

native = read(out / 'native-preservation.json')
portable = read(out / 'portable-complexion-validation.json')
manifest = read(root / 'src/player/completeAvatarDownloads.json')
previous = read(out / 'before/completeAvatarDownloads.json')
exports = read(study / 'female-portable-validation.json')
assert native['unchangedMeshContracts'] == 63
assert native['unchangedPackedImages'] == 93
assert native['unchangedBones'] == 56 and native['unchangedActions'] == 3
assert not read(out / 'browser-errors.json')
assert read(study / 'female-native-validation.json')['faceSurface'] == read(out / 'before/female-native-validation.json')['faceSurface']

delivery = {}
growth = {}
for name in ['female.glb', 'female-lod1.glb', 'female-lod2.glb']:
    file = root / 'public/assets/avatars/complete-pair' / name
    raw = file.read_bytes()
    zipped = file.with_suffix(file.suffix + '.gz').read_bytes()
    assert gzip.decompress(zipped) == raw
    digest = sha(raw)
    assert manifest[name] == {'bytes': len(raw), 'gzipBytes': len(zipped), 'sha256': digest}
    assert portable[name]['sha256'] == exports[name]['sha256'] == digest
    assert portable[name]['unchangedSceneGraph'] and portable[name]['faceImageMatch']
    assert exports[name]['gltfErrors'] == 0
    delivery[name] = {'sha256': digest, 'compressedBytes': len(zipped), 'gltfErrors': 0, 'unchangedAccessors': portable[name]['unchangedAccessors'], 'unchangedTextures': portable[name]['unchangedTextures']}
    growth[name] = {key: manifest[name][key] - previous[name][key] for key in ['bytes', 'gzipBytes']}
write(out / 'delivery-verification.json', delivery)

shutil.copy2(study / 'female-hair-refined.blend', study.parent / 'female-runtime.blend')
shutil.copy2(out / 'after-oblique.png', study / 'female-blender-oblique.png')
for name, logfile in [('build', '/tmp/female-complexion-build.log'), ('native', '/tmp/female-complexion-native.log'), ('delivery', '/tmp/female-complexion-delivery.log'), ('portable', '/tmp/female-complexion-portable.log')]:
    shutil.copy2(logfile, out / (name + '.log'))
for name in ['female-native-validation.json', 'female-portable-validation.json']:
    shutil.copy2(study / name, out / name)

summary = read(study / 'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend'] = sha((study / 'female-hair-refined.blend').read_bytes())
summary['exports']['female'] = exports
summary['delivery'].update(delivery)
summary['femaleComplexionContinuation'] = {
    'change': 'Warmed the outer cheeks and temples through the existing female skin color texture.',
    'nativePreservation': 'complexion-pass/native-preservation.json',
    'portableValidation': 'complexion-pass/portable-complexion-validation.json',
    'evidenceDirectory': 'complexion-pass/',
    'unchangedMeshContracts': 63,
    'unchangedBones': 56,
    'unchangedActions': 3,
    'addedRuntimeTextures': 0,
    'replacedRuntimeTextures': 1,
    'browserErrors': 0,
    'scope': 'Material-only face color refinement. Front, oblique and profile native views plus neutral, smile and closed-eye browser checks. Existing geometry and animation validation remains applicable.'
}
summary.setdefault('browserViews', []).append('Female complexion pass: neutral face, smile and closed eyes; zero browser errors')
summary['femaleBrowserErrors'] = 0
summary['preserved'] = 'All 63 native mesh contracts, 93 existing packed images, 56 bones and three animation actions remain exact. One new packed authoring image replaces the existing face color at runtime. All GLB accessors, scene structure and other runtime textures are unchanged.'
write(study / 'validation-summary.json', summary)

readme = study / 'README.md'
heading = '## Female cheek and temple complexion — September 28\n\n'
section = (
    'The face now has restrained warmth along the outer cheeks and temples,\n'
    'closer to the complexion in the original artwork. The retained makeup,\n'
    'skin detail and roughness map remain intact. The editable Blender graph\n'
    'bakes this finish onto the existing UVs.\n\n'
    '`complexion-pass/` contains the previous source and deliveries, front,\n'
    'oblique and profile renders, a live preview image and validation records.\n'
    'All 63 meshes, 56 bones and three clips are exact, as are every runtime\n'
    'accessor and all other textures. Only the existing face color image is\n'
    'replaced across close, medium and distant detail.\n\n'
)
text = readme.read_text()
if heading not in text:
    readme.write_text(text.replace('\n\n', '\n\n' + heading + section, 1))

state_file = study.parent / 'current-state-validation.json'
state = read(state_file)
state['checks']['gltfFiles'].update({name: {'bytes': manifest[name]['bytes'], 'sha256': manifest[name]['sha256'], 'gltfErrors': 0} for name in delivery})
state['checks']['losslessDelivery']['assets'].update({name: manifest[name] for name in delivery})
state['checks']['referenceHair']['femaleComplexionPass'] = {
    'nativeRecord': 'hair-likeness-20260921/complexion-pass/native-preservation.json',
    'portableRecord': 'hair-likeness-20260921/complexion-pass/portable-complexion-validation.json',
    'addedRuntimeTextures': 0, 'replacedRuntimeTextures': 1, 'unchangedMeshContracts': 63, 'browserErrors': 0
}
owned = [root / 'src/player/completeAvatarDownloads.json', study.parent / 'female-runtime.blend', study / 'female-hair-refined.blend', study / 'README.md', study / 'female-native-validation.json', study / 'female-portable-validation.json', study / 'validation-summary.json', study / 'female-blender-oblique.png', out / 'female-face-complexion-color.png']
owned += list((root / 'public/assets/avatars/complete-pair').glob('female*.glb*'))
state['files'].update({str(file.relative_to(root)): {'bytes': len(file.read_bytes()), 'sha256': sha(file.read_bytes())} for file in owned})
write(state_file, state)
print('COMPLEXION_FINALIZED', json.dumps(growth))
