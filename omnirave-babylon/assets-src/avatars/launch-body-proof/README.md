# Launch body and motion study

Local Blender/Babylon work for the two authored OmniRave characters. **Body matching, face likeness, finished wardrobe and gameplay acceptance remain pending.** This directory is a technical development checkpoint, not the finished characters or an automated OmniAI reconstruction result.

## Preserved proportion baseline: body03

The page now defaults to **Body contact repair** (`body05`). **Updated proportions** (`body03`), **Shoulder skinning study** (`body04`) and **Previous** (`body02`) remain comparison controls for both characters. Body03 broadens the upper torso modestly and extends the arms while preserving body height, hand scale, polygon connectivity and all 56 bones. The target spans are authored estimates from dressed supporting views, not recovered anatomical measurements.

| Measurement | Male body02 → body03 | Female body02 → body03 |
| --- | ---: | ---: |
| Arm span / body height | 0.978 → 1.020 | 0.918 → 1.000 |
| Sampled upper-chest width | 0.343 → 0.370 m | 0.244 → 0.255 m |
| Narrowest sampled torso width | 0.232 → 0.237 m | 0.192 → 0.200 m |

`refine_proportions.py` builds body03 from each retained body02 master; its report records the displacement field, arm gain, source hash and before/after geometry measurements. Every connected bone endpoint is checked and body polygon connectivity is unchanged. The lower-torso sample is explicitly separate from the measured narrowest waist band. Body03 render framing is wider to include fingertips.

Body03 uses `male-body03.blend`, `female-body03.blend`, their `review03.blend` export sources and `body03.glb` files. The versioned `body03-deformation-check.json` and `body03-export-check.json` are the current evidence; the unversioned check files below describe the previous body02 checkpoint. Neither character is accepted as matching its reference yet.

Current body03 validation: the male has no garment vertices beyond the 2 mm distance threshold in 151 sampled frames. The female has one affected vertex in two frames; the deepest reported value is 2.17 mm. The formerly persistent hip finding is corrected. Both GLBs pass structural validation. These results do not establish complete collision-free motion, body likeness, final clothing quality or gameplay readiness.

## Previous checkpoint and shared files

- `male-body02.blend` and `female-body02.blend`: complete fixed bodies and retained prototype wardrobe. They freeze the sex/lean morphs of the retained editorial v18 mesh, fit the existing skeleton to each body and extend upper/forearms by 12%. This work reuses and corrects existing local topology; it is not a fresh reconstruction from photographs.
- `male-review02.blend` and `female-review02.blend`: editable export sources with two separately skinned prototype tops, trousers and a five-second joint animation. Tops are cut from copies of the body surface, with independent garment geometry, open armholes and baked thickness.
- `male-body02.glb` and `female-body02.glb`: isolated Babylon review exports. Each has 56 bones. They do not replace the public gameplay assets.
- `review.js` and the package-root `body-review.html`: local side-by-side comparison with body selection, removable tops/trousers, orbit controls and animation playback. Start Vite with `npm run dev -- --host 127.0.0.1 --port 4178` from the package directory, then open `/body-review.html`. This page is not a production build entry.

Superseded body01 binary sources and eight temporary GLB exports were pruned after recording their hashes in `intermediate-cleanup.json`; body01 renders and measurements remain as comparison controls. The four body02/review02 source files are retained.

The starting meshes hid feet using six shoe-related mask modifiers. The study removes those body masks and retains all 13,380 body vertices. Bone fitting uses corresponding surface displacements to initialize joint positions; it still needs visual anatomical and motion refinement. Arm length edits preserve hand dimensions and move the skeleton and weighted wardrobe together.

## Reference and proportion status

`male-original.png` and `female-original.png` are byte copies of the original artwork in `.superpowers/brainstorm/49113-1780456702/content/assets/`. Those originals define appearance. The existing dressed T-pose images in `reference-turnarounds` are supporting generated views, not verified anatomy or calibrated measurements. Clothes obscure much of the torso/legs; hidden body shape remains an inference.

| Body measurement | body01 | body02 |
| --- | ---: | ---: |
| Male fingertip span / full body height, posed in T | 0.9127 | 0.9777 |
| Female fingertip span / full body height, posed in T | 0.8573 | 0.9184 |

These numbers describe the meshes, not likeness percentages. The body02 female arm span appeared short against the supporting view; body03 is the candidate correction. Both bodies need further shoulder/torso and silhouette comparison. The neutral gray materials intentionally expose geometry; they do not represent final skin or clothing appearance. The older male face19 study remains separate and unaccepted.

## Evidence and limits

- `source-inspection.json`, the `*-body01.json` / `*-body02.json` reports and front/profile/pose renders document the source, fitted bones, complete vertex counts and proportion changes.
- `deformation-before-thickness-fit.json` and `deformation-before-motion-fit.json` preserve earlier diagnostic failures. Clean static poses did not imply clean transitions.
- `deformation-check.json` checks all 151 integer frames in each saved Blender animation. It records finite complete body geometry, foot vertices and nearest-surface garment vertex distances. Negative signed distances beyond 2 mm are findings. This is not exhaustive triangle collision detection, subframe coverage or proof of identical GPU deformation.
- `*-garment-fit.json` records bounded rest-mesh corrections across the animation. Iteration count or a low residual is not an appearance acceptance score.
- `export-check.json` is generated from the GLB bytes, checking primitive indices, finite attributes, normalized weights, the 56-joint skin and five-second animation. Triangle totals include both alternative tops.

Previous body02 checkpoint: both GLB structural checks pass. Across 151 sampled Blender frames per character, the distance diagnostic still flags 6 male frames and 8 female frames, with at most 4 affected vertices across all three garment alternatives and a worst signed depth of about 2.50 mm. These remaining findings keep garment deformation acceptance pending. No zero-clipping claim is made.

The motion is a joint diagnostic, not walking, running, dancing, foot-contact IK or player control. Hair, final reference outfits, shoes, accessories, face expressions, production materials, LODs and 8 GB device/crowd performance are still outstanding. The launch-face decision belongs to Nick after complete playable characters; the future OmniAI pipeline has a separate facial identity requirement.

## Reproduction

Scripts are in `scripts/launch-body-proof/`, run using local Blender 5.1.2 with `--background --python-exit-code 1 --python <script>`. `build_bodies.py -- male --version body02 --arm-gain 1.12` (or female) constructs each source; `export_review.py -- male` (or female) constructs the review source and GLB. Builders refuse an existing primary output. Export writes its owned review source and diagnostic JSON. Preserve the current comparison checkpoint before deliberately rebuilding; do not bulk-delete the folder.

For body03, run `refine_proportions.py -- female` (or male), followed by `export_review.py -- female --version body03` (or male). After a female body03 export, run `repair_hip.py` in Blender for the bounded, animation-tested local hip-vertex correction. This uses a 1.5 mm point-distance allowance, stricter than the unchanged 2 mm whole-garment diagnostic threshold. It operates on the saved review source and records its trials in `female-body03-hip-correction.json`. Use `-- --version body03` after the Blender validation script and `--version body03` for the Python export inspector. `--replace-candidate` deliberately rebuilds only the body03 candidate; body02 controls remain unchanged.

Run `validate_review.py` in Blender to regenerate deformation evidence, then `python3 scripts/launch-body-proof/inspect_exports.py` for the GLB boundary checks. Source reports contain hashes of the retained v18 input. The manifest records this checkpoint's outputs and scripts.

## Next modeling work

1. Correct full-body proportions against the original artwork and supporting views, explicitly separating visible anatomy from inferred shape.
2. Refit joints and garments to the corrected bodies; review shoulders, elbows, hips, knees, hands and foot contact in motion.
3. Build the actual modular reference wardrobes and add locomotion/player control in an isolated OmniRave test.
4. Refine face/hair and present completed characters for Nick's launch acceptance. Continue the separate automated human/anime conversion work and device verification.


## Male wardrobe construction: outfit01

The updated male view now includes an optional **Luxury bomber draft (male)**. `male-outfit01.blend` and `male-outfit01.glb` are provisional wardrobe sources/exports built from the unchanged `male-review03.blend`. The body03 masters, original GLBs and female study remain comparison controls. The bomber checkbox controls the entire draft outfit; prototype tops are temporarily disabled while it is shown.

The pearl jacket uses one continuous body-derived shell through the torso and sleeves, retaining interpolated skin weights. The front opening is cut along exact planes, the collar follows the actual neckline, and cuffs, waistband, piping, pocket strips and black underlayer remain separately skinned pieces. This replaces the intersecting independent torso/sleeve lofts. Local Blender geometry is used throughout; no paid generator or external source is involved.

`build_bomber.py` deliberately overwrites only its owned provisional outfit01 source/export/renders. `fit_bomber.py` applies bounded rest-space corrections through the animation. `finish_bomber_fit.py` searches small residual adjustments, translating paired fabric surfaces together. Regenerate with Blender `--background --python-exit-code 1 --python scripts/launch-body-proof/build_bomber.py`, then run `validate_bomber.py` the same way. The GLB can be inspected with `inspect_exports.inspect(path)` from ordinary Python. The outfit retains the five-second diagnostic action, not finished locomotion.

The independent validator reopens the saved file, compares complete body coordinates, polygons, weights and skeleton against body03, checks garment topology, and samples all 151 integer animation frames against the complete unmasked body. It does not establish garment-to-garment clearance, triangle/subframe collision freedom, visual likeness, GPU deformation parity, player control or device performance. `male-outfit01-before-fit-summary.json` retains the initial connected-shell failure (up to 287 flagged vertices in a sampled frame, 41.27 mm deepest penetration); it is historical evidence, not the current result.

Appearance remains early: the sleeve/underarm shape, tailored shirt collar and placket, satin folds, functional-looking pockets and zipper hardware need further work. The cargo trousers, shoes, jewelry, hair and female reference wardrobe are still outstanding. The generic head in this body study has no accepted face likeness. This wardrobe checkpoint does not advance launch acceptance or the automated OmniAI pipeline.

Current outfit01 checkpoint: all 151 sampled integer frames have no garment vertices beyond the 2 mm body-penetration threshold. All 20 wardrobe pieces have closed manifold mesh edges and no degenerate faces. The actual GLB contains 32 meshes including the existing body/prototype alternatives, 69,860 total triangles, 56 bones and a five-second action; it is 6,512,972 bytes. These are construction/diagnostic results, not a clothing or likeness acceptance score.

## Refined male wardrobe: outfit02

The **Bomber version** selector compares Refined (`male-outfit02`) with Construction (`male-outfit01`). The refined candidate adds sleeve topology and localized folds, adjusts pearl/black material roughness, seats gold bands on the actual cuffs/waistband, and adds a sleeve pocket and zipper teeth. The pocket copies coat surface vertices and weights; other surface details are fitted after the coat's final shape correction. This keeps outfit01 as a reproducible construction control rather than overwriting it.

Run `refine_bomber.py` in Blender to regenerate outfit02 from outfit01. Run `validate_bomber.py -- --version outfit02` and `validate_layers.py -- --version outfit02` in Blender, then `python3 scripts/launch-body-proof/inspect_exports.py --version outfit02`. The builder writes only its owned outfit02 candidate files. Body/rig identity and garment-body distances are separate from clothing-layer crossings.

**Layer fitting is not accepted.** The new shirt/jacket crossing diagnostic finds intersections in the construction control throughout the animation. Bounded extra coat ease improves some areas but does not establish clean layering. Its BVH controls detect crossing triangles and reject separated/disjoint triangles; coplanar containment is a demonstrated blind spot. Accordingly, a clean body-vertex report must not be described as a complete clothing-fit pass. Current source hashes and per-frame layer findings are in `male-outfit01-layer-check.json` and `male-outfit02-layer-check.json`.

The reference's tailored collar, shirt placket, natural fabric folds, sleeve-pocket outline and hardware still need further shaping. The procedural cloth remains simplified. Next resolve shirt/jacket crossings with coupled surface/weight changes, then refine tailoring and the remaining outfit pieces. Likeness, locomotion, modular gameplay integration and device/crowd acceptance remain pending.

Current outfit02 result: 151/151 integer frames clear the 2 mm body-vertex penetration threshold, and all 25 wardrobe pieces have manifold edges and no degenerate faces. Body geometry, skin weights and skeleton match body03. The shirt/jacket crossing probe still reports findings in all 151 frames (up to 570 polygon pairs), so layered-clothing acceptance remains failed. The GLB is 6,898,616 bytes with 81,300 triangles across 37 meshes including existing body/prototype alternatives, 56 bones and the five-second joint action. These counts are not a device or crowd-performance result.


## Layer repair experiment: outfit03 (not promoted)

`male-outfit03` is available as **Layer repair experiment** in the local version selector. Outfit02 remains the default. This experiment fixes a measured shirt defect and reduces shirt/jacket crossings, but broader checks find self-intersections, including a regression in the coat. It is retained as a diagnostic comparison, not an accepted fit or the preferred wardrobe source.

The shirt's paired fabric vertices had stretched from their nominal 1.5 mm separation to as much as 10.45 mm; seven pairs exceeded 3 mm. The experiment restores paired rest separation to 1.5 mm, then searches bounded shirt corrections and local jacket-underarm clearance. Body03 geometry, weights and skeleton remain identical, as do the other 23 wardrobe meshes. Only the shirt and continuous coat shell change. This stage does not repair the underlying body.

| Independent check | Outfit02 control | Outfit03 experiment |
| --- | ---: | ---: |
| Integer frames with shirt/jacket crossings, saved Blender source | 151/151 | 68/151 |
| Maximum crossing polygon pairs in one frame | 570 | 22 |
| Integer frames with crossings after reimporting the actual GLB | 151/151 | 68/151 |
| Maximum exported crossing triangle pairs in one frame | 1,056 | 52 |
| Strict coat self-crossings in relaxed pose | 4,385 | 4,617 |
| Strict shirt self-crossings in relaxed pose | 931 | 809 |

The original 2 mm garment-to-body vertex diagnostic still has zero findings in all 151 frames, and all 25 wardrobe meshes have manifold edges and no degenerate faces. These properties are insufficient for clean deformation: the new non-adjacent triangle self-crossing check finds 262 body pairs in the relaxed pose, including 49 in the diagnostic armpit region. The same body findings occur in outfit02, so they predate this experiment. The body also has self-crossings in the T-pose outside that armpit region. Pair counts do not measure visible severity or penetration depth.

`validate_self_intersections.py` confirms BVH candidates using strict segment/triangle interior intersections, with crossing, separated, touching and coplanar controls. It tests four poses; adjacent folds, coplanar overlap and unsampled frames remain outside its scope. `male-outfit03-body-underarm-diagnostic.png` highlights sample confirmed body faces near the lowered arm. The result identifies a body-deformation problem but does not prove it is the sole cause of the garment failures.

Reproduce outfit03 with `repair_bomber_layers.py` in Blender; it reads outfit02 and writes only its owned experimental files. `repair_bomber_underarm.py` supplies the local coat stage. Run `validate_bomber.py`, `validate_layers.py`, `validate_exported_layers.py`, and `validate_self_intersections.py` with `-- --version outfit03`, then ordinary Python `inspect_exports.py --version outfit03`. Run the export-layer and self-intersection probes with outfit02 for the retained control. The source-layer and exported-layer counters use different triangle/polygon representations and must not be mixed. The additional alternating-shirt trial was performed in memory and was not promoted or saved as another model.

**Next priority:** correct the body's underarm surface and skinning while preserving the current body03 control, and inspect the existing rest-pose self-intersections. Then refit/rebuild the local garment topology with self-intersection checks included in the fitting constraints. Do not continue unconstrained point nudges merely to lower the shirt/jacket counter. Recheck silhouette and motion before returning to tailoring, trousers, shoes, accessories and the female wardrobe. Appearance, playable motion, modular gameplay, 8 GB/crowd performance and OmniAI conversion remain unaccepted.


## Shoulder skinning correction: body04

The **Proportions → Shoulder skinning study** option loads a body-only body04 for either character. Body03, body02 and the three male outfit versions remain available. Body04 removes the existing prototype garments from its isolated export because those garments have not been refitted to the changed deformation. It introduces no production/runtime asset replacement.

