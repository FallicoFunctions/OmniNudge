# Male front layers and temple flow

The main groom receives longer, inward-turning front locks with staggered,
tapered ends and more separation through their free sections. Ear-side layers
finish with a softer backward direction. The lowered scalp, rooted underlayer,
flyaways, and first two pairs of each main-groom ribbon remain fixed.

This pass also repairs strips widened by earlier edge-by-edge skin fitting.
Its clearance correction translates both edges together to preserve the narrow
cross section. Width checks reject broad triangles in the final evaluated asset.

## Rebuild

Run from `omnirave-babylon`, with one Blender process and two threads:

1. Run this directory's `build-candidate.py` in Blender background mode with
   `--python-exit-code 1` and inspect the four native renders.
2. Run `validate-candidate.py` with the same settings.
3. Run `node scripts/launch-body-proof/apply_reference_hair.mjs male`.
4. Run this directory's `deliver.mjs` and inspect the male browser preview.

Implementation: `scripts/launch-body-proof/refine_male_front_layers.py`.
The `before/` directory retains the input native source, mapping, reports,
three exported detail levels and review images.

## Verification scope

Native checks compare the other 42 meshes, topology, UVs, weights, materials,
transforms, exact root pairs, relative morph offsets and triangle degeneracy.
Ribbon widths must stay below 2.5 mm and free pairs below twice their root width.
Skin clearance is measured at nine expression and hair-sway samples. Standard
attachment and head-relative movement checks cover 27 idle, walk and run samples.
These finite samples do not prove continuous or strand-to-strand clearance.

All three exports are checked for glTF errors and retained data outside groom
geometry. Delivery checks compression and hashes, merges only male download
entries into the current manifest, and synchronizes the male runtime source.

Preview: `/complete-review.html?character=male&motion=idle&view=hair`.
