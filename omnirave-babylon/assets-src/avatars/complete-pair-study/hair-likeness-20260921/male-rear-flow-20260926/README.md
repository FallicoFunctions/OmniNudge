# Male rear hair flow — September 26–27, 2026

The upper rear groom converged into large, pointed fans. This pass shortens and staggers selected rear locks and spreads their fibers across each wave, giving a softer rear texture. The reference guides the side silhouette; the unseen back is an authored interpretation.

## Change

Only the free portions of 1,478 ribbons in `Luxury retained swept groom` change. Their mean centerline length falls from 82.32 mm to 68.07 mm, and their tips move 12.99 mm on average. The final version spreads fibers across their existing curve, with the lateral direction transported along the curve, to maintain a shared flow. Free arches settle toward measured scalp layers and receive two light smoothing passes.

The first two root pairs remain exact. All 4,862 unedited ribbons, including 1,189 protected forehead ribbons, remain exact. The other 42 meshes, lowered hairline, vertex colors, materials, textures, topology, UVs, weights, and relative motion shapes are preserved. No geometry or texture count was added.

The first candidate was visually too subtle. The second scattered strands in three dimensions and looked too wispy. Both are archived for comparison. The delivered version uses controlled lateral separation.

## Verification

- Native structure and retained-data checks pass. Maximum ribbon width remains 1.61913 mm, with no newly degenerate triangles.
- Changed vertices retain at least 1.60053 mm skin clearance across nine sampled facial and hair poses. Inside/outside ray controls pass.
- A neutral-pose face audit checks triangle centers and edge midpoints: 130,064 samples on changed rear ribbons, with no penetrations and at least 1.96532 mm clearance. The retained front fringe is also rechecked: 115,148 samples, no penetrations, minimum 0.14817 mm. Eleven retained fringe samples remain below 0.5 mm, unchanged from the preceding pass.
- All 27 movement samples and attachment checks pass.
- All three male GLBs validate with zero errors. Strict comparisons preserve all data except the main groom's position, normal, and tangent arrays. Exported color data remains exact.
- Gzip round-trips, download hashes and sizes, and native/runtime source equality are checked by the delivery and final verification scripts. Only male manifest entries are merged.
- Browser screenshots cover rear, side, standard hair, face, walk, and run. The temporary camera-only rear inspection route is removed after use.

These are finite pose and surface samples. They do not prove continuous collision freedom or strand self-contact. The full cumulative authoring pipeline was not rerun; this pass uses an incremental rebuild from immutable inputs.

## Evidence and reproduction

`before/` contains the immutable source, mapping, reports, exports, manifest, and previous review images. `build-candidate.py` applies the archived `authored-refinement.py` and renders four native views. `validate-candidate.py` checks structure, retained mapping, skin clearance, and motion. `audit-fringe-faces.py -- --current` checks neutral face samples. The shared `apply_reference_hair.mjs male` exports only male assets; `deliver.mjs` checks retained data, gzip, and the fresh male manifest merge.

The live helper is `scripts/launch-body-proof/refine_male_rear_flow.py`, called only in the male branch of `refine_reference_hair.py`. See `pass-summary.json`, `native-checks.json`, `candidate-fringe-face-audit.json`, `delivery-verification.json`, and `runtime-*.jpg` for results.

The rear reads less pointed in the runtime comparison. The crown still looks dense and somewhat flat, so this is another refinement rather than a completed reference match.