The armpit folded through itself as each arm lowered. Local weight smoothing corrects the transition between the torso and upper-arm influences: 706 male vertices and 652 female vertices change. The body rest coordinates, all 13,380 vertices, polygon connectivity, semantic groups and the 56-bone skeleton are preserved. Every sampled bone matrix matches the prior animation exactly; no diagnostic poses are weakened. Maximum posed point displacement is 29.22 mm for the male and 25.77 mm for the female, restricted to the edited weights. T-pose body height and fingertip span are unchanged.

| Shoulder-region triangle probe, all 151 integer frames | Male | Female |
| --- | ---: | ---: |
| Body03 frames with crossings | 81 | 73 |
| Body03 maximum crossing pairs per frame | 108 | 73 |
| Body04 saved-source frames with crossings | 0 | 0 |
| Body04 exported-GLB frames with crossings | 0 | 0 |

These are scoped shoulder results, **not full-body collision acceptance**. The full-body probe still finds crossings, primarily feet plus other body contacts: the maximum per-frame totals are 165 male pairs and 276 female pairs. There is no subframe, coplanar, adjacent-fold, GPU-parity, garment-fit or gameplay guarantee. Body/reference matching and faces remain unaccepted.

The export probe initially mislabeled two transition frames per character because GLB duplicates vertices at texture/normal seams. Recorded triangles showed a shared physical edge with different buffer indices. The validator now recognizes identical bind positions and skin weights as the same physical vertex when excluding adjacent triangles. `body04-export-seam-control.json` preserves the actual false-positive case: raw buffer adjacency reports one crossing, physical adjacency reports zero. Ordinary crossing/separation/touch/coplanar controls remain explicit. This correction concerns body self-adjacency and does not clear the separate outfit03 garment findings.

Each body04 has one editable animated `.blend` source and one `.glb`; no extra review-source duplicate is needed. Both GLBs contain 9 body/eye/brow meshes, 30,244 triangles, the 56-bone skin and five-second diagnostic action, at about 5.27 MB each. Structural inspection passes; these sizes are not an 8 GB or crowd benchmark.

Rebuild locally with Blender `repair_body_skinning.py -- --sex male` or `--sex female` (40 iterations by default), then run `validate_body_skinning.py -- --sex male` or female. The validation reopens body03, body04 and the actual GLB and checks all 151 frames. Run ordinary Python `inspect_exports.py --version body04` for structural export evidence. `male-body04-trials.json` retains compact exploratory evidence; no exploratory model binaries were retained. The two versioned validation reports are the current authority.

Next repair the foot surfaces and investigate remaining hand/hip-region contacts, then refit the clothing to the corrected deformation with body, layer and self-intersection checks together. The female outfit, reference tailoring, shoes/hair/accessories, locomotion, device/crowd tests and automated OmniAI reconstruction remain outstanding.


## Foot and body-contact correction: body05

The page defaults to **Body contact repair**, with a **Feet** close-up that also works while switching between the retained versions. Body05 is a body-only deformation checkpoint, not an accepted reference match or a finished playable avatar. Clothing controls remain disabled on body04/body05 until garments are refitted.

Three diagnosed corrections are included:

- Folded toe surfaces existed even in the resting body04 meshes. A local surface-fairing operation with a three-edge-ring falloff repairs them without replacing or deleting topology. The male uses 20 Taubin iterations; the female uses five Laplacian iterations. Maximum rest-coordinate changes are 6.10 mm male and 6.14 mm female, confined to the feet. The before/after foot renders show the affected surfaces.
- Six male distal-thumb vertices had stray forearm influence, reaching 2.6%. Removing that influence and renormalizing the remaining weights fixes the T-pose thumb fold without changing hand geometry or the male animation.
- The female diagnostic placed its lowered forearms through the hips/thighs. Their lowered rotation keys now angle them slightly outward. T-pose and overhead reach stay unchanged, as do every other local bone channel. This is an authored motion correction; it is not automatic contact avoidance for arbitrary animations.

Both bodies keep all 13,380 vertices, 13,378 faces, mesh connectivity and the 56-bone bind skeleton. Both have manifold edges and no degenerate faces. T-pose height and fingertip span remain unchanged. The existing shoulder-weight correction remains intact. No body masking or deletion is used.

| Complete body triangle probe | Male body04 → body05 | Female body04 → body05 |
| --- | ---: | ---: |
| Resting-mesh crossing pairs | 164 → 0 | 134 → 0 |
| Samples with crossings, 301 samples over five seconds | 301 → 0 | 301 → 0 |
| Maximum pairs in a sampled pose | 165 → 0 | 276 → 0 |
| Exported body05 GLB: samples with crossings | 0/301 | 0/301 |

The validator samples at 60 Hz, including half-frame positions between the source animation's 30 Hz frames. It reopens body04, body05 and the actual GLB, and verifies that geometry/weight/animation changes stay within their declared scope. The recorded seam-adjacency control remains active. This is a strict non-adjacent, non-coplanar triangle check: adjacent folds, coplanar overlap, continuous-time guarantees, Babylon GPU parity and other animations remain outside its scope. A passing count does not establish body likeness, garment clearance, locomotion or device performance.

The GLBs retain 9 body/eye/brow meshes, 30,244 triangles, 56 bones and the five-second diagnostic action. File sizes are 5,273,204 bytes male and 5,273,380 bytes female; structural inspection passes. Each character has one editable body05 source and one export. The body04 sources and earlier wardrobe controls are preserved.

Reproduce with local Blender `repair_body_contacts.py -- --sex male` or female, followed by `validate_body_contacts.py -- --sex male` or female (60 Hz by default). Run ordinary Python `inspect_exports.py --version body05` for the export structure check. `inspect_body_contacts.py` reproduces the body04 localization and diagnostic foot renders. `body05-trials.json` records the foot and forearm trials without retaining exploratory model binaries. Versioned repair and validation JSONs identify the current hashes and limits.

Next refit/rebuild the modular garments against body05, checking body clearance, clothing-layer crossings and garment self-intersections together. Preserve the previous outfit controls; the body repair does not clear their known failures. Then continue reference tailoring, the remaining male and female outfit pieces, locomotion, face/hair work and device testing. Automated OmniAI reconstruction remains a separate unproven launch requirement.


## Removable torso tops on body05: top01

**Proportions → Top fit study** loads body05 plus one independently skinned top: a male open-V torso layer or a female cropped V layer. **Top → None / Fitted top** removes or restores it. **Torso** frames the garment closely; Front, Three-quarter, Profile and Feet remain available. The body05-only view remains the default and all earlier body/outfit controls remain available.

These are construction and deformation studies. The neck/shoulder outline, front closure, edging, fabric detail and original-reference tailoring still need work. They do not reproduce the complete black shirt or female outfit from the artwork. No jacket, trousers, shoes, hair or accessories are included in top01, and this checkpoint does not clear the older bomber's layering or self-intersection failures.

The new top meshes use a regular torso sampling grid, measured radial body surfaces, smoothed armhole boundaries and barycentric skin transfer to the existing 56-bone skeleton. A smooth height-dependent ease allowance ranges from 10 mm over the lower torso to 6 mm above it. The fabric has a 1 mm physical wall with connected rims. All body vertices, body connectivity, body weights, bind bones and every sampled local body-animation transform are preserved exactly. No body masking, face deletion on the body, or motion weakening is used.

The export check caught a defect that a five-pose check of dynamically triangulated quads missed: independently triangulating the two fabric walls gave opposite diagonals, causing up to eight male wall-crossing pairs in 82/301 source and GLB samples. The builder now triangulates the midsurface before generating thickness, so the walls share the same diagonals. `top01-diagonal-control.json` retains the actual eight crossing triangle pairs as a positive detector control; `top01-before-diagonal-fix.json` retains the full-sweep summary. The revised validator must still detect those recorded crossings.

| Final top01 probe | Male | Female |
| --- | ---: | ---: |
| Source rest: top self / top-body crossing pairs | 0 / 0 | 0 / 0 |
| Source motion: samples with either type of crossing | 0 / 301 | 0 / 301 |
| Actual GLB reimport: samples with either type of crossing | 0 / 301 | 0 / 301 |
| Added top vertices / triangles | 5,156 / 10,308 | 4,544 / 9,084 |
| Complete export triangles | 40,552 | 39,328 |
| Complete export bytes | 5,563,144 | 5,529,048 |

Both complete exports have 10 meshes, 56 bones and the five-second joint action. The source garment walls are manifold with no degenerate faces. Structural export checks and the source/GLB rest and 60 Hz motion probes pass. The probe concerns strict non-adjacent, non-coplanar crossings. Adjacent folds, coplanar overlaps, continuous-time guarantees, other animations, garment-layer combinations and GPU parity are outside its scope. Browser checks confirm rendering, character switching and garment removal; they are not a device/crowd benchmark or visual acceptance.

Rebuild with local Blender `build_body05_tops.py -- --sex male` or female. Validate with `validate_body05_tops.py -- --sex male` or female (301 samples by default); failures are recorded and exit with an assertion. Run ordinary Python `inspect_exports.py --version top01` for the actual GLB structure. The build and validation JSONs pin the source/export hashes. Each character has one top01 Blender source and one GLB; compact trial counts are in `top01-construction-trials.json`, with no failed trial binaries added to the workspace.

Next reconstruct the bomber's sleeve/underarm topology and deformation around body05, fit it over the new torso layer, and recheck body clearance, garment-layer crossings and self-crossings together. Finish the shirt/crop-top outlines and reference details alongside that fit. Trousers, footwear, hair, accessories, the female outer outfit, locomotion, 8 GB/crowd testing and the automated OmniAI pipeline remain outstanding.


## Connected jacket construction experiment: outfit04

**Proportions → Jacket construction (male)** loads a new jacket over the preserved male top01/body05 character. It is a **fitting experiment, not a promoted wardrobe candidate**. The jacket checkbox and Fitted top/None remain independent; switching to Female returns to her top01 study. The body05 default and earlier body/outfit controls remain available.

The jacket is rebuilt from a locally remeshed surface with less ease on the compressed inner sleeve and more on the outer sleeve/front/back. Black ribbed cuffs, waistband and collar extend the actual opening edges. Gold bands use face material assignments in the same connected wall, rather than overlapping decorative meshes. Mesh reduction now precedes the opening cuts, keeping those attachment edges precise. A connected-component neckline cut preserves shoulder caps, and an exact front-depth cut removes a nonmanifold neckline connection. Midsurface triangulation precedes 1 mm fabric thickness, retaining the paired wall diagonals learned in top01.

The source jacket has one connected component, 19,538 vertices and 39,080 triangles, with no nonmanifold edges or degenerate faces. The actual GLB is also one manifold component after welding coincident bind-position/skin-weight seams. Its raw material/normal seams create 29 buffer components; those are not disconnected physical garment pieces. The complete export has 11 meshes, 79,632 triangles, 56 bones, the unchanged five-second action and 6,846,896 bytes. Structural export validation passes. Body05 geometry, top01 geometry, their weights, the bind rig and sampled body animation are preserved exactly.

**Deformation does not pass.** The rest mesh and five diagnostic poses were tested in the saved source and actual GLB; no all-frame claim is made.

| Pose | Jacket self pairs (source / GLB) | Jacket/body pairs | Jacket/top pairs |
| --- | ---: | ---: | ---: |
| Rest | 143 / 143 | 0 | 0 |
| T-pose | 0 / 0 | 0 | 0 |
| Relaxed | 2,198 / 2,198 | 581 | 22 |
| Arms raised | 1,132 / 1,131 | 344 | 0 |
| Crouch | 2,356 / 2,356 | 661 | 76 |
| Step | 1,818 / 1,818 | 537 | 39 |

Counts are strict non-adjacent, non-coplanar triangle crossings, not visible pixel areas or severity scores. The one-pair source/export difference in raised arms does not change the failed result. Adjacent folds, coplanar contacts and untested motion remain outside scope. `male-outfit04-contact-diagnostic.png` marks implicated jacket triangles red without changing the saved source or export. Appearance remains unfinished: shoulder/sleeve form and shading, collar/front closure, fabric detail, pockets and reference tailoring still need work.

Tests of alternative weight transfer, heat weights and broad/local smoothing did not resolve the contacts. A cloth simulation was rejected during stationary warm-up. Direct rest-pose construction reduced its resting crossings but still failed the moving poses; it was not promoted. `outfit04-trials.json` retains compact numeric evidence, with no trial model binaries added to the workspace.

Rebuild with local Blender `build_body05_bomber.py`. Inspect with `inspect_body05_bomber.py`, which writes source/export findings and a diagnostic render. Its `-- --require-clear` gate correctly fails with `Jacket contact findings remain open`; normal inspection intentionally records an unfinished experiment. Ordinary Python `inspect_exports.py --version outfit04` checks the actual GLB structure. The build and validation reports pin current hashes.

Next isolate one shoulder/inner-sleeve region and develop a garment-specific corrective that accounts for arm lowering and raising, while preserving the body/top controls. Test the correction over the interpolation, then export and recheck it before transferring it to the other side. Do not promote the jacket because T-pose or topology passes. Reference tailoring, the rest of both wardrobes, locomotion, device/crowd checks and OmniAI conversion remain outstanding.


## Underarm corrective investigation: outfit04 retained

No replacement Blender source or GLB was retained from this pass. Outfit04 remains **NOT_PROMOTED_CONTACT_CHECK_FAILED**; body05, top01 and all 32 existing model binaries are preserved. The review page continues to load the prior controls.

Separating the fabric walls from the midsurface shows actual folding in the jacket: the relaxed pose has 428 strict midsurface crossing pairs, as well as crossings between the inner and outer walls. Rebuilding or thinning the walls alone does not repair the folds. Body-surface following, Corrective Smooth, copied body topology, collar weight changes and thinner inner-sleeve trials all failed the combined contact checks. Compact results are in `outfit04-corrective-trials.json`; no failed trial model binaries were added.

The reproducible local probe corrects only a contact-seeded left-side patch. It pins the ribbed collar, cuffs and waistband plus two adjacent edge rings, and preserves the opposite side exactly. Collision projection uses the outer top wall with a bounded search distance; an earlier unrestricted nearest-wall projection distorted the garment. The final probe catches eight recorded positive crossing controls and verifies unchanged body/top data and pinned/opposite-side points.

| Relaxed pose, left side only | Original | Pinned local trial, 160 iterations |
| --- | ---: | ---: |
| Jacket/body crossing pairs | 298 | 9 |
| Jacket/top crossing pairs | 10 | 0 |
| Jacket self-crossing pairs | 1,092 | 622 |

The correction moves some points by 46.65 mm and leaves visible fabric problems. **It is rejected**, despite reducing some contacts. The complete jacket still has 1,728 self, 292 body and 12 top pairs in this single-pose trial. No interpolation or GLB validation was warranted. `male-outfit04-local-corrective-frame1.png` marks remaining contacts red and is a diagnostic render, not a new selectable avatar. The `--require-clear` gate correctly exits with a contact failure after recording the evidence.

A calibrated directional ray probe samples the space between the torso/top and left arm, rejecting unrelated surfaces through majority bone influence. Across 1,433 classified rays in four poses, the smallest sampled body gaps are 1.27 mm relaxed and 1.11 mm crouched, near the underarm. Where the top occupies the gap, the smallest remaining sampled gaps are 4.63 mm relaxed, 4.12 mm crouched and 4.35 mm stepping. The raised-arm pose has no qualifying gaps on this grid; that is not a clearance pass. These are sparse horizontal measurements, not global minimum distances or proof that fitting is impossible. The independent 5 mm gap calibration passes.

A first projection of the existing underarm triangles onto a shallow gusset target also failed: body contact decreased but self-folding increased, with 72–101 mm point changes. It was rejected without saving a model.

Next replace the underarm panel connectivity and sleeve connection with an explicit sewn panel that spans the tight skin crease, and a deliberate transition between torso and arm deformation. Preserve the shared garment edges and body/top controls. Wall thickness and clearance need to be designed together; simply thinning the current folded mesh was already rejected. First compare rest and the five poses for shape and all three contact classes, then test interpolation and actual GLB export before promoting anything.

