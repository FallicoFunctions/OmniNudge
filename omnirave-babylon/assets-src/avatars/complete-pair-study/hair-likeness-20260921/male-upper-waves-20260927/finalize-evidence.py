"""Check the final upper-wave delivery and write its evidence summary."""
from pathlib import Path
import json,gzip,hashlib
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study';parent=study/'hair-likeness-20260921';folder=parent/'male-upper-waves-20260927'
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
for name in ['male-upper-waves-probe.html','src/review/maleUpperWavesProbe.ts']:assert not (root/name).exists()
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');f=load(folder/'candidate-fringe-face-audit.json');m=load(folder/'male-motion-validation.json');c=load(folder/'crown-coverage.json')
assert all(v['penetrating']==0 for v in f.values());assert m['movementSamples']==27
for region in ['original-center','forward-separation','combined']:assert c['after'][region]['fraction']>=c['before'][region]['fraction']-.04
minimum=min(v['minimumSkinClearanceMm'] for v in n['sampledSkinClearance'].values());face_minimum=min(v['minimumMm'] for k,v in f.items() if k.startswith('changed-'))
summary={'pass':folder.name,'scope':'Shape nested upper waves and turn upright ends back into the crown sweep.','authoring':a,'nativeChecks':n,'faceSamples':f,'crownCoverage':c,'motion':m,'assets':assets,'nativeSourceSha256':d['nativeSourceSha256'],'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},'limitations':['Finite pose and surface samples do not establish continuous or hair-to-hair collision freedom.','Crown coverage rays measure geometry rather than texture opacity; browser views establish the visible result.','The front fringe remains broad, and some dark support is still visible; this is not a finished likeness match.','The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
coverage_lines='\n'.join(f"- {region}: {c['before'][region]['fraction']:.1%} → {c['after'][region]['fraction']:.1%}." for region in ['original-center','forward-separation','combined'])
(folder/'README.md').write_text(f'''# Male upper waves — September 27, 2026

The upper groom followed nearly uniform arches that read as broad flat bands. This pass varies the height and timing of neighboring crown arches, gathers the crossing band into three overlapping waves, and turns high free ends back into the sweep.

## Authored change

{a['editedRibbons']:,} of {a['totalRibbons']:,} ribbons change. The first three pairs of every ribbon, all {n['exactProtectedFringeRibbons']:,} protected front curls, all {n['exactLowerPairs']:,} pairs with original minimum height at or below 1.770 m, all {n['exactUneditedRibbons']:,} other main-groom ribbons, and the other {n['unchangedMeshes']} meshes remain exact. The side layers, nape, and lowered hairline are retained. No meshes or vertices are added.

The highest hair point changes by {(a['afterPeakM']-a['beforePeakM'])*1000:.2f} mm. Maximum movement is {a['maxMovementMm']:.2f} mm. The three crossing waves use {a['nestedBridgeRibbons']} existing ribbons. Width vectors are retained within float32 tolerance; edited face normals follow the new curves. Topology, UVs, colors, materials, weights, origins, and relative motion shapes remain.

The first candidate was too subtle and introduced width-direction flips where rotated free pairs met fixed pairs. The final candidate retains the original width vectors and has clearer nested waves. The first candidate's helper, images, and logs are archived under `candidate-01-subtle-width-turn/`.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least {minimum:.5f} mm outside the skin. Neutral triangle centers and edge midpoints on changed hair remain at least {face_minimum:.5f} mm outside it. Retained fringe samples show no penetration. All 27 movement samples and scalp attachment checks pass. These finite checks do not prove continuous collision freedom or hair self-contact.

No newly degenerate triangles or meaningful new width-direction flips are introduced. Vertical crown geometry coverage is measured in three fixed regions:

{coverage_lines}

Each region uses 6,400 rays. The acceptance limit, set before measurement, permits at most four percentage points of geometry coverage loss while separating waves. These rays do not account for texture opacity; browser images establish visible coverage.

All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except the main groom's position, normal, and tangent arrays. Outfit, rig, animation, material, texture, UV, and weight data remain exact. Final gzip round-trips, hashes, sizes, male manifest entries, and native/runtime source equality pass. Eight browser views and empty error logs are archived. The temporary camera-only page is removed.

## Reproduction and evidence

`before/` contains immutable inputs and previous views. `build-candidate.py` applies the helper archived as `authored-refinement.py`. `validate-candidate.py` checks retained data, sample clearance, roots, and motion. `audit-fringe-faces.py -- --current` samples changed faces and retained fringe. `measure-crown-coverage.py` compares the fixed regions. `deliver.mjs` validates exports, compresses them, copies the native runtime, and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_upper_waves.py`, called after the nape-shape pass in the male branch of `refine_reference_hair.py`. The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.

The broad front fringe and some dark support remain visible. This is an upper-wave refinement, not a finished likeness match.
''')
print(json.dumps({'verifiedAssets':list(assets),'editedRibbons':a['editedRibbons'],'minimumSampledSkinClearanceMm':minimum,'minimumChangedFaceClearanceMm':face_minimum,'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
