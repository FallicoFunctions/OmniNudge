"""Verify delivered male assets and assemble this pass's final evidence."""
from pathlib import Path
import gzip
import hashlib
import json

root = Path.cwd()
study = root / 'assets-src/avatars/complete-pair-study'
parent = study / 'hair-likeness-20260921'
folder = parent / 'male-crown-blend-20260927'
load = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
delivery = load(folder / 'delivery-verification.json')
manifest = load(root / 'src/player/completeAvatarDownloads.json')
before = load(folder / 'before/completeAvatarDownloads.json')
assets = {}
for name, data in delivery['assets'].items():
    path = root / 'public/assets/avatars/complete-pair' / name
    compressed = path.with_suffix('.glb.gz')
    assert sha(path) == data['sha256'] == manifest[name]['sha256']
    assert path.stat().st_size == data['bytes'] == manifest[name]['bytes']
    assert compressed.stat().st_size == data['gzipBytes'] == manifest[name]['gzipBytes']
    assert gzip.decompress(compressed.read_bytes()) == path.read_bytes()
    assets[name] = {**data, 'rawByteChange': data['bytes'] - before[name]['bytes'],
                   'gzipByteChange': data['gzipBytes'] - before[name]['gzipBytes']}
assert sha(parent / 'male-hair-refined.blend') == sha(study / 'male-runtime.blend') == delivery['nativeSourceSha256']
for name in ['browser-errors.json', 'browser-upper-errors.json', 'browser-side-errors.json', 'browser-back-errors.json']:
    assert load(folder / name) == [], name
assert not (root / 'male-crown-blend-probe.html').exists()
assert not (root / 'src/review/maleCrownBlendProbe.ts').exists()
views = ['upper', 'back', 'side', 'hair', 'face', 'run', 'walk']
for view in views:
    assert (folder / ('runtime-' + view + '.jpg')).stat().st_size > 10000
authoring = load(folder / 'authoring-report.json')
native = load(folder / 'native-checks.json')
faces = load(folder / 'candidate-fringe-face-audit.json')
coverage = load(folder / 'crown-coverage.json')
motion = load(folder / 'male-motion-validation.json')
assert coverage['after']['forward-separation']['fraction'] > coverage['before']['forward-separation']['fraction']
assert coverage['after']['combined']['fraction'] > coverage['before']['combined']['fraction']
assert coverage['after']['original-center']['fraction'] > coverage['before']['original-center']['fraction'] - .01
assert all(entry['penetrating'] == 0 for entry in faces.values())
assert motion['movementSamples'] == 27
summary = {
    'pass': folder.name,
    'scope': 'Extend the ends of 168 crown ribbons into the forward separation while preserving the first six pairs and all other hair.',
    'authoring': authoring, 'nativeChecks': native, 'faceSamples': faces,
    'crownCoverage': coverage, 'motion': motion, 'assets': assets,
    'nativeSourceSha256': delivery['nativeSourceSha256'],
    'finalVerification': {'assetHashesSizesAndGzipMatch': True, 'nativeRuntimeMatches': True,
                          'browserErrors': 0, 'browserViews': views, 'temporaryProbeRemoved': True},
    'limitations': ['Finite pose and face samples; no continuous or hair-to-hair collision guarantee.',
                    'Coverage rays measure geometry, not texture opacity; screenshots establish the visible result.',
                    'The broad locks and some dark separation remain; this is not a finished likeness match.',
                    'Incremental pass validated; full cumulative authoring pipeline not rerun.']
}
(folder / 'pass-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
minimum = min(entry['minimumSkinClearanceMm'] for entry in native['sampledSkinClearance'].values())
peak_change = (authoring['afterPeakM'] - authoring['beforePeakM']) * 1000
text = f"""# Male crown blending — September 27, 2026

The crown sweep stopped short of the neighboring front waves, exposing dark support between them. This pass extends the existing crown ends forward and retains enough width through the taper to blend into that neighboring hair.

## Authored change

Only the last six pairs of 168 main-groom ribbons change. Their first six pairs, all 6,172 other ribbons, all 1,189 protected front curls, and the other 42 meshes remain exact. The lowered hairline and the upper arches are retained. The highest hair point changes by {peak_change:.2f} mm. No meshes, vertices, materials, or textures are added.

The ends extend forward by up to 34 mm, with a small sideways turn and a 4 mm descent. Existing strands keep their UVs and vertex colors. Card widths stay below the original maximum, and adjacent width directions stay consistent to avoid twisted surfaces. Skin fitting adjusts 12 edge vertices across the sampled poses.

## Verification

- Native structure, topology, UVs, material parameters, colors, weights, origins, relative morph offsets, and unchanged geometry pass retained-data checks.
- Nine sampled expression and hair poses retain at least {minimum:.5f} mm clearance on changed vertices. No newly degenerate triangles or width-direction flips are introduced.
- Neutral triangle centers and edge midpoints show no sampled skin penetration in changed hair or the retained fringe. The close front-fringe locations are unchanged; see the face audit for details.
- All 27 movement samples and attachment checks pass.
- Vertical geometry-ray coverage in the forward separation increases from {coverage['before']['forward-separation']['fraction']:.1%} to {coverage['after']['forward-separation']['fraction']:.1%}. Combined coverage increases from {coverage['before']['combined']['fraction']:.1%} to {coverage['after']['combined']['fraction']:.1%}. The original center changes from {coverage['before']['original-center']['fraction']:.1%} to {coverage['after']['original-center']['fraction']:.1%}. These rays measure geometry above the cap, not texture opacity.
- All three male GLBs validate with zero errors. Strict comparisons retain every original accessor except the main groom's position, normal, and tangent arrays. Textures, material parameters, colors, rig, animations, and outfit data remain exact.
- Gzip round-trips, final hashes and byte counts, the male download manifest records, and native/runtime source equality pass. Browser upper, side, back, hair, face, run, and walk images are saved with empty error logs. The temporary camera-only probe is removed.

## Reproduction and evidence

Immutable inputs and prior images are in `before/`. `build-candidate.py` applies `authored-refinement.py` and renders five views. `validate-candidate.py` checks retained structure, the six fixed pairs, card direction, sampled clearance, and motion. `audit-fringe-faces.py -- --current` checks changed triangle faces and the retained front fringe. `measure-crown-coverage.py` compares three fixed regions. The shared `apply_reference_hair.mjs male` exports only male assets. `deliver.mjs` checks exported retained data and gzip, copies the native runtime, and merges male records into a fresh manifest read. `finalize-evidence.py` verifies the final delivery and writes this report.

The live helper is `scripts/launch-body-proof/refine_male_crown_blend.py`, called after the crown-profile pass in the male branch of `refine_reference_hair.py`. The full cumulative authoring pipeline was not rerun.

The ends connect more smoothly into adjacent hair. Broad stylized locks and some dark separation remain. These finite samples do not prove continuous collision freedom or strand self-contact; the model is still being refined toward the reference.
"""
(folder / 'README.md').write_text(text)
print(json.dumps({'verifiedAssets': list(assets), 'browserErrors': 0,
                  'nativeRuntimeMatch': True, 'temporaryProbeRemoved': True,
                  'forwardCoverageBeforeAfter': [coverage['before']['forward-separation']['fraction'], coverage['after']['forward-separation']['fraction']]}, indent=2))