Reproduce with local Blender `probe_bomber_correctives.py -- --render --require-clear` (one relaxed pose by default; failure is expected) and `inspect_bomber_clearance.py` (directional diagnostic only). The versioned JSON reports pin the source hash and exact scope. The remaining wardrobe, likeness, gameplay, device and OmniAI-pipeline work is still outstanding.


## Sewn panel and calibrated cloth probe: no promoted model

The new `rebuild_bomber_underarm.py` actually replaces the underarm triangles. A geodesic disk is mapped into a positive harmonic chart, resampled with constrained Delaunay triangles, and sewn onto the exact existing boundary. The default 140 mm region shares 119 boundary vertices per wall and replaces 2,718 triangles with 582. It preserves every retained jacket position/weight, body/top data and bind bone. The resulting wall has no nonmanifold edges, inconsistent edge winding or degenerate faces. It still fails the contact and visual checks, so no new Blender source or GLB was saved.

The attachment boundary matters: the smaller 100 mm region leaves 33 crossing pairs in retained faces near its seam in lowered-arm poses. The 140 mm boundary's retained neighboring faces are clear in rest and the five sampled poses. This does not clear the panel interior or the remaining jacket. In the rebuilt 140 mm panel, relaxed-pose contacts include 391 panel self pairs, 221 panel/body pairs and 94 panel/top pairs. Counts across different triangulations are not comparable severity measures. `male-outfit04-underarm-panel.png` highlights the experimental panel green; it is not an accepted visual or a new viewer option.

The new cloth experiment exposed a real configuration defect. Blender 5.1.2 silently clamps attempted 0.2 mm collision distances and 0.4 mm self-collision distance to 1 mm at the model's native scale. Those requested values therefore did not describe the executed simulation. This finding concerns the new submillimeter panel trials; it does not retrospectively explain the older full-jacket trial that requested 3 mm.

`probe_bomber_panel_cloth.py` now reads back and verifies every effective distance. Its native-scale control rejects the mismatch before simulation. A temporary 10× unit conversion, including the collider geometry, bind bones and attachment motion, allows the intended physical distances; all measured geometry is converted back to meters for the triangle probe. The fixed T-pose rest surface and attachment targets are separate. Original model files stay untouched. The schedule is a temporary T-pose warm-up, arm lowering and settling, not the original five-second source/export check.

| Scaled simulation sample | Midsurface self pairs | Body pairs | Top pairs |
| --- | ---: | ---: | ---: |
| Initial T-pose | 0 | 0 | 0 |
| Stationary warm-up | 1 | 0 | 0 |
| End of arm lowering | 91 | 76 | 46 |
| After settling | 78 | 72 | 44 |

The scale correction avoids the warm-up's body/top contacts, but it does not solve the garment deformation. The scaled simulation and the rebuilt panel remain **NOT PROMOTED**. Only sampled strict non-adjacent, non-coplanar crossings are reported; neither a sampled pass nor a valid manifold establishes visual or runtime acceptance.

Reproduce the panel with `rebuild_bomber_underarm.py -- --render --require-clear`. Test the configuration rejection with `probe_bomber_panel_cloth.py -- --scale 1`; test actual calibrated behavior with `-- --scale 10 --require-clear`. Both contact gates fail for the recorded reasons. Compact alternate constructions, projections and retained-seam controls are in `outfit04-sewn-panel-trials.json`. All 32 prior model binaries remain preserved; no failed model binary or disk cloth cache was added.

The current fitting approaches have not produced an acceptable jacket. The next bounded experiment should enforce collision avoidance during deformation of this isolated panel, starting with a clear reference surface and clean attachment boundaries. Establish independent crossing and near-contact controls, then test arm lowering before rebuilding the complete jacket or exporting another model. Body/top controls and all broader avatar acceptance requirements remain unchanged.


## Collision-aware underarm motion: isolated surface passes, jacket not promoted

The local IPC feasibility solver now completes T-pose-to-relaxed arm lowering with **101 collision-checked linear transitions and 102 independently checked poses**. All retained transitions are clear under IPC's continuous checks for the modeled linear vertex motion. Blender's separate strict-triangle probe finds zero panel self/body/top crossings at the 102 stored poses, both against the solver's collider arrays and the evaluated source rig. The analytic minimum triangle area over the stored linear transitions is 2.03637e-6 m², above the 1e-12 m² degeneracy threshold. Stationary, tunneling, filtering, known-distance, gradient and triangle-collapse controls pass.

These are scoped midsurface results. The rest of the jacket, fabric thickness, all other actions, export interpolation, visual acceptance and gameplay remain open. Evaluated skeletal motion differs from linear collider interpolation by up to 0.118 mm at the checked poses; the continuous result does not extend to the complete nonlinear rig trajectory. No Blender source or GLB was saved or replaced. All 32 existing model binaries remain unchanged.

Two experiment defects were exposed and corrected. First, a solver can traverse an obstacle-free optimization path while the straight animation transition between its endpoints intersects. The final solver checks both paths, includes intermediate-path barriers, and discards/re-solves intervals that require subdivision. Second, Blender changed body quad diagonals in 9 of the 61 input poses; retaining only the last pose's triangle indices hid four actual body contacts at frame 25.5. The corrected exporter covers both diagonal choices for every quad and asserts coverage of evaluated triangles. This defect was in the new IPC input exporter; it does not invalidate the earlier body05/top01 checks that evaluated geometry at each pose. Discarded trial counts are kept in `outfit04-ipc-discarded-trials.json`.

The final solve took about 713 seconds on this machine. It verified 1,512 optimizer steps including discarded attempts and retained 101 transitions after 41 interval retries, reaching subdivision depth three. This is an offline experiment, not a runtime or 8 GB performance benchmark. IPC Toolkit 1.6.0, NumPy 2.5.2 and SciPy 1.18.1 were installed only in `/tmp/omnirave-ipc-env`. No paid service, project dependency change or model upload was used.

The green-panel render still has a pronounced crease and is not visually accepted. Some strain is prescribed by the fixed attachment boundary itself: one edge grows from 3.625 mm to 4.906 mm (35.3%), and the 95th percentile absolute boundary-edge strain in the relaxed pose is 23.4%. Interior fitting cannot remove stretch imposed on pinned edges. Next extend this local method to a larger connected sleeve/torso region so the problematic seam can move, preserve body/top and deliberate cuff/collar/waist attachments, then address fabric thickness and complete-jacket contacts. A clear isolated surface is not an accepted outfit or avatar.

Reproduction (from the repository root; diagnostic outputs stay temporary):

```sh
python3 -m venv /tmp/omnirave-ipc-env
/tmp/omnirave-ipc-env/bin/pip install ipctk==1.6.0 numpy==2.5.2 scipy==1.18.1
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/export_panel_motion_probe.py -- --output /tmp/omnirave-panel-motion-envelope.npz
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_panel_ipc.py --input /tmp/omnirave-panel-motion-envelope.npz --report /tmp/omnirave-panel-ipc.json --temporary-result /tmp/omnirave-panel-ipc-result.npz --require-motion-clear
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_panel_ipc.py -- --input /tmp/omnirave-panel-motion-envelope.npz --result /tmp/omnirave-panel-ipc-result.npz --solver-report /tmp/omnirave-panel-ipc.json --report /tmp/omnirave-panel-ipc-independent.json --render /tmp/omnirave-panel-ipc.png
```

The source-frame positions between the original half-frame samples are linear collider interpolation. The solver's `--require-motion-clear` gate covers its isolated linear-motion domain; the independent report and all broader garment acceptance remain separate. Temporary NPZ arrays are local numerical test inputs/results, not playable avatar exports.


## Connected jacket surface: finite fabric remains unresolved

The connected experiment frees the internal sleeve/torso seam and plain front opening while retaining 417 ribbing attachment vertices. Its reduced surface has 1,989 vertices and 3,356 triangles. A 0.5 mm weld removes tiny cut slivers only from the temporary simulation mesh; 624 retained opening points remain exact, and the maximum original opening sampling deviation is 0.494 mm. Body, top, bind skeleton and all 32 prior model files are unchanged. No Blender source or GLB was created or promoted.

Progress damping improves the solver's step sizing without changing its energy or collision gates. A matched first half-frame test completed in five iterations without subdivision. The longer damped run retained 31 clear linear transitions, reaching source frame 16 from frame 31, before it was deliberately interrupted because an independent intermediate-pose test had already rejected the fabric construction. **This is a partial run, not a complete arm-lowering pass.** Independent dense-wall checks cover the explicitly recorded poses, not every retained transition.

At source frame 21, the simulation surface has no strict self/body/top crossings. However, transferring its motion to the original two fabric walls produces 684 self, 115 body and 24 top crossing pairs. Even the transferred midsurface has 11 self-crossing pairs. Rebuilding wall normals, cleaning source slivers, reducing thickness to 0.2 mm, or constructing walls directly from the reduced surface does not clear the combined checks. Counts across different meshes are diagnostics, not comparable severity scores.

The reduced surface folds nearly back onto itself: 14 adjacent face pairs exceed 150 degrees, with a maximum of 178.10 degrees, versus no such folds in T-pose. The largest edge ratio of 1.553 at this pose corresponds to a small edge growing from 0.867 to 1.346 mm; the 95th percentile absolute edge strain is 3.865%. Large maximum ratios alone would overstate the typical stretch. Pinned-edge 95th percentile absolute strain is 0.281%, substantially less constrained than the earlier isolated underarm boundary.

A bounded fixed-pose correction adds weak opposite-vertex springs across interior edges as a rotation-invariant bending surrogate. A matched zero-stiffness control uses the identical starting pose, body/top, rest lengths, attachments and correction schedule. Both correction paths and endpoints remain clear for the zero-thickness simulation. The bending variant reduces folds above 150 degrees from 14 to 11, but original transferred-wall contacts remain 498 self/143 body/94 top, versus 688/105/26 in the matched control. It is rejected: fewer self contacts do not compensate for remaining folds or increased body/top contacts. This surrogate is not a calibrated fabric model, and neither fixed-pose result proves an animation trajectory. Gradient, rigid-transform and known-fold controls pass. Independent analytic triangle-area checks cover both static correction transitions.

`outfit04-connected-ipc-trials.json` records the stopped runs, controls, wall variants and static bending comparison. `male-outfit04-connected-ipc-frame21.png` shows the original transferred walls before bending; it is an unaccepted diagnostic. Numerical inputs/results remain temporary. Existing body05/top01/outfit04 viewer controls remain unchanged. No provider, upload, paid source or project dependency was used.

Next include finite fabric clearance and resistance to local fold-back during fitting from the clear starting pose. Screen the actual constructed walls on early motion before another full run. After that, full action, actual export, tailoring/likeness, gameplay, wardrobe, device budgets and OmniAI conversion still require their own evidence.

