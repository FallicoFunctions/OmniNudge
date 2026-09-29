# Male side layers — September 27, 2026

The reference has layered side and rear hair, while the model's shorter ends expose a hard undercut boundary. This pass extends and staggers existing outer strands, with a shallow outward curve and a backward sweep near the ears. It adds layered ends around the retained support.

## Authored change

- 1,443 of 6,340 ribbons change; all other 4,897 ribbons remain exact.
- The first three pairs of every ribbon, all 1,189 protected forehead curls, all 168 crown bridge ribbons, and the other 42 meshes remain exact.
- Selected tips descend by 15.12 mm on average. Lengths vary within and between waves; the largest authored drop is 34.89 mm.
- Existing UVs, vertex colors, material parameters, weights, topology, origins, and relative motion shapes remain. No new meshes or vertices are added.
- The first candidate introduced width-direction flips at a few tight turns. The final candidate keeps adjacent free ribbon widths consistently oriented; the rejected candidate's helper, renders, and log are archived under `candidate-01-width-turn/`.

## Verification

Nine sampled expression and hair-motion poses keep changed vertices at least 1.60022 mm from the skin. Neutral-pose triangle centers and edge midpoints show no sampled skin penetration. All 27 movement and attachment samples pass. These are finite samples and do not establish continuous or hair-to-hair collision freedom.

All three male GLBs validate with zero errors. Strict export comparison retains every accessor except the main groom's position, normal, and tangent arrays. Final gzip round-trips, hashes, byte counts, male download entries, and native/runtime source equality pass. Eight browser views are archived with empty error logs. The temporary camera-only page was removed.

## Reproduction

`before/` holds immutable inputs and prior views. `build-candidate.py` applies the helper archived as `authored-refinement.py`; `validate-candidate.py` checks retained data, geometry, and poses. `audit-fringe-faces.py -- --current` samples triangle surfaces. `deliver.mjs` validates exports and merges only male manifest entries. `finalize-evidence.py` checks final files and assembles this record.

The live helper is `scripts/launch-body-proof/refine_male_side_layers.py`, called after crown blending in the male branch of `refine_reference_hair.py`. This incremental pass was validated; the complete cumulative pipeline was not rerun.

## Remaining visual work

The dense support layer still produces a fairly straight rear boundary, and the upper locks remain broad. The side layering is closer to the reference, but the hairstyle is still being refined.
