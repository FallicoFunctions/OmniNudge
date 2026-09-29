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

- Female scalp continuation: all 460 retained scalp cards sweep toward the
  measured pony attachment along a shared curved field, replacing crossing
  loops. The braid has a shallow channel beneath it, and the cards fit behind
  the goggle lenses. Darker brunette shading, quieter underlayer fibers and a
  wider feather at the hairline soften the cap. This adds no geometry,
  materials or texture images. All 60 other mesh contracts match the preceding
  source exactly, including the pony, braid, front locks, face and goggles.

- Female front-wave continuation: the front locks curve diagonally toward
  the temple, with three overlapping families and unequal tapered ends. A
  matching low contour connects the underlayer through the temple, avoiding
  an exposed wedge below the former horizontal band. Lower relief softens the
  ridges between locks. Scalp roots and the braid are refitted to that surface;
  cheek strands are tucked beneath the goggle lenses with their roots retained.
  All 55 other mesh contracts match the preceding source exactly. The two
  shared cheek/pony meshes retain all 14,580 long-pony vertex and shape-key
  coordinates exactly. No geometry, materials or texture images are added.

- Female fiber continuation: individual brunette cards have subtly varied
  pigment, and the strand normals now follow the same curved paths as the
  visible fibers. Two shared 256×1024 textures and two vertex-color attributes
  replace uniform brown shading on the scalp groom and front locks. All 61
  mesh contracts and the stored fiber alpha coverage match the front-wave
  source exactly. This adds no geometry or materials; the added image storage
  is 2 MiB before mipmaps (about 2.67 MiB with them), plus vertex colors.
  Download growth is 190,075 compressed bytes at full detail, 161,877 at the
  middle level and 148,484 at the lowest level.

- Female hairline continuation: narrower front cards follow more curved,
  distinct lock families with unequal tapered ends. The forehead underlayer
  recedes slightly and uses strand-aligned endpoints. A deeper early cutback
  exposed pointed scalp-card roots in the game renderer and was reduced before
  delivery. This adds no geometry, materials or texture images. All 60 other
  mesh contracts match the fiber-pass source exactly.

- Female pony-wave continuation: 212 outer cards follow nine layered groups
  with staggered lengths and softly turning ends. Tips stay farther beside the
  ear, with slightly more separation inside each lock. An expanded inspection
  also found older rear strand tips crossing the folded hood. A smooth bend on
  the final 44% of 153 rear cards fits their vertices and actual edge spans
  outside the jacket in 31 authored poses. This adds no geometry, materials or
  textures and keeps existing relative secondary motion.

- Female pony-fiber continuation: all 852 long pony cards now share a coherent
  brunette-to-magenta palette with varied dye boundaries and darker individual
  locks. Pink develops nearer the gathering point, reducing mismatched brown
  and purple bands. Softer specular highlights and the existing fiber-aligned
  normal atlas reduce broad ribbon shine. The 1,224 cheek vertices retain their
  base pigment products within float rounding; their shared hair shading also
  receives the softer highlights. This adds a color attribute to the middle
  pony mesh, with no new geometry, material or texture images.

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
- `ends-pass/`: preceding female views, exported runtime evidence and preserved
  inputs from the preceding shoulder pass.
- `scalp-pass/`: preceding female native/runtime views, scalp clearance report,
  delivery verification and preserved inputs from the ends/color pass.
- `front-wave-pass/`: preceding female front, side and rear native views, live
  preview evidence, front/scalp clearance and preserved preceding source.
- `fiber-pass/`: preceding female native/runtime views, material and exact mesh
  retention checks, all-detail export checks, delivery records and preserved
  front-wave inputs.
- `hairline-pass/`: preceding female front, side and rear native views, runtime
  comparisons, front-lock clearance, export/delivery checks and preserved inputs.
  Its `candidate-deep-hairline/` folder records a rejected deeper cutback.
- `pony-wave-pass/`: preceding female native/runtime views, preservation checks,
  complete hanging-edge collar checks, delivery records and preserved inputs.
  The collar diagnosis records matching intersections in the preceding source
  and the initial candidate; `candidate-close-tips/` records an early shape.
- `pony-fiber-pass/`: current female native/runtime views, exact mesh and
  animation retention checks, pigment/texture checks at all detail levels,
  delivery records, and the preserved preceding pony-wave source.
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
- `female-cascade-clearance.json`: current 31-pose hair/body/collar check through
  every free end, accepting either exterior side of the collar and checking
  strand-edge intersections against its actual triangles.
- `*-blender-oblique.png`: native rendered close-ups; runtime captures are
  saved separately so Blender lighting is not confused with game appearance.

## Validation

Each character was sampled at nine points in idle, walk and run, plus seven
expression/secondary-hair combinations. Hair remains attached to the head;
female pony roots remain within 1.67 mm of their carrier, and female scalp
roots within 1.41 mm of the scalp. Male scalp roots remain within 1.41 mm.
Morph displacement deviation from the intended retained/scaled values is below
0.00003 mm (float rounding). The braid stays 0.73–6.93 mm outside the scalp.
New front-lock roots remain within 1.94 mm of the scalp and their surfaces
remain at least 2.94 mm outside the skin in the sampled expression poses.
The preceding fringe continuation checked the then-retained cheek-lock edges and
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

The ends/color pass repeats all 31 clip/secondary clearance poses,
with minimum measured body clearance 3.91 mm and jacket clearance 3.09 mm.
The finite-sample scope remains unchanged.

