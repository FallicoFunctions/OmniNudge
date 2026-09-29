"""Check delivery, then write the evidence summary for the male side layers."""
from pathlib import Path
import gzip,hashlib,json
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study';parent=study/'hair-likeness-20260921';folder=parent/'male-side-layers-20260927'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
delivery=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json');before=load(folder/'before/completeAvatarDownloads.json');assets={}
for name,data in delivery['assets'].items():
 p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
 assert sha(p)==data['sha256']==manifest[name]['sha256']
 assert p.stat().st_size==data['bytes']==manifest[name]['bytes']
 assert z.stat().st_size==data['gzipBytes']==manifest[name]['gzipBytes']
 assert gzip.decompress(z.read_bytes())==p.read_bytes()
 assets[name]={**data,'rawByteChange':data['bytes']-before[name]['bytes'],'gzipByteChange':data['gzipBytes']-before[name]['gzipBytes']}
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==delivery['nativeSourceSha256']
for name in ['browser-errors.json','browser-upper-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-back-errors.json']:
 assert load(folder/name)==[],name
for name in ['male-side-layers-probe.html','src/review/maleSideLayersProbe.ts']:assert not (root/name).exists()
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');f=load(folder/'candidate-fringe-face-audit.json');m=load(folder/'male-motion-validation.json')
assert all(v['penetrating']==0 for v in f.values());assert m['movementSamples']==27
bridges=load(parent/'male-crown-blend-20260927/authoring-report.json')['editedRibbonIndices']
fringe=load(folder/'protected-fringe-ribbons.json')
assert not set(a['editedRibbonIndices'])&set(bridges)
assert not set(a['editedRibbonIndices'])&set(fringe)
minimum=min(v['minimumSkinClearanceMm'] for v in n['sampledSkinClearance'].values())
summary={'pass':folder.name,'scope':'Lengthen and stagger side and lower rear hair ends, retaining roots, forehead curls, and crown bridges.','authoring':a,'nativeChecks':n,'faceSamples':f,'motion':m,'assets':assets,'nativeSourceSha256':delivery['nativeSourceSha256'],'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},'limitations':['Finite pose and face sampling does not prove continuous or hair-to-hair collision freedom.','The dense support layer still makes a fairly straight rear boundary; broad upper locks remain.','This is an incremental likeness improvement; the full cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(folder/'README.md').write_text(f'''# Male side layers — September 27, 2026

The reference has layered side and rear hair, while the model's shorter ends expose a hard undercut boundary. This pass extends and staggers existing outer strands, with a shallow outward curve and a backward sweep near the ears. It adds layered ends around the retained support.

## Authored change

- {a['editedRibbons']:,} of {a['totalRibbons']:,} ribbons change; all other {a['totalRibbons']-a['editedRibbons']:,} ribbons remain exact.
- The first three pairs of every ribbon, all {len(fringe):,} protected forehead curls, all {len(bridges):,} crown bridge ribbons, and the other {n['unchangedMeshes']} meshes remain exact.
- Selected tips descend by {a['meanFinalTipDropMm']:.2f} mm on average. Lengths vary within and between waves; the largest authored drop is {a['maxAuthoredDropMm']:.2f} mm.
- Existing UVs, vertex colors, material parameters, weights, topology, origins, and relative motion shapes remain. No new meshes or vertices are added.
- The first candidate introduced width-direction flips at a few tight turns. The final candidate keeps adjacent free ribbon widths consistently oriented; the rejected candidate's helper, renders, and log are archived under `candidate-01-width-turn/`.

## Verification

Nine sampled expression and hair-motion poses keep changed vertices at least {minimum:.5f} mm from the skin. Neutral-pose triangle centers and edge midpoints show no sampled skin penetration. All 27 movement and attachment samples pass. These are finite samples and do not establish continuous or hair-to-hair collision freedom.

All three male GLBs validate with zero errors. Strict export comparison retains every accessor except the main groom's position, normal, and tangent arrays. Final gzip round-trips, hashes, byte counts, male download entries, and native/runtime source equality pass. Eight browser views are archived with empty error logs. The temporary camera-only page was removed.

## Reproduction

`before/` holds immutable inputs and prior views. `build-candidate.py` applies the helper archived as `authored-refinement.py`; `validate-candidate.py` checks retained data, geometry, and poses. `audit-fringe-faces.py -- --current` samples triangle surfaces. `deliver.mjs` validates exports and merges only male manifest entries. `finalize-evidence.py` checks final files and assembles this record.

The live helper is `scripts/launch-body-proof/refine_male_side_layers.py`, called after crown blending in the male branch of `refine_reference_hair.py`. This incremental pass was validated; the complete cumulative pipeline was not rerun.

## Remaining visual work

The dense support layer still produces a fairly straight rear boundary, and the upper locks remain broad. The side layering is closer to the reference, but the hairstyle is still being refined.
''')
print(json.dumps({'verifiedAssets':list(assets),'editedRibbons':a['editedRibbons'],'minimumSampledSkinClearanceMm':minimum,'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
