from pathlib import Path
import difflib
import gzip
import hashlib
import json
import shutil
import struct

root = Path.cwd()
study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir = study / 'gaze-settle-pass'
read = lambda file: json.loads(file.read_text())
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
sha = lambda data: hashlib.sha256(data).hexdigest()

native = read(pass_dir / 'native-face-contour-validation.json')
revision = read(pass_dir / 'native-revision-preservation.json')
portable = read(pass_dir / 'portable-face-contour-validation.json')
motion = read(study / 'female-motion-validation.json')
cascade = read(study / 'female-cascade-clearance.json')
assert native['spec']['version'] == 11
assert native['unchangedOtherMeshContracts'] == 59
assert len(native['poses']) == 10 and len(native['facialAttachments']) == 6
assert native['maximumRevisionDisplacementMm'] < .7
assert revision['unchangedOtherGeometryIncludingAllShapeKeys'] == 59
assert revision['unchangedPackedImages'] == 93
assert revision['minimumRevisionTriangleNormalDot'] > .99
assert revision['minimumRevisionTriangleAreaRatio'] > .8
assert motion['movementSamples'] == 27 and len(motion['attachments']) == 7
assert motion['validatedFaceContour'] == native
assert len(cascade['samples']) == 31
assert cascade['maximumStrandEdgeBodyIntersections'] == 0
assert cascade['maximumStrandEdgeJacketIntersections'] == 0
assert not read(pass_dir / 'browser-errors.json')
assert (study / 'female-vertex-mapping.json').read_bytes() == (pass_dir / 'before/female-vertex-mapping.json').read_bytes()

shutil.copy2(study / 'female-hair-refined.blend', study.parent / 'female-runtime.blend')
shutil.copy2(pass_dir / 'after-oblique.png', study / 'female-blender-oblique.png')
for label, logfile in {
    'candidate': '/tmp/female-gaze-candidate.log',
    'export': '/tmp/female-gaze-export.log',
    'portable': '/tmp/female-gaze-portable.log',
    'delivery': '/tmp/female-gaze-delivery.log',
    'native-preservation': '/tmp/female-gaze-motion.log',
    'movement': '/tmp/female-gaze-motion27.log',
}.items():
    shutil.copy2(logfile, pass_dir / f'{label}.log')
for name in ['female-native-validation.json', 'female-portable-validation.json', 'female-motion-validation.json', 'female-cascade-clearance.json']:
    shutil.copy2(study / name, pass_dir / name)

manifest = read(root / 'src/player/completeAvatarDownloads.json')
earlier = read(pass_dir / 'before/completeAvatarDownloads.json')
export_report = read(study / 'female-portable-validation.json')
delivery = {}
growth = {}
for name in ['female.glb', 'female-lod1.glb', 'female-lod2.glb']:
    file = root / 'public/assets/avatars/complete-pair' / name
    raw = file.read_bytes()
    compressed = file.with_suffix(file.suffix + '.gz').read_bytes()
    digest = sha(raw)
    assert gzip.decompress(compressed) == raw
    assert manifest[name] == {'bytes': len(raw), 'gzipBytes': len(compressed), 'sha256': digest}
    assert export_report[name]['sha256'] == digest and export_report[name]['gltfErrors'] == 0
    document = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
    assert len(document['skins'][0]['joints']) == 56
    assert sum(node.get('name') == 'PLURR neon ear drops' for node in document['nodes']) == 1
    assert not any(node.get('name') in ['PLURR face gems -1', 'PLURR face gems 1'] for node in document['nodes'])
    assert portable[name]['unchangedHairOutfitsRigAnimationsWeightsUvsTextures']
    delivery[name] = {'sha256': digest, 'compressedBytes': len(compressed), 'lossless': True, 'joints': 56, 'earringsRetained': True, 'eyeStudNodesAbsent': True}
    growth[name] = {key: manifest[name][key] - earlier[name][key] for key in ['bytes', 'gzipBytes']}
write(pass_dir / 'delivery-verification.json', delivery)
assert (study.parent / 'female-runtime.blend').read_bytes() == (study / 'female-hair-refined.blend').read_bytes()