The scalp continuation repeats the 27 clip samples and seven expression/hair
attachment checks. A separate probe checks all 22,080 scalp-card vertices in
seven expression/hair poses: minimum skin clearance is 1.55 mm, with zero
vertices in front of the goggle lenses. It also verifies exact retention of
all 60 other mesh contracts, so the preceding pony/tendril clearance results
still apply to those unchanged surfaces. This probe excludes triangle-interior
and continuous collisions, goggle-frame contact and hair self-contact.

The front-wave continuation repeats the 27 clip samples and seven expression/
hair attachment checks. It additionally checks all vertices of the four
revised front/scalp/braid meshes plus the cheek-lock vertices in seven
expression/hair poses. Minimum skin clearance is 1.55 mm, with zero vertices
in front of the goggle lenses. The revised cheek locks retain at least 3.14 mm
of skin clearance. The 55 unchanged mesh contracts include the face and
goggles. The two meshes shared by the cheek and pony retain all 14,580 long
pony vertex and shape coordinates exactly, so the preceding hanging-pony
clearance remains applicable. The same finite-sample and triangle-interior
limitations apply.

The fiber continuation checks exact native geometry, UVs, skin weights and
all shape coordinates against the preceding front-wave source: 61 mesh
contracts match. The two brunette textures preserve stored alpha coverage,
and normal vector lengths remain within byte-image rounding tolerance. Every
existing exported index, geometry/skin attribute and morph attribute matches
at all three detail levels; new colors and texture bytes match the native
manifest. The preceding finite motion/clearance results are reused because
those inputs are identical; this continuation does not claim a new motion
sweep. Runtime evidence shows hair and face at idle frame 1, hair at run frame
10 and walk frame 18, with zero errors since the final page reload. The visual
change is subtle, and broader reference likeness remains in progress.

The hairline continuation checks the revised front-lock vertices in seven
expression/hair poses: minimum measured skin clearance is 2.96 mm, with zero
vertices in front of the goggle lenses. Roots remain within 1.78 mm of the cap;
narrower card-edge fitting moves their centers by at most 0.17 mm. Indices,
UVs and skin weights are retained. Root-derived tint varies by less than
0.00012, and exported colors match the new native values exactly. All 60 other
mesh contracts match the fiber source, including every pony and cheek strand.
The 27 native clip samples and seven attachment poses pass. Final runtime
captures cover hair and face at idle frame 1, run frame 10 and walk frame 18.
The same finite-sample limitations apply.

The pony-wave continuation retains all 58 other mesh contracts and all 1,224
cheek vertices and their shape coordinates exactly. The first four pairs of
each long card, topology, UVs, skin weights and vertex colors stay exact;
relative secondary deltas differ only by float rounding below 0.00002 mm.
365 cards change: 212 in the visible outer layer and 153 with rear-tip fitting.
The expanded 31-pose check covers both edges from pairs 4 through 17 of every
long card, including all tips. Minimum sampled body clearance is 3.91 mm and
jacket Y-column clearance is 8.00 mm. No tested longitudinal/cross-card edge
intersects the coat or hood triangles. This remains a finite native pose check,
not continuous collision, full triangle-interior, self-contact or LOD proof.

The pony-fiber continuation retains all 61 native mesh contracts (positions,
topology, UVs, weights and every shape coordinate) exactly. All eight other
hair material records and all 58 other mesh color arrays are retained. Alpha
coverage is identical. At every exported detail level, geometry, morph
attributes, index buffers, skeleton and animation data, and all texture bytes
match the preceding delivery exactly. Pony pigments match the native values
at every exported position. The existing finite motion and clearance reports
are reused because those geometry and motion inputs are identical; this pass
does not claim a new pose sweep. Reference likeness remains in progress.
The 27 native animation samples and seven attachment poses pass separately.
Runtime checks cover idle hair/face close-ups, the rear view, run frame 10 and
walk frame 18, with zero errors since the final page reload.

All six GLBs have zero validation errors. Export preservation checks compare
non-edited accessors, rig/node structure, animation channels, original textures
and unrelated material factors before/after serialization. The compressed
delivery copies and their SHA-256 manifest are regenerated losslessly.

The preceding pass's 18 focused import, expression and delivery tests and
TypeScript check pass. The contour, fringe, shoulder and ends/color continuations
change asset authoring only. The scalp continuation also explicitly imports
the review page's two floor-line shaders, fixing a missing-shader startup error
seen after restarting the preview server. Its fresh TypeScript check passes.
The front-wave, fiber, hairline and pony-wave continuations change asset authoring only.

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
The current front/scalp clearance and preceding-mesh preservation check uses
`scripts/launch-body-proof/validate_female_front_wave.py`. The older
`validate_female_scalp.py` targets the archived scalp-pass source now preserved
in `front-wave-pass/before/female-hair-refined.blend`.
The fiber pass material/geometry retention results are historical; its exact
source is retained in `hairline-pass/before/female-hair-refined.blend`.
The hairline pass front-lock/geometry results are historical; its source is
retained in `pony-wave-pass/before/female-hair-refined.blend`.
The current pony-only preservation check uses Blender with
`scripts/launch-body-proof/validate_female_pony_waves.py`. Its exported-data check
uses `node assets-src/avatars/complete-pair-study/hair-likeness-20260921/pony-wave-pass/validate-exports.mjs`.
The normal `npm run build` preserves the edited models and refreshes delivery
copies. The older full Blender reconstruction pipeline predates this pass;
reapply this reference-hair stage if reconstructing from its historical inputs.
