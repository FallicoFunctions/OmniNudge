"""Verify the delivered front-sweep assets and record this male-only pass."""
from pathlib import Path
import json,gzip,hashlib

root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study'
parent=study/'hair-likeness-20260921';folder=parent/'male-fringe-sweep-20260927'
load=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json')
before=load(folder/'before/completeAvatarDownloads.json');assets={}
for name,entry in d['assets'].items():
    p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
    assert sha(p)==entry['sha256']==manifest[name]['sha256']
    assert p.stat().st_size==entry['bytes']==manifest[name]['bytes']
    assert z.stat().st_size==entry['gzipBytes']==manifest[name]['gzipBytes']
    assert gzip.decompress(z.read_bytes())==p.read_bytes()
    assets[name]={**entry,'rawByteChange':entry['bytes']-before[name]['bytes'],'gzipByteChange':entry['gzipBytes']-before[name]['gzipBytes']}
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==d['nativeSourceSha256']
assert sha(root/'scripts/launch-body-proof/refine_male_fringe_sweep.py')==sha(folder/'authored-refinement.py')
for name in ['browser-errors.json','browser-upper-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-back-errors.json']:
    assert load(folder/name)==[],name
for name in ['male-fringe-sweep-probe.html','src/review/maleFringeSweepProbe.ts']:
    assert not (root/name).exists()
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json')
f=load(folder/'candidate-fringe-face-audit.json');m=load(folder/'male-motion-validation.json')
assert all(v['penetrating']==0 for v in f.values());assert m['movementSamples']==27
assert all(v['belowHalfMm']==0 for v in n['sampledSkinClearance'].values())
minimum=min(v['minimumSkinClearanceMm'] for v in n['sampledSkinClearance'].values())
face_minimum=min(v['minimumMm'] for k,v in f.items() if k.startswith('changed-'))
summary={'pass':folder.name,'scope':'Vary the front crossing waves and give the falling curls staggered, turning tips.',
         'authoring':a,'nativeChecks':n,'faceSamples':f,'motion':m,'assets':assets,'nativeSourceSha256':d['nativeSourceSha256'],
         'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},
         'limitations':['Finite pose and surface samples do not establish continuous or hair-to-hair collision freedom.',
                        'The front sweep remains heavier than the reference; this is an incremental likeness improvement.',
                        'The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(folder/'README.md').write_text(f'''# Male fringe sweep — September 27, 2026

The falling curls ended at nearly the same height and the crossing front waves formed a uniform arch. This pass varies the arch heights and turns the lower curl ends sideways, with shorter inner curls and longer outer curls.

## Authored change

{a['editedRibbons']:,} of {a['totalRibbons']:,} existing ribbons change. {a['crossingWaveRibbons']:,} participate in the crossing-wave field and {a['fallingCurlRibbons']:,} in the falling-curl field; those categories overlap. Every ribbon retains its first three scalp pairs. All {n['exactUneditedRibbons']:,} other main-groom ribbons, including {n['exactRearAndCrownRibbons']:,} ribbons outside the front region, and the other {n['unchangedMeshes']} meshes remain exact. No meshes or vertices are added.

The selected tips rise by {a['meanSelectedTipLiftMm']:.2f} mm on average, with a maximum of {a['maximumSelectedTipLiftMm']:.2f} mm. Maximum vertex movement is {a['maxMovementMm']:.2f} mm. The overall peak changes by {(a['afterPeakM']-a['beforePeakM'])*1000:.2f} mm. Width vectors remain within float32 tolerance; normals follow the edited curves. The hairline, support, nape, topology, UVs, colors, materials, weights, origins and relative secondary-motion offsets are retained. Vertex fitting adjusts {a["skinFitVertices"]:,} free vertices; surface fitting adjusts {a["surfaceFit"]["adjustedPairs"]:,} free pairs while retaining their width vectors.

The first candidate enlarged the outer loop too much in oblique view. Its editable source, helper, report, renders and build log are archived under `candidate-01-wide-outer-loop/`. The delivered candidate uses less lateral displacement and alternates lower and higher arches rather than raising every arch. A second candidate passed vertex checks but cut through the scalp at some connecting faces; its renders and failed surface audit are archived under `candidate-02-chord-contact/`. The final helper fits free pairs using triangle centers and edge midpoints across nine expressions and secondary-hair poses, then independently rechecks the result.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least {minimum:.5f} mm outside the skin. Neutral triangle centers and edge midpoints on changed hair remain at least {face_minimum:.5f} mm outside it. Retained fringe and fixed sections of selected ribbons have no sampled skin penetration. All 27 movement samples and scalp attachment checks pass. These finite checks do not prove continuous collision freedom or hair self-contact.

No new degenerate triangles or meaningful new width-direction flips are introduced. All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except the main groom's position, normal and tangent arrays. Outfit, rig, animation, material, texture, UV and weight data remain exact. Gzip round-trips, hashes, sizes, male manifest entries, native/runtime source equality and the archived authoring helper all pass.

Eight browser views and empty error logs are archived. The temporary camera-only page is removed. The standard male hair preview is restored.

## Reproduction and limitations

`before/` contains immutable native inputs, all three delivered male GLBs/gzip files, the download manifest, and previous renders. `build-candidate.py` applies `authored-refinement.py`. `validate-candidate.py` checks retained data, widths, sampled vertex clearance, roots and movement. `audit-fringe-faces.py -- --current` samples changed faces and retained fringe. `deliver.mjs` validates retained exported data, compresses assets, copies the native runtime and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_fringe_sweep.py`, called after the upper-wave pass in the male branch of `refine_reference_hair.py`. The incremental pass was validated; the full cumulative authoring pipeline was not rerun.

The front wave remains heavier than the reference. This is a refinement to its shape and ends, not a finished likeness match.
''')
print(json.dumps({'verifiedAssets':list(assets),'editedRibbons':a['editedRibbons'],'minimumSampledSkinClearanceMm':minimum,
                  'minimumChangedFaceClearanceMm':face_minimum,'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
