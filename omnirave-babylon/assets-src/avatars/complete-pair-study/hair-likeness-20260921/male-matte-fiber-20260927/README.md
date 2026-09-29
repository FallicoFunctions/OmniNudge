# Male matte fibers — September 27, 2026

The side of the male hair showed a broad silver/white highlight, making the dark reference hairstyle look like a stiff helmet. An isolated-layer study found the glare on both the retained main groom and the rooted support. Raising fiber roughness from 0.58 to 0.86, lowering the glTF specular factor from 0.28 to 0.09, and reducing normal-map strength from 0.35 to 0.14 produces a dark brown, strand-readable finish. The scalp already used a soft finish and remains unchanged.

## Retained data and verification

Only 7 existing male fiber materials change. All 43 native mesh geometry contracts, rig, UVs, vertex colors, node graphs, textures and vertex mapping remain exact. The male material branch and normal-map strength are updated in the cumulative authoring code. All 27 motion samples pass. The incremental pass was validated; the complete cumulative pipeline was not rerun.

All three male GLBs validate with zero errors. Export comparison confirms every accessor, texture, node, skin, mesh, animation and non-hair material remains exact; the seven target materials contain only the expected roughness, specular and normal-strength changes. Gzip, hashes, sizes, native/runtime source equality and fresh male-only manifest merge pass. Five native renders and seven browser views are archived with empty browser error logs. Temporary camera pages were removed and the standard preview restored.

## Reproduction and remaining work

`before/` contains immutable native source, reports, GLBs, gzip files, manifest and earlier renders. `build-candidate.py` applies the material values and saves the native source. `validate-candidate.py`, `deliver.mjs` and `finalize-evidence.py` record the checks. The isolated-layer diagnosis is archived in this folder. The front sweep and rooted support remain too uniform and dense relative to the reference; those need structural work next.
