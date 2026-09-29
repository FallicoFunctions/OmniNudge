# Jacket neck-seam clearance checkpoint

`male-rigged-jacket-neck-seam.blend` clears the three inherited shirt-contact cases from the refined standing collar. All 354 established arm-motion samples pass, as do the eight paired neck endpoints and the 36-sample single-axis neck sweep. These scopes overlap; they are not 398 independent poses. The model remains an editable garment study with unfinished reference appearance and untested runtime export.

The change moves 44 sewn-surface vertices, using 0.35 mm outward offsets at contact seeds, 0.15 mm on neighboring vertices, and a coherent 0.35 mm translation across five vertices at the tiny front collar junction. Directions come from the complete outer shirt at the actual failing poses and are transported through skinning into bind coordinates. The same bind offset is added to Basis and all 14 corrective shapes. The other 2,627 vertices retain exact shape coordinates. Skin weights, topology, drivers, body, shirt, rest skeleton, actions, modifiers, materials and shader attributes are preserved. All 40 preceding model binaries remain unchanged.

The earlier T-arm neck tests had 4/4/12 shirt crossing pairs. The delivered model has zero native self/body/shirt crossings in all checked poses, zero midsurface self-crossings, zero body-containment or ambiguity flags, zero near-normal shirt-layer flags and zero reversed thickness faces. Existing key values match the source exactly. Maximum relative-key float residual is 7.451e-9 m. Minimum sampled triangle area remains 7.348e-9 m² and minimum thickness orientation ratio remains 0.4130.

The neck sweep tests `neck_01.matrix_basis = baseline @ local_rotation` at lowered and T arm endpoints: local X from −10° to +10° in 2.5° increments, and local Z from −20° to +20° in 5° increments. Each sample restores the original action and baseline first. Combined-axis neck poses, arbitrary animation, continuous clearance, coplanar contact and positive minimum clearance remain unvalidated.

Two rejected controls are retained under `controls/`. Both cleared the shirt but folded the native wall into itself at one lowered-arm neck endpoint. Reducing offsets alone did not resolve this; translating the five-vertex junction coherently did. No guard was relaxed.

The provenance records source shapes, authored T displacements, bind displacements and vertex sets. `seam-audit.json` uses the existing sleeve-offset audit because this correction follows the same unchanged-weight/all-key-offset contract. `neck-probe.json` compares the source and result at eight endpoints. `neck-sweep.json` checks the intermediate angles. `reproduction-check.json` compares a fresh build with the delivered file, including exact shape coordinates, weights, checked metadata/attributes, native T/down output and provenance arrays. Five renders are bound to the delivered model hash in `render-check.json`.

From the repository root, rebuild into a fresh directory:

```sh
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/fit_rigged_jacket_neck_seam.py -- --output /tmp/neck-seam-repeat/model.blend --provenance /tmp/neck-seam-repeat/provenance.npz --report /tmp/neck-seam-repeat/build.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_sleeves.py -- --source omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-collar-refinement-study/male-rigged-jacket-collar-refined.blend --input /tmp/neck-seam-repeat/model.blend --provenance /tmp/neck-seam-repeat/provenance.npz --report /tmp/neck-seam-repeat/audit.json
/opt/homebrew/bin/blender -b --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_rigged_jacket_neck_sweep.py -- --input /tmp/neck-seam-repeat/model.blend --report /tmp/neck-seam-repeat/neck-sweep.json
```

Remaining avatar work includes body-panel tailoring, satin folds, pockets/embroidery/hardware, complete male and female reference likeness and outfits, broader animation validation, runtime export and in-game/device testing. The body05/runtime working candidate is unchanged.
