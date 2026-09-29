# Jacket satin folds and finish checkpoint

`male-rigged-jacket-satin.blend` adds broad front-panel and outer-sleeve folds to the passing chest study, with sharper satin highlights and finer fabric-coordinate normal detail. The sewn opening, standing collar, cuffs and fitted inner sleeve channels retain their established construction. Pockets, embroidery, hardware, full reference likeness and runtime export remain unfinished.

The geometric front folds use three uneven diagonal fans, authored in the lowered pose, at roughly 1.096, 1.243 and 1.383 m height. Their broad widths are 32, 44 and 35 mm. Outer sleeves use a roughly 170 mm varying wavelength and smoothly preserve the inner arm channel, elbow crease and cuff transitions. Maximum authored T displacement is 5.998 mm. The same inverse-skinned bind offset is added to all fifteen shape blocks. Topology and weights are unchanged; 806 vertices have offsets greater than 1 nm and the other 1,865 retain exact stored shape coordinates. Six of those fixed vertices have smaller computed taper offsets. Maximum relative-key float residual is 2.980e-8 m.

The first broad-fold candidate passed all 354 checks but reduced one tiny zipper-adjacent triangle's minimum signed offset-orientation/area ratio to 0.1166, versus 0.5939 on that source face. It was superseded by a 10 mm flat strip beside the zipper, feathering into the folds over the next 20 mm. The delivered geometry restores the overall sampled minimum ratio to 0.4130 and minimum triangle area to 7.514e-9 m². The earlier passing control and corrected diagnostic are retained under `controls/`. This ratio is an orientation/area measure, not a physical thickness percentage.

The jacket-only material refinement retains the original pearl/black/gold colors, metallic connections and knit bump. White-fabric roughness changes from 0.36 to 0.26, with coat weight 0.18, coat roughness 0.20 and increased fabric sheen. A stretched low-amplitude noise bump supplies fine normal detail through the existing `TailorRest` point attribute. No UV or Generated coordinates are used, and no material displacement output is connected. All other materials, geometry, skin, shape keys, rig/actions/drivers, modifiers and retained shader attributes are exactly preserved across this shading step.

Validation is explicitly connected across the two build steps:

- `folds-audit.json` tests the geometry-only intermediate at all 354 established samples: 61 lowering, 291 gesture and two independent-arm endpoint controls. Every native self/body/shirt crossing, midsurface crossing, containment/ambiguity, layer-order and thickness-orientation guard is clear. Existing driver values match the source exactly.
- `satin-style.json` links that audited intermediate hash to the delivered model and verifies identical mesh geometry, skin, every shape coordinate and deformation metadata after reopening. Only the identified jacket material changes, so the arm-motion result carries through unchanged.
- `neck-sweep.json` tests the final styled binary directly at all 36 finite neck controls. Every guard passes. Zero-neck samples overlap the arm scope.
- `reproduction-check.json` verifies exact geometry, weights, keys, checked material/metadata/attributes, native T/down output and provenance arrays from a fresh two-step rebuild.
- Seven review images cover front, oblique, back, collar, cuff, T arms and bent elbows. Both render reports identify the exact delivered binary.

All 42 preceding model binaries are preserved. The jacket remains a 2,671-vertex, 5,088-triangle connected garment with fourteen native corrective drivers and live 1 mm Solidify. General/combined animation, continuous clearance, coplanar contact and positive minimum clearance remain unvalidated. The jacket has no UV layers; the procedural finish still requires an export/baking strategy and verification in Babylon before it can be considered game-ready.

From the repository root, rebuild into a fresh directory:

```sh
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_jacket_satin_folds.py -- --output /tmp/satin-repeat/folds.blend --provenance /tmp/satin-repeat/folds.npz --report /tmp/satin-repeat/build.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_sleeves.py -- --source omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-chest-study/male-rigged-jacket-chest.blend --input /tmp/satin-repeat/folds.blend --provenance /tmp/satin-repeat/folds.npz --report /tmp/satin-repeat/audit.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/style_rigged_jacket_satin.py -- --input /tmp/satin-repeat/folds.blend --output /tmp/satin-repeat/satin.blend --report /tmp/satin-repeat/style.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_rigged_jacket_neck_sweep.py -- --input /tmp/satin-repeat/satin.blend --report /tmp/satin-repeat/neck.json
```
