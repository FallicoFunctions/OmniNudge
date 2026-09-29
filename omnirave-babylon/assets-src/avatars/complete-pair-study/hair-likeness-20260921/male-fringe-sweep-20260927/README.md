# Male fringe sweep — September 27, 2026

The falling curls ended at nearly the same height and the crossing front waves formed a uniform arch. This pass varies the arch heights and turns the lower curl ends sideways, with shorter inner curls and longer outer curls.

## Authored change

1,912 of 6,340 existing ribbons change. 1,277 participate in the crossing-wave field and 1,189 in the falling-curl field; those categories overlap. Every ribbon retains its first three scalp pairs. All 4,428 other main-groom ribbons, including 2,474 ribbons outside the front region, and the other 42 meshes remain exact. No meshes or vertices are added.

The selected tips rise by 7.89 mm on average, with a maximum of 15.15 mm. Maximum vertex movement is 15.93 mm. The overall peak changes by 0.00 mm. Width vectors remain within float32 tolerance; normals follow the edited curves. The hairline, support, nape, topology, UVs, colors, materials, weights, origins and relative secondary-motion offsets are retained. Vertex fitting adjusts 1,658 free vertices; surface fitting adjusts 409 free pairs while retaining their width vectors.

The first candidate enlarged the outer loop too much in oblique view. Its editable source, helper, report, renders and build log are archived under `candidate-01-wide-outer-loop/`. The delivered candidate uses less lateral displacement and alternates lower and higher arches rather than raising every arch. A second candidate passed vertex checks but cut through the scalp at some connecting faces; its renders and failed surface audit are archived under `candidate-02-chord-contact/`. The final helper fits free pairs using triangle centers and edge midpoints across nine expressions and secondary-hair poses, then independently rechecks the result.

## Verification

Nine expression and secondary-hair samples keep changed vertices at least 1.60283 mm outside the skin. Neutral triangle centers and edge midpoints on changed hair remain at least 0.90796 mm outside it. Retained fringe and fixed sections of selected ribbons have no sampled skin penetration. All 27 movement samples and scalp attachment checks pass. These finite checks do not prove continuous collision freedom or hair self-contact.

No new degenerate triangles or meaningful new width-direction flips are introduced. All three male GLBs validate with zero errors. Strict exported-data comparison retains all accessors except the main groom's position, normal and tangent arrays. Outfit, rig, animation, material, texture, UV and weight data remain exact. Gzip round-trips, hashes, sizes, male manifest entries, native/runtime source equality and the archived authoring helper all pass.

Eight browser views and empty error logs are archived. The temporary camera-only page is removed. The standard male hair preview is restored.

## Reproduction and limitations

`before/` contains immutable native inputs, all three delivered male GLBs/gzip files, the download manifest, and previous renders. `build-candidate.py` applies `authored-refinement.py`. `validate-candidate.py` checks retained data, widths, sampled vertex clearance, roots and movement. `audit-fringe-faces.py -- --current` samples changed faces and retained fringe. `deliver.mjs` validates retained exported data, compresses assets, copies the native runtime and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_fringe_sweep.py`, called after the upper-wave pass in the male branch of `refine_reference_hair.py`. The incremental pass was validated; the full cumulative authoring pipeline was not rerun.

The front wave remains heavier than the reference. This is a refinement to its shape and ends, not a finished likeness match.