Reproduce the temporary input and connected solve from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/export_jacket_motion_probe.py -- --output /tmp/omnirave-jacket-motion-clean.npz
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_ipc.py --input /tmp/omnirave-jacket-motion-clean.npz --report /tmp/omnirave-jacket-ipc-damped.json --temporary-result /tmp/omnirave-jacket-ipc-damped-result.npz --damped-progress --require-motion-clear
```

Use `--first-interval` for the bounded progress control. The connected solver publishes one-pose `-latest.npz/.json` snapshots; copy a matching pair before inspecting it, verifying the NPZ source frame equals the JSON frame. `inspect_jacket_ipc.py` takes `--input`, `--result`, `--solver-report`, `--report`, optional `--render`, and `--all-samples`; `--simulation-only` skips the wall comparisons. `probe_jacket_bending.py` takes `--input`, `--snapshot`, `--report`, `--result`, and `--stiffness` (0.04 for the recorded trial; 0 for its control). Its two stored states are at the same source frame and represent only a static correction. Source-frame-21 snapshots require reaching that pose; the original long run was stopped after its failure screen and has no complete result file.

## Finite-clearance fitting and early wall gates: no promoted model

The next experiment starts in the clear T-pose. `probe_jacket_finite.py` retains all original zero-distance self/body/top CCD checks and adds 1.2 mm clearance between nonlocal cloth regions and 0.7 mm between the midsurface and body/top. The extra self-clearance excludes vertex neighborhoods within three mesh-edge hops (37,331 vertex pairs); the original crossing checks still include them. A blanket fabric gap is invalid on this input: local triangle spacing is as small as 0.254 mm in T-pose. These neighborhood exclusions mean this is **not a uniform volumetric fabric guarantee**. Constructed walls must be checked separately.

A one-sided rest-cosine hinge penalty, stiffness `1e-5`, resists increasing adjacent-face angles from the start. It is a fitting regularizer, not a calibrated fabric law. Controls check its gradient and rigid-transform invariance, finite-distance rejection of a noncrossing near approach, barrier derivatives, and the original crossing controls. With both new terms disabled, the refactored solver reproduces the prior damped half-frame result with **zero vertex-coordinate difference**. No body, top, skeleton, or source animation is altered.

Every stored pose triggers a fresh Blender wall screen; failed screens stop the solve. The finite trial and the matched zero-term control use the same source, rest lengths, targets, attachments and progress damping:

| Trial | Outcome |
| --- | --- |
| Original detailed transfer, both new terms disabled | Stops at frame 30.5 with one inner-wall self-crossing; body/top crossings remain zero. |
| Original detailed transfer, finite clearance and cosine hinges | First half-frame is clear; stops at frame 30 with one inner-wall self-crossing. No folds exceed 150 degrees; maximum adjacent angle is 98.31 degrees. |
| Separate directly constructed 1 mm walls on the reduced topology, same constrained fit, initial default CCD tolerance | Four intervals complete through frame 29.375; a fifth stored state stalls at frame 29.354187 after three subdivision levels. The requested early endpoint, frame 28, is not reached. |

The detailed-transfer crossing is between inner-wall faces 23079 and 23080, driven by several different coarse triangle frames. Their T-pose areas are about `3.83e-5` and `3.11e-5 m²`; their transfer barycentric weights are inside the driving triangles. This is not evidence of a degenerate cut sliver or barycentric extrapolation. The captured pair establishes a transfer defect even before severe folds develop. Rebuilding fine-wall normals still introduces contacts in T-pose and is not promoted as a repair.

The separate reduced wall construction has 3,978 vertices and 7,960 triangles, matching outer/inner connectivity and closed opening rims, with no nonmanifold edges or inconsistent edge winding. It is a lower-detail construction experiment, not an accepted replacement for the original jacket. Its six stored states have zero strict self/body/top crossings and no adjacent angles above 150 degrees. The maximum angle across them is 98.33 degrees. The native diagnostic render, `male-outfit04-finite-reduced-diagnostic.png`, shows the latest documented reduced 1 mm construction in green clay; its visible faceting and unfinished tailoring are not visual acceptance.

`inspect_jacket_finite_walls.py` reconstructs the selected walls at quarter-interval samples and evaluates the original rig independently at those times. Across **21 poses and 20 straight vertex transitions**, IPC finds no wall intersections; the wall/body/top transitions also pass a 0.2 mm minimum-clearance check. The smallest measured endpoint wall/obstacle gap is **0.769819 mm**. Analytic triangle-area minima on these same linear wall paths stay above `2.2544169e-7 m²`; stationary and collapse controls pass. These checks include the final partially advanced state, which is **not a completed solver interval**. They certify only the specified sampled linear wall paths, not exact nonlinear normal reconstruction or rig motion between samples, full arm lowering, the original action, an exported GLB, appearance or gameplay.

The initial default-tolerance reduced trial exits the required bounded-motion gate with failure because it stalls. Its solve plus per-pose wall screens took 486.36 seconds; the Python process's recorded peak RSS was 1.88 GB (Blender subprocess memory is separate). This is offline authoring evidence, not an 8 GB client or crowd benchmark. All 32 prior model binaries and the body05/top01/outfit04 viewer controls remain unchanged. No model binary, runtime asset, project dependency, paid source, upload or external generation was added.

Reproduction uses the existing temporary input/environment from the connected-jacket section. From the repository root:

```sh
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_finite.py --input /tmp/omnirave-jacket-motion-clean.npz --output-prefix /tmp/omnirave-finite-original --intervals 4 --ccd-tolerance 1e-6 --require-wall-clear
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_finite.py --input /tmp/omnirave-jacket-motion-clean.npz --output-prefix /tmp/omnirave-finite-reduced --intervals 6 --wall-construction reduced --ccd-tolerance 1e-6 --require-wall-clear
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_jacket_finite_walls.py -- --export --input /tmp/omnirave-jacket-motion-clean.npz --result /tmp/omnirave-finite-reduced.npz --solver-report /tmp/omnirave-finite-reduced.json --output /tmp/omnirave-finite-walls.npz
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/inspect_jacket_finite_walls.py --check --input /tmp/omnirave-finite-walls.npz --output /tmp/omnirave-finite-walls-check.json --require-clear
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_jacket_finite_walls.py -- --areas --input /tmp/omnirave-finite-walls.npz --output /tmp/omnirave-finite-walls-areas.json --require-clear
```

Both solver commands are expected to fail their bounded gate after writing evidence, for different reasons; the subsequent independent wall checks cover the saved short path only. Add `--zero-clearance-control --bending 0` to reproduce the matched control. `inspect_jacket_ipc.py --render-wall-construction reduced` renders the reduced walls rather than the rejected original detail transfer. Numerical arrays remain temporary; `outfit04-finite-clearance-trials.json` retains the compact evidence and exact scope.

### Finite-distance numerical guard investigation

**Correction to the historical bound-based trials below:** the first implementation grouped IPC vertex/face degrees of freedom incorrectly when calculating relative speed. A moving-point/moving-face control demonstrates a false clearance result. The helper is corrected and the 22 retained midsurface intervals from frame 31 through frame 20 have been rechecked with the corrected bounds and native zero-distance CCD. Earlier claims about unsaved optimizer trajectories are withdrawn; they cannot be reconstructed from saved poses. Independent reconstructed-wall evidence is described separately in the latest continuation below. Commands use the corrected implementation and need not reproduce the historical solver paths bit for bit.

The stalled state exposed a conservative CCD rejection. A captured pair of moving edges has an all-time distance lower bound of **1.189999 mm**, greater than the required **0.7 mm** gap. IPC's default `1e-6` CCD tolerance rejects it; `1e-10` reports it clear and still rejects the colliding control. The calculation subtracts each edge's maximum endpoint displacement from its initial separation, so this conclusion does not depend on sampled times. The four-vertex fixture is retained in `outfit04-finite-ccd-control.json`.

A complete matched retry with `--ccd-tolerance 1e-10` still stalls near frame 29.354117. The tighter tolerance fixes the captured control but **does not solve the fit**. Both default- and tight-tolerance runs remain diagnostic failures.

`finite_clearance_bounds.py` adds a separate optional conservative-distance check. IPC supplies swept candidate coverage; each candidate's midpoint distance minus the sum of its primitive speed bounds times the half-interval gives a lower bound for the entire interval. Unresolved intervals subdivide to a bounded depth; contact, a 1 nm safety margin, or unresolved bounds cause rejection. Controls include edge/edge and vertex/face tunneling, a clear sweep requiring subdivision, and rejection when the subdivision budget cannot establish clearance. This is floating-point numerical evidence, not an exact-arithmetic proof.

`--clearance-bounds` permits this full-interval check to resolve conservative finite-CCD rejections. The physical gaps stay unchanged. The original zero-distance CCD remains mandatory, and both the optimizer step and its complete proposed animation interval must pass the finite check. A step-size proposal alone cannot authorize a motion. This option tests a different numerical method; it does not promote the original detailed transfer or a garment based on endpoint samples.

### Conservative-bound result: six early intervals complete, still no model acceptance

The conservative-bound variant completes **all six half-frame intervals from source frame 31 to frame 28**, without subdivision. It passes the actual reduced 1 mm wall screen at all seven stored poses. There are no detected strict wall self/body/top crossings and no adjacent angles above 150 degrees; the maximum adjacent angle is 98.35 degrees. The original detailed transfer still has two self-crossing pairs at frame 28 and remains rejected.

A separate native-CCD validation of the reconstructed reduced walls covers **25 quarter-interval poses and 24 straight vertex transitions**, including the evaluated source rig at those poses. It passes the 0.2 mm wall/obstacle clearance gate without using the fitting solver's conservative-bound fallback. The smallest measured wall/body/top gap is **0.488428 mm**, at frame 28.375. Analytic wall triangle-area minima on the same paths remain **2.2544169e-7 m²**, above the collapse threshold. This supersedes the stalled trial's shorter path coverage for this construction only. It does not complete arm lowering to frame 1 or establish the exact nonlinear trajectory between samples.

The fit plus automatic pose screens took **573.39 seconds**; Python peak RSS was **1.63 GB**, excluding Blender subprocess memory. The conservative check ran 103 times, established clearance on 93 calls and rejected 10, with 6,385,070 distance queries. This cost is offline experimental work, not runtime simulation or evidence of an 8 GB game budget. No cloth stiffness, physical clearance, body motion or acceptance requirement was relaxed to obtain this scoped result.

Reproduce the latest bounded trial with:

```sh
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_finite.py --input /tmp/omnirave-jacket-motion-clean.npz --output-prefix /tmp/omnirave-finite-bounds --intervals 6 --wall-construction reduced --clearance-bounds --require-wall-clear
```

Use that output prefix with the wall export/check/area commands above for its independent validation. The diagnostic image shows the actual reduced walls at the pose documented in the latest continuation below. The 32 source/export controls remain unchanged and no model binary is added. Next extend the bounded fit beyond frame 28 with the same actual-wall gates, then develop coherent higher-detail topology and reference tailoring. Complete source/export action checks, likeness, wardrobe, gameplay/device budgets and the automated OmniAI pipeline remain outstanding. **No new model or visual result is accepted.**

### Actual-wall constrained fitting clears the frame-27 failure

Checkpoint continuation now retains the original T-pose edge lengths and hinge targets while restoring the fitted surface and prescribed colliders at a completed source sample. Input hashes, constraints, saved wall screens and attachments must match. A replay of frame 28.5 to 28 differs from the uninterrupted result by at most `2.63678e-16 m`. Resuming cannot silently drop an already enabled wall barrier.

Continuing the midsurface-only constrained fit from frame 28 exposes **three reduced outer-wall self-crossing pairs at frame 27**. The midsurface and body/top checks remain clear, and there are no folds above 150 degrees. The crossing regions are one coarse edge hop apart, inside the explicitly excluded local neighborhood for the extra 1.2 mm gap. They contain no pinned vertices. Neighboring coarse face 1157 reverses its outer offset orientation: its projected area ratio becomes `-0.6562`, even though the wall triangle-area check does not find a collapse. The independently reconstructed wall trajectory also rejects the final transition from frame 27.125 to 27. This negative result is retained; it does not extend the clear trajectory.

`probe_jacket_actual_walls.py` adds an optional `--actual-wall-barrier` to the finite driver. It differentiates the actual 1 mm normal-offset construction analytically, adds a wall contact barrier, and checks the reconstructed wall motion through quarter-interval samples. Original midsurface crossing checks, the 1.2/0.7 mm finite gaps, attachments, rest shape and hinge stiffness are retained. The wall barrier activates within 0.3 mm and uses the existing `1e7` barrier stiffness. Its curvature approximation is positive semidefinite; line-search energy and collision gates still authorize every retained step. This remains numerical fitting, not calibrated cloth physics.

Controls verify the normal-offset Jacobian (maximum finite-difference discrepancy about `2.12e-11`), the full reduced energy gradient with active wall contacts, and exact position/topology agreement with Blender at nine independently reconstructed poses. The new wall guard preserves the known clear frame-28-to-27.5 interval and rejects the known bad frame-27.5-to-27 interval that the midsurface guard permits. The constrained retry reaches frame 27 without crossings or reversed offset faces. Independent checks cover nine wall poses and eight linear transitions with minimum measured body/top clearance **0.475006 mm**.

A subsequent constrained continuation reaches **frame 25**, with four further completed half-frame intervals and clear wall screens at all five stored poses. Its separate wall validation covers 17 poses and 16 linear transitions and passes the 0.2 mm clearance gate; the minimum measured wall/body/top gap is **0.465121 mm**. The two actual-wall fitting runs take 155.02 and 260.89 seconds, with Python peak RSS of 2.22 and 2.01 GB respectively, excluding Blender subprocess memory. These are offline costs, not game/device benchmarks. The diagnostic clay shows the latest documented reduced-wall pose; faceting and unfinished reference tailoring remain visible.

Reproduce these continuations after the six-interval conservative-bound trial above (whose output prefix is `/tmp/omnirave-finite-bounds`):

```sh
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_finite.py --input /tmp/omnirave-jacket-motion-clean.npz --output-prefix /tmp/omnirave-finite-wall-control --intervals 8 --wall-construction reduced --clearance-bounds --resume-prefix /tmp/omnirave-finite-bounds --require-wall-clear
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_finite.py --input /tmp/omnirave-jacket-motion-clean.npz --output-prefix /tmp/omnirave-finite-walls27 --intervals 8 --wall-construction reduced --clearance-bounds --resume-prefix /tmp/omnirave-finite-bounds --actual-wall-barrier --require-wall-clear
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/probe_jacket_finite.py --input /tmp/omnirave-jacket-motion-clean.npz --output-prefix /tmp/omnirave-finite-walls25 --intervals 12 --wall-construction reduced --clearance-bounds --resume-prefix /tmp/omnirave-finite-walls27 --actual-wall-barrier --require-wall-clear
```

The first command is the negative control and must fail after saving evidence. Apply the independent wall export/check/area commands above to each constrained output before continuing it. `--intervals` specifies the total target index from the original frame-31 input; the resume option skips already completed fitting without resetting constitutive state. Screens and linear wall checks do not certify the exact nonlinear normal/rig trajectory, full source/export actions, appearance, likeness or gameplay. **Outfit04 remains unpromoted and all 32 model binaries and body05/top01 controls remain preserved.**


### Retained motion through frame 20; clearance-bound correction

The next complete batch reaches frame 22. A subsequent attempt toward frame 19 hits its 30-minute process limit after four completed intervals through frame 20. Its original full-batch report is absent; the requested batch did **not** finish. The completed prefix was recovered from the saved per-pose arrays and converged interval logs, with hashes and explicit partial-batch provenance. No unfinished solver interval is included. A late one-second OS profile places the main thread in native edge/edge CCD root finding; this identifies a cost center, not a particular colliding pair. The observed peak physical footprint is about 3.4 GB, a different metric from the earlier Python RSS measurements.

The resulting joined trajectory spans **frame 31 to frame 20: 23 stored fitting poses, 22 completed fitting intervals, 89 independently reconstructed wall poses and 88 straight wall transitions**. Shared stage endpoints match exactly. Native zero-distance wall CCD and endpoint intersection checks pass throughout, and analytic triangle-area minima remain above `2.2543891e-7 m²`. The minimum measured wall/body/top gap is **0.430361 mm**. These are checks on saved linear paths; arm lowering to frame 1 is incomplete.

At the final wall transition, frame 20.125 to 20, native finite CCD rejects the 0.2 mm wall/obstacle query despite clear endpoints and a passing zero-distance test. `linear_separation_bounds.py` resolves this specific rejection independently of IPC primitive distances and the fitting bound routine: proposed separating axes must separate every opposing vertex pair at both interval endpoints, which bounds their affine projections for all intervening times. Unresolved intervals subdivide and eventually reject. The captured query covers 55,838 candidates, requires at most two subdivisions, and has a minimum certified projection of **0.239175 mm** among its candidate certificates. That projection statistic is not a measured global minimum distance. The checker shares IPC broadphase candidate coverage and uses floating-point arithmetic with a 1 nm margin. Its `--separation-bounds` option permits this fallback only for finite wall/obstacle clearance; original native zero-distance wall CCD remains mandatory. The negative native-only report is retained beside the passing combined report.

This independent work exposed a defect in the fitting Lipschitz helper: IPC vertex/face degrees of freedom put the **point first**. The old 3+1 grouping could underestimate relative speed when the point and a face vertex moved oppositely. A permanent regression has analytic contact at `t=0.51`; the former helper incorrectly reports clear and the corrected helper rejects it. The correct grouping is 1+3 for point/face, 1+2 for point/edge and 2+2 for edge/edge. Controls for both bound methods now include opposed point/face motion, off-midpoint tunneling and unresolved intervals. **Historical claims that the old bound implementation certified unsaved optimizer trajectories are withdrawn.** All 22 retained midsurface linear intervals through frame 20 were rechecked with the corrected helper at the original 1.2/0.7 mm gaps and with native zero-distance CCD; all pass. This recheck cannot establish the discarded optimizer iterates.

An optional `--bounded-ccd` experiment caps native queries at 10,000 iterations and requires corrected Lipschitz verification for **every** such query, regardless of its returned boolean. It also changes the step-size proposal to a unit step with the full line-search and animation gates retained. Physical gaps, energy and wall construction are unchanged. This is an explicit numerical-policy experiment, not an equivalent-tolerance claim or acceptance based on an iteration cap. The first replay was stopped when the ordering defect was found; the corrected replay is recorded separately in the ledger. Its guard passes the saved frame-20.5-to-20 interval in 12.72 seconds with 1,461,487 distance queries. The optimization replay was deliberately stopped after 10 minutes 26 seconds without completing a new interval. This policy is not yet a demonstrated fitting performance fix.

The green-clay diagnostic shows the actual reduced walls at frame 20. It is visibly faceted, and reference tailoring is unfinished. No source/export model, runtime asset, body05/top01 control or failed outfit04 status has changed. Full lowering, exact nonlinear motion, source/export action checks, detailed construction, likeness, both characters, remaining wardrobe, gameplay/device budgets and the automated OmniAI pipeline remain open.


### Faster interval certificates and a corrected native-data lifetime

The first batch-filter prototype crashed the isolated Python process in `ipctk` at 04:52:35 local time. It had replaced the owning `Candidates` container with a Python list of borrowed candidate bindings. The native objects were freed while those bindings were still in use. The corrected implementation retains the owning container throughout the check; subsequent replays finish successfully. The user's crash report matches this event. No model was saved by the failed check, and all 32 source/export hashes remain unchanged.

`--fast-bounds` is an optional extension of `--bounded-ccd`. It subtracts a common primitive velocity when forming scalar speed bounds, which leaves distances unchanged. It first handles candidates in batches using fixed-plane certificates: every opposing vertex pair must have more than the required separation at both interval endpoints. Midpoint geometry proposes axes only. Unresolved candidates still require the corrected scalar distance bound and reject on contact, the 1 nm margin or unresolved subdivision. The batch implementation gathers mesh indices directly and checks its index order against the native binding. Controls reject 80 constructed moving edge/edge and point/face collisions, including large shared translations, while preserving a known clear translated pair. The prior opposed point/face regression still rejects.

The fast option omits the capped-native diagnostic query whose boolean the bounded policy already ignored. It **does not** authorize motion from that missing query. Every optimizer and proposed animation interval still requires its interval certificates; native wall endpoint intersection checks remain enabled. Physical gaps, cloth energy, attachments, unit-step proposal and convergence criteria match the earlier bounded mode. Independent reconstructed-wall checks still require native zero-distance CCD. Their optional finite separating-plane fallback uses related mathematics, so it should not be described as an unrelated algorithm.

On the captured frame-20.5-to-20 transition, the final fast guard passes in 2.47 seconds with 4,765 scalar distance queries and 483,858 plane certificates. The earlier corrected guard took 12.72 seconds with 1,461,487 scalar queries. These are individual local diagnostic timings, with different concurrent load, not a controlled speedup ratio or game/device benchmark. Relative-velocity bounds alone and an initial batched version reduced query counts without a comparable elapsed-time improvement. The optimization replay and its independent wall validation are recorded separately in the evidence ledger.


The fast control replay from frame 20.5 to 20 subsequently **converges in 55 iterations**, with no subdivision and clear endpoint wall screens. It takes 998.62 seconds for fitting plus screens and records 2.30 GB Python peak RSS, excluding Blender subprocess memory. This is still expensive offline fitting; the faster guard is not an end-to-end performance benchmark. Its final coordinates differ from the older retained frame-20 fit by at most 0.0593 mm. Independent validation passes five wall poses, four linear transitions and the analytic triangle-area gate, with minimum measured body/top gap 0.438029 mm. The known clear frame-28-to-27.5 interval still passes and the known bad frame-27.5-to-27 wall interval still rejects.

This replay is a separate control. Further motion starts from the previously verified frame-20 checkpoint so the retained trajectory joins exactly; it does not splice the slightly different replay endpoint into that older path.

The subsequent strict attempt from frame 20 to 19.5 reaches the 1,800-second limit without a completed interval or final solver report. Reaching full target pose inside an optimizer iteration is not convergence or a retained checkpoint. The checked trajectory therefore remains **frame 31 through frame 20**, with 89 reconstructed wall poses and 88 linear wall transitions. No later batch starts after the timeout.

A controlled `--position-tolerance-m 1e-6` replay tests whether the default `1e-9` metre displacement threshold causes unnecessary settling. The comparison limit was set in advance to 0.1 mm maximum coordinate difference, plus independent wall and area checks. The result takes the same 55 iterations, with final coordinates differing from the strict fast replay by only `4.44e-16 m`. Five reconstructed wall poses, four native zero-distance CCD transitions, the finite-clearance gate and analytic area checks pass. The final proposed coordinate step is `6.4321e-5 m`, above both displacement thresholds: the existing gradient criterion ends both runs. Its 919.59-second elapsed time is another individual local run, not evidence of a tolerance speedup. The optional parameter is recorded in reports; the default stays at 1 nm. The looser threshold is not used to extend the trajectory.

Free-vertex-only finite-difference probes also pass at the retained frame-20 endpoint, including the largest free gradient coordinate. Fixing progress in these probes prevents the progress-force term from hiding a cloth-gradient error. This supports the gradient implementation within the tested directions; it does not establish complete convergence or a faster solver. Progress snapshots now contain interval, iteration, energy and free-gradient telemetry and explicitly identify themselves as incomplete optimizer states that cannot be used as resume checkpoints.

The next fitting experiment should address the search direction or conditioning during cloth settling, with a completed strict replay and the same independent wall gates as controls. Repeating the timed-out frame-19.5 run or merely loosening the displacement threshold is not supported by these results. Full lowering, original detailed walls, reference tailoring and avatar/pipeline acceptance remain unfinished. All 32 prior model binaries and the viewer controls are preserved.

### Controlled garment construction: a useful rest-shape candidate

The next experiment changes garment construction instead of solver settings. Its predeclared protocol and complete results are in `outfit04-construction-study.json`. All cases use the same checked frame-20.5 coordinates and the same motion to frame 20, with 417 unchanged collar/cuff/waist anchors, original body/top targets, original stiffnesses, 1 nm stopping tolerance and all existing wall/clearance gates. There are no pinned vertices in the selected 448-vertex underarm/armhole region. Releasing an alleged underarm attachment is therefore not an applicable local experiment.

Two changes are tested separately. The layout variant flips 16 interior diagonals, preserving vertices, openings and anchors; each flip improves triangle shape in both the rest and starting poses, with local plane span limited to 0.75 mm. The rest-shape variant smoothly lowers the underarm reference geometry by at most 3.995 mm. Only the frame-31 rest coordinates change; rest lengths and hinge cosines derive from that geometry. All later prescribed positions remain identical. This tests a small change to the three-dimensional rest shape, not a newly sewn gusset, new rig or accepted pattern.

| Construction | Iterations / solver result | Underarm p95 absolute edge strain | Underarm p95 adjacent-normal angle |
| --- | --- | --- | --- |
| Unchanged, fresh matched control | 55 / converged | 10.49% | 44.29° |
| 16 underarm diagonal changes | 55 / iteration limit | 10.33% | 43.79° |
| Up to 4 mm lower underarm rest shape | 32 / converged | 10.27% | 44.40° |

The rest-shape case meets the prospective benefit gate: at most 40 iterations, or at least 20% lower underarm p95 strain, while limiting increases to 10% of global p95 strain and 5 degrees of underarm p95 fold angle. Its **32 versus 55 iterations is a 41.8% reduction**. Global p95 strain is 6.06%, versus 6.10% for the control. Independent validation passes five reconstructed wall poses, four native zero-distance linear wall transitions, the 0.2 mm wall/obstacle clearance gate and analytic wall-area checks. Its minimum measured wall/body/top gap is 0.437549 mm, and minimum analytic wall triangle area is `2.2543988663e-7 m²`. The maximum attachment coordinate error is `2.22e-16 m`.

The fresh control reproduces the previous strict fast-control endpoint within `2.22e-16 m` and again takes 55 iterations. The layout variant also passes independent wall/area checks, but its 1.6% underarm strain reduction misses the 20% threshold and it reaches the iteration cap. Better local triangle shape alone is not a useful fitting improvement in this test. Its final endpoint gradient happens to pass a later diagnostic; that does not rewrite its recorded iteration-limit result or satisfy the benefit gate.

The solver's existing gradient stop uses the gradient before the final accepted step. A separate endpoint-force check therefore supplements the comparison without changing that rule: the rest-shape case has maximum free-coordinate gradient `7.2523e-6`, versus `1.4614e-5` for the control, and a lower gradient L2 norm. A free-only finite-difference check at the largest residual coordinate passes for all three constructions. Thus the iteration benefit is not accompanied by a larger endpoint residual in the tested case. Energy values across different rest shapes or triangulations are not directly comparable.

**Decision:** carry the rest-shape change into a fresh fit from T-pose. The current test reuses a common deformed warm start; it does not establish that the changed construction can get there from T-pose, complete lowering, or replace any part of the retained trajectory. Verified joined motion remains frame 31 to 20 with 89/88 reconstructed wall poses/transitions. The diagnostic renders still show faceted, bunched underarms and unfinished tailoring. All 32 model binaries remain unchanged, no model is promoted, and both launch avatars and the automated OmniAI pipeline remain unfinished.

The recorded fits take 263.45 seconds for the fresh control, 292.80 seconds for the layout limit and 163.31 seconds for the rest-shape case, including their final wall screens. These individual local timings had other diagnostic activity and are not a controlled runtime/device benchmark; iteration counts are the primary comparison. Every fit is limited to 55 iterations without subdivision and a 1,200-second process timeout. The experimental driver and evaluator are `probe_jacket_construction.py` and `summarize_jacket_construction.py`; `inspect_jacket_construction_forces.py` reproduces the endpoint diagnostic. Reduced-wall diagnostic images are kept separately as `male-outfit04-construction-layout-diagnostic.png` and `male-outfit04-construction-rest-depth-diagnostic.png`, preserving the prior trajectory image.

A repeatable serial runner enforces the process limits, keeps failed results and performs the independent checks. Use a fresh temporary output directory; it refuses to overwrite an earlier study. The source motion input and checked warm-start checkpoint must already exist.

```sh
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/run_jacket_construction_study.py --input /tmp/omnirave-jacket-motion-clean.npz --checkpoint /tmp/omnirave-finite-wall-batch-19-prefix20 --output /tmp/omnirave-construction-repeat
```

## Fresh underarm rest-shape fit from T-pose

`outfit04-rest-tpose-fit.json` records a new fit of the selected rest-shape construction, starting exactly at its modified frame-31 T-pose. No older construction checkpoint or common deformed warm start is used. The 448 unanchored underarm rest vertices move down smoothly by at most 3.995 mm; later prescribed positions, all 417 anchors, topology, energy coefficients, clearance constraints and the default 1 nm position tolerance stay unchanged.

The independently verified fresh range is **frame 31 to 6**, with 52 fitted poses, 51 fitted intervals, 205 reconstructed wall poses and 204 linear wall transitions. Every batch joins exactly in panel, reconstructed wall, body and top positions. Native zero-distance wall checks, the 0.2 mm bounded wall/obstacle clearance requirement and analytic wall-area checks pass. The minimum measured wall/body/top gap is **0.227096 mm**, and the minimum analytic wall triangle area is `2.1841773179e-07 m²`. These are straight paths between quarter-interval reconstructions; exact nonlinear rig motion, original detailed walls, exported actions and gameplay remain outside this result.

The user paused this work during the frame-5.5 solver attempt to switch to Blender skill research. All fitting processes are stopped. Frame 6 remains the last independently checked endpoint; the interrupted attempt is neither a solver-failure nor collision claim. Each solver batch has a 1,200-second process limit, followed by separately bounded export (180 seconds), independent path (300 seconds) and area (180 seconds) checks. The recorded four-interval batch from 22 to 20 converges in 16, 76, 60 and 17 iterations at its successive half-frame endpoints. The later frame-11 batch reaches the existing 100-iteration limit, discards that unconverged attempt, and succeeds through frame 11.25 (20 iterations) and frame 11 (94 iterations); independent checks pass nine reconstructed poses and eight linear transitions for that batch. These additional fitting samples are distinct from subdivision inside the native CCD checker. The earlier matched-start result of 32 versus 55 iterations remains a local comparison; it is not a measured full-trajectory speedup. This fresh run also enables the existing actual-wall barrier from frame 31, whereas the older retained path introduced it at frame 28; the increased verified reach is not a controlled attribution to rest shape alone. Individual local timings are not a controlled device benchmark.

A native zero-distance query initially rejected the final linear transition into frame 18.5. That original failed report is preserved. Wall/body/top separation passes, and the isolated wall-self rejection is resolved by two native-clear halves of the same straight path. A separate full-wall projection bound certifies separation throughout, with minimum certified projection `3.4233018483e-7 m`. The checker now allows at most four levels of native-query subdivision; every accepted leaf must pass native zero-distance CCD, and unresolved leaves reject. Controls retain the recorded long-query rejection, reject depth exhaustion and reject three off-midpoint edge tunnels plus a vertex/face tunnel with clear endpoints. No geometry, clearance or CCD tolerance is changed. The fitted endpoint is reused only after this independent revalidation.

The frame-6 fit stops on the unchanged 1 nm position-step criterion (last proposed coordinate step `8.3853521162e-10 m`), rather than a small force residual. Its last gradient snapshot matches the completed positions exactly and records maximum free-coordinate gradient `0.0034894938`. The geometric path checks pass, but that endpoint does not establish low-residual force equilibrium. Optimizer snapshots remain diagnostic-only and are never used as resume checkpoints.

The separate fixed-attachment preflight checks all 417 pinned vertices through their 418 incident pinned edges against all input body/top triangles. All 61 sampled poses and 60 piecewise-linear motions pass the 0.7 mm requirement; the minimum measured pose gap is 4.624220 mm. This is necessary prescribed-constraint feasibility only, not a free-cloth or actual-wall acceptance test.

`outfit04-rest-tpose-input.npz` preserves the selected input byte-for-byte, and `outfit04-rest-tpose-checked-panels.npz` preserves exactly the joined checked midsurface positions and source frames. The collector round-trips those arrays and records hashes. These are diagnostic data archives, not model exports or solver resume reports; they allow later inspection without depending on the temporary input and per-batch position files.

The preserved frame-20 diagnostic is supplemented by `male-outfit04-rest-tpose-frame6-diagnostic.png`. Frame 6 remains faceted and pinched under the arms. Its reduced 1 mm walls have zero reported intersection pairs, but outer offset face 1478 is reversed relative to its midsurface (minimum projected area ratio -0.0915428195). Passing collision and nonzero-area gates does not establish offset orientation, low-residual equilibrium or visual acceptance. The original detailed transfer remains a failed control, and all 32 model binaries are unchanged. No model is exported or promoted. The older original-construction trajectory remains a separate frame-31-to-20 record; neither path is spliced into the other. Both launch avatars and the automated OmniAI pipeline remain unfinished.

`run_jacket_rest_fit.py` packages the executed serial workflow with configurable local paths and atomic progress metadata; it requires a fresh output directory and stops after a failed or timed-out batch. `summarize_jacket_rest_fit.py` verifies source/result hashes, settings, independent checks and exact joins before collecting a completed prefix. `inspect_jacket_attachments.py` exposes the preflight as a CLI. The public runner's component commands were exercised by the recorded temporary driver; the expensive full trajectory was not rerun simply to test the packaging.

```sh
OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 /tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/run_jacket_rest_fit.py --input omnirave-babylon/assets-src/avatars/launch-body-proof/outfit04-rest-tpose-input.npz --output /tmp/omnirave-rest-tpose-repeat
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/summarize_jacket_rest_fit.py --directory /tmp/omnirave-rest-tpose-repeat --input omnirave-babylon/assets-src/avatars/launch-body-proof/outfit04-rest-tpose-input.npz --output /tmp/omnirave-rest-tpose-repeat/checked-prefix.json --archive-panels /tmp/omnirave-rest-tpose-repeat/checked-panels.npz
```

That historical trajectory remains stopped. The resumed Blender study below is a separate construction and deformation experiment.

## Resumed Blender skill study: corrected setup, garment still rejected

Work resumed with `blender-image-character-clothing`: shared-rest weight transfer, explicit deformation ownership, clean garment construction, collider isolation and evaluation of final thickness. Native nearest-face transfer and moving Solidify after Armature both fail the existing rest/five-pose checks. Rebinding the archived fitted frame-6 surface also fails, with and without QuadriFlow. None of these becomes a viewer option or replaces body05/top01/outfit04.

The native cloth warm-up isolates a setup failure. With gravity and self-collision disabled, the full shirt collider drives the initially clear jacket into the shirt. An outer-surface-only shirt collision proxy removes this failure in matched native-scale trials. Independent checks still include the entire original shirt: both walls and its rims. Source model files are never changed.

| Stationary native-scale control, frame 11 | Maximum movement from start | Midsurface self/body/shirt crossing pairs |
| --- | ---: | ---: |
| No collision | 0.000132 mm | 0 / 0 / 0 |
| Body collision only | 0.000132 mm | 0 / 0 / 0 |
| Complete shirt collision only | 39.898 mm | 4 / 464 / 5,070 |
| Outer shirt surface collision only | 0.000132 mm | 0 / 0 / 0 |

Self-collision on the original irregular cage also disturbs the stationary surface. A smaller-distance trial at 10× geometry reduces that disturbance, but changes both scale and distance; it does not isolate either cause or establish equivalent cloth physics. Every executed collision distance is read back and converted to meters. The native cloth result with corrected shirt collision still fails actual 1 mm walls, including when more simulation steps are used.

The regular mesh trial exposes a second construction defect: QuadriFlow caps both sleeves despite the requested boundary preservation. The first projected trial therefore intersects the wrists. The corrected builder removes those end-facing cap proposals before projection and explicitly requires three opening loops: two cuffs plus the connected front/neck/hem opening. It retains 2,284 vertices and 4,408 triangles, with 162 boundary pins. A 2 mm additional normal ease clears the initial full-thickness body contacts. This changes construction and attachment sampling; it is not the old 417-pin experiment with only a new triangulation.

The corrected 1 mm construction passes all 11 stored stationary warm-up samples, including wall self/body/shirt contacts and offset-face orientation. Arm lowering is still unsuccessful. In the bend-200 trial, every stored frame is independently checked: the first 36 stored frames are clear, then source frame 18 has three midsurface self pairs and 20 wall self pairs. The endpoint at source frame 16 has a clear midsurface but eight wall self pairs. The first failure would have been missed by the coarser simulation checkpoints. Increasing bending to 800 fails within the stationary warm-up and moves the surface by about 73 mm; simply increasing stiffness is not an accepted fix.

These are sampled strict nonadjacent, noncoplanar crossing checks. Continuous native-cloth motion, nonlinear wall reconstruction between samples, the full source action, export and runtime behavior remain unchecked. Fabric parameters are not physically calibrated at the temporary 10× scale. Counts across different topologies are not severity comparisons, and local elapsed times are not performance benchmarks. The new renders are smoother construction diagnostics, with unfinished underarms, silhouette and reference tailoring; neither is a visual acceptance.

`outfit04-blender-skill-study.json` retains the transfer/rebind results, 22 native trials, independent wall inspections, controls, hashes and limits. `male-outfit04-blender-regular-tpose.png` shows the checked warm-up endpoint; `male-outfit04-blender-regular-motion-diagnostic.png` shows the failing source-frame-16 endpoint. All 32 previous model binaries and runtime controls remain unchanged. Failed bind models and native simulation arrays remain temporary.

Reproduce the corrected construction and bounded motion from the repository root:

```sh
BLENDER_STUDY_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
BLENDER_STUDY_SCRIPTS="omnirave-babylon/scripts/launch-body-proof"
BLENDER_STUDY_DIR="/tmp/omnirave-blender-cloth-repeat"
"$BLENDER_STUDY_BIN" --background --threads 2 --python-exit-code 1 --python "$BLENDER_STUDY_SCRIPTS/rebuild_native_jacket_proxy.py" -- --output "$BLENDER_STUDY_DIR/regular-input.npz" --ease 0.002
"$BLENDER_STUDY_BIN" --background --threads 2 --python-exit-code 1 --python "$BLENDER_STUDY_SCRIPTS/probe_native_jacket_cloth.py" -- --output "$BLENDER_STUDY_DIR/motion" --input "$BLENDER_STUDY_DIR/regular-input.npz" --scale 10 --object-gap 0.001 --self-gap 0.0012 --top-surface outer --check-walls --bending 200
"$BLENDER_STUDY_BIN" --background --threads 2 --python-exit-code 1 --python "$BLENDER_STUDY_SCRIPTS/inspect_native_jacket_cloth.py" -- --directory "$BLENDER_STUDY_DIR/motion" --render
```

These diagnostic commands write failure reports and do not promote a model. `--keep-caps-control` in the construction script reproduces the rejected capped topology; normal construction requires the three openings. The raw native collider controls use `--max-frame 11 --colliders none|body|top`, with `--no-self-collision`; compare the default full shirt surface with `--top-surface outer`. `summarize_blender_cloth_study.py --directory <completed-study-directory>` collects an existing full study and verifies all 32 baseline model hashes.

Next redesign the underarm rest pattern and sleeve/torso transition on this corrected setup. Keep the clean openings and actual-wall checks; do not repeat transfer-only fixes or resume the old expensive IPC trajectory. Both complete launch avatars, remaining wardrobe/actions, reference likeness, gameplay/device checks and the automated OmniAI pipeline remain unfinished.


## Underarm construction follow-up: small extension, still rejected

The direct 12 mm underarm-depth construction extends the clear sampled prefix from source frame 18.5 to 17.5. It first fails at frame 17 with eight wall self-crossing pairs. A 30 mm version fails earlier, at frame 24. Neither completes lowering or repairs the visible underarm pinch. The new surface is a smooth deformation of the regular construction, not a newly sewn gusset.

| Construction / animation | Clear stored prefix | Last clear source frame | First failed source frame | Wall self pairs at first failure |
| --- | ---: | ---: | ---: | ---: |
| Unchanged, absolute animation control | 36 | 18.5 | 18 | 20 |
| Up to 11.950 mm deeper underarm, absolute animation | 38 | 17.5 | 17 | 8 |
| Up to 29.875 mm deeper underarm, absolute animation | 24 | 24.5 | 24 | 13 |
| Unchanged, relative animation control | 35 | 19 | 18.5 | 21 |

Source frames decrease as the arms lower. Counts include the 11 stationary warm-up frames; they are not unique poses. Each listed run has an independent inspection of every stored frame against actual 1 mm walls, original body and the full original shirt, including offset orientation. The two depth changes affect 399 free vertices; all 162 pins, topology, body/top motion and all later prescribed garment samples remain exactly unchanged. The 12 mm construction reproduces exactly through `reshape_jacket_underarm.py`. No continuous-motion or finite-clearance guarantee is added.

A proposed custom Cloth Rest Shape Key did **not** produce a measured response in this installed setup. T-pose and lowered-pose rest inputs differ by up to 436.301 mm in vertex position and 11.863 mm in edge length, yet their cloth coordinates are exactly identical within each paired run. This holds for absolute keys, an identity Triangulate modifier, and relative keys. Relative animation matches the complete prescribed garment motion at 181 integer/half-frame samples within 0.000190 mm, but its simulated trajectory differs slightly from the absolute-animation control; those representations must not be pooled as interchangeable cloth controls.

The first tiny rest-key test was misleading: Blender created the new key with mix value 1, so the relative strip already started at half length. That apparent success was ordinary shape mixing, not simulated contraction. The corrected `probe_cloth_rest_key.py` explicitly sets zero mix and asserts the initial length. Both absolute and relative strips stay at one meter despite a half-length rest input. A deliberately mixed negative control starts and stays at half length, while the gravity control moves, confirming that simulation itself runs. The earlier claim that relative keys fixed the rest-key behavior is withdrawn. This is an observed limitation of the tested setup; no general Blender defect or source-level cause is established.

`probe_native_jacket_cloth.py` now supports `--check-every-frame` to stop at the first stored crossing. Its `--rest-shape` and `--relative-rest-control` options are diagnostic only; successful property readback is not proof of a working rest pattern. The failed identity-modifier workaround is removed. `outfit04-underarm-rest-study.json` retains the paired controls, independent inspections, source/result hashes, correction and scope. `male-outfit04-underarm-depth-diagnostic.png` shows the failing 12 mm endpoint, with visible underarm pinching and unfinished tailoring.

Reproduce the direct construction test after building the regular input using the preceding section:

```sh
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/reshape_jacket_underarm.py --input /tmp/omnirave-blender-cloth-repeat/regular-input.npz --output /tmp/omnirave-underarm-repeat/input.npz --depth 0.012
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_native_jacket_cloth.py -- --output /tmp/omnirave-underarm-repeat/motion --input /tmp/omnirave-underarm-repeat/input.npz --scale 10 --object-gap .001 --self-gap .0012 --top-surface outer --bending 200 --check-walls --check-every-frame
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_native_jacket_cloth.py -- --directory /tmp/omnirave-underarm-repeat/motion --render
```

All 32 original model binaries and runtime controls remain unchanged. The next construction should change the sleeve/torso junction and its fold distribution rather than increasing local depth or stiffness again. Both finished avatars, remaining wardrobe/actions, reference matching, export/runtime checks and the automated OmniAI pipeline remain outstanding.


## Sleeve-junction patch and guide study: no improved candidate

Both underarm junction patches were rebuilt with an 8 mm triangular lattice, sharing the existing boundary vertices with the surrounding shell. The left/right patches retain 27 boundary vertices each, replace 85/55 triangles with 321/315, and add 148/145 interior vertices before unused old vertices are removed. The connected jacket totals 2,532 vertices and 4,904 triangles. All 162 cuff/collar/waist pins, their complete prescribed motion, and the three original openings are retained exactly. New points sample the previous surface; retriangulation changes the surface between them. This is a welded mesh patch, not a physically sewn pattern.

The first unconstrained triangulation omitted boundary segments and was rejected before saving an input. The builder now recovers those segments by convex edge flips and requires exact boundary-edge equality and manifold edge incidence. Unbounded smoothing is another negative control: it changes a patch point by up to 16.619 mm and produces four wall self-crossing pairs in the initial T-pose. The normal smoothing option therefore bounds displacement to 3 mm and fades it near the fixed patch boundary; its actual maxima are 2.943/2.995 mm.

| Variant | Clear stored prefix | Last clear source frame | First failed source frame |
| --- | ---: | ---: | ---: |
| Earlier retained 12 mm depth diagnostic | 38 | 17.5 | 17 |
| New lattice patches | 31 | 21 | 20.5 |
| New patches, unbounded smoothing control | 0 | — | 31, initial T-pose |
| New patches, bounded smoothing | 36 | 18.5 | 18 |
| New patches, soft guide peak 0.25 | 37 | 18 | 17.5 |
| New patches, soft guide peak 0.75 | 31 | 21 | 20.5 |
| New patches, bounded smoothing and guide peak 0.25 | 36 | 18.5 | 18 |

Source frames decrease during lowering. Prefix counts include 11 stationary warm-up frames. All six new variants have independent inspection of **every stored frame**, including actual 1 mm walls, the original body, the complete original shirt and offset-face orientation. Each new run first fails with four wall self-crossing pairs while its midsurface/body/shirt crossing counts remain zero. Pair counts across different topology are not severity measurements. No new variant outperforms the retained depth diagnostic, and no motion prefixes are spliced together.

The guide variants add 447 weighted underarm vertices, with a smooth falloff from the requested peak. They follow the already prescribed garment positions and introduce an explicit additional motion constraint; they are not a topology-only comparison. The original 162 hard attachments stay at weight 1. Guide weights and hard-attachment weights are read back from Blender and checked. Stronger guides do not provide a monotonic improvement, and combining the tested smoothing and guides does not improve the prefix.

`rebuild_jacket_underarm_patch.py` packages construction, boundary recovery, bounded smoothing and optional guide weights. All six executed inputs reproduce exactly in every array, including the unbounded-smoothing negative control. `probe_native_jacket_cloth.py` accepts optional `guide_weights` from the input and preserves its previous behavior when absent. A fresh final-code 11-frame guided warm-up verifies the weight readback and actual-wall screen. Python formatting, lint and compilation checks pass.

Reproduce the guided patch after building the regular input described above:

```sh
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/rebuild_jacket_underarm_patch.py --input /tmp/omnirave-blender-cloth-repeat/regular-input.npz --output /tmp/omnirave-junction-repeat/input.npz --guide-weight .25
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_native_jacket_cloth.py -- --output /tmp/omnirave-junction-repeat/motion --input /tmp/omnirave-junction-repeat/input.npz --scale 10 --object-gap .001 --self-gap .0012 --top-surface outer --bending 200 --check-walls --check-every-frame
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_native_jacket_cloth.py -- --directory /tmp/omnirave-junction-repeat/motion --render
```

Omit `--guide-weight` for the lattice control. Add `--smooth 20` for bounded smoothing; `--smooth 20 --unbounded-fair-control` reproduces the rejected initial-wall control. `outfit04-sleeve-junction-study.json` retains results, independent inspections, construction/reproduction metadata and hashes. `male-outfit04-sleeve-junction-diagnostic.png` shows the failing 0.25-guide endpoint; underarm pinching and unfinished tailoring remain visible.

All 32 original model binaries and runtime controls remain unchanged. These are sampled strict crossing checks, not continuous-motion or finite-clearance guarantees; fabric scale remains uncalibrated and no export/gameplay result is accepted. Next author a sleeve/armhole pattern independently of this inherited body-derived surface, rather than repeating patch density, smoothing, depth, stiffness or guide-strength adjustments. Both finished avatars, wardrobe/actions, reference matching and the automated OmniAI pipeline remain unfinished.

## Independent authored jacket pattern and bounded pose corrections

A new jacket is built from four independent front/back outlines with analytic depth and exactly welded side, shoulder, sleeve and back-center seams. It copies no surface or vertices from the old body-derived garment. This is a three-dimensional pattern construction, **not simulated sewing**. The default samples along the curved surface, yielding 5,041 vertices, 9,862 triangles, three opening loops and 222 boundary attachments. Its shortest edge is 9.60 mm, median edge 15.71 mm and longest edge 43.28 mm; the optional refinement target is not a maximum-edge guarantee for the default. The initial T-pose passes actual 1 mm wall, body, complete-shirt and offset-orientation checks.

| Construction / deformation | Last clear source frame | First failed source frame |
| --- | ---: | ---: |
| Earlier retained body-derived depth diagnostic | 17.5 | 17 |
| New uniform-chart pattern, native cloth | 16.5 | 16 |
| Uniform chart with released front-opening pins | 20 | 19.5 |
| Long-edge refinement control | — | 31, warm-up sample 3 |
| New curved-chart pattern, native cloth | 16 | 15.5 |
| Curved chart with bounded post-cloth corrections | 10 | 9.5 |

Source frames decrease as the arms lower. Native weight transfer alone also fails: the curved pattern first intersects its own walls at source frame 27.5. Refining long edges introduces small sliver triangles and fails during stationary warm-up. Three separate QuadriFlow controls preserve the intended openings after cap removal but already fail the initial back-neck wall checks. Their projected, raw and neck-faired variants have 12, 26 and 3 wall crossing pairs respectively. These results are retained as negative controls, not candidates.

The raw curved-chart simulation has 41 initially clear stored samples, including 11 warm-up frames. A full 91-frame diagnostic capture reproduces the original first 42 samples exactly and continues through the failed motion without claiming acceptance. At source frame 15.5 it first develops four wall self-crossing pairs. Later it also intersects the body and shirt. `--record-contacting-frames` explicitly labels this contact-containing diagnostic and requires every-frame checking; the native runner still stops at first contact by default.

Local post-cloth fairing repairs eight stored poses with displacement limited to 3 mm from their raw simulated positions, using a 0.0001 mm numerical allowance. All hard attachments remain exact. The maximum accepted displacement is 3.000044 mm. This is a separate deformation step, not a physics improvement. Independent reconstruction verifies all **53 saved poses through source frame 10** against actual 1 mm walls, the original body, the complete original shirt and positive offset orientation. Another **156 quarter-step samples** of linear interpolation between saved poses pass against actual rig-evaluated body/shirt geometry. These are sampled strict-crossing checks; they establish neither continuous native-cloth clearance nor a positive finite separation bound.

At the next source frame, 9.5, the raw pose has 30 wall self pairs. The bounded corrective retains four self pairs, and some larger trial steps introduce body intersections. That frame is rejected and omitted from the clear prefix. Full lowering, settling and the remaining actions are still incomplete. No historical and new trajectories are spliced together.

`male-authored-jacket-pattern-study.blend` is an editable **unbound static T-pose** source with playback restricted to frame 31. The selected midsurface is editable; its separate rendered 1 mm walls are a frozen diagnostic and must be rebuilt after edits. An internal text explains this scope. Reopening confirms geometry parity within 0.000060 mm, the initial wall checks and no missing external image files. Front, back, profile and lowered diagnostic views were inspected. The garment remains boxy, with scalloped boundaries, underarm compression and unfinished neckline/tailoring; luxury trim and reference appearance are not accepted. The two accompanying PNGs show the initial construction and last clear corrected pose.

Reproduce with the existing local Python environment and Blender installation:

```sh
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/build_authored_jacket_pattern.py --output /tmp/omnirave-pattern-repeat/rest.npz
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/fit_authored_jacket_pattern.py -- --pattern /tmp/omnirave-pattern-repeat/rest.npz --output /tmp/omnirave-pattern-repeat/fit --bind
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_native_jacket_cloth.py -- --output /tmp/omnirave-pattern-repeat/raw --input /tmp/omnirave-pattern-repeat/fit/pattern-motion-input.npz --scale 10 --object-gap .001 --self-gap .0012 --top-surface outer --bending 200 --check-walls --check-every-frame --record-contacting-frames
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_pattern_fold_corrective.py -- --directory /tmp/omnirave-pattern-repeat/raw --output /tmp/omnirave-pattern-repeat/corrected --all-frames
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_native_jacket_cloth.py -- --directory /tmp/omnirave-pattern-repeat/corrected --render
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_pattern_interpolation.py -- --directory /tmp/omnirave-pattern-repeat/corrected
```

For the static editable source, run the fitter with `--render --save-study` and omit `--bind`. The builder's `--uniform-chart-control` and `--uniform-chart-control --refine-control` reproduce the two mesh controls. All three construction outputs reproduce exactly in every array. The full results, negative controls, independent inspections, interpolation checks, script/input/result hashes and source reopening report are retained in `outfit04-authored-pattern-study.json`; raw NPZ caches remain temporary. The seven new/changed Python files pass lint, formatting and compilation checks.

All 32 earlier model binaries and runtime controls remain unchanged; the one new Blender file is explicitly a construction diagnostic. Next develop contact-aware garment deformation for the remaining underarm closure, starting at source frame 9.5, before detail or export. Both finished avatars, reference tailoring, remaining wardrobe/actions, runtime/device validation and the automated OmniAI pipeline remain outstanding.

## Contact corrections, flat sewing and fitted sleeves

The latest retained construction narrows the sleeves using measured T-pose arm sections. At upper-arm X = 0.28 m the body is approximately 79 mm high, compared with roughly 161 mm for the previous jacket envelope. The new independent outline/depth profile has 4,687 vertices, 9,166 triangles, three opening loops and 210 hard attachments. The initial narrower profile intersects the body and is rejected; `--clearance-adjusted` adds targeted front/back depth and lowers the underarm outline by 4 mm, passing the initial actual 1 mm wall checks.

| Separate construction / deformation | Clear stored prefix | Last clear source frame | First failed source frame |
| --- | ---: | ---: | ---: |
| Previous curved construction, 3 mm post-cloth fairing | 53 | 10 | 9.5 |
| Previous curved construction, 6 mm vertex contact correction | 55 | 9 | 8.5 |
| Previous curved construction, 6 mm balanced facet correction | 58 | 7.5 | 7 |
| New fitted sleeve, native cloth | 39 | 17 | 16.5 |
| New fitted sleeve, 6 mm balanced facet correction | 59 | 7 | 6.5 |
| Frozen corrected sewing drape, native bend 200 | 32 | 20.5 | 20 |
| Frozen corrected sewing drape, native bend 0.5 | 15 | 29 | 28.5 |

Source frames decrease during lowering; these prefix counts include 11 stationary warm-up samples. Raw native cloth is not improved by the first-contact measure. Its full fitted-sleeve diagnostic capture reproduces the first 40 stored poses exactly and still develops later body/shirt contact. Applying bounded corrections after simulation modifies 15 poses and preserves all raw hard-attachment coordinates exactly. The displacement limit is 6 mm, checked with a 1 nm numerical allowance. Independent reconstruction passes all **59 saved poses** and **174 quarter-step interpolation samples**, checking actual 1 mm walls against themselves, the original body, the complete original shirt and offset-face orientation. At the next source frame, 6.5, the final tested proposal retains 134 wall self pairs and 66 body pairs and is rejected. Neither full lowering nor settling passes.

The contact controls distinguish proposal behavior from acceptance. At old source frame 9.5, projected and unprojected 6 mm fairing both pass; neither 3 mm version passes. That comparison supports the larger correction cap, not a projection benefit. At old source frame 8.5, averaging facet-contact proposals succeeds where the tested vertex-only and sequential facet methods fail. Synthetic sphere/triangle fixtures verify that clear vertices can still form an intersecting facet. The small fixture clears with balanced proposals; the large fixture still has two crossings after 40 steps and must be rejected. `projection-controls.json` is the authoritative fixture record; it corrects an initial mistaken expectation that the large case should clear. Further 12 mm caps and transported fixed displacements do not solve the old construction. Separate section-weight and medial-compression controls also fail and are not used in the retained prefix.

The sewing experiment starts from **three actual flat pieces and 202 loose sewing edges**. The default flat cuff material is too short for its prescribed opening (target/material length ratio 1.491). A matched control adjusts torso allowance, increases sleeve material height by 20% and reduces the prescribed cuff radius by 20%; this changes both cut and attachment dimensions. Native sewing alone does not close the seams sufficiently. Temporary seam-placement guides close them at simulation frame 31, but explicit diagnostic welding still produces 47 wall self-crossing pairs. Releasing the guides lets seams reopen to 21.991 mm by frame 61. Sewing springs are not a topology weld, and that result is not accepted.

The closed, explicitly welded frame-31 drape can be repaired with the bounded 6 mm correction. Freezing it as a new cloth rest shape **discards the original flat-material strain state**. Both high and soft bending motion tests of this frozen surface fail earlier than the retained independent construction, despite clear stationary warm-up. This is a separate negative construction control, not a complete physically sewn garment.

`male-fitted-sleeve-pattern-study.blend` is the new editable **unbound static T-pose** source. Its internal note references `outfit04-contact-and-sewing-study.json`, restricts playback to frame 31 and explains that the separate rendered 1 mm walls must be rebuilt after editing. Reopening verifies exact face indices, coordinate agreement within 0.000060 mm, clear initial walls and no missing external images. Front, back, profile and lowered views were inspected. The torso remains boxy and deep, with unfinished neck/cuff/hem tailoring, compressed underarms and plain diagnostic materials. `male-fitted-sleeve-pattern-tpose.png` and `male-fitted-sleeve-corrected-prefix.png` show the retained construction and its last clear corrected pose.

Reproduce the fitted construction and its separate corrected prefix:

```sh
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/build_fitted_sleeve_pattern.py --output /tmp/omnirave-fitted-repeat/rest.npz --clearance-adjusted
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/fit_authored_jacket_pattern.py -- --pattern /tmp/omnirave-fitted-repeat/rest.npz --output /tmp/omnirave-fitted-repeat/fit --bind
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_native_jacket_cloth.py -- --input /tmp/omnirave-fitted-repeat/fit/pattern-motion-input.npz --output /tmp/omnirave-fitted-repeat/raw --scale 10 --object-gap .001 --self-gap .0012 --top-surface outer --bending 200 --check-walls --check-every-frame --record-contacting-frames
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_pattern_contact_corrective.py -- --directory /tmp/omnirave-fitted-repeat/raw --output /tmp/omnirave-fitted-repeat/corrected --all-frames --limit .006 --iterations 30 --facet-contacts --balanced-facets
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_native_jacket_cloth.py -- --directory /tmp/omnirave-fitted-repeat/corrected --render
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_pattern_interpolation.py -- --directory /tmp/omnirave-fitted-repeat/corrected
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/inspect_pattern_projection_controls.py -- --output /tmp/omnirave-fitted-repeat/projection-controls.json
```

Omit `--clearance-adjusted` to reproduce the rejected initial fitted envelope. For the editable T-pose, use the fitter with `--render --save-study` and omit `--bind`; its generic internal note references the preceding authored-pattern ledger, so update that note to this contact/sewing ledger when naming the fitted study. For the old contact controls, use the previous section's full curved raw cache with this corrective runner; omit facet flags for vertex-only proposals, or add `--no-project-control` for fairing alone. Single-frame tests use `--sample-frame` in simulation-frame coordinates; the historical 3 mm tests used 60 iterations per factor. Section controls use `probe_pattern_section_weights.py -- --pattern <curved-rest.npz> --output <directory>`, optionally with `--medial-compression .7`.

Reproduce the guided, matched flat-panel negative control:

```sh
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/build_authored_jacket_pattern.py --output /tmp/omnirave-sewing-repeat/coarse.npz --uniform-chart-control
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/fit_authored_jacket_pattern.py -- --pattern /tmp/omnirave-sewing-repeat/coarse.npz --output /tmp/omnirave-sewing-repeat/fit --bind
/tmp/omnirave-ipc-env/bin/python omnirave-babylon/scripts/launch-body-proof/build_flat_jacket_sewing_pattern.py --source /tmp/omnirave-sewing-repeat/coarse.npz --output /tmp/omnirave-sewing-repeat/flat.npz --torso-allowance .0915 --sleeve-height-scale 1.2 --cuff-scale .8
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_flat_jacket_sewing.py -- --pattern /tmp/omnirave-sewing-repeat/flat.npz --input /tmp/omnirave-sewing-repeat/fit/pattern-motion-input.npz --output /tmp/omnirave-sewing-repeat/closed31 --seam-guides --max-frame 31
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_pattern_contact_corrective.py -- --directory /tmp/omnirave-sewing-repeat/closed31 --output /tmp/omnirave-sewing-repeat/repaired31 --sample-frame 31 --limit .006 --iterations 30 --facet-contacts --balanced-facets
```

Use `--max-frame 61` in a separate output directory to test guide release; omit `--seam-guides` for sewing springs alone. Omit the three sizing flags on the flat builder for the unmatched control. To reproduce the frozen-rest control, save the repaired endpoint's `points` and `faces` plus the coarse pattern's `anchors` into a new NPZ, pass it to the fitter with `--bind`, and run native cloth as above with bending 200 or 0.5. That explicit freeze changes the material rest metric.

Both fitted variants and the matched flat construction reproduce exactly in every array. The original default flat file predates the optional `cuff_scale` scalar; final-code reproduction adds its default value 1 and has only sub-femtometer target roundoff. The final sewing runner reproduces the guided frame-31 archive exactly, including its failed-wall result. All six new Python scripts pass lint, formatting and compilation checks. The ledger retains 69 reports, source/result/script hashes, synthetic controls and independent inspections; large section-weight lists are represented by canonical hashes and their deterministic generator. Raw NPZ caches remain temporary.

All **33 preceding model binaries** and runtime controls remain unchanged. One new static Blender study is added. These are sampled strict-crossing results, not continuous-time or finite-clearance guarantees; fabric properties at 10× scale remain uncalibrated. Next resolve the fitted sleeve/torso fold beginning at source frame 6.5 with a construction or deformation change, then prove complete lowering and settling before detail/export. Both complete launch avatars, remaining wardrobe/actions, likeness, runtime/device validation and the automated OmniAI pipeline remain unfinished.

## Rigged jacket and finite corrective shapes

The strategy reset replaces further cloth-prefix tuning with an editable fitted deformation base. `rigged-jacket-study/male-rigged-jacket-study.blend` contains one connected 2,636-vertex, 5,062-triangle jacket, three opening loops, the unchanged body armature, **12 finite corrective shape keys**, and a live 1 mm Solidify modifier. The three `Jacket review` actions demonstrate elbow bend, forward reach and overhead reach. The saved default is elbow bend; select the others in Blender's Action Editor. The original lowering action remains available under the name stored in the scene's `riggedJacketOriginalLoweringAction` property.

The structured sleeve-ring and high-armhole constructions still fail full motion. The retained base instead trims the native body topology in the shared T-pose, smooths the construction and fits it over the complete shirt. Its rest fit passes both reconstructed thickness and actual Solidify checks. Six symmetric support poses—one intermediate and one endpoint for each gesture—produce left/right corrective keys. Ordinary Blender drivers interpolate them from upper/lower arm directions. There is no runtime contact solver, Python handler or cloth simulation. The driver's RNA matrix indices are explicitly checked against mathutils: their index orders differ. The initial wrong-index implementation is retained only as a rejected control.

A fixed bind-space correction of at most 1.5 mm is applied equally to Basis and every key to improve shirt clearance. It is stored in `fixed-bind-margin.npz`; it is not a per-frame correction. The source mesh, shirt, rest skeleton and all **34 preceding model binaries** remain unchanged.

| Saved-rig check | Clear / checked |
| --- | ---: |
| Elbow bend | 49 / 49 |
| Forward reach | 49 / 49 |
| Overhead reach | 49 / 49 |
| One-arm variants across the three gestures | 18 / 18 |
| Original full lowering control | **2 / 61** |
| Reopened review-action playback, actual Solidify | **291 / 291** |

The first four rows include both independently reconstructed walls and Blender's actual modifier output against themselves, the body and the complete shirt. The playback check reopens the exact delivered file and samples 97 half-frame positions over each clip's outward half. Return key values mirror the outward values within 2e-5; return subframes were not independently sampled. Reopening also verifies unchanged shape-key coordinates, body/top/rest-bone data and no missing external images. The final artifact is a **rigging study, not an accepted jacket or avatar**.

Full lowering still fails, beginning at source frame 30. Gaussian interpolation extrapolates poorly along that unsupported motion and introduces earlier contacts than the uncorrected fitted base. Local full-down fitting targets also fail and are excluded from the keys. These failures remain in the validation report. The garment is still a close-fitting base with body-derived chest contours, uneven front/neck boundaries and plain materials; bomber proportions, luxury detailing and reference likeness remain unfinished.

The input bundle retains the fitted mesh, weights, six target arrays and target evidence. Rebuild and inspect using the installed Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/probe_armhole_jacket.py -- --pattern omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-study/inputs/body-patch-clean-rest.npz --corrective-targets omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-study/inputs/correctives.json --native-thickness --save-study --output /tmp/rigged-jacket-repeat/base
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/finish_rigged_jacket_study.py -- --input /tmp/rigged-jacket-repeat/base/rigged-jacket-study.blend --fit-shirt-margin --output /tmp/rigged-jacket-repeat/fitted
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 2 --python-exit-code 1 --python omnirave-babylon/scripts/launch-body-proof/save_rigged_jacket_review_actions.py -- --input /tmp/rigged-jacket-repeat/fitted/rigged-jacket-study.blend --output /tmp/rigged-jacket-repeat/delivery/male-rigged-jacket-study.blend
```

