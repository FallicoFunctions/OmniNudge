# Male hair: loose fringe and temple layers

Male-only continuation on September 26, 2026. The reference is
`public/assets/avatars/complete-pair/male-reference.png`.

The front locks now fall farther toward the brow and turn inward at the ends.
The swept crest rolls forward more gently, and longer temple layers fill the
previous close-cropped silhouette above the ears. This is a first male likeness
pass; the back hairline and dense crown still leave room for refinement.

## Authoring

- `scripts/launch-body-proof/refine_male_loose_fringe.py` implements the pass.
- The male branch of `refine_reference_hair.py` invokes it after `soften_waves`.
- `build-candidate.py` rebuilds this pass from the immutable `before/` archive
  and writes four Blender review views.
- Only the retained swept groom changes. The first two vertex pairs of every
  ribbon, topology, UVs, material assignments, weights, and relative animation
  shape offsets are retained. The pass adds no vertices or draw calls.
- The editable result is `../male-hair-refined.blend`; delivery synchronizes
  it to `../../male-runtime.blend`.

## Verification and delivery

Run from the `omnirave-babylon` project directory, one Blender process at a time:

1. Run `build-candidate.py` with Blender background mode and two threads.
2. Run `validate-candidate.py` the same way. This checks unchanged meshes,
   exact roots, topology, weights, UVs, morph offsets, degenerate triangles,
   nine expression/hair-sway poses, and 27 idle/walk/run samples.
3. Run `node scripts/launch-body-proof/apply_reference_hair.mjs male`.
4. Run this directory's `deliver.mjs`. It compares retained exported data with
   this pass's baseline, validates the export report hashes, compresses the
   three male GLBs, verifies decompression, and merges only the male download
   manifest entries from a fresh read.
5. Reload the male review tab and inspect idle, walking, running, and rear views.

The skin probe resolves ambiguous negative nearest-triangle normal signs near
ear folds using five-ray parity. Inside/outside controls are checked per pose.
These are finite samples, not a continuous or hair-to-hair collision guarantee.

Evidence lives in `authoring-report.json`, `native-checks.json`, the copied
male motion/export reports, `delivery-verification.json`, and the native/live
review images. Shared female assets and female progress reports are owned by
the original chat; this pass does not replace those reports.

Preview: `/complete-review.html?character=male&motion=idle&view=hair`.
