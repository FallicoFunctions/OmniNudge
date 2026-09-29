"""Verify final male-only nape delivery and collect review evidence."""
from pathlib import Path
import json,gzip,hashlib
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study';parent=study/'hair-likeness-20260921';folder=parent/'male-nape-shape-20260927'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json');before=load(folder/'before/completeAvatarDownloads.json');assets={}
for name,entry in d['assets'].items():
 p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
 assert sha(p)==entry['sha256']==manifest[name]['sha256']
 assert p.stat().st_size==entry['bytes']==manifest[name]['bytes']
 assert z.stat().st_size==entry['gzipBytes']==manifest[name]['gzipBytes']
 assert gzip.decompress(z.read_bytes())==p.read_bytes()
 assets[name]={**entry,'rawByteChange':entry['bytes']-before[name]['bytes'],'gzipByteChange':entry['gzipBytes']-before[name]['gzipBytes']}
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==d['nativeSourceSha256']
for name in ['browser-errors.json','browser-upper-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-back-errors.json']:assert load(folder/name)==[],name
for name in ['male-nape-shape-probe.html','src/review/maleNapeShapeProbe.ts']:assert not (root/name).exists()
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');f=load(folder/'candidate-face-audit.json');m=load(folder/'male-motion-validation.json')
assert all(v['penetrating']==0 for v in f.values());assert m['movementSamples']==27
minimum=min(v['minimumSkinClearanceMm'] for v in n['sampledSkinClearance'].values());face_minimum=min(v['minimumMm'] for v in f.values())
summary={'pass':folder.name,'scope':'Reshape the low posterior scalp and carried hair roots, with a shared softer opacity transition.','authoring':a,'nativeChecks':n,'faceSamples':f,'motion':m,'assets':assets,'nativeSourceSha256':d['nativeSourceSha256'],'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},'limitations':['Rear shape is an authored interpretation; the supplied reference does not show the nape directly.','Finite pose and surface samples do not establish continuous or hair-to-hair collision freedom.','Broad upper locks and dark support remain; this is not a finished likeness match.','The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(folder/'README.md').write_text(f'''# Male nape shape — September 27, 2026

Isolating the outer hair and its support showed that the smooth underlayer created most of the straight rear boundary. This pass reshapes that support into a lower, gently irregular nape and carries the attached roots with it. The rear view is an authored interpretation because the reference does not directly show the back.

## Authored change

The central rear scalp edge descends by {a['scalpRearEdgeMeanDropMm']:.2f} mm on average across {a['centralRearEdgeVertices']} edge vertices. A modest off-center low point and overlapping variations replace the even arc. The scalp and rooted underlayer share a wider, irregular opacity transition. Existing RGB colors, materials, and textures are unchanged.

The scalp, rooted underlayer, and main groom retain topology, UVs, origins, weights, and relative morph offsets. The main groom's final three pairs, all {n['exactProtectedFringeRibbons']:,} protected front curls, all {n['exactCrownBridgeRibbons']} crown bridge ribbons, all points above 1.750 m, and the frontal points below y = -0.065 m are exact. The other {n['unchangedMeshes']} meshes are exact. No meshes or vertices are added.

The first candidate carried a small deformation above the intended lower region. The final candidate explicitly fades the carrier before the upper hair; the first candidate's helper, images, and reports are archived under `candidate-01-upper-carrier/`.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least {minimum:.5f} mm from the skin. Neutral triangle centers and edge midpoints on all three changed meshes remain at least {face_minimum:.5f} mm outside the skin. These are finite checks, not continuous or hair-to-hair collision guarantees. All 27 movement samples and scalp-root attachment checks pass.

Widths remain equal to the immutable input within float32 tolerance, including the wider rooted support cards. No new degenerate triangles are introduced. Vertex alpha is allowed to change only on the two support layers; RGB and all main-groom colors remain exact.

All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except positions, normals, and tangents on the three changed hair meshes and COLOR_0 on the two support layers. Rig, animation, outfit, texture, material, UV, and weight data remain exact. Final gzip round-trips, hashes, sizes, male manifest entries, and native/runtime source equality pass. Eight browser views and empty error logs are archived; the temporary camera-only page is removed.

## Reproduction and evidence

`before/` contains immutable inputs and previous views. `diagnostic-*.png` isolate the original outer hair and support. `build-candidate.py` applies the helper archived as `authored-refinement.py`. `validate-candidate.py` checks retained data, sample clearance, roots, and motion. `audit-faces.py` samples triangle centers and edge midpoints. `deliver.mjs` checks the exports, compresses them, copies the native runtime, and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_nape_shape.py`, called after the side-layer pass in the male branch of `refine_reference_hair.py`. This incremental pass was validated; the full cumulative authoring pipeline was not rerun.

Broad upper locks and some dark support remain visible. The result is a nape-shape improvement, not a finished likeness match.
''')
print(json.dumps({'verifiedAssets':list(assets),'rearEdgeMeanDropMm':a['scalpRearEdgeMeanDropMm'],'minimumSampledSkinClearanceMm':minimum,'minimumFaceSampleClearanceMm':face_minimum,'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
