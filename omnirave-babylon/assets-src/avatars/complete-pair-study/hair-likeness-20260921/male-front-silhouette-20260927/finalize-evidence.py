"""Verify final male front-silhouette delivery and browser views."""
from pathlib import Path
import json,gzip,hashlib
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study';parent=study/'hair-likeness-20260921';folder=parent/'male-front-silhouette-20260927'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json');assets={}
for name,entry in d['assets'].items():
 p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
 assert sha(p)==entry['sha256']==manifest[name]['sha256']
 assert p.stat().st_size==entry['bytes']==manifest[name]['bytes']
 assert z.stat().st_size==entry['gzipBytes']==manifest[name]['gzipBytes']
 assert gzip.decompress(z.read_bytes())==p.read_bytes();assets[name]=entry
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==d['nativeSourceSha256']
assert sha(root/'scripts/launch-body-proof/refine_male_front_silhouette.py')==sha(folder/'authored-refinement.py')
for name in ['browser-errors.json','browser-upper-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-back-errors.json']:assert load(folder/name)==[],name
for name in ['male-front-silhouette-probe.html','src/review/maleFrontSilhouetteProbe.ts']:assert not (root/name).exists()
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
for v in ['front','oblique','side','back','upper']:assert (folder/('male-'+v+'.png')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');f=load(folder/'candidate-fringe-face-audit.json');m=load(folder/'male-motion-validation.json')
assert all(v['penetrating']==0 for v in f.values());assert m['movementSamples']==27
assert all(v['belowHalfMm']==0 for v in n['sampledSkinClearance'].values())
minimum=min(v['minimumSkinClearanceMm'] for v in n['sampledSkinClearance'].values());face_minimum=min(v['minimumMm'] for k,v in f.items() if k.startswith('changed-'))
summary={'pass':folder.name,'scope':'Lift and sweep inner falling bangs to open the forehead, keeping the outer curl.',
 'authoring':a,'nativeChecks':n,'faceSamples':f,'motion':m,'assets':assets,'nativeSourceSha256':d['nativeSourceSha256'],
 'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},
 'limitations':['Finite pose and surface samples do not establish continuous or hair-to-hair collision freedom.',
 'The rooted support remains too smooth and the side haircut is still shorter than the reference.',
 'The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(folder/'README.md').write_text(f'''# Male front silhouette — September 27, 2026

The inner fringe still formed two heavy eyebrow-level bangs after tip feathering. This pass lifts and sweeps the inner falling curls away from the middle forehead while retaining the longest outer temple lock. The front looks more open and asymmetric, closer to the reference's sweep.

## Authored change

{a['editedRibbons']:,} of {a['totalRibbons']:,} main-groom ribbons change, including {a['strongInnerRibbons']:,} with strong inner influence. The first three scalp pairs, {n['exactUneditedRibbons']:,} unselected ribbons, {n['exactRearAndCrownRibbons']:,} rear/crown ribbons and {n['unchangedMeshes']} other meshes remain exact. No geometry is added. Tips rise {a['meanSelectedTipLiftMm']:.2f} mm on average, at most {a['maximumSelectedTipLiftMm']:.2f} mm; maximum vertex movement is {a['maxMovementMm']:.2f} mm. Overall hair peak is unchanged. Width vectors, UVs, colors, weights, matte materials, textures, transforms and relative motion shapes remain exact.

## Verification

Nine expression/secondary-hair samples keep changed vertices at least {minimum:.5f} mm outside the skin. Triangle-center and edge-midpoint fitting checks nine poses and reports {a['surfaceFit']['minimumSampledGapMm']:.5f} mm minimum. An independent neutral face audit finds changed faces at least {face_minimum:.5f} mm clear with zero sampled penetration. All 27 movement and scalp attachment samples pass. Finite checks do not prove continuous clearance or hair self-contact.

All three male GLBs validate with zero errors. Strict exported comparison permits only main-groom position, normal and tangent changes; all other accessors, rig, outfit, animations, colors, matte materials and texture bytes remain exact. Gzip, hashes, sizes, fresh male-only manifest merge and native/runtime source equality pass. Five native renders, eight browser views and empty browser-error logs are archived. The camera-only probe is removed and the standard male hair preview restored.

## Reproduction and remaining work

`before/` contains immutable native source, mapping, reports, GLBs, gzip, earlier renders and manifest. `build-candidate.py` applies the archived refinement helper; `validate-candidate.py`, `audit-fringe-faces.py -- --current`, `deliver.mjs` and `finalize-evidence.py` record checks and delivery. The live helper is `scripts/launch-body-proof/refine_male_front_silhouette.py`, called after fringe feathering in the male branch of `refine_reference_hair.py`.

The rooted support still reads as a smooth sheet, and the side haircut remains shorter than the reference. The incremental pass was validated; the full cumulative pipeline was not rerun.
''')
print(json.dumps({'verifiedAssets':list(assets),'editedRibbons':a['editedRibbons'],'minimumSampledSkinClearanceMm':minimum,'minimumChangedFaceClearanceMm':face_minimum,'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