`build_body_patch_jacket.py -- --output <path.npz>` reproduces the raw trimmed construction, which requires rest fitting before binding. `sculpt_armhole_corrective.py` retains the offline fitting method, its bounded cuff constraints, synthetic separation control and optional actual-thickness checks. The scripts never promote a failed endpoint into a key. The retained evidence lives in `saved-rig-check.json`, `review-actions-check.json` and the aggregate `outfit04-rigged-armhole-study.json`.

These are finite sampled strict-crossing checks, not continuous-motion or positive-clearance guarantees. Exported driver/morph behavior, runtime/device performance and general animation are untested. Next resolve the lowered-arm target and corrective activation outside the three reviewed gestures before styling or export. Both finished launch avatars, remaining wardrobe and the automated OmniAI pipeline remain outstanding.


### Corrective activation follow-up

The [gated jacket copy](rigged-jacket-gated-study/README.md) preserves all 291 checked review samples and removes the early lowering regression by fading the correctives outside their calibrated motions. The original lowering now matches the zero-corrective control: first failure at frame 26, with full lowering still failing. The body, shirt, rest skeleton, jacket shapes and previous source files remain unchanged. This is a driver correction; shoulder/armhole fit, finished tailoring and general motion remain open.


## Full-lowering corrective follow-up — 2026-09-06

