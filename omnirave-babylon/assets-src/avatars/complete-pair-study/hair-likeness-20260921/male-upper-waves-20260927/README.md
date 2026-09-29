# Male upper waves — September 27, 2026

The upper groom followed nearly uniform arches that read as broad flat bands. This pass varies the height and timing of neighboring crown arches, gathers the crossing band into three overlapping waves, and turns high free ends back into the sweep.

## Authored change

971 of 6,340 ribbons change. The first three pairs of every ribbon, all 1,189 protected front curls, all 54,799 pairs with original minimum height at or below 1.770 m, all 5,369 other main-groom ribbons, and the other 42 meshes remain exact. The side layers, nape, and lowered hairline are retained. No meshes or vertices are added.

The highest hair point changes by 4.19 mm. Maximum movement is 6.60 mm. The three crossing waves use 168 existing ribbons. Width vectors are retained within float32 tolerance; edited face normals follow the new curves. Topology, UVs, colors, materials, weights, origins, and relative motion shapes remain.

The first candidate was too subtle and introduced width-direction flips where rotated free pairs met fixed pairs. The final candidate retains the original width vectors and has clearer nested waves. The first candidate's helper, images, and logs are archived under `candidate-01-subtle-width-turn/`.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least 1.86842 mm outside the skin. Neutral triangle centers and edge midpoints on changed hair remain at least 3.19220 mm outside it. Retained fringe samples show no penetration. All 27 movement samples and scalp attachment checks pass. These finite checks do not prove continuous collision freedom or hair self-contact.

No newly degenerate triangles or meaningful new width-direction flips are introduced. Vertical crown geometry coverage is measured in three fixed regions:

- original-center: 78.2% → 74.7%.
- forward-separation: 73.8% → 72.1%.
- combined: 76.8% → 74.2%.

Each region uses 6,400 rays. The acceptance limit, set before measurement, permits at most four percentage points of geometry coverage loss while separating waves. These rays do not account for texture opacity; browser images establish visible coverage.

All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except the main groom's position, normal, and tangent arrays. Outfit, rig, animation, material, texture, UV, and weight data remain exact. Final gzip round-trips, hashes, sizes, male manifest entries, and native/runtime source equality pass. Eight browser views and empty error logs are archived. The temporary camera-only page is removed.

## Reproduction and evidence

`before/` contains immutable inputs and previous views. `build-candidate.py` applies the helper archived as `authored-refinement.py`. `validate-candidate.py` checks retained data, sample clearance, roots, and motion. `audit-fringe-faces.py -- --current` samples changed faces and retained fringe. `measure-crown-coverage.py` compares the fixed regions. `deliver.mjs` validates exports, compresses them, copies the native runtime, and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_upper_waves.py`, called after the nape-shape pass in the male branch of `refine_reference_hair.py`. The incremental pass was validated; the complete cumulative authoring pipeline was not rerun.

The broad front fringe and some dark support remain visible. This is an upper-wave refinement, not a finished likeness match.
