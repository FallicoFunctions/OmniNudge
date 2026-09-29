# Reference hair pass — September 21

Authored in Blender 5.1.2 from the retained complete-character sources, using the
original male and female artwork. The female ponytail was the main focus.

## Changes

- Female: varied pony lock lengths, more crown lift and uneven bends, tapered
  face tendrils, a smaller lime accent, and a darker underlying pony volume.
- Female forehead: a subtly asymmetric fitted hairline, finer root widths and
  strand coverage that avoids the blunt strip edge. An intermediate jagged
  candidate was corrected before delivery.
- Male: reduced the tall front crest and tapered its free ends.
- Male wave continuation: 96 shared lock guides lower the forehead arch, shorten
  the hanging ear layers, soften the falling fringe and vary the free ends.
  Curve smoothing and transported card frames avoid sharp twists. Flyaways
  follow the lower crest; softer specular and fiber normals reduce flat shine.
- Both: fewer, resolvable fibers in each hair-card texture, pigment variation,
  root/tip fade and an authored alpha cutoff retained by the game renderer.
- Female crown continuation: a fitted three-strand temple braid, a visible
  short green fan at the crown, and overlapping brunette locks across the
  forehead. The hairline and loose face tendrils are less symmetrical.
- The ponytail's outer locks, inner fibers and carrier move together toward the
  head to reduce the broad empty arch while preserving the attached roots.
- The review page has a **Hair** camera view that includes the whole hairstyle.
- Female loose-hair continuation: uneven shoulder-length pony locks, short pink
  crown wisps, lower temple coverage, mostly brunette face tendrils, a faded
  lower pony carrier and softer fiber shading. The two colored eye-stud meshes
  are removed from the editable model and every female detail level, and their
  construction is removed from the historical detail generator.
- Female contour continuation: lower, fuller temple coverage, 38 lifted scalp
  lock guides, rounded front locks, darker matte roots and a softer hairline.
  The ponytail and longer flyaways follow broad shared waves. Its supporting
  volume fades earlier, and the hanging locks fit behind the measured collar.
  This continuation adds no meshes, triangles, materials or texture images.

- Female fringe continuation: three curved cheek-lock groups per side with
  unequal ends, a closer grouped forehead sweep, a shorter feathered carrier
  fade and 12 shaped inner pony groups. The root layer is darker so the loose
  pink strands carry the silhouette. Existing topology and motion are retained;
  this continuation adds no meshes, triangles, materials or texture images.

- Female shoulder continuation: 212 retained pony cards follow nine grouped
  curves beside the left ear and toward the shoulder. Unequal lengths and broad
  bends carry the magenta silhouette down the side of the head. Upper locks
  clear the ear laterally; lower locks fit ahead of the collar across all four
  secondary-motion corners. No geometry or texture images are added.

- Female ends/color continuation: the lower front locks finish nearer the
  collar, gather more tightly into their parent curves and have staggered tips.
  225 formerly brown pony cards now transition from brunette roots to magenta;
  the face tendrils keep the exact previous brunette pigment. This uses one
  vertex-color attribute on an existing mesh, with no new geometry, materials,
  texture images.

The first pass retained all topology. The crown continuation adds two head-bound
hair meshes (braid and front locks), totaling 7,260 triangles and two materials
per female detail level. Apart from the requested eye-stud removal, non-hair geometry, clothing materials,
skeletons, animation clips and skin weights are retained. The green tuft's two
secondary shapes are reduced to 18% of their former displacement to suit its
shorter length. Newly shortened pink crown wisps use 24% of their original
secondary displacement; other existing morph displacements are retained.
The face geometry is retained; only the requested colored eye studs are removed.
This pass does not claim complete reference likeness. Scalp coverage, lock
grouping and overall styling still differ from the artwork's tousled hair.
Unseen views remain interpretations of the existing model.

## Files

- `before/`: exact native/runtime inputs and original preview captures.
- `crown-pass/before/`: the first-pass female source and authoring scripts.
- `crown-pass/`: front, braid-side and back native renders and runtime evidence
  from the crown continuation; previous female captures outside it are historical.
- `loose-pass/`: preceding female front, braid-side, back and runtime hair/motion
  comparisons, plus the preserved preceding source and authoring scripts.
- `contour-pass/`: preceding female comparisons and preserved inputs.
- `fringe-pass/`: preceding female front, braid-side, back and runtime comparisons,
  measured face/inner-fiber clearance, and the preserved preceding source.