The new [rigged jacket lowering study](rigged-jacket-lowering-study/README.md) adds two finite native pose keys to the preserved gated male jacket. The reopened model passes all 61 original lowering samples, all 291 existing review samples with exact old-key parity, and two independent-arm endpoint controls. The 61 lowering samples also pass midsurface, body containment, shirt-layer order and thickness-orientation guards. The source body, shirt, rest skeleton, weights, topology, original twelve corrective keys and action contents remain unchanged. The new editable model is `rigged-jacket-lowering-study/male-rigged-jacket-lowering.blend`; its exact audit and retained authoring inputs are beside it. This resolves the original lowering failure documented in the preceding study. General motion, reference appearance, tailoring and runtime export remain unaccepted.


## Open-front tailoring follow-up — 2026-09-06

The new [jacket tailoring study](rigged-jacket-tailoring-study/README.md) adds an open front, a fitted standing collar and pearl/black/gold trim to the preserved lowering rig. Its 2,671-vertex, 5,088-triangle jacket retains 14 native corrective keys and live 1 mm Solidify. The exact saved model passes all 354 sampled configurations: 61 lowering, 291 review and two independent-arm controls, with zero strict self/body/shirt crossings and zero containment, layer-order or thickness-orientation flags. Retained source key coordinates and all driver/action data are preserved; original retained weights differ by at most 2.98e-8 from float normalization. The collar preserves its immediate open-front input exactly. All 37 earlier model binaries remain unchanged. Five portable build/style/audit/render scripts, exact geometry reproduction checks, input mappings and five review views accompany the new model. Bomber sleeve volume, folds, embroidery, pockets, hardware, likeness and runtime export remain unfinished.


