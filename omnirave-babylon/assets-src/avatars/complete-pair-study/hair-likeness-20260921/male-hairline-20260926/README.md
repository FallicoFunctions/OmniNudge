# Male hairline correction

The user identified excessive forehead height compared with the male reference.
This pass lowers the frontal scalp boundary, fills the temple corners, and
carries the rooted hair layers onto the new surface. The crown and free fringe
ends retain their existing positions.

## Files and rebuild

- `scripts/launch-body-proof/refine_male_hairline.py` contains the deformation.
- The male branch of `refine_reference_hair.py` calls it after the loose-fringe pass.
- `before/` retains this pass's immutable male source and exports.
- `build-candidate.py` rebuilds the native source and four review renders.
- `validate-candidate.py` verifies unchanged meshes, retained topology/UVs/
  weights/materials/transforms, shape offsets, crown/fringe preservation, skin
  clearance in nine expression/sway poses, flyaway roots, and 27 locomotion samples.
- `deliver.mjs` compares all retained exported data, verifies export hashes,
  compresses the three male GLBs, checks decompression, synchronizes the male
  runtime source, and merges only male manifest entries from a fresh read.

Run Blender scripts from the `omnirave-babylon` directory using background mode,
two threads, and `--python-exit-code 1`. Run the build, then validation, then
`node scripts/launch-body-proof/apply_reference_hair.mjs male`, then this pass's
`deliver.mjs`. Reload the male preview after delivery.

## Scope

Only four existing hair meshes change: the scalp, rooted underlayer, main groom,
and fine flyaways. No geometry is added. The face, outfit and animation data are
retained. Female exports and shared female progress reports remain owned by the
original chat.

The contact checks are finite samples. Five-ray parity resolves ambiguous
negative nearest-face normal signs around concave skin. These checks do not
guarantee continuous collision avoidance or strand-to-strand clearance.

Results and screenshots are retained alongside this file. Preview:
`http://127.0.0.1:4175/complete-review.html?character=male&motion=idle&view=hair`.