- `shoulder-pass/`: preceding female fixed-view and runtime comparisons, with
  the preceding editable source and authoring scripts preserved.
- `ends-pass/`: current female views, exported runtime evidence and preserved
  inputs from the preceding shoulder pass.
- `male-wave-pass/`: current male multi-view and runtime comparisons, plus the
  preceding male source, matching fixed native views and authoring scripts.
- `female-hair-refined.blend`, `male-hair-refined.blend`: editable results with
  packed textures, existing rig, animation and expression/secondary controls.
- `*-vertex-mapping.json`: correspondence used to update existing GLB vertices.
- `*-native-validation.json`: geometry/material edit measurements.
- `*-portable-validation.json`: all three detail-level export checks per sex.
- `*-motion-validation.json`: attachment/morph checks and their limited scope.
- `female-pony-clearance.json`: historical back-only collar check before the
  shoulder layer.
- `female-cascade-clearance.json`: current 31-pose hair/body/collar check, accepting
  locks outside either the front or back of the collar.
- `*-blender-oblique.png`: native rendered close-ups; runtime captures are
  saved separately so Blender lighting is not confused with game appearance.

## Validation

Each character was sampled at nine points in idle, walk and run, plus seven
expression/secondary-hair combinations. Hair remains attached to the head;
female pony roots remain within 1.67 mm of their carrier, and female scalp
roots within 1.41 mm of the scalp. Male scalp roots remain within 1.41 mm.
Morph displacement deviation from the intended retained/scaled values is below
0.00003 mm (float rounding). The braid stays 0.73–6.93 mm outside the scalp.
New front-lock roots remain within 2.29 mm of the scalp and their surfaces
remain at least 2.98 mm outside the skin in the sampled expression poses.
The fringe continuation additionally checks the retained cheek-lock edges and
upper inner-pony edges in nine expression/hair poses: minimum measured clearances
are 8.08 mm around the face and 11.97 mm for the inner pony against the head.
These checks do not certify continuous collision, goggle contact or strand
self-contact.

The contour continuation checked the hanging pony-card edges through 88%
of their length in 31 native clip/secondary-shape poses. Minimum measured body
clearance is 3.91 mm and jacket-back clearance is 3.09 mm. Body side uses front
and back ray intersections, avoiding false penetration reports from the ear's
concave triangle normals. This finite check excludes the hidden carrier,
simplified distance meshes and arbitrary combined runtime poses.

The preceding shoulder-layer audit checked the same 31 clip/secondary poses,
accepting hair outside either the front or back of the collar. The minimum
sampled body clearance is 1.70 mm and jacket clearance is 3.09 mm. Real card
edges are fitted around the ear; centerline clearance alone missed its rim.
This remains a finite-sample check, not continuous or strand-self-contact proof.

The current ends/color pass repeats all 31 clip/secondary clearance poses,
with minimum measured body clearance 3.91 mm and jacket clearance 3.09 mm.
The finite-sample scope remains unchanged.

All six GLBs have zero validation errors. Export preservation checks compare
non-edited accessors, rig/node structure, animation channels, original textures
and unrelated material factors before/after serialization. The compressed
delivery copies and their SHA-256 manifest are regenerated losslessly.

The preceding pass's 18 focused import, expression and delivery tests and
TypeScript check pass. The contour, fringe, shoulder and ends/color continuations change asset authoring only.

## Reproduce from the archived inputs

From `omnirave-babylon`, for each `female` and `male`:

```sh
blender --background --threads 2 --python-exit-code 1 --python scripts/launch-body-proof/refine_reference_hair.py -- --sex female
node scripts/launch-body-proof/apply_reference_hair.mjs female
blender --background --threads 2 --python-exit-code 1 --python scripts/launch-body-proof/validate_reference_hair.py -- --sex female --render
```

Then run `node scripts/launch-body-proof/compress_complete_downloads.mjs`.
For the female hanging-hair fit, also run Blender with
`scripts/launch-body-proof/validate_female_cascade.py`. The older back-only
`validate_female_pony_clearance.py` applies to the archived contour/fringe source.
The cheek/inner-pony
check uses `scripts/launch-body-proof/validate_female_tendrils.py`.
The normal `npm run build` preserves the edited models and refreshes delivery
copies. The older full Blender reconstruction pipeline predates this pass;
reapply this reference-hair stage if reconstructing from its historical inputs.
