"""Verify delivered male assets and assemble this pass's final evidence."""
from pathlib import Path
import gzip
import hashlib
import json

root = Path.cwd()
study = root / 'assets-src/avatars/complete-pair-study'
parent = study / 'hair-likeness-20260921'
folder = parent / 'male-crown-profile-20260927'
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
assert not (root / 'male-crown-profile-probe.html').exists()
assert not (root / 'src/review/maleCrownProfileProbe.ts').exists()
views = ['upper', 'back', 'side', 'hair', 'face', 'run', 'walk']
for view in views:
    assert (folder / ('runtime-' + view + '.jpg')).stat().st_size > 10000
authoring = load(folder / 'authoring-report.json')
native = load(folder / 'native-checks.json')
faces = load(folder / 'candidate-fringe-face-audit.json')
coverage = load(folder / 'crown-coverage.json')
motion = load(folder / 'male-motion-validation.json')
assert coverage['after']['fraction'] > coverage['before']['fraction']
assert all(entry['penetrating'] == 0 for entry in faces.values())
assert motion['movementSamples'] == 27
summary = {
    'pass': folder.name,
    'scope': 'Round the male crown and redirect 168 existing upper locks across exposed support.',
    'authoring': authoring, 'nativeChecks': native, 'faceSamples': faces,
    'crownCoverage': coverage, 'motion': motion, 'assets': assets,
    'nativeSourceSha256': delivery['nativeSourceSha256'],
    'finalVerification': {'assetHashesSizesAndGzipMatch': True, 'nativeRuntimeMatches': True,
                          'browserErrors': 0, 'browserViews': views, 'temporaryProbeRemoved': True},
    'limitations': ['Finite pose and face samples; no continuous or hair-to-hair collision guarantee.',
                    'Coverage rays measure geometry, not texture opacity; screenshots establish the visible result.',
                    'The hairstyle still has broad, stylized locks and a smaller dark crown separation; this is not a finished likeness match.',
                    'Incremental pass validated; full cumulative authoring pipeline not rerun.']
}
(folder / 'pass-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
minimum = min(entry['minimumSkinClearanceMm'] for entry in native['sampledSkinClearance'].values())
peak_change = (authoring['afterPeakM'] - authoring['beforePeakM']) * 1000
text = f'''# Male crown profile — September 27, 2026

The broad crown shelf lacked a rounded crest, and a higher camera angle exposed a central patch of scalp support. This pass rounds the top into a modest off-center arch and redirects 168 existing upper locks across that patch.

## Authored result

The highest hair point rises {peak_change:.2f} mm. Shallow channels follow the sideways sweep, and high ends turn back into the arch. The redirected locks retain their root pairs, receive curved paths across the exposed region, and lie with their faces toward the crown. Their width directions remain continuous along their free lengths, avoiding twists.

The pass edits {authoring['editedRibbons']:,} of 6,340 main-groom ribbons. All {native['exactUneditedRibbons']:,} unedited ribbons, including all {native['exactProtectedFringeRibbons']:,} protected front curls, and 42 other meshes remain exact. All original root pairs and {native['exactLowerPairs']:,} lower pairs remain exact, including {native['exactLowerFringePairs']:,} lower pairs in the protected forehead locks. The 168 redirected upper locks are the explicit exception to the lower-height preservation mask. No topology, weights, origins, UVs, textures, vertex colors, material parameters, or relative motion shapes change.

## Verification

- Nine sampled expression and secondary-motion poses retain at least {minimum:.5f} mm clearance on changed vertices. Inside/outside ray controls pass.
- Neutral face centers and edge midpoints show no sampled skin penetrations in changed hair or retained fringe. See `candidate-fringe-face-audit.json` for the sample counts and the retained close-clearance front locations.
- All 168 redirected cards pass width-direction continuity checks. Maximum ribbon width remains 1.61913 mm, with no newly degenerate triangles.
- All 27 movement samples and attachment checks pass.
- In the measured central patch, geometry coverage above the cap increases from {coverage['before']['fraction']:.1%} to {coverage['after']['fraction']:.1%} over 6,400 vertical rays. This measures geometry coverage, not texture alpha; the upper browser view provides the visual comparison.
- All three male GLBs validate with zero errors. Strict comparisons retain all original data except main-groom position, normal, and tangent arrays. Gzip round-trips, hashes, manifest byte counts, and native/runtime source equality pass. Only male manifest records are merged.
- Browser upper, back, side, standard hair, face, run, and walk views are saved. Error logs are empty. The temporary camera-only probe is removed, and the standard hair preview is retained.

## Reproduction and evidence

`before/` contains immutable inputs and baseline images. `build-candidate.py` applies `authored-refinement.py` and renders five native views. `validate-candidate.py` checks retained data, structure, width continuity, sampled skin clearance, and motion. `audit-fringe-faces.py -- --current` checks neutral triangle samples. `measure-crown-coverage.py` compares the measured crown patch. The shared `apply_reference_hair.mjs male` exports the assets, and `deliver.mjs` validates retained data and merges male download records. `finalize-evidence.py` checks the final delivery and writes this report.

The live helper is `scripts/launch-body-proof/refine_male_crown_profile.py`, with a male-only call after the rear-flow pass in `refine_reference_hair.py`. The full cumulative pipeline was not rerun. Earlier candidate folders retain the iterations used to identify high endpoints, the exposed crown location, card orientation, and temple intersections caused by moving upper sections of the front curls. The final version preserves those front curls completely.

These checks use finite samples and do not establish continuous collision freedom or strand self-contact. The upper browser comparison shows a smaller exposed crown patch, with dark separation still visible between the crossing locks. The hairstyle still has broad, stylized locks; this is another reference refinement, not a completed likeness match.
'''
(folder / 'README.md').write_text(text)
print(json.dumps({'verifiedAssets': list(assets), 'browserErrors': 0,
                  'nativeRuntimeMatch': True, 'temporaryProbeRemoved': True,
                  'crownCoverageBeforeAfter': [coverage['before']['fraction'], coverage['after']['fraction']]}, indent=2))
