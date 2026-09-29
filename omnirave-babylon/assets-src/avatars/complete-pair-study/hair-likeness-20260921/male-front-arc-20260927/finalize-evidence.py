"""Verify delivered male arc revision and record reproducible evidence."""
from pathlib import Path
import json,gzip,hashlib
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study';parent=study/'hair-likeness-20260921';folder=parent/'male-front-arc-20260927'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json');assets={}
for name,entry in d['assets'].items():
 p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
 assert sha(p)==entry['sha256']==manifest[name]['sha256']
 assert p.stat().st_size==entry['bytes']==manifest[name]['bytes']
 assert z.stat().st_size==entry['gzipBytes']==manifest[name]['gzipBytes']
 assert gzip.decompress(z.read_bytes())==p.read_bytes();assets[name]=entry
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==d['nativeSourceSha256']
assert sha(root/'scripts/launch-body-proof/refine_male_front_arc.py')==sha(folder/'authored-refinement.py')
for name in ['browser-errors.json','browser-upper-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-back-errors.json']:assert load(folder/name)==[],name
for name in ['male-front-arc-probe.html','src/review/maleFrontArcProbe.ts']:assert not (root/name).exists()
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
for v in ['front','oblique','side','back','upper']:assert (folder/('male-'+v+'.png')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');f=load(folder/'candidate-fringe-face-audit.json');m=load(folder/'male-motion-validation.json')
assert all(v['penetrating']==0 for v in f.values());assert m['movementSamples']==27
assert all(v['belowHalfMm']==0 for v in n['sampledSkinClearance'].values())
minimum=min(v['minimumSkinClearanceMm'] for v in n['sampledSkinClearance'].values());face_minimum=min(v['minimumMm'] for k,v in f.items() if k.startswith('changed-'))
summary={'pass':folder.name,'scope':'Lower the front arch and open the hanging curl ends into a relaxed sideways fall.',
 'authoring':a,'nativeChecks':n,'faceSamples':f,'motion':m,'assets':assets,'nativeSourceSha256':d['nativeSourceSha256'],
 'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},
 'limitations':['Finite pose and surface samples do not establish continuous or hair-to-hair collision freedom.',
 'The hairstyle remains an incremental likeness match, with denser support and less fine flyaway detail than the reference.',
 'This incremental pass was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(folder/'README.md').write_text(f'''# Male front arc — September 27, 2026

The large frontal loop looked circular and heavy. This pass lowers its upper arc, advances the sideways sweep, and removes much of the inward return at the ends of falling curls. Higher short curls extend downward more than the existing long locks, leaving staggered tips.

## Geometry and retained data

{a['editedRibbons']:,} of {a['totalRibbons']:,} main-groom ribbons change. All first three scalp pairs, {n['exactUneditedRibbons']:,} unselected ribbons, {n['exactRearAndCrownRibbons']:,} rear/crown ribbons and {n['unchangedMeshes']} other meshes remain exact. Hair width vectors, UVs, vertex colors including the prior front density refinement, materials, textures, weights, transforms and relative motion shapes are retained. No geometry is added. Maximum vertex movement is {a['maxMovementMm']:.3f} mm; mean selected tip-height change is {a['meanSelectedTipLiftMm']:.3f} mm. The overall peak changes by {(a['afterPeakM']-a['beforePeakM'])*1000:.3f} mm.

The first attempt was too subtle in front and oblique views; its helper, report, log and renders are archived under `candidate-01-subtle-arc/`. The delivered revision more clearly opens the ends. Skin fitting translates whole free pairs, retaining thin widths and roots, rather than applying structural overlap rules to hair.

## Verification

Nine expression/secondary-hair samples keep changed vertices at least {minimum:.6f} mm outside the skin. Triangle-center and edge-midpoint fitting across nine poses reports {a['surfaceFit']['minimumSampledGapMm']:.6f} mm minimum clearance. An independent neutral surface audit finds changed faces at least {face_minimum:.6f} mm outside the skin and no sampled penetration in retained fringe. All 27 movement samples and scalp attachment checks pass. These are finite samples, not a continuous or self-collision guarantee.

All three male GLBs validate with zero errors. Strict exported comparison permits only the main groom's position, normal and tangent arrays to differ; all other accessors, rig, outfit, animations, materials and texture bytes remain exact. Gzip round-trips, hashes, sizes, native/runtime equality and fresh male-only manifest merge pass. Five native renders, eight browser views and five empty browser error logs are archived. Temporary camera pages are removed; the standard male hair preview is restored.

## Reproduction and remaining work

`before/` contains immutable source, mapping, reports, prior renders, GLBs, gzip files and manifest. `build-candidate.py` calls the archived `authored-refinement.py` helper. `validate-candidate.py`, `audit-fringe-faces.py -- --current`, `deliver.mjs` and `finalize-evidence.py` record retained-data checks and delivery evidence.

The live helper `scripts/launch-body-proof/refine_male_front_arc.py` is hooked after front separation in the male branch of `refine_reference_hair.py`. The incremental pass was verified; the full cumulative pipeline was not rerun. The hairstyle still needs finer wisps and closer support-layer likeness to the reference.
''')
print(json.dumps({'verifiedAssets':list(assets),'editedRibbons':a['editedRibbons'],'minimumSampledSkinClearanceMm':minimum,'minimumChangedFaceClearanceMm':face_minimum,'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
