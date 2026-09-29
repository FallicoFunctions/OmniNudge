# Male likeness experiment — rejected at G1

Four local Blender studies were made from the existing MPFB-based male body. The latest is `study04.blend`. It opens and renders, but does **not** reproduce the original identity sufficiently. This is an unsuccessful likeness experiment, not a finished avatar. No user likeness acceptance has been given.

Open `index.html` for the original artwork beside the unmodified base or current study, with front, three-quarter, profile, and approximate reference-angle cameras. The original crop is enlarged in the browser; it contains no newly generated facial detail. Camera, framing, lights and exposure match between the displayed baseline and study04. Historical study01–03 images use the earlier framing and must not be treated as matched controls.

## What the experiment established

- The original 1024 × 1536 artwork is the authority. The existing dressed turnarounds are supporting inferences, not independent measurements.
- A coherent inherited face can be adjusted without replacing it with disconnected primitives: the face study retains body vertex order, UVs and inherited weights. Cheek, chin, nose, mouth and eyelid changes are editable in `Reference_face_study`.
- Swept solid locks produced an exposed scalp gap, then a conspicuous solid wig. A scalp-following strand-card groom removed that gap but still has the wrong hairline, volume and curl structure.
- The face remains a generic interpretation. The reference's eye/brow relationship, nose-to-mouth proportions, cheek/jaw structure and expression are not captured well enough. Material changes do not establish identity.
- Earrings were moved toward the lobes. Their final attachment and movement have not been certified. A 56-bone inherited rig does not prove deformation quality.

## Checkpoints

| Checkpoint | Change | Decision |
|---|---|---|
| baseline | Male morph of untouched source geometry/materials, selected source wardrobe | Control only |
| study01 | Face targets, warmer skin, swept solid locks, earrings | Reject: exposed scalp and incorrect hair form |
| study02 | Filled hair underlayer, denser strands | Reject: solid wig and floating side locks |
| study03 | Continuous groom volume and textured strand cards | Reject: simplified side sweep, generic face |
| study04 | Reduced crest, irregular waves, calmer skin, matched review framing | Best current diagnostic; likeness still fails |

`study04.blend` contains a whole inherited body and wardrobe, but only the head was studied. Garment fit problems remain. Portrait subdivision and the 73,680-triangle strand cards are experimental; they are not an 8 GB runtime asset budget. `structure-report.json` measures the viewport-evaluated geometry, not the higher render subdivision. No GLB export, runtime FPS claim, animation acceptance, clothing-swap acceptance or automated-pipeline completion is made.

## Recommended next experiment, pending cost/upload approval

Compare three **image-conditioned** Meshy-7 outputs against the same original before any modular-body conversion:

1. Original male artwork as the single geometry image.
2. Existing male front T-pose as the single geometry image.
3. Existing male front/back/left/right T-poses together. The original guides texture, and remains the acceptance reference.

Use explicit Meshy-7, no Ultra, 4K textured output, no remeshing, no automatic image enhancement, lighting removal, and requested T-pose. Different input preparations are deliberate experimental variables; this is not a statistically powered comparison of models. Retain every result, including failures. Compare neutral material and clay renders, especially the face after removing baked lighting. Do not confuse a fused dressed scan with a reusable anatomical body.

The proposed ceiling is **90 generation credits** (3 × 30) and **$25 total first-month outlay including tax**, subject to user approval. Meshy's public Pro price is $20/month with 1,000 monthly credits and API access; the API documentation separately describes prepaid usage. Verify the actual account's usable API balance/entitlement and checkout total **before purchasing**. If the cap cannot cover the experiment, stop without purchasing; do not assume subscription credits and API credits are interchangeable. No renewal, paid retry, add-on, new Tripo charge or other reference upload is included. Disable renewal if a one-month subscription is approved and purchased. No purchase or upload has occurred.

The precise five proposed upload files, their hashes and three candidate configurations are in `benchmark-proposal.json`. Only these male assets are in scope; no OmniAI user data or female/anime references are included.

If a candidate passes likeness, the next proof is retention of that identity after topology fitting, neutral-body recovery, separate hair and one fitted garment. If it requires manual per-character sculpting, the automated launch requirement remains unsatisfied. Blender remains the local authoring/repair tool and Babylon remains the target review/runtime engine; changing to Unity would not itself solve identity reconstruction.

Sources checked 2026-09-05 UTC: [Meshy pricing](https://www.meshy.ai/pricing), [API credit pricing](https://docs.meshy.ai/en/api/pricing), [multi-image API parameters](https://docs.meshy.ai/en/api/multi-image-to-3d). A provider trial is a test, not evidence that the provider will meet the likeness or modularity gate.

## Reproduce and inspect

From the repository root, using installed Blender 5.1.2:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/astra-male-proof/build.py -- baseline
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/astra-male-proof/build.py -- study04
python3 -m http.server 4177 --bind 127.0.0.1 --directory omnirave-babylon/assets-src/avatars/astra-male-proof
```

Then open `http://127.0.0.1:4177/`. The source `.blend` is read only; outputs remain in this experimental directory. Current scripts reproduce baseline/study04; earlier `.blend` checkpoints preserve historical geometry, while study01–03 cannot be reconstructed exactly from the subsequently revised scripts. `face-targets.json` describes the current weights. `hair-bounds.json` describes the discarded solid-lock intermediate; use `structure-report.json` for the final groom. `manifest.json` records source, reference, script and final artifact hashes.
