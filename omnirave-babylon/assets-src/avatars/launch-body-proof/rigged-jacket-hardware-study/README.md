# Rigged jacket pocket and hardware study

The editable `male-rigged-jacket-hardware.blend` adds two closed hip pocket zipper faces, one left sleeve utility zipper face and four hollow gold pull tabs to the satin jacket. These are closed decorative pocket fronts; opening zippers and pocket bags are not implemented. The original jacket, body, shirt, skeleton, action contents, original materials and corrective system are preserved exactly.

Seven new meshes contain 10,464 vertices and 20,276 triangles. Each uses the existing armature, at most four normalized bone influences, and fifteen shape blocks with fourteen drivers that follow the matching jacket corrective values. No extra bones, Surface Deform modifier or frame handler is required. Each metal tooth and pull uses a shared local support anchor; the panel follows many barycentric samples from the evaluated outer cloth. Constant outward projection avoids the folded offsets created by faceted cloth normals in the rejected first candidate. The dense panel uses smooth shading, while metal edges keep crisp bevels.

The exact final binary passes all 354 established arm samples (61 lowering, 291 gesture, two independent-arm endpoints) plus the 36 finite single-axis neck controls. All added geometry has zero strict crossings with the jacket/body/shirt, zero component self-crossings, zero unintended component pairs and zero inter-object crossings. The only permitted construction overlaps are each tooth with its nearby panel rows and each pull tab with its own slider. Source geometry/deformation preservation carries the preceding jacket's existing acceptance forward; this new audit directly tests hardware against that preserved surface. The arm and neck scopes overlap and are not 390 unique poses.

Maximum measured metal edge strain across the finite samples is 3.5615%. Full per-part nearest-surface ranges and strain values are in `motion-metrics-summary.json`; these measurements are not general-motion tolerances. Hip attachment weight interpolation loses at most 4.391% before renormalization to four influences. Walking, leg motion, arbitrary combined gestures and continuous contact are untested. Strict-crossing tests also do not certify coplanar contact, positive minimum clearance, physical cloth behavior or export behavior.

A fresh build reproduces all geometry, skin, shape blocks, attributes, checked material/rig/action metadata, panel smoothing, native T/down positions and every provenance array exactly. `reproduction-check.json` records the comparison. Nine saved renders show front, oblique, back, collar, cuff, T pose, elbow bend and both hardware closeups. The original failed fit's short audit and localization remain under `controls/`.

## Rebuild and audit

Run from the repository root, replacing `blender` with the local Blender executable. Each output must be a fresh path.

```sh
blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_jacket_hardware.py -- --output /tmp/hardware-repeat/model.blend --provenance /tmp/hardware-repeat/provenance.npz --report /tmp/hardware-repeat/build.json
blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_jacket_hardware.py -- --input /tmp/hardware-repeat/model.blend --provenance /tmp/hardware-repeat/provenance.npz --report /tmp/hardware-repeat/audit.json
```

Add `--quick` to the auditor for fourteen arm samples and eight neck endpoints. Both scripts default to the preceding satin model as their source and accept explicit source overrides. The source SHA is `80c645ecb426ae3c4ea36860efd734afeeccbdb58ae68c914c91b77837377c31`; this model SHA is `31517968748c06d92ce28925be0a4f540261a424237e3828bc069b10aa458ae1`.

All 43 preceding model binaries remain unchanged. The body05/runtime candidate is unchanged. Embroidery, closer reference tailoring, complete male/female likeness and outfits, broad animation qualification, UV/material baking, corrective export, hardware LOD and runtime/device testing remain unfinished. This is an authoring checkpoint, not a game-ready asset release.
