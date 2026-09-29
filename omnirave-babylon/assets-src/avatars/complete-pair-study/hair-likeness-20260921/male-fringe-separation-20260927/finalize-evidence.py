"""Verify the final male coverage pass and archive its evidence."""
from pathlib import Path
import json,gzip,hashlib
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study'
parent=study/'hair-likeness-20260921';folder=parent/'male-fringe-separation-20260927'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json')
old=load(folder/'before/completeAvatarDownloads.json');assets={}
for name,entry in d['assets'].items():
    p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
    assert sha(p)==entry['sha256']==manifest[name]['sha256']
    assert p.stat().st_size==entry['bytes']==manifest[name]['bytes']
    assert z.stat().st_size==entry['gzipBytes']==manifest[name]['gzipBytes']
    assert gzip.decompress(z.read_bytes())==p.read_bytes()
    assert entry['alphaCoverageOnly'] and entry['retainedGeometryOutfitRigAnimationMaterialsTexturesUVsWeights']
    assets[name]={**entry,'rawByteChange':entry['bytes']-old[name]['bytes'],'gzipByteChange':entry['gzipBytes']-old[name]['gzipBytes']}
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==d['nativeSourceSha256']
assert sha(root/'scripts/launch-body-proof/refine_male_fringe_separation.py')==sha(folder/'authored-refinement.py')
views=['upper','side','other-side','back','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
for name in ['browser-errors.json','browser-upper-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-back-errors.json']:
    assert load(folder/name)==[],name
for name in ['male-fringe-separation-probe.html','src/review/maleFringeSeparationProbe.ts']:
    assert not (root/name).exists()
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');m=load(folder/'male-motion-validation.json')
assert n['geometryRigWeightsUVsMorphsExact'] and n['materialsTexturesAndRGBExact']
assert m['movementSamples']==27
previous_faces=load(folder/'before/candidate-fringe-face-audit.json')
assert all(row['penetrating']==0 for row in previous_faces.values())
summary={'pass':folder.name,'scope':'Thin the high frontal support and overlapping front-wave fibers through retained vertex alpha.',
         'authoring':a,'nativeChecks':n,'motion':m,'inheritedSurfaceEvidence':previous_faces,'assets':assets,
         'nativeSourceSha256':d['nativeSourceSha256'],
         'finalVerification':{'nativeRuntimeMatches':True,'assetHashesSizesAndGzipMatch':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},
         'limitations':['Blender uses dithered alpha while the browser uses alpha testing; browser views establish the delivered appearance.',
                        'The overall front curl shape remains broad and the hairstyle is not a finished reference match.',
                        'Skin-clearance evidence is inherited through exact geometry and relative morph equality, not new surface sampling.',
                        'The incremental helper was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
rows='\n'.join(f"- {name}: {row['affectedRibbons']:,} selected ribbons, {row['changedAlphaVertices']:,} alpha values changed." for name,row in a['meshes'].items())
(folder/'README.md').write_text(f'''# Male fringe separation — September 27, 2026

Layer-isolation renders show that the straight frontal support fills the spaces between the outer curls, adding a uniform sheet beneath the sweep. This pass fades its high free section and thins overlapping outer fibers between three coherent front-wave lanes. The first three pairs of every ribbon keep their prior coverage. The scalp, rear, temple support beyond the front-root boundary and all geometry stay exact.

## Authored change

{rows}

Only alpha in the existing `MaleRearFinish` vertex attribute changes. RGB pigment, materials, shader nodes, packed texture bytes, mesh topology, positions, normals, UVs, weights, transforms, shape keys and rig are retained. Outer fading is restricted to the forehead-facing part of the fall; the crown-facing arch remains covered. Separate native checks preserve every pair behind the forward boundary. No geometry or textures are added.

The initial candidate was too subtle: residual coverage accumulated across overlapping cards. It is archived under `candidate-01-subtle-density/`. A second candidate also thinned 47 support ribbons beyond the front-root boundary; its failed scope check and renders are archived under `candidate-02-wide-support-mask/`. A third candidate exposed too much dark support between the fringe and crown in the browser upper view; it is archived under `candidate-03-open-upper-gap/`. The final candidate keeps all ribbons with root Y at or above -0.095 m exact and attenuates only pairs ahead of the mesh-specific forward boundary (-0.110 m for the outer groom and -0.085 m for the support).

## Verification

All {n['exactMeshCount']} native mesh geometry/weight/UV/morph contracts are exact. Native material graphs and packed texture hashes pass. Blender rebases four relative image paths while saving the archive to the runtime path; `image-path-audit.json` records this, and packed filenames and bytes remain exact. Vertex RGB, root coverage and unselected ribbons pass separate comparisons.

All 27 idle/walk/run movement samples and scalp attachments pass. The prior pass's skin-clearance samples remain applicable because positions and relative secondary-motion shapes are exact; new surface sampling would duplicate those results.

All three male GLBs validate with zero errors. Strict exported comparison retains every accessor except the two selected `COLOR_0` arrays. Those arrays independently retain exact RGB and only reduce alpha. Geometry, outfit, rig, animation, UVs, weights, material values and embedded textures are exact. Gzip round-trips, final hashes/sizes, male manifest entries, source/runtime equality and the archived helper pass.

Eight browser views and empty error logs are archived. The temporary camera-only route is removed and the standard male hair preview is restored. Blender uses dithered alpha and the browser uses alpha testing, so browser evidence establishes the final visible result.

## Reproduction and remaining work

`before/` contains immutable sources, all three GLB/gzip files, the previous manifest and previous views. `inspect-fringe-layers.py` creates the isolation renders. `build-candidate.py` applies the helper archived as `authored-refinement.py`. `validate-candidate.py` proves the coverage-only change and checks movement. `deliver.mjs` verifies retained exported data, compresses assets, copies the runtime source and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_fringe_separation.py`, called after the fringe-sweep stage in the male branch of `refine_reference_hair.py`. The full cumulative authoring pipeline was not rerun.

The front curl shape remains broad and the hairstyle is not a finished likeness match. This pass improves visible separation rather than changing the curves.
''')
print(json.dumps({'verifiedAssets':list(assets),'exactMeshCount':n['exactMeshCount'],'movementSamples':m['movementSamples'],
                  'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
