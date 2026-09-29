# Male front silhouette — September 27, 2026

The inner fringe still formed two heavy eyebrow-level bangs after tip feathering. This pass lifts and sweeps the inner falling curls away from the middle forehead while retaining the longest outer temple lock. The front looks more open and asymmetric, closer to the reference's sweep.

## Authored change

414 of 6,340 main-groom ribbons change, including 332 with strong inner influence. The first three scalp pairs, 5,926 unselected ribbons, 2,474 rear/crown ribbons and 42 other meshes remain exact. No geometry is added. Tips rise 15.94 mm on average, at most 20.00 mm; maximum vertex movement is 20.93 mm. Overall hair peak is unchanged. Width vectors, UVs, colors, weights, matte materials, textures, transforms and relative motion shapes remain exact.

## Verification

Nine expression/secondary-hair samples keep changed vertices at least 1.94907 mm outside the skin. Triangle-center and edge-midpoint fitting checks nine poses and reports 1.62138 mm minimum. An independent neutral face audit finds changed faces at least 1.67041 mm clear with zero sampled penetration. All 27 movement and scalp attachment samples pass. Finite checks do not prove continuous clearance or hair self-contact.

All three male GLBs validate with zero errors. Strict exported comparison permits only main-groom position, normal and tangent changes; all other accessors, rig, outfit, animations, colors, matte materials and texture bytes remain exact. Gzip, hashes, sizes, fresh male-only manifest merge and native/runtime source equality pass. Five native renders, eight browser views and empty browser-error logs are archived. The camera-only probe is removed and the standard male hair preview restored.

## Reproduction and remaining work

`before/` contains immutable native source, mapping, reports, GLBs, gzip, earlier renders and manifest. `build-candidate.py` applies the archived refinement helper; `validate-candidate.py`, `audit-fringe-faces.py -- --current`, `deliver.mjs` and `finalize-evidence.py` record checks and delivery. The live helper is `scripts/launch-body-proof/refine_male_front_silhouette.py`, called after fringe feathering in the male branch of `refine_reference_hair.py`.

The rooted support still reads as a smooth sheet, and the side haircut remains shorter than the reference. The incremental pass was validated; the full cumulative pipeline was not rerun.
