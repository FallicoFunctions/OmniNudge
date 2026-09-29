# Right-sleeve embroidery checkpoint

`male-rigged-jacket-embroidered.blend` adds fine gold filigree and thread relief to the character-right sleeve. Its winding stems, open leaves and scrolls interpret the visible reference linework; they are not an exact recovered pattern from the foreshortened image. The final width and gold response were strengthened after the first render was too faint at the normal review distance. The initial style control is retained under `controls/`.

The finish adds no objects, vertices, triangles, bones or corrective shapes. All existing mesh coordinates, topology, smoothing, skin weights, shape coordinates/metadata, object transforms/parents/modifiers/drivers, skeleton, actions and original mesh attributes remain exact. Every non-jacket material is preserved. Only the existing jacket material graph, `JacketEmbroideryUV` and the `TailorEmbroidery` face attribute are new or changed. The layer uses color, metallic/roughness blending and a chained Bump normal; material output displacement remains unlinked.

The packed `right-sleeve-embroidery.png` is a 2048×2048 Non-Color atlas: R coverage, G thread relief, B stored filament variation, A one. The shader uses R/G; B is retained for later baking work. Its 28 authored curves occupy 1.3523% of the atlas above half coverage. The sleeve UV is derived from the evaluated T pose, covering 0.29–0.69 m along the right arm, with an angle unwrap at the rear seam. The region contains 818 faces. The independent check reproduces those coordinates within 5.95e-8 and verifies the named UV node, Linear/CLIP sampling and packed atlas bytes.

`audit.json` verifies an exact geometry/deformation preservation bridge to the hardware checkpoint. It reads the preceding `hardware-audit.json`, verifies its source-model SHA and accepted 354 arm/36 neck counts, and records that report's SHA. These prior finite motion results carry forward through the unchanged geometry; no new full collision sweep was run for this material-only change. The finite arm/neck scopes overlap. General or combined motion, continuous/coplanar contact and positive minimum clearance remain unvalidated.

A fresh build reproduces every mesh/UV/attribute, skin, shape arrays and metadata, checked transforms/rig/actions/materials, all packed images, the external atlas PNG and native coat/hardware T/down output exactly. `reproduction-check.json` records that comparison. Eight saved views cover front, both obliques, back, collar, cuff, the extended sleeve and an elbow bend. The negative controls confirm that a wrong packed-image hash and a wrong UV-layer contract are rejected.

## Rebuild and audit

Run from the repository root with Blender 5.1.2 or a compatible version, replacing `blender` with the local executable. Output paths must be fresh.

```sh
blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/style_rigged_jacket_embroidery.py -- --output /tmp/embroidery-repeat/model.blend --texture /tmp/embroidery-repeat/right-sleeve-embroidery.png --report /tmp/embroidery-repeat/build.json
blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_embroidery.py -- --input /tmp/embroidery-repeat/model.blend --provenance /tmp/embroidery-repeat/build.json --report /tmp/embroidery-repeat/audit.json
```

The scripts default to the preceding hardware model. The auditor requires its matching `hardware-audit.json` next to the source before inheriting motion acceptance. This model SHA is `a22ecfdc08d602add04fba71bc19776af590522c43607cd660da4e80be44c569`. The packed and external atlas SHA is `feae84a99d1f70ea98080e1185bcb0323ffa2e5c9e4f90e0cfc7cc86bbedf250`.

All 44 preceding model binaries are preserved. Full male/female likeness, hair, the remaining outfit and accessories, closer fabric/reference tailoring, broader animation, full-material baking, corrective export and runtime/device tests remain unfinished. This sleeve-specific UV is not a completed garment unwrap or runtime material. The body05/runtime candidate is unchanged.
