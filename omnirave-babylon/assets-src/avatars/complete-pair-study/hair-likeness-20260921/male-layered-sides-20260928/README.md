# Male hair: layered sides, 2026-09-28

Added 261 short, backward-swept hair ribbons beneath the male avatar's existing
top hair. Their roots follow the scalp carrier, their tips taper behind the ear,
and every vertex is weighted to the head. The new matte fiber material uses the
existing male hair atlas and normal map. All three male GLBs and compressed
downloads were updated; the female assets were untouched.

The side and opposite-side Blender renders (`male-side.png`,
`male-other-side.png`) show the added layer. The Babylon captures
(`runtime-side-close.jpg`, `runtime-other-side-close.jpg`,
`runtime-standard-hair.jpg`) show it in the delivered asset. The layer softens
the cropped edge, but at review-page scale the change is modest. The back still
reads as a high undercut, and the top/front clumps remain more blocky and more
forward-hanging than the reference. Isolation renders
(`diagnostic-front-no-rooted.png`, `diagnostic-front-no-swept.png`, and
`diagnostic-front-no-scalp.png`) show that the solid scalp carrier fills the
gaps between the front locks and creates much of the straight visual edge;
removing the swept groom instead reveals the cap's own high curved hairline.
A further likeness pass should reshape the front cap/groom overlap and the back
silhouette together instead of adding another small surface layer.

Validation: 43 pre-existing meshes and the vertex mapping stayed exact;
the new cards are attached to the scalp within 1.2 mm and clear the body by at
least 1.94 mm at sampled pose corners (`native-checks.json`). The 27 movement
samples passed (`male-motion-validation.json`), portable glTF validation found
zero errors (`male-portable-validation.json`), the three detail levels and gzip
downloads passed comparison (`delivery-verification.json`), and the review page
loaded with no browser errors. These sampled tests cannot prove continuous
collision or hair-to-hair clearance.

`before/` holds an immutable snapshot of the male source and deliveries from
the start of this pass. `candidate-v1/` holds the first, rejected card layout.
