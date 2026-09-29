# Open-front jacket tailoring study

The editable [male jacket](male-rigged-jacket-tailored.blend) adds a tapered open front, a sewn standing collar, pearl satin and matching black/gold collar, cuff and waistband trim to the validated lowering rig. The authoritative appearance reference is the preceding `male-original.png`.

The file opens with arms lowered on `Body joint test`, frame 1. Frame 31 is the shared T-pose. Its three `Jacket review` actions remain available in Blender's Action Editor. The saved timeline bounds are 1–31; the reviewed outward halves of those three actions run from 1–49.

![Front review](tailored-front.png)

## Geometry and deformation

The jacket has **2,671 vertices, 5,088 triangles, one connected component and three closed boundary loops**: the combined front/neck/hem opening and two cuffs. It retains the armature, 14 native corrective shape keys and live 1 mm Solidify. Every vertex has at most four bone influences. No solver or Python handler runs during playback.

The front opening is about 92 mm across at the neck and 160 mm at the hem. Shared-edge clipping interpolates every corrective shape and each new vertex's weights. All 2,426 surviving original vertices retain exact source key coordinates; retained weights differ by at most 2.98e-8 from normalization and float storage.

The collar adds 123 vertices and 240 triangles on three rings attached to 41 existing neck vertices. The short vertical zipper-edge segments are excluded from its attachment arc. Body/shirt cross-sections guide the rings, and a bounded radial correction addresses actual contact faces across 11 fitting poses. One pass moves 31 new vertices by at most 3 mm; the next pass finds no collar crossings. The immediate open-front input's existing coordinates, keys and weights remain exact. A rejected collar control is retained in `inputs/collar-negative-control.json`.

Materials use stable T-pose attributes. Gold zipper teeth and piping stay on the jacket panels; paired gold bands follow the knit trim. Rib detail is bump shading with no geometry displacement. These are Blender procedural materials; a runtime texture/UV export has not been accepted.

## Saved-file validation

The exact delivered file passes the [motion audit](tailoring-audit.json):

| Scope | Clear / checked |
| --- | ---: |
| Original lowering, frames 31–1 in half-frame steps | 61 / 61 |
| Elbow bend, forward reach and overhead reach, frames 1–49 in half-frame steps | 291 / 291 |
| Left-down/right-T and right-down/left-T controls | 2 / 2 |

Every sample has zero actual Solidify self/body/shirt strict crossings, midsurface self crossings, body-inside/ambiguous flags, near-normal shirt-layer flags and reversed thickness faces. Existing key values match the source exactly; the independent-arm controls activate the expected lowering key at 1 and the other at 0. The minimum midsurface triangle area is 7.35e-9 m² and the minimum thickness orientation ratio is 0.413.

The audit also verifies the source body, shirt geometry, skeleton, actions, modifiers and driver metadata. All 37 preceding model binaries are preserved. `style-check.json` verifies unchanged geometry/skin through styling and reopening. `render-check.json` ties the five review views to this exact model. The opening and collar rebuild checks verify exact geometry, skin, keys, drivers, attributes and native T/down output against the accepted candidates.

The 2 mm local fitting target is not a certified minimum clearance. These are finite sampled strict-crossing checks; continuous motion, coplanar contact, general animations, optimized topology, runtime export and device performance remain unaccepted. Loose bomber sleeve volume, authored folds, collar silhouette refinement, embroidery, utility pockets, hardware and full reference likeness remain unfinished.

## Rebuild

Run from the repository root with Blender 5.1.2 available as `blender`. Each output must be fresh. The scripts use Blender's bundled Python/NumPy.

```sh
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/tailor_rigged_jacket_opening.py -- --output /tmp/jacket-tailoring-repeat/opening.blend
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_jacket_collar.py -- --input /tmp/jacket-tailoring-repeat/opening.blend --output /tmp/jacket-tailoring-repeat/collar.blend --report /tmp/jacket-tailoring-repeat/collar-build.json --provenance /tmp/jacket-tailoring-repeat/collar-provenance.npz
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/style_rigged_jacket_tailoring.py -- --input /tmp/jacket-tailoring-repeat/collar.blend --output /tmp/jacket-tailoring-repeat/tailored.blend
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_tailoring.py -- --input /tmp/jacket-tailoring-repeat/tailored.blend --opening-provenance /tmp/jacket-tailoring-repeat/opening.provenance.npz --report /tmp/jacket-tailoring-repeat/audit.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/render_tailored_jacket_review.py -- --input /tmp/jacket-tailoring-repeat/tailored.blend --output /tmp/jacket-tailoring-repeat/views
```

The opening builder defaults to the preserved `rigged-jacket-lowering-study/male-rigged-jacket-lowering.blend`. Retained construction mappings, collar bind deltas, fitting evidence and reproduction checks are in `inputs/`; `tailoring-authoring.json` records appearance intent and scope.
