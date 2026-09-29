# Male crown and front-lock flow

Continuation after the lowered-hairline pass. The main groom receives a softer
backward roll, a sideways sweep through the front crest, rounded upper corners,
and more separation between tapered lock ends. The lowered scalp, rooted
underlayer, flyaways, and first two pairs of each main-groom ribbon stay fixed.

## Rebuild and validation

Run from `omnirave-babylon`, one Blender process at a time with two threads:

1. Run `build-candidate.py` in Blender background mode with `--python-exit-code 1`.
2. Run `validate-candidate.py` with the same settings.
3. Run `node scripts/launch-body-proof/apply_reference_hair.mjs male`.
4. Run this directory's `deliver.mjs` and reload the male review tab.

The implementation is `scripts/launch-body-proof/refine_male_crown_flow.py`.
`before/` retains the input native source and three exported detail levels.

The native checks cover unchanged meshes, exact root pairs, retained topology,
UVs, skin weights and relative shape offsets, degenerate triangles, nine
expression/hair-sway poses, and 27 idle/walk/run samples. Export checks compare
retained data against this pass's baseline, validate all three GLBs, and verify
compression and current download hashes. Delivery merges only male manifest
entries and synchronizes only the male runtime source.

Contact checks use finite samples and nearest skin distance, resolving ambiguous
negative normal signs with ray parity. They do not establish continuous or
hair-to-hair collision avoidance. No vertices or material slots are added.

Preview: `/complete-review.html?character=male&motion=idle&view=hair`.
