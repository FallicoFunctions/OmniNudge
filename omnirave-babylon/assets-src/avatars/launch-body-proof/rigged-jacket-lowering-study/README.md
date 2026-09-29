# Rigged jacket lowering study

The male jacket now passes the original full arm-lowering control with two added finite shape keys. The body, shirt, rest skeleton, jacket topology, weights, live 1 mm Solidify modifier, original twelve key coordinates, and action contents are preserved. The preceding gated model remains unchanged in `../rigged-jacket-gated-study/`.

Open `male-rigged-jacket-lowering.blend`. It starts at the corrected full-down pose, frame 1 of `Body joint test`. The default timeline ends at frame 31, the T-pose. The existing elbow-bend, forward-reach and overhead-reach review actions remain available. There are fourteen corrective keys excluding Basis; `lowered_endpoint_l` and `lowered_endpoint_r` are editable independently.

## Verified scope

`lowering-audit.json` records checks made after saving and reopening the exact model bytes retained here:

- All 61 half-frame samples from original frame 31 to frame 1 have zero strict non-coplanar native self/body/shirt triangle crossings, zero midsurface crossings, zero body-contained or ambiguous native vertices, zero near-normal shirt-layering violations, and zero reversed thickness faces.
- All 291 existing review samples retain their original key values exactly, with the two new keys at zero and no native triangle crossings. These sample frames 1 through 49 at half-frame spacing in each of the three review actions.
- Two additional controls, one arm down and the other in T, pass the same new-geometry guards and activate only the appropriate endpoint key.
- Full-down reconstructed target error is below 0.0000003 m; T geometry is unchanged. The 22 added property/key drivers use Blender's simple evaluator. No runtime handler or contact solver was added.

The new keys use upper-arm angle for interpolation and a smooth confidence gate derived from both arm-bone directions. Their influence also vanishes on the three previously calibrated gesture curves. The retained `inputs/lowering-curve-fit.json` supplies the six polynomial feature fits used to author those native drivers. The saved Blender file contains its key coordinates and driver expressions; it does not read the NPZ or JSON inputs at runtime.

The accepted posed target is retained in `inputs/lowered-target.npz`, with its independent geometry audit beside it. `target-authoring.json` summarizes the rejected geometric controls and the final underarm, shirt and front-opening corrections. Front, oblique and back renders come from this exact saved model; `render-check.json` records the model hash and native endpoint contact check.

This is a motion study. Reference appearance, finished tailoring, materials, general motion and runtime export remain unfinished. Finite strict-crossing checks do not prove continuous or coplanar separation or a minimum physical clearance. The previous male and female body/wardrobe controls remain separate preserved artifacts.

## Reproduce

From the repository root, with Blender 5.1.2, run the installer with a fresh output location:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/install_lowered_jacket_corrective.py -- --output-blend /tmp/omnirave-lowering-reproduction/male-rigged-jacket-lowering.blend --audit /tmp/omnirave-lowering-reproduction/lowering-audit.json
```

The installer defaults to the preserved gated source and the inputs in this directory. It refuses to overwrite an existing model. To reproduce the review images, run `omnirave-babylon/scripts/launch-body-proof/render_lowered_jacket_review.py` with `--input` set to the reproduced model and `--output` set to a fresh image directory. Rendering does not save changes to the source model.
