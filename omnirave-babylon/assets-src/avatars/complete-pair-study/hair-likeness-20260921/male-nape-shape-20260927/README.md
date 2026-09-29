# Male nape shape — September 27, 2026

Isolating the outer hair and its support showed that the smooth underlayer created most of the straight rear boundary. This pass reshapes that support into a lower, gently irregular nape and carries the attached roots with it. The rear view is an authored interpretation because the reference does not directly show the back.

## Authored change

The central rear scalp edge descends by 10.00 mm on average across 17 edge vertices. A modest off-center low point and overlapping variations replace the even arc. The scalp and rooted underlayer share a wider, irregular opacity transition. Existing RGB colors, materials, and textures are unchanged.

The scalp, rooted underlayer, and main groom retain topology, UVs, origins, weights, and relative morph offsets. The main groom's final three pairs, all 1,189 protected front curls, all 168 crown bridge ribbons, all points above 1.750 m, and the frontal points below y = -0.065 m are exact. The other 40 meshes are exact. No meshes or vertices are added.

The first candidate carried a small deformation above the intended lower region. The final candidate explicitly fades the carrier before the upper hair; the first candidate's helper, images, and reports are archived under `candidate-01-upper-carrier/`.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least 2.39998 mm from the skin. Neutral triangle centers and edge midpoints on all three changed meshes remain at least 1.71030 mm outside the skin. These are finite checks, not continuous or hair-to-hair collision guarantees. All 27 movement samples and scalp-root attachment checks pass.

Widths remain equal to the immutable input within float32 tolerance, including the wider rooted support cards. No new degenerate triangles are introduced. Vertex alpha is allowed to change only on the two support layers; RGB and all main-groom colors remain exact.

All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except positions, normals, and tangents on the three changed hair meshes and COLOR_0 on the two support layers. Rig, animation, outfit, texture, material, UV, and weight data remain exact. Final gzip round-trips, hashes, sizes, male manifest entries, and native/runtime source equality pass. Eight browser views and empty error logs are archived; the temporary camera-only page is removed.

## Reproduction and evidence

`before/` contains immutable inputs and previous views. `diagnostic-*.png` isolate the original outer hair and support. `build-candidate.py` applies the helper archived as `authored-refinement.py`. `validate-candidate.py` checks retained data, sample clearance, roots, and motion. `audit-faces.py` samples triangle centers and edge midpoints. `deliver.mjs` checks the exports, compresses them, copies the native runtime, and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_nape_shape.py`, called after the side-layer pass in the male branch of `refine_reference_hair.py`. This incremental pass was validated; the full cumulative authoring pipeline was not rerun.

Broad upper locks and some dark support remain visible. The result is a nape-shape improvement, not a finished likeness match.
