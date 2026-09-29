# Male fringe taper in the browser

The preceding front-layer pass left visibly grainy tips at the preview's normal
size. Isolated browser probes compared solid geometry, alpha cutoffs, blending,
coverage smoothing, hidden layers, disabled shadows, a lifted groom and doubled
resolution. Grain remained without texture or shadows and after lifting away
from the face. Doubling resolution partly reduced it. It is concentrated in the
very narrow free sections of the main groom.

This pass redistributes the existing ribbon samples along the free fringe so
the finest part occupies a shorter physical length, and gathers the last fibers
toward each existing lock. The roots, lowered hairline, main curve reach,
materials, UVs, weights and relative morph offsets are retained. It adds no
geometry, textures, render passes or runtime quality overrides.

## Rebuild and validation

Run from `omnirave-babylon`, with one Blender process at a time and two threads:

1. Run `build-candidate.py` in Blender background mode with `--python-exit-code 1`.
2. Inspect the native renders, then run `validate-candidate.py` the same way.
   Run `audit-fringe-faces.py -- --current` to check candidate face interiors.
3. Run `node scripts/launch-body-proof/apply_reference_hair.mjs male`.
4. Run this directory's `deliver.mjs` and inspect the ordinary male preview.

Implementation: `scripts/launch-body-proof/refine_male_fringe_taper.py`.
The archived `before/` source is the input to this pass.

Native validation compares the other 42 meshes, exact first two root pairs,
topology, UVs, skin weights, materials, morph offsets and degenerate triangles.
It measures hair width and skin clearance at nine expression/hair-sway samples,
then checks attachment through 27 idle/walk/run samples. Export validation
compares retained data outside the main groom's positions and shading normals,
checks all three GLBs, verifies compression and current download hashes, and
updates only male manifest entries and native runtime source.

`fringe-face-audit.json` records baseline triangle-center and edge-midpoint
clearance samples across the foreground fringe. No penetration was found in
those samples. `candidate-fringe-face-audit.json` checks the revised mesh using
the same sample pattern. These finite checks do not establish continuous or hair-to-hair
collision avoidance.

Preview: `/complete-review.html?character=male&motion=idle&view=hair`.