summary = read(study / 'validation-summary.json')
summary['nativeFiles']['female-hair-refined.blend'] = sha((study / 'female-hair-refined.blend').read_bytes())
summary['exports']['female'] = export_report
summary['delivery'].update(delivery)
summary['femaleMotionChecks'] = motion
summary['femaleGazeContinuation'] = {
    'change': 'Lowered the female upper lids and subtly narrowed the openings for a calmer, more hooded neutral gaze.',
    'maximumRevisionDisplacementMm': native['maximumRevisionDisplacementMm'],
    'nativeValidation': 'gaze-settle-pass/native-face-contour-validation.json',
    'revisionPreservation': 'gaze-settle-pass/native-revision-preservation.json',
    'portableValidation': 'gaze-settle-pass/portable-face-contour-validation.json',
    'movementValidation': 'gaze-settle-pass/female-motion-validation.json',
    'evidenceDirectory': 'gaze-settle-pass/',
    'expressionPoses': 10,
    'movementSamples': 27,
    'browserErrors': 0,
    'scope': 'The body orbital field, brow and lash roots share the revision. All other native meshes, packed images, skin weights and animation clips are retained. Motion and clearance checks sample finite poses.',
}
summary.setdefault('browserViews', []).append('Female gaze pass: neutral, closed eyes and soft smile; zero browser errors')
summary['femaleBrowserErrors'] = 0
summary['preserved'] = 'Female face contour v11 revises the body orbital field, brow ribbons and lash roots. All 59 other native mesh contracts, 93 packed images, 56 bones, three animation actions and the neon ear drops remain intact. Historical records retain their own input scope.'
write(study / 'validation-summary.json', summary)

readme = study / 'README.md'
heading = '## Female calmer gaze — September 27\n\n'
section = (
    'The upper lids sit a little lower and the eye openings are subtly narrower,\n'
    'giving the neutral face a calmer gaze. The same continuous field moves the\n'
    'orbital skin, brows and lash roots through every expression shape. Eyeballs\n'
    'and irises retain their geometry.\n\n'
    '`gaze-settle-pass/` archives the prior editable source and all three exports,\n'
    'matched native renders and browser captures. Ten expression poses retain\n'
    'clean closures; 27 movement and 31 long-hair poses pass. Fifty-nine other\n'
    'mesh contracts and all 93 packed images are exact. The delivered glTFs\n'
    'retain the earrings and validate without errors. Full likeness remains\n'
    'in progress.\n\n'
)
text = readme.read_text()
if heading not in text:
    readme.write_text(text.replace('\n\n', '\n\n' + heading + section, 1))

scripts = ['refine_female_face_contour.py', 'apply_female_face_contour.mjs']
owned = [root / 'src/player/completeAvatarDownloads.json', study.parent / 'female-runtime.blend', study / 'female-hair-refined.blend', study / 'README.md', study / 'female-native-validation.json', study / 'female-vertex-mapping.json']
owned += list((root / 'public/assets/avatars/complete-pair').glob('female*.glb*'))
owned += [root / 'scripts/launch-body-proof' / name for name in scripts]
state = read(study.parent / 'current-state-validation.json')
state['checks']['gltfFiles'].update({name: {'bytes': manifest[name]['bytes'], 'sha256': manifest[name]['sha256'], 'gltfErrors': 0} for name in delivery})
state['checks']['losslessDelivery']['assets'].update({name: manifest[name] for name in delivery})
state['checks']['referenceHair']['femaleGazePass'] = {'nativeRecord': 'hair-likeness-20260921/gaze-settle-pass/native-face-contour-validation.json', 'portableRecord': 'hair-likeness-20260921/gaze-settle-pass/portable-face-contour-validation.json', 'maximumRevisionDisplacementMm': native['maximumRevisionDisplacementMm'], 'unchangedOtherMeshContracts': 59, 'expressionPoses': 10, 'movementSamples': 27, 'browserErrors': 0}
state['files'].update({str(file.relative_to(root)): {'bytes': len(file.read_bytes()), 'sha256': sha(file.read_bytes())} for file in owned})
write(study.parent / 'current-state-validation.json', state)

diff = []
for name in scripts:
    diff.extend(difflib.unified_diff((pass_dir / 'before' / name).read_text().splitlines(True), (root / 'scripts/launch-body-proof' / name).read_text().splitlines(True), fromfile='before/' + name, tofile=name))
(pass_dir / 'authoring-changes.patch').write_text(''.join(diff))
print('Female gaze source and all three deliveries synchronized.', json.dumps(growth))
