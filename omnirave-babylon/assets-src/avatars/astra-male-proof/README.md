# Local male likeness work — in progress, G1 not passed

The active route is sustained local Blender reconstruction. The user deferred external paid sources; there is no provider approval request. No reference upload or purchase has occurred in this experiment. Historical provider suggestions are preserved in `README-study04-historical.md` and the deferred `benchmark-proposal.json`.

The facial baseline remains `fit05.blend`; the combined working candidate is `face19.blend`, with a complete experimental groom and a small lower-face adjustment. It is not an accepted likeness or playable avatar. Newer hair checkpoints are diagnostic candidates; they are not automatically promoted as improvements.

## Evidence retained

The original 1024 × 1536 male artwork is the identity authority. Supporting generated T-pose views infer hidden anatomy and are not independent ground truth. The browser crop enlarges original pixels without inventing facial detail.

`pose04` and `fit05` use the same fitted camera. The first is the earlier edited face before the measured deformation. Selected landmark RMSE decreased from 1.67 to 1.12 original-image pixels. These landmarks were used in fitting: this is a fitting residual, not a holdout test, face-recognition result, or likeness acceptance. Camera and depth remain inferred.

Local MediaPipe 0.10.21 performs landmark measurement in `.tooling/avatar-landmarks-venv`; no reference leaves the machine. Its model is `.tooling/avatar-landmarks-models/face_landmarker.task`. `fit05-deformation.json` is the deformation record. Earlier `fit05.json` is a landmark measurement; new measurements use the explicit `-landmarks.json` suffix to prevent filename collisions.

## Checkpoint decisions

| Checkpoint | Finding | Decision |
|---|---|---|
| study01–04 | Solid locks, then strand cards; generic face and wrong hairstyle | Historical failures retained |
| pose04 | Earlier face under the fitted camera | Facial comparison control |
| fit05 | Bounded measured facial adjustment | Retain as facial working checkpoint; likeness unaccepted |
| trace06–fiber09 | Contour-driven ribbons/strands; inferred depths caused gaps and penetration | Do not promote |
| master10 | Surface contact and skin smoothing | Generic smooth face; hair artifacts remain |
| quiff11 | Full 3D quiff | Reject: excessive floating volume and clipped silhouette |
| scalp12 | 23,000 roots within 0.6001 mm of evaluated scalp | Useful root-attachment evidence; wrong hairstyle and forehead fuzz |
| curl13 | Actual scalp depths for front contour guides | Coarse separated locks, exposed undercoat and inadequate back volume |
| curl14 | Undercoat recessed; visible curls unchanged | Confirms occlusion problem; profile still fails |
| curl15 | Broader, denser curl groups | Improves coverage; overly heavy front locks |
| curl16 / face17 | Crown/back strands and a separate jaw/mouth experiment | Reject groom regression: paths escaped toward neck |
| curl18 | Bounded crown/back strands and narrower front groups | Retain as full-groom working candidate; heavy fringe, blunt roots, uneven crown remain |
| face19 | Same bounded groom, jaw/mouth adjustment up to 2.24 mm, darker irises, calmer tint | Retain for facial comparison; no independent identity improvement established |
| optics20 | Hair BSDF and scalp-shell clearance | Material experiment; overly broad highlights, do not promote over face19 |

`index.html` presents matched camera views of the face control, measured face, full groom and jaw/mouth candidate. Displayed views are rendered from the four retained comparison checkpoints. Other historical images remain as failure evidence after their large workfiles were removed. Historical baseline/study01–04 reference-angle views use different camera fitting and must not be compared as matched controls with the newer series.

## Structural inspection

The checked checkpoints retain the 13,380-vertex body and identical polygon connectivity. The full groom contains 73,700 native strands, attached to the head bone; the coordinate checks reject non-finite points and hair escaping the expected head region. These checks do not prove physical root contact, deformation quality or runtime suitability. No missing file-backed images were found in the inspected files.

## Next work

User priority clarified 2026-09-05: the authored male/female launch characters prioritize reference-matched bodies, rigging, animation, and modular clothes. Final face approval can follow that work. Nick may accept a close facial match on the complete characters; no percentage is pre-approved. OmniAI conversion separately requires preservation of the existing facial identity.

1. Compare complete male and female body geometry to the original and supporting T-pose references. Correct proportions, silhouette, and anatomical build; identify inferred hidden anatomy.
2. Prove full-body rigging and deformation, complete the modular wardrobe and garment fit/swaps, and produce an isolated Babylon playable export. Imperfect faces do not block these steps.
3. Refine hair silhouette and facial proportions alongside the body work, retaining the current controls and honest discrepancy notes. Present completed playable characters to Nick for the launch-face judgment.
4. Complete the 8 GB runtime checks. Independently prove the automated human/anime pipeline with its full facial-identity requirement; manual launch-character work does not establish that pipeline.

The `.blend` files contain inherited body and wardrobe geometry. Those parts have not passed fit, deformation or likeness review. Native strand grooms are authoring assets requiring later runtime conversion. There is no new GLB/playability or 8 GB performance acceptance.

## Cleanup and retention

The authorized cleanup removed redundant backups and rejected intermediate `.blend` files. Retained here: `study04`, `pose04`, `fit05`, `curl18`, and `face19`. Historical captures and reports remain; the table above records past experiments even when their binaries are no longer present. `historical-scripts.zip` preserves the superseded stage scripts as historical evidence.

The active `rebuild_current.py` replaces the scalp12 → curl13 → curl14 → curl18 → face19 file chain with one in-memory recipe starting from `fit05`. The consolidated result matched all 25 visible evaluated objects exactly and reproduced the reference-angle render pixel-for-pixel. The saved `face19.blend` was replaced with that equivalent compressed file, dropping hidden rejected hair. Existing renders and comparison controls remain unchanged. This is a cleanup validation, not a likeness pass.

See `../CLEANUP.md` and the repository's `.codex/cleanup/2026-09-05-cleanup-ledger.json` for retained sources and the hash-indexed deletion record. `manifest-pre-cleanup-historical.json` and the study04 records are historical; only `manifest.json` describes the current retained evidence set.

## Reproduce

From the repository root with Blender 5.1.2:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/astra-male-proof/rebuild_current.py -- --output /tmp/omnirave-current-rebuild.blend --render /tmp/omnirave-current-rebuild.png
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/astra-male-proof/render_checkpoint.py -- face19
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/astra-male-proof/inspect_checkpoint.py -- face19
```

Serve this experimental folder only on `127.0.0.1:4177`. The original modular source is read-only. Historical scripts were revised between early passes; retained `.blend` files are authoritative only for retained checkpoints. Removed historical binaries are explicitly listed in the cleanup ledger. Historical manifests and verification records describe their original scope only; subsequent edits invalidate old hashes for changed files.
