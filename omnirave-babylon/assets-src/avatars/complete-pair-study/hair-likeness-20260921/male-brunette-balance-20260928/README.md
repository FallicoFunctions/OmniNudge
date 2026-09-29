# Male brunette fiber balance, 2026-09-28

The groom fibers were nearly black in the review lighting, obscuring the
individual swept waves. This pass warms and lifts the base-color factors of
eight existing male hair materials. The grayscale fiber atlas, normal map,
alpha, geometry, rig, weights, UVs, vertex colors, and motion shapes are exact.
All three male detail levels and their compressed downloads were updated.

`candidate-front.png`, `candidate-oblique.png`, and `candidate-side.png` show
the clearer brunette strands in Blender; `runtime-front.jpg` shows the delivered
Babylon preview. The difference is subtle at the review page's normal scale.
The hairstyle remains too dense and angular at the front and too cropped at
the side and rear compared with the reference. A tested rear-volume expansion
created a bulb in side view and was rejected. A coherent rebuild of the hair
mass and swept locks is still needed; this color change does not solve that
silhouette mismatch.

`native-checks.json` confirms 44 exact mesh structures, vertex colors and
alpha, and hair images. `delivery-verification.json` confirms only the eight
base-color factors changed in all three GLBs, which passed glTF validation and
gzip round-trip checks. The existing 27-sample motion validation still applies
because geometry, rigging, and morphs are unchanged. The Babylon review page
loaded without browser errors. `before/` records the male source and exports
from the start of this pass.