## Bomber sleeve volume checkpoint

`rigged-jacket-sleeves-study/male-rigged-jacket-sleeves.blend` continues the open-front tailoring study with fuller outer sleeves and subtle broad oblique folds. It offsets 358 vertices while preserving all shape coordinates on the other 2,313; topology, weights, 14 native corrective keys, original materials and the body/shirt/rig/actions remain preserved. The same bind offset is added to all fifteen shape blocks, with at most 5.96e-8 m relative-key float residual. Maximum authored T displacement is 13.798 mm. The inner sleeve channel and front elbow crease taper to the passing source shape after two rejected contact controls.

The exact new binary passes the established 354 finite checks (61 lowering, 291 gesture, two independent-arm endpoints), with all strict-crossing, containment, layering and thickness-orientation guards clear. A portable rebuild reproduces geometry, skin, keys, checked metadata/attributes and native T/down output exactly. The study README, provenance, two rejected quick controls, full audit, reproduction check and five rendered views are retained beside the model. All 38 preceding model binaries remain unchanged.

This is a sleeve-volume milestone. Detailed satin wrinkles, smoother silhouette topology, collar refinement, embroidery/pockets/hardware, full reference likeness and runtime export remain unfinished. Continuous motion, coplanar contact, positive minimum clearance and general animations remain unvalidated. The working body05/runtime candidate is unchanged.


