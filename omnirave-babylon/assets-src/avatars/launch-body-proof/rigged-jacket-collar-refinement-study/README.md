# Refined bomber collar

The editable [jacket](male-rigged-jacket-collar-refined.blend) gives the standing collar a smoother, closer upper rim that follows the chest and neck. It continues the sleeve-volume checkpoint and opens with arms lowered on `Body joint test`, frame 1; frame 31 is the T-pose. The authoritative appearance reference remains `../male-original.png`.

![Collar review](tailored-collar.png)

## What changed

The former upper rim inherited shoulder and arm influences from the sewn base. At its side peaks, skinning alone lifted the collar about 18.4 mm and pushed it outward about 27.1 mm when the arms lowered; inherited lowering keys added roughly 1.8 mm of height. A pose-independent coordinate offset would have moved the T-pose collar as well.

This stage changes only the **123 existing collar-ring vertices**. The original 2,548 vertices, including the neck seam, body panels, sleeves and cuffs, retain exact shape coordinates and weights. The jacket stays at 2,671 vertices and 5,088 triangles with the same connected topology, 14 native corrective keys and live 1 mm Solidify. The body, shirt, rest skeleton, actions, modifiers, drivers, material nodes and material-coordinate attributes remain preserved.

The collar's quarter, middle and top rings blend toward a chest/neck anchor by 4%, 45% and 100%. The target upper-rim weights are 25% `spine_03` and 75% `neck_01`. Every vertex still has at most four normalized, nonnegative influences. The builder uses the full T-pose affine skinning map to preserve its authored surface when rebinding; it accounts for the existing nonzero corrective values in that pose. Collar-local relative key offsets fade with the same blend. No new key driver or runtime handler is added.

The upper rim is smoothed along the chain and follows a gentle height curve, lower at the front and higher at the back. It is raised in the T-pose to retain standing-collar height after removing the shoulder-driven flare. In the default lowered pose, rim width decreases from 217.6 to 183.7 mm; maximum adjacent Z second difference decreases from 3.797 to 0.869 mm. These are same-vertex profile comparisons, not a general curvature guarantee; see `collar-profile-check.json`.

## Validation and remaining boundary

The exact delivered file passes [all 354 established motion samples](collar-audit.json): 61 lowering, 291 elbow/forward/overhead gesture samples and two independent-arm endpoints. Every sample has zero actual Solidify self/body/shirt strict crossings, midsurface self crossings, body-inside/ambiguous flags, near-normal shirt-layer flags and reversed thickness faces. Existing corrective driver values match the source exactly. Minimum triangle area remains 7.35e-9 m² and minimum thickness-orientation ratio remains 0.413.

The additional [eight neck controls](neck-probe.json) compare source and refined files at the lowered/T endpoints, using local `neck_01` X rotations of ±10° and Z rotations of ±20°. All four lowered controls pass. In the T-pose, the +10° X control passes; the other three retain 4, 4 and 12 shirt-seam crossing pairs already present in the source (4, 4 and 16). **No new body, self or shirt crossing pairs are introduced in these controls. Five of eight fully pass; general neck motion is not accepted.** The remaining three cases involve the preserved original seam and remain open.

Two rejected controls are retained: the first collar was too low and crossed the shoulder; the second followed the neck too weakly during the added sideways-bend test. The final 75% neck anchor removes those introduced body contacts. `collar-source-diagnostic.json` and `collar-source-deformation.json` record the source measurements.

A fresh portable rebuild reproduces all geometry, weights, keys, checked metadata, attributes and native T/down output exactly. `reproduction-check.json` records that comparison. Seven review images cover front, oblique, back, collar, cuff, T-pose collar and overhead collar. Their render reports identify the exact model. All 39 earlier model binaries are preserved.

This is a collar-refinement checkpoint. Detailed satin wrinkles, smoother body/sleeve topology, pockets, embroidery, hardware, full reference likeness and runtime export remain unfinished. The finite audit does not certify continuous motion, coplanar contact, positive minimum clearance or arbitrary animations. No runtime GLB is promoted.

## Rebuild

Run from the repository root using Blender 5.1.2 and fresh output paths. Blender's bundled Python/NumPy are sufficient.

```sh
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/refine_rigged_jacket_collar.py -- --output /tmp/jacket-collar-repeat/collar.blend --provenance /tmp/jacket-collar-repeat/collar.npz --report /tmp/jacket-collar-repeat/build.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_collar_refinement.py -- --input /tmp/jacket-collar-repeat/collar.blend --provenance /tmp/jacket-collar-repeat/collar.npz --report /tmp/jacket-collar-repeat/audit.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_rigged_jacket_neck.py -- --input /tmp/jacket-collar-repeat/collar.blend --report /tmp/jacket-collar-repeat/neck-probe.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/render_tailored_jacket_review.py -- --input /tmp/jacket-collar-repeat/collar.blend --output /tmp/jacket-collar-repeat/views
```

The builder defaults to the preserved sleeve study and uses the earlier collar provenance to identify its sewn rings. The optional audit `--quick` runs the 14-pose diagnostic scope. The neck probe is diagnostic: it records its acceptance result and does not treat the three known source-seam failures as an execution error.
