# Male swept crest — 26 September 2026

## Change

The upper crown now rolls backward and sideways, with softer flow above the ears. Five main-groom brown colors were rebalanced to lift very dark fibers and reduce bright gold streaks. The lowered hairline, first two pairs of every ribbon, and all 1,912 falling-fringe ribbons remain exact.

The Blender helper is `scripts/launch-body-proof/refine_male_swept_crest.py`; this folder archives it as `authored-refinement.py`. The male branch of `refine_reference_hair.py` calls the helper after fringe taper and before material finishing. The color helper works on both untextured source materials and the finished incremental source; `material-source-check.log` records that check. A full cumulative rebuild was not performed in this pass.

## Verified

- All 42 other native meshes are unchanged; topology, UVs, weights, material slots, transforms, and relative morph offsets are retained.
- Nine expression/secondary-motion samples: changed vertices stay at least 1.601 mm from skin; maximum ribbon width is 1.619 mm.
- All 27 standard movement samples pass attachment checks.
- 115,256 foreground triangle-center and edge-midpoint samples have no skin penetrations. Minimum sampled clearance is 0.148 mm; 11 samples are below 0.5 mm.
- All three male GLBs have zero glTF validation errors. Retained GLB data checks pass, allowing the intended groom geometry and five base-color changes.
- Asset/manifest hashes, gzip decompression, and native/runtime source equality pass.
- Browser screenshots cover idle, face, run, and walk poses. No browser errors were reported; the male hair preview remains open.

## Visual limits

The crown is less upright and the brunette tones are more even. Fine forehead strands still look grainy at this small browser size. Finite pose and face samples do not prove continuous or hair-to-hair collision freedom.

## Evidence

- `authoring-report.json`: geometric and material changes.
- `native-checks.json`, `male-motion-validation.json`, and `candidate-fringe-face-audit.json`: native checks.
- `male-portable-validation.json` and `delivery-verification.json`: export and delivery checks.
- `pass-summary.json`: combined final checks.
- `male-*.png`: native views; `runtime-*.jpg`: browser views.
- `before/`: immutable input snapshot; `geometry-only/`: intermediate geometry-only iteration.