## Refined standing-collar checkpoint

`rigged-jacket-collar-refinement-study/male-rigged-jacket-collar-refined.blend` replaces the collar rim's inherited arm/shoulder flare with a chest/neck blend on its 123 existing ring vertices. The original 2,548 vertices, sewn seam, body panels, sleeves and cuffs preserve exact weights and all shape coordinates. The rim uses 25% spine_03 /75% neck_01, with the influence blend and relative-key attenuation fading down the middle/quarter rings. The same topology, 14 corrective drivers, body/shirt, skeleton, actions, modifiers and shader attributes remain. Default lowered rim width improves from 217.6 to 183.7 mm, and maximum adjacent Z second difference from 3.797 to 0.869 mm.

The exact binary passes all 354 established samples (61 lowering,291 gestures, two independent-arm endpoints) with all native strict-crossing, containment, layering and thickness guards clear. A fresh rebuild reproduces geometry/skin/keys/attributes/checked metadata and native T/down output exactly. Seven review images and the associated reports are retained beside the model; all 39 preceding model binaries are preserved.

An added eight-control neck probe identifies an explicit unfinished boundary: all four lowered controls and one T control pass; three T controls retain 4/4/12 original shirt-seam pairs versus 4/4/16 in the source. There are no introduced crossing pairs. General neck motion remains unaccepted, as do continuous/coplanar/positive-clearance guarantees and runtime export. Detailed satin wrinkles, smoother silhouette topology, pockets/embroidery/hardware and full reference likeness remain unfinished. The working body05/runtime candidate remains unchanged.


## Neck-seam clearance checkpoint

The new `rigged-jacket-neck-seam-study/male-rigged-jacket-neck-seam.blend` clears the three inherited 4/4/12-pair shirt-contact cases at the refined collar. The exact file passes all 354 established arm-motion samples, all eight neck endpoint controls and the 36-sample single-axis neck sweep. The neck scopes overlap; combined-axis/general neck motion, continuous/coplanar/positive-clearance guarantees and runtime export remain unvalidated.

The correction offsets 44 sewn-surface vertices by 0.15–0.35 mm in the authored T pose, using one coherent translation at the tiny front collar junction. All other 2,627 vertices preserve exact shape coordinates. Topology, weights, relative corrective shapes within 7.451e-9 m float residual, driver behavior, body/shirt/rig/actions and shader attributes are preserved. The full audit, paired source controls, intermediate sweep, rejected controls, exact rebuild check, provenance and five renders accompany the model. All 40 preceding model binaries remain unchanged.

This resolves the finite neck-seam boundary documented in the prior checkpoint. Body-panel tailoring, satin folds, pockets/embroidery/hardware, full male/female likeness and remaining outfits, broader animation coverage, runtime export and in-game/device validation remain unfinished. Estimated overall effort completion for both game-ready avatars is roughly 25%, a planning estimate rather than a measured acceptance score.


## Jacket front-panel shape checkpoint

The new `rigged-jacket-chest-study/male-rigged-jacket-chest.blend` removes the body-derived nipple relief and gives the chest and waist smoother hanging front panels. A curved surface is fitted in the actual lowered pose, with transitions before the neck, hem and side/armhole regions. Local tangential relaxation separates inherited overlapping XZ triangle footprints before flattening their depth. The initial depth-only candidate failed 14 self-crossings and is retained as a rejected control. Maximum forward displacement is 45.175 mm; local tangential displacement is at most 5.665 mm.

The delivered model passes all 354 established arm-motion samples and all 36 finite single-axis neck samples, with every existing strict-crossing, containment, layer-order and thickness-orientation guard clear. Topology, weights, driver behavior, body/shirt/rig/actions and shader attributes remain exact. The same bind offset is added to all fifteen shape blocks; 624 vertices move by more than 1 nm, two taper endpoints have smaller computed offsets, and 2,047 vertices (including those taper endpoints) preserve exact stored shape coordinates. A fresh build reproduces mesh/keys/skin/checked metadata and native T/down output exactly. Five renders, provenance, source diagnostics, the rejected control, full audits and reproduction evidence accompany the model. All 41 preceding model binaries remain unchanged.

This establishes smoother front-panel massing. Satin folds, pockets/embroidery/hardware, complete male/female likeness and outfits, broader animation coverage, runtime export and in-game/device testing remain unfinished. The existing body05/runtime candidate is unchanged. Finite samples do not certify arbitrary/combined motion, continuous clearance, coplanar contact or a positive clearance margin.


## Jacket satin folds and finish checkpoint

`rigged-jacket-satin-study/male-rigged-jacket-satin.blend` adds three broad front-panel fold fans and outer-sleeve compression, followed by a jacket-only satin material refinement. The front folds preserve a flat 10 mm strip beside the zipper; the outer sleeve field preserves the inner arm channel and elbow/cuff transitions. Maximum authored T displacement is 5.998 mm. The same bind offset is added to all fifteen shape blocks, preserving topology, weights and native driver behavior. Fine normal detail uses the existing TailorRest attribute; the material adds no geometric displacement.

All 354 established arm-motion samples pass on the geometry intermediate. An exact geometry/skin/shape/deformation-metadata preservation bridge links it to the final styled binary; all 36 finite neck controls pass directly on that final file. Every existing strict-crossing, containment, layer-order and thickness-orientation guard remains clear. The final minimum offset-orientation/area ratio is restored to 0.4130 after a superseded passing candidate compressed a tiny zipper-adjacent triangle to 0.1166. A fresh two-step rebuild reproduces geometry, skin, keys, checked materials/metadata/attributes, native T/down output and provenance arrays exactly. Seven review views, source sampling diagnostics, the earlier control, full motion/neck reports and the shading bridge accompany the model. All 42 preceding model binaries remain unchanged.

This is an initial folds-and-finish milestone. Pockets, embroidery, hardware, more detailed reference tailoring, complete male/female likeness and outfits, broader animation coverage and runtime/device validation remain unfinished. The jacket has no UV layers and its procedural material still needs an export/baking strategy for Babylon. The working body05/runtime candidate remains unchanged; finite samples do not certify arbitrary/combined motion, continuous/coplanar contact or positive minimum clearance.


## Jacket pocket and hardware checkpoint

`rigged-jacket-hardware-study/male-rigged-jacket-hardware.blend` adds two closed hip zipper faces, a closed left sleeve utility zipper face, and four hollow gold pull tabs. Seven new meshes use the original armature and matching corrective values, with four normalized influences per vertex at most. Each tooth and pull has a shared support anchor; dense panel sampling and outward projection resolve the first candidate's faceted-normal intersections. The original jacket, body, shirt, skeleton, actions, shaders and corrective geometry are preserved exactly.

The exact new binary passes 354 established arm samples and 36 finite neck controls. New hardware has zero unintended strict crossings with the jacket/body/shirt, within components or between objects; tooth-to-nearby-panel and pull-to-own-slider mating are explicitly allowed. Source geometry/deformation preservation carries the existing coat checks forward. A fresh build reproduces all geometry/skin/keys/checked metadata, smoothing, native T/down results and provenance exactly. Nine rendered views, the failed-fit control, full audit and measured attachment/metal-strain summaries accompany the model. All 43 preceding model binaries remain unchanged.

These are closed decorative zipper fronts, without working pocket openings or zipper animation. Hardware adds 20,276 authoring triangles and still needs runtime/LOD review. Hip weight truncation reaches 4.391%; walking and leg motion are untested. Embroidery, full male/female likeness and outfits, broader animation, UV/material baking, corrective export and in-game/device validation remain unfinished. Finite scopes overlap and do not certify arbitrary/combined motion, continuous or coplanar contact, physical cloth response or positive minimum clearance. The body05/runtime candidate remains unchanged.


## Right-sleeve embroidery checkpoint

`rigged-jacket-embroidery-study/male-rigged-jacket-embroidered.blend` adds an authored gold filigree interpretation of the reference's visible right-sleeve linework. A packed 2048² atlas supplies color coverage and thread normal relief through a sleeve-specific UV; the finish adds no geometry. The first thin-line style was strengthened for visibility at the review distance. The pattern is an authored interpretation of a foreshortened reference, not an exact recovered design.

The independent preservation bridge verifies every existing mesh/skin/shape and shape metadata, rig/action/driver/transform, original attribute and non-jacket material. Only the jacket material, JacketEmbroideryUV and TailorEmbroidery face mask change; material displacement is absent. It validates the preceding hardware audit's SHA and source-model match, carrying forward its accepted 354 arm and 36 neck samples through unchanged geometry. Those scopes overlap; no redundant full collision run is claimed. The named packed atlas and actual-T cylindrical UV contract pass, and wrong-image-hash/wrong-UV controls fail as intended.

A fresh build reproduces all checked geometry/skin/keys/UV/material/rig metadata, packed image bytes and native coat/hardware T/down output exactly. Eight review views, the initial faint-style control, interpretation notes, bridge audit and rebuild evidence accompany the model. All 44 preceding model binaries are unchanged. Complete male/female likeness, hair, remaining clothing/accessories, closer reference tailoring, broad animation, full UV/material baking and runtime export/device testing remain unfinished. This local UV layer does not constitute a full garment unwrap. The body05/runtime candidate remains unchanged.


## Shirt detail checkpoint

`rigged-shirt-detail-study/male-rigged-shirt-detailed.blend` adds a center placket extending to the measured hem, two pointed collar overlays and four dark buttons with gold rims. Seven closed meshes add 3,618 vertices and 7,208 triangles, using the original shirt's skinning with four normalized influences at most. All original mesh/skin/shape/rig/action/material/embroidery data remain exact. The independent auditor reconstructs the transferred weights from original shirt triangles; maximum top-four weight truncation is 0.65291%.

The exact saved model passes 354 established arm samples and 36 single-axis neck samples with zero strict crossings involving the new details: shirt/body/coat/hardware, self and inter-detail. There are no mating exceptions for the shirt details. The original accepted coat/hardware scope carries forward through unchanged source geometry and a verified embroidery-audit bridge. A fresh build reproduces checked static data, packed images, all 26 evaluated meshes in native T/down and all 35 provenance arrays exactly. Eight reviewed views, the rejected fit control, source surface probes, full audit and reproduction evidence accompany the model. All 45 preceding model binaries remain unchanged.

The collar flaps are an initial tailoring pass; their visible upper ends still need a continuous neck band. Button holes are shader wells. Maximum collar edge strain is 23.421% and unsigned distance to the open shirt reaches 12.704 mm; these are reported metrics without physical acceptance thresholds. The finite scopes overlap and do not certify arbitrary/combined motion, continuous/coplanar contact, positive clearance or locomotion. Full likeness/outfits, closer reference tailoring, material baking, corrective export and runtime/device tests remain unfinished. The body05/runtime candidate remains unchanged.


## Connected shirt-neckband checkpoint

`rigged-shirt-neckband-study/male-rigged-shirt-neckband.blend` joins both pointed collar flaps into one closed collar mesh with a band around the neck. All 1,152 original flap vertices preserve exact coordinates, weights and attributes; sixteen upper cap triangles per flap are replaced by shared-vertex connections. The resulting mesh has 9,054 vertices and 18,104 triangles, adding 7,902 vertices and a net 15,808 authoring triangles. The band's rear lower edge is fitted 0.5 mm above the measured shirt rim in the authored T pose; it remains a separate fitted layer rather than a sewn shirt seam. Every other mesh, rig/action, skin/shape, material and packed image remains exact.

The exact final binary passes all 354 established arm samples and 36 single-axis neck samples with zero strict collar crossings involving body, shirt, coat, hardware, remaining shirt details or itself. No collar mating exceptions are used. An independent auditor verifies the preserved flap surfaces, one consistently wound closed component and the reconstructed body/shirt anchor weights, including localized smoothing. A fresh rebuild matches static data, raw topology/edge indices, packed images, all 25 meshes in native T/down and all 13 provenance arrays exactly. Explicit sorted edges resolve Blender's thread-dependent edge indexing. Nine reviewed views, development controls, provenance and full audit/reproduction evidence accompany the model. All 46 preceding model binaries remain unchanged.

Physical cloth acceptance remains open: maximum edge strain is 69.384% in overhead review. A localized neck-control transition improved from 133.919% to 40.857%, but neither value is a passed physical threshold. Body/shirt-derived head influence is merged into the neck for the tested scope; independent head motion is untested. These overlapping finite scopes do not certify arbitrary/combined motion, continuous/coplanar contact, positive clearance or locomotion. Sewing the collar into a refined shirt pattern, full reference likeness/outfits, material baking and runtime/device validation remain unfinished. The body05/runtime candidate is unchanged.


## Collar deformation checkpoint

`rigged-collar-deformation-study/male-rigged-collar-deformation.blend` reduces maximum sampled collar edge strain from 69.384% to 53.807%, a 22.45% relative reduction. The band interior blends toward weights interpolated along measured cross-section arcs, while both rim rows retain their original skin. Compensating bind coordinates preserve the source T shape within 0.2384 micrometers. Exactly 5,306 band vertices change; all other 3,748 collar vertices remain exact, including the 1,152 original flap vertices and 1,756 rim vertices. Topology, raw edge indices, smoothing, attributes, materials, all other meshes and rig/action/corrective data are preserved.

The exact saved model passes 354 established arm samples and 36 single-axis neck samples with zero strict collar crossings against body, shirt, coat, hardware, remaining shirt details or itself. An independent audit reconstructs the arc fractions and weights from the source, checks exact rim preservation and verifies the preceding accepted audit bridge. A fresh rebuild matches all checked static data, packed images, all 25 meshes in native T/down and all seven provenance arrays exactly. Nine reviewed views, motion comparisons and a rejected lower-rim contact trial accompany the model. All 47 preceding model binaries are unchanged.

Substantial strain remains; this is a deformation improvement, with physical cloth behavior still unaccepted. Sewing the band into a refined shirt pattern, independent head motion, broader/combined animation, full likeness/outfits, material baking and runtime/device tests remain unfinished. These overlapping finite samples do not certify continuous/coplanar contact or positive minimum clearance. The body05/runtime candidate remains unchanged.


## Collar pose-correction checkpoint

`rigged-collar-corrective-study/male-rigged-collar-correctives.blend` adds four collar shape keys driven by the existing left/right overhead and forward controls. Maximum sampled source-relative edge strain falls from 53.807% to 39.316%, a 26.93% relative reduction. The largest target-pose displacement is 1.252 mm. Raw collar basis, skin weights, topology, attributes, materials and all other source data remain exact; all original flap vertices remain exact in every key. Native T/down output is unchanged.

The saved model passes 354 established arm samples, 36 single-axis neck samples and 16 additional unilateral reach samples with zero strict collar crossings against body, shirt, coat, hardware, other details or itself. The auditor reconstructs all four exact key arrays from source pose matrices and retained fit inputs, verifies driver ownership and checks the preceding accepted source audit. A fresh build reproduces checked static data, packed images, all 25 native T/down meshes and all five provenance arrays exactly. Four target-pose renders were reviewed. All 48 preceding model binaries are unchanged. This pass used Astra alone.

These overlapping finite checks do not establish physical cloth acceptance, arbitrary/combined movement, continuous/coplanar collision or positive clearance. The open shirt pattern and separate collar-to-shirt gap remain visible with the jacket hidden; sewing, independent head motion, full avatar likeness/outfits, baking and runtime export remain unfinished. The runtime candidate is unchanged.
