# Bomber sleeve volume study

The editable [jacket](male-rigged-jacket-sleeves.blend) adds fuller outer sleeves and subtle broad folds to the preceding open-front tailoring checkpoint. It opens with arms lowered on `Body joint test`, frame 1; frame 31 is the T-pose. The authoritative visual reference remains `../male-original.png`.

![Front review](tailored-front.png)

## Shape and deformation

This stage offsets **358 sleeve vertices** and preserves all shape coordinates on the other **2,313 vertices** exactly. The jacket remains 2,671 vertices and 5,088 triangles, with the same sewn topology, weights, 14 native corrective keys, armature and 1 mm Solidify. No new driver or playback handler is added.

The authored ease is 12 mm before tapering, with broad oblique folds up to 1.8 mm and a nominal 105 mm wavelength. Maximum measured T-pose displacement is 13.798 mm. Smooth transitions preserve the shoulder junction, cuffs, inner sleeve channel and front elbow crease. These areas constrain the added volume when the arms lower or bend.

The builder measures the actual T-pose arm axes, transports the authored displacement through each vertex's inverse skinning map, and adds the same bind-space offset to all fifteen shape blocks. The maximum change in existing relative shape deltas after float storage is 5.96e-8 m. The original material-coordinate attributes stay exact, keeping the trim anchored to the fabric.

Two rejected controls explain the constraints: unrestricted radial expansion crossed the torso and shirt in the lowered pose; protecting the inner sleeve alone still caused a foldover in the deepest elbow bend. Their quick audit reports are retained in `controls/`.

## Validation

The exact delivered binary passes [354 sampled motion checks](sleeve-audit.json): 61 original lowering samples, 291 samples across elbow bend/forward reach/overhead reach, and two independent-arm endpoints. Every sample has zero actual Solidify self/body/shirt strict crossings, midsurface self crossings, body-inside/ambiguous flags, near-normal shirt-layer flags and reversed thickness faces. Existing corrective-key values match the source exactly.

Topology, weights, body/shirt geometry, rest skeleton, actions, modifiers, drivers and sampled material/attribute state match the preceding tailored source. Minimum triangle area is 7.35e-9 m²; minimum thickness orientation ratio is 0.413. A fresh portable rebuild matches all geometry, weights, keys, checked metadata, attributes and native T/down output exactly; see [reproduction-check.json](reproduction-check.json). All 38 earlier model binaries are preserved.

The five review views are tied to this exact file by `render-check.json`. The result is a sleeve-volume checkpoint: the folds are intentionally subtle on the existing coarse mesh. Detailed satin wrinkles, smoother silhouette topology, collar refinement, embroidery, pockets, hardware and overall reference likeness remain unfinished. These finite checks do not certify continuous motion, coplanar contact, positive minimum clearance, general animations or runtime export. No GLB is promoted by this stage.

## Rebuild

From the repository root, use Blender 5.1.2 with fresh output paths. Blender's bundled Python and NumPy are sufficient.

```sh
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_jacket_sleeves.py -- --output /tmp/jacket-sleeves-repeat/sleeves.blend --provenance /tmp/jacket-sleeves-repeat/sleeves.npz --report /tmp/jacket-sleeves-repeat/build.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_sleeves.py -- --input /tmp/jacket-sleeves-repeat/sleeves.blend --provenance /tmp/jacket-sleeves-repeat/sleeves.npz --report /tmp/jacket-sleeves-repeat/audit.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/render_tailored_jacket_review.py -- --input /tmp/jacket-sleeves-repeat/sleeves.blend --output /tmp/jacket-sleeves-repeat/views
```

The builder defaults to the preserved `rigged-jacket-tailoring-study/male-rigged-jacket-tailored.blend`. `--scale` changes the authored displacement and requires a new audit; only the default 1.0 recipe is accepted here. The audit's optional `--quick` performs a 14-pose diagnostic before the full scope.
