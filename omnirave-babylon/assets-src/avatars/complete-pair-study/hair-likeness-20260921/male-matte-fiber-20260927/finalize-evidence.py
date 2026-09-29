"""Verify matte male fiber delivery, browser evidence and native source."""
from pathlib import Path
import json,gzip,hashlib
root=Path.cwd();study=root/'assets-src/avatars/complete-pair-study';parent=study/'hair-likeness-20260921';folder=parent/'male-matte-fiber-20260927'
load=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=load(folder/'delivery-verification.json');manifest=load(root/'src/player/completeAvatarDownloads.json');assets={}
for name,entry in d['assets'].items():
 p=root/'public/assets/avatars/complete-pair'/name;z=p.with_suffix('.glb.gz')
 assert sha(p)==entry['sha256']==manifest[name]['sha256']
 assert p.stat().st_size==entry['bytes']==manifest[name]['bytes']
 assert z.stat().st_size==entry['gzipBytes']==manifest[name]['gzipBytes']
 assert gzip.decompress(z.read_bytes())==p.read_bytes();assets[name]=entry
assert sha(parent/'male-hair-refined.blend')==sha(study/'male-runtime.blend')==d['nativeSourceSha256']
for name in ['browser-errors.json','browser-side-errors.json','browser-other-side-errors.json','browser-upper-errors.json']:assert load(folder/name)==[],name
for name in ['male-matte-fiber-probe.html','src/review/maleMatteFiberProbe.ts']:assert not (root/name).exists()
views=['side','other-side','upper','hair','face','run','walk']
for v in views:assert (folder/('runtime-'+v+'.jpg')).stat().st_size>10000
for v in ['front','oblique','side','back','upper']:assert (folder/('male-'+v+'.png')).stat().st_size>10000
a=load(folder/'authoring-report.json');n=load(folder/'native-checks.json');m=load(folder/'male-motion-validation.json')
assert n['geometryAndRigExact'] and m['movementSamples']==27
summary={'pass':folder.name,'scope':'Remove metallic-looking white hair glare with darker matte fiber shading.',
 'authoring':a,'nativeChecks':n,'motion':m,'assets':assets,'nativeSourceSha256':d['nativeSourceSha256'],
 'finalVerification':{'assetHashesSizesAndGzipMatch':True,'nativeRuntimeMatches':True,'browserErrors':0,'browserViews':views,'temporaryProbeRemoved':True},
 'limitations':['This material change does not correct the overall hairstyle silhouette or dense support sheet.',
 'The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.']}
(folder/'pass-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(folder/'README.md').write_text(f'''# Male matte fibers — September 27, 2026

The side of the male hair showed a broad silver/white highlight, making the dark reference hairstyle look like a stiff helmet. An isolated-layer study found the glare on both the retained main groom and the rooted support. Raising fiber roughness from 0.58 to 0.86, lowering the glTF specular factor from 0.28 to 0.09, and reducing normal-map strength from 0.35 to 0.14 produces a dark brown, strand-readable finish. The scalp already used a soft finish and remains unchanged.

## Retained data and verification

Only {len(a['materials'])} existing male fiber materials change. All {n['exactMeshCount']} native mesh geometry contracts, rig, UVs, vertex colors, node graphs, textures and vertex mapping remain exact. The male material branch and normal-map strength are updated in the cumulative authoring code. All 27 motion samples pass. The incremental pass was validated; the complete cumulative pipeline was not rerun.

All three male GLBs validate with zero errors. Export comparison confirms every accessor, texture, node, skin, mesh, animation and non-hair material remains exact; the seven target materials contain only the expected roughness, specular and normal-strength changes. Gzip, hashes, sizes, native/runtime source equality and fresh male-only manifest merge pass. Five native renders and seven browser views are archived with empty browser error logs. Temporary camera pages were removed and the standard preview restored.

## Reproduction and remaining work

`before/` contains immutable native source, reports, GLBs, gzip files, manifest and earlier renders. `build-candidate.py` applies the material values and saves the native source. `validate-candidate.py`, `deliver.mjs` and `finalize-evidence.py` record the checks. The isolated-layer diagnosis is archived in this folder. The front sweep and rooted support remain too uniform and dense relative to the reference; those need structural work next.
''')
print(json.dumps({'verifiedAssets':list(assets),'changedHairMaterials':len(a['materials']),'movementSamples':m['movementSamples'],'browserErrors':0,'nativeRuntimeMatch':True},indent=2))
