# Male front arc — September 27, 2026

The large frontal loop looked circular and heavy. This pass lowers its upper arc, advances the sideways sweep, and removes much of the inward return at the ends of falling curls. Higher short curls extend downward more than the existing long locks, leaving staggered tips.

## Geometry and retained data

1,912 of 6,340 main-groom ribbons change. All first three scalp pairs, 4,428 unselected ribbons, 2,474 rear/crown ribbons and 42 other meshes remain exact. Hair width vectors, UVs, vertex colors including the prior front density refinement, materials, textures, weights, transforms and relative motion shapes are retained. No geometry is added. Maximum vertex movement is 18.339 mm; mean selected tip-height change is -3.194 mm. The overall peak changes by 0.000 mm.

The first attempt was too subtle in front and oblique views; its helper, report, log and renders are archived under `candidate-01-subtle-arc/`. The delivered revision more clearly opens the ends. Skin fitting translates whole free pairs, retaining thin widths and roots, rather than applying structural overlap rules to hair.

## Verification

Nine expression/secondary-hair samples keep changed vertices at least 1.600023 mm outside the skin. Triangle-center and edge-midpoint fitting across nine poses reports 0.900684 mm minimum clearance. An independent neutral surface audit finds changed faces at least 0.909389 mm outside the skin and no sampled penetration in retained fringe. All 27 movement samples and scalp attachment checks pass. These are finite samples, not a continuous or self-collision guarantee.

All three male GLBs validate with zero errors. Strict exported comparison permits only the main groom's position, normal and tangent arrays to differ; all other accessors, rig, outfit, animations, materials and texture bytes remain exact. Gzip round-trips, hashes, sizes, native/runtime equality and fresh male-only manifest merge pass. Five native renders, eight browser views and five empty browser error logs are archived. Temporary camera pages are removed; the standard male hair preview is restored.

## Reproduction and remaining work

`before/` contains immutable source, mapping, reports, prior renders, GLBs, gzip files and manifest. `build-candidate.py` calls the archived `authored-refinement.py` helper. `validate-candidate.py`, `audit-fringe-faces.py -- --current`, `deliver.mjs` and `finalize-evidence.py` record retained-data checks and delivery evidence.

The live helper `scripts/launch-body-proof/refine_male_front_arc.py` is hooked after front separation in the male branch of `refine_reference_hair.py`. The incremental pass was verified; the full cumulative pipeline was not rerun. The hairstyle still needs finer wisps and closer support-layer likeness to the reference.
