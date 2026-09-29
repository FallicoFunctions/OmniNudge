# Shirt placket, collar flaps and buttons

`male-rigged-shirt-detailed.blend` adds a full-length center placket, two pointed collar overlays and four dark buttons with gold rims to the embroidered-jacket source. Seven closed meshes add 3,618 vertices and 7,208 triangles. The placket reaches the measured center-front shirt hem; its upper end preserves the deep V opening. Four dark circles on each button are shader wells, not physical holes. The collar overlays are an initial tailoring pass: their upper ends remain visible and a continuous neck band is still unfinished.

The original shirt, jacket, body, hardware, embroidery, packed images, materials, skinning, corrective shapes, skeleton and actions remain exact. Each new piece has one existing-armature modifier, no corrective keys or drivers, identity local/parent-inverse transforms, and no more than four normalized influences per vertex. Bind coordinates compensate for the original shirt's actual T-pose skin matrix. The independent auditor reconstructs every new vertex's bone weights from an original shirt triangle and barycentric coordinates, separately from checking the saved provenance arrays. Maximum discarded weight before renormalization is 0.65291%.

`shirt-audit.json` passes 354 established arm samples and 36 single-axis neck samples directly on this exact binary. All new pieces have zero strict crossings with the complete original shirt, body, coat and hardware, zero self-crossings and zero inter-detail crossings. No mating exceptions are used for shirt details. Closed triangle topology, positive T signed volume, coordinate reconstruction, finite geometry/metrics and source preservation also pass. The accepted embroidery audit's model SHA and report SHA are verified; unchanged original geometry carries its preceding coat/hardware scope forward.

These finite scopes overlap and do not certify arbitrary/combined motion, continuous or coplanar contact, positive minimum clearance, physical cloth behavior or locomotion. Unsigned nearest-shirt distance and edge strain are descriptive metrics, not acceptance thresholds. Collar distance reaches 12.704 mm across the open V and maximum collar edge strain reaches 23.421% during neck controls. Maximum button edge strain is 0.002993%; all four buttons use one shared anchor apiece. See `motion-metrics.json` for each part.

A fresh build reproduces all checked geometry, topology, skin, shapes, metadata, rig/actions/materials and packed image bytes exactly. All 26 evaluated meshes match exactly in native T/down poses, as do all 35 provenance arrays. Eight review images accompany the model. Seven final images have identical pixels to the inspected fit candidate; the cuff differs by at most one 8-bit channel level and was inspected separately. The rejected first fit, its contact localization, the corrected parameter summary and front/hem surface probes are retained. All 45 preceding model binaries remain unchanged.

## Reproduce

Run from the repository root using Blender 5.1.2 or a compatible version. Use fresh output paths. The builder and auditor default to the preceding embroidery source; the auditor requires its matching `audit.json` beside that source.

```sh
blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_shirt_details.py -- --output /tmp/shirt-repeat/model.blend --provenance /tmp/shirt-repeat/provenance.npz --report /tmp/shirt-repeat/build.json
blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_shirt_details.py -- --input /tmp/shirt-repeat/model.blend --provenance /tmp/shirt-repeat/provenance.npz --report /tmp/shirt-repeat/audit.json
blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/verify_rigged_shirt_reproduction.py -- --first omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-shirt-detail-study/male-rigged-shirt-detailed.blend --second /tmp/shirt-repeat/model.blend --first-provenance omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-shirt-detail-study/shirt-provenance.npz --second-provenance /tmp/shirt-repeat/provenance.npz --report /tmp/shirt-repeat/reproduction.json
```

Use `render_tailored_jacket_review.py` for five overall views and `render_rigged_shirt_details.py` for three closeups; both take `--input` and `--output` after `--` and preserve the Blender source. The final model SHA is `a66c375fc95b28f82674bce0f386a771416ee2a7a3b8f80341dd85b61431e6db`.

Closer collar/reference tailoring, full male/female likeness, hair, trousers, footwear, accessories, wider motion coverage, material baking, corrective export and runtime/device validation remain unfinished. The existing body05/runtime candidate is unchanged.
