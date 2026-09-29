# Male crown blending — September 27, 2026

The crown sweep stopped short of the neighboring front waves, exposing dark support between them. This pass extends the existing crown ends forward and retains enough width through the taper to blend into that neighboring hair.

## Authored change

Only the last six pairs of 168 main-groom ribbons change. Their first six pairs, all 6,172 other ribbons, all 1,189 protected front curls, and the other 42 meshes remain exact. The lowered hairline and the upper arches are retained. The highest hair point changes by -0.60 mm. No meshes, vertices, materials, or textures are added.

The ends extend forward by up to 34 mm, with a small sideways turn and a 4 mm descent. Existing strands keep their UVs and vertex colors. Card widths stay below the original maximum, and adjacent width directions stay consistent to avoid twisted surfaces. Skin fitting adjusts 12 edge vertices across the sampled poses.

## Verification

- Native structure, topology, UVs, material parameters, colors, weights, origins, relative morph offsets, and unchanged geometry pass retained-data checks.
- Nine sampled expression and hair poses retain at least 1.73689 mm clearance on changed vertices. No newly degenerate triangles or width-direction flips are introduced.
- Neutral triangle centers and edge midpoints show no sampled skin penetration in changed hair or the retained fringe. The close front-fringe locations are unchanged; see the face audit for details.
- All 27 movement samples and attachment checks pass.
- Vertical geometry-ray coverage in the forward separation increases from 49.9% to 73.8%. Combined coverage increases from 66.2% to 76.8%. The original center changes from 78.7% to 78.2%. These rays measure geometry above the cap, not texture opacity.
- All three male GLBs validate with zero errors. Strict comparisons retain every original accessor except the main groom's position, normal, and tangent arrays. Textures, material parameters, colors, rig, animations, and outfit data remain exact.
- Gzip round-trips, final hashes and byte counts, the male download manifest records, and native/runtime source equality pass. Browser upper, side, back, hair, face, run, and walk images are saved with empty error logs. The temporary camera-only probe is removed.

## Reproduction and evidence

Immutable inputs and prior images are in `before/`. `build-candidate.py` applies `authored-refinement.py` and renders five views. `validate-candidate.py` checks retained structure, the six fixed pairs, card direction, sampled clearance, and motion. `audit-fringe-faces.py -- --current` checks changed triangle faces and the retained front fringe. `measure-crown-coverage.py` compares three fixed regions. The shared `apply_reference_hair.mjs male` exports only male assets. `deliver.mjs` checks exported retained data and gzip, copies the native runtime, and merges male records into a fresh manifest read. `finalize-evidence.py` verifies the final delivery and writes this report.

The live helper is `scripts/launch-body-proof/refine_male_crown_blend.py`, called after the crown-profile pass in the male branch of `refine_reference_hair.py`. The full cumulative authoring pipeline was not rerun.

The ends connect more smoothly into adjacent hair. Broad stylized locks and some dark separation remain. These finite samples do not prove continuous collision freedom or strand self-contact; the model is still being refined toward the reference.
