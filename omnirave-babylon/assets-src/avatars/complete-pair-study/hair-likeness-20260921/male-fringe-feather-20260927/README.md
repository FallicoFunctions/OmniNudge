# Male fringe feathering — September 27, 2026

Several large falling curl groups terminated at almost exactly the same height, making the fringe edge look flat and heavy. This pass staggers each group's visible endpoint height according to its scalp root position: outer fibers remain long, inner fibers finish progressively higher, and a small stable variation prevents a new flat row. The ends also spread laterally by up to 2 mm.

## Authored change

1,035 of 6,340 existing main-groom ribbons change. The first three scalp pairs, 5,305 unselected ribbons, 2,474 rear/crown ribbons and 42 other meshes remain exact. No geometry is added. Tip heights rise 6.12 mm on average, at most 12.75 mm; maximum vertex movement is 12.90 mm. Overall hair peak is unchanged. Width vectors, UVs, colors including existing coverage refinements, weights, materials, textures, transforms and relative hair-motion shapes remain exact.

An opacity-only experiment changed very few visible pixels because other ribbons covered the faded tips. Its source, renders and reasoning remain archived in `../male-tip-wisps-20260927/` and were not delivered. The delivered geometry pass directly staggers the formerly coincident ends.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least 6.04408 mm outside the skin. The sampled triangle-center/edge fitting checks nine poses and reports 6.04477 mm minimum; the independent neutral face audit finds changed faces at least 9.52572 mm clear and zero sampled penetration. All 27 movement and scalp-attachment samples pass. Finite samples do not prove continuous or hair self-collision clearance.

All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except main-groom position, normal and tangent. Outfit, rig, animations, materials, textures, UVs, colors and weights remain exact. Gzip, hashes, sizes, fresh male-only manifest merge and native/runtime source equality pass. Five native renders, eight browser views and empty browser-error logs are archived. The temporary camera page is removed and the standard male hair preview is restored.

## Reproduction and remaining work

`before/` contains immutable native source, mapping, reports, GLBs, gzip, prior renders and manifest. `build-candidate.py` applies the archived refinement helper. `validate-candidate.py`, `audit-fringe-faces.py -- --current`, `deliver.mjs` and `finalize-evidence.py` reproduce the checks and delivery. The live helper is `scripts/launch-body-proof/refine_male_fringe_feather.py`, called after front-arc relaxation in the male branch of `refine_reference_hair.py`.

The incremental pass was validated; the full cumulative authoring pipeline was not rerun. The frontal locks remain denser and more sculptural than the loose reference hair.
