# Jacket front-panel shape checkpoint

`male-rigged-jacket-chest.blend` gives the jacket smooth hanging chest/waist panels and removes the inherited nipple relief. It continues the passing neck-seam model. This is a shape milestone; satin folds, pockets, embroidery, hardware, full avatar likeness and runtime export remain unfinished.

The front is authored in the actual lowered pose. A shallow curved surface spans the pectorals and abdomen, while a smooth envelope fades the change before the neckline, hem and side/armhole regions. The original T coordinates distinguish torso vertices from lowered sleeves. Maximum forward displacement is 45.175 mm, occurring near the side of the waist. The existing front opening follows the new surface.

Flattening only depth initially caused 14 native self-crossings in the bilateral nipple patches. The diagnostic found overlapping XZ triangle footprints at different depths in the inherited body mesh; flattening collapsed those layers. The delivered correction first relaxes local XZ coordinates over 198 vertices with a fixed outer border, then fits the smooth depth surface. Maximum tangential displacement is 5.665 mm. The rejected control and diagnostic remain under `controls/`; its guard failure was not relaxed or hidden.

The same inverse-skinned bind offset is added to Basis and all 14 corrective shapes. The builder computes 626 nonzero offsets; 624 exceed 1 nm, with two smaller taper endpoints. The audit verifies exact stored coordinates on 2,047 vertices, including the two taper endpoints, plus exact weights/topology and unchanged body/shirt, rest skeleton, actions, drivers, modifiers, material data and shader attributes. Maximum relative-key float residual is 1.490e-8 m. The jacket remains one connected 2,671-vertex, 5,088-triangle mesh with three opening loops and live 1 mm Solidify.

The reopened delivered file passes:

- All 354 established arm-motion samples: 61 lowering, 291 review motions and two independent-arm endpoints.
- All 36 finite neck samples at lowered and T arm endpoints, including the previously corrected neck positions. These overlap the arm scope at zero neck rotation.
- Zero strict native self/body/shirt crossings, midsurface self-crossings, body containment/ambiguity, near-normal shirt-layer flags or reversed thickness faces throughout those scopes. Existing driver values match the source exactly.
- Exact reproduction of mesh/shape coordinates, weights, checked metadata/attributes, native T/down output and all provenance arrays in a fresh build.

General animation, combined-axis neck motion, continuous-time clearance, coplanar contact, positive minimum clearance and runtime/device behavior remain unvalidated. All 41 preceding model binaries remain unchanged.

`chest-provenance.npz` records original T/down points, authored down displacements, bind displacements, all source shape coordinates, the surface target and masks. `chest-audit.json` reuses the established same-offset sleeve audit; `neck-sweep.json` contains the finite neck checks. Five review renders and their model hash are retained beside the model.

From the repository root, rebuild into a fresh directory:

```sh
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_jacket_chest.py -- --output /tmp/chest-repeat/model.blend --provenance /tmp/chest-repeat/provenance.npz --report /tmp/chest-repeat/build.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_sleeves.py -- --source omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-neck-seam-study/male-rigged-jacket-neck-seam.blend --input /tmp/chest-repeat/model.blend --provenance /tmp/chest-repeat/provenance.npz --report /tmp/chest-repeat/audit.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_rigged_jacket_neck_sweep.py -- --input /tmp/chest-repeat/model.blend --report /tmp/chest-repeat/neck-sweep.json
```
