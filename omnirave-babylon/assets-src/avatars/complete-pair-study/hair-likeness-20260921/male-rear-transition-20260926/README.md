# Male rear hair transition — September 26, 2026

The dense scalp and rooted underlayer ended abruptly against the sides and back of the head. This pass softens that lower edge with vertex coverage and reduces a few bright rear strands. It preserves the lowered forehead hairline, hanging curls, and all geometry.

## Authored change

- The scalp and rooted underlayer receive a 14 mm coverage transition measured from the existing scalp boundary, with small variation along the boundary.
- The main groom remains fully opaque. Only selected rear highlight strands receive a pigment multiplier, reaching 0.48 in the strongest area.
- All 1,189 protected forehead ribbons retain white, opaque vertex factors.
- Blender shader factors and exported glTF `COLOR_0` use the same float32 data. Existing textures and material parameters remain intact.
- No meshes, vertices, textures, or materials were added. Three existing meshes gain vertex color data.

The first candidate also faded the outer groom, which shortened the visible curl above the ear. It was rejected and saved under `first-candidate/`. The delivered version restores opaque coverage across the entire main groom.

## Verification

- All 43 meshes retain exact geometry, topology, UVs, transforms, weights, and shape keys relative to `before/`.
- Existing material slots, material parameter defaults, polygon assignments, and original vertex attributes remain exact. Native shader graphs intentionally gain the color and coverage multipliers.
- Native validation passes 27 motion samples and attachment checks. No geometry changed; the preceding crown pass's skin-clearance results remain applicable. These sampled checks are not a continuous collision guarantee.
- All three male GLBs pass validation with zero errors. Exported vertex factors match native data; original geometry attributes, morphs, rig, animations, outfit, material parameters, and textures are retained.
- SHA-256 hashes and byte counts match the download manifest. All three gzip files round-trip to their GLBs. The refined native source and delivered runtime blend match exactly.
- Browser screenshots cover back, side, hair, face, run frame 10, and walk frame 18. Browser error logs are empty. The temporary camera-only inspection route was removed, and the standard male hair preview was retained at idle.

| Asset | Vertices checked for color | Added raw bytes | Added gzip bytes |
| --- | ---: | ---: | ---: |
| male.glb | 177,704 | 2,843,952 | 52,676 |
| male-lod1.glb | 64,368 | 1,030,564 | 19,131 |
| male-lod2.glb | 8,575 | 137,876 | 2,289 |

## Visual assessment

The rear and side boundary has fewer sharp dark points against the skin. Hanging curls and the frontal silhouette are preserved. Rear highlight reduction is subtle in the runtime lighting. The back remains dense and visibly clumped; this pass does not establish a finished reference likeness.

## Reproduction and evidence

`before/` stores immutable inputs. `build-candidate.py` applies the archived `authored-refinement.py` logic to that source and writes native renders. `validate-candidate.py` checks native contracts and motion. `node scripts/launch-body-proof/apply_reference_hair.mjs male` exports the male assets. `deliver.mjs` compares retained data, verifies color factors and gzip, copies the native runtime, and merges only male download records into a fresh manifest read.

The live helper is `scripts/launch-body-proof/refine_male_rear_transition.py`, with male-only hooks in `refine_reference_hair.py`. The incremental rebuild and exports were validated; the full cumulative pipeline was not rerun.

See `pass-summary.json`, `native-checks.json`, `delivery-verification.json`, native and motion reports, browser logs, and `runtime-*.jpg` for this pass's evidence. Temporary probe source is archived as `.txt` solely to document the inspection cameras.
