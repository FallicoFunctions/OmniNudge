# Jacket corrective activation follow-up

This editable Blender copy fixes corrective activation outside the three calibrated gestures. It preserves the body, shirt, rest skeleton, jacket shape-key coordinates, modifiers and existing actions. The prior source remains unchanged in `../rigged-jacket-study/`.

Each arm has a separate gate based on its upper-arm and forearm directions. Correctives retain full influence within a six-dimensional direction distance of 0.01 from a calibrated curve, fade smoothly between 0.01 and 0.04, and turn off beyond 0.04. These are design thresholds, not angle measurements. The three curves cover the existing elbow bend, forward reach and overhead reach actions. They do not establish a general pose domain.

The exact saved copy was reopened for these checks:

- All 291 half-frame review samples remain clear of strict non-coplanar self, body and shirt triangle crossings with the live 1 mm Solidify modifier. Existing key values are preserved within the tolerance recorded in the audit.
- The 61 original lowering samples match the zero-corrective control. Ten samples are clear; the first failure is frame 26, compared with frame 30 in the prior active-corrective file. Full lowering still fails.
- Twenty-one samples through the fade near the T-pose have finite, non-increasing gate values and no measured contacts.
- Two mixed-arm controls verify independent activation. They do not claim whole-pose clearance.

`male-rigged-jacket-gated-audit.json` records the copy's checks and source hash. `luna-lowering-study.json` and its two NPZ files retain the comparison used to diagnose the regression. The two lowered-pose PNGs show the original zero-corrective control's unresolved shoulder and armhole defects. A three-pose Preserve Volume control also failed; that modifier change was not adopted.

Full lowering, tailoring, reference appearance and runtime export remain unaccepted. The contact screen does not prove continuous collision avoidance, coplanar separation or a minimum physical gap. Existing score drivers are retained; the added gate and updated key expressions use Blender's simple evaluator. No Python handler, add-on or runtime contact solver was added.

## Reproduce

From the repository root, run Blender 5.1.2 in background mode with `--threads 2 --python-exit-code 1`. First run `omnirave-babylon/scripts/launch-body-proof/probe_rigged_lowering_control.py`, then `omnirave-babylon/scripts/launch-body-proof/gate_rigged_jacket_correctives.py`. The scripts resolve the retained input relative to themselves and write their default outputs under `/tmp/omnirave-luna-lowering-study`. Use the gate script's `--output-blend` and `--audit` options for a fresh destination when the default output already exists. The saved Blender file itself has no dependency on those temporary diagnostic files.
