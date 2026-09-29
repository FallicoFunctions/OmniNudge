# OmniAvatar v2 build log

## Pass 0 — repo + GLB inspection (2026-09-03)

- Tools: Blender 5.1.2, MPFB 2.0.17 (toolchain present), Node 24 + glTF-Transform,
  Babylon.js 8.1.0, vitest.
- Actions: read-only audit of body-bases blend, modular-v1 blend, all public
  GLBs, avatarDefinition/createReviewAvatar/applyAvatarDefinition/playerRig,
  authoritative PNGs + turnaround sheets, fashion-v18 integrity audit.
- Findings: see AUDIT-LEGACY.md. No files changed.
- Time: ~40 min inspection + image review.

## Pass 1 — contract + workspace (2026-09-03)

- Created `assets-src/avatars/omniavatar-v2/` (contract, audit, this log,
  pipeline design, textures/, review-captures/) and
  `public/assets/avatars/omniavatar-v2/` (runtime output, empty).
- Wrote CONTRACT.md (`omnirave-avatar/2`, T-pose, 56-bone canonical skeleton,
  seamless body, slot naming, PBR minima, budgets, Babylon preview route).
- Legacy files untouched.

## Pass 2 — canonical foundation duplicates (next)

- Copy `avatar-modular-v1.blend` → `OA_male_luxury_v1.blend` and
  `OA_female_plurr_v1.blend` inside omniavatar-v2/. Never edit the original.
- Stamp scene extras (contract v2, character id, source, date).
- Rebind to T-pose via a documented armature operation; keep joint names.
- Record vertex/bone/morph counts before/after.

## Pass 2 — canonical foundation duplicates (2026-09-03)

- Copied `modular-v1/avatar-modular-v1.blend` (43 MB) to
  `omniavatar-v2/OA_male_luxury_v1.blend` and `OA_female_plurr_v1.blend`.
- Stamped scene custom props: contract `omnirave-avatar/2`, character id,
  source blend, date. Original blend untouched.
- Blender 5.1.2 background runs OK. Time ~2 min.

## Pass 3 — first versioned GLB export (2026-09-03)

- Exported both blends via Blender glTF I/O (skins, morphs, animations,
  materials) to `public/assets/avatars/omniavatar-v2/male-luxury-festival-v1.glb`
  and `female-plurr-warehouse-v1.glb` (46 MB each, PNG textures).
- Stamped glTF scene extras with gltf-transform (contract v2, character,
  source, pass id). Verified: 135 nodes, 39 meshes, 27 materials, 20
  textures, 1 skin / 56 joints, clips idle/run/walk, body morphs male+female.
- Wrote `OA_male_luxury_v1.manifest.json` + female manifest: ~121.6k tris
  each — OVER the 60k LOD0 budget. Expected at foundation stage (full option
  catalog embedded, PNG textures). Optimization + LOD pass is scheduled and
  has not run yet.
- Failure noted: first render attempt used engine id `BLENDER_EEVEE_NEXT`,
  absent in Blender 5.1. Fixed to `BLENDER_EEVEE`. No asset harm.

## Pass 4 — Babylon preview route (2026-09-03)

- `modularAvatarContract.ts`: added `OMNIAVATAR_CONTRACT_VERSION_V2`,
  male/female v1 URLs; validator accepts v1 or v2. Default profile still
  editorial; gameplay fallback unchanged.
- `createReviewAvatar.ts`: new `previewMaleV2/previewFemaleV2` options that
  load the v2 GLB on the identity `classic` path (no runtime bone scales).
- `createMainStageScene.ts`: localhost-only `?avatarMaleV2=1` /
  `?avatarFemaleV2=1` flags, wired to colorway + review lighting. Main stage
  design untouched.
- `createRuntime.ts`: v2 flags join `avatarPreviewMode` for review framing.
- Tests: contract (5), asset (4), review avatar (2) pass. `tsc --noEmit` clean.

## Pass 5 — foundation review captures (2026-09-03)

- Rendered EEVEE front views of both v2 blends to `review-captures/`
  (male-v1-front.png, female-v1-front.png, 1024px, 457 KB each).
- Result: both show the unmodified canonical base (same viewport state in
  both copies). They do NOT yet resemble the references. Likeness sculpt,
  wardrobe, hair, and PBR passes are pending and listed in PIPELINE-DESIGN.md.

## Pass 6 — correction checkpoint (2026-09-03, ten findings)

Backups: `backups/OA_*_v1-pre-morph.blend` before any morph edit. Legacy
`modular-v1/*`, `body-bases/*`, `review-rig/*`, and all public v1 GLBs
untouched. Root `.gitignore` already ignores `*.blend1`; the two OA
`.blend1` files from this work were deleted.

1. Distinct foundations: male blend sets male=1.0/female=0.0 on all 39
   meshes (78 values); female blend the reverse. glTF default weights now
   read [1,0] vs [0,1]. Rest-pose JSONs (56 bones each, identical order)
   recorded BEFORE any pose edit for the future rebind diff.
2. Explicit preview defs: `MALE_V2_PREVIEW_DEFINITION` (male/starter kit)
   and `FEMALE_V2_PREVIEW_DEFINITION` (female/authored female options) in
   `avatarDefinition.ts`, wired in `createMainStageScene.ts` and
   `createRuntime.ts`. v2 loads on the identity `classic` path: zero runtime
   bone scales.
3. Feet at ground: `computeGroundOffsetMeters()` (pure, tested) plus a
   measured loader offset from live bounding boxes. Male +0.0244 m, female
   +0.0210 m at runtime (manifest basis +0.0221 m; morphs shift soles a few
   mm, which is why the value is measured, not hard-coded). No profile magic
   numbers on the v2 path; the legacy +1.10 lift is untouched.
4. Real contract metadata: `resolveAvatarContractMetadata()` — stamped
   extras win (`imported`); the two known v2 files resolve explicitly
   (`known-v2-asset`); known v1 URLs flag `assumed-v1-legacy`; anything else
   without extras throws. Root metadata now reports contract, source,
   character, ground offset, and measured min-Y. Finding: Babylon's import
   path does NOT surface glTF scene extras (proven via console), hence the
   explicit allowlist; binary tests still verify the stamped bytes.
5. Split validation: `validateOmniAvatarV2Asset()` gates contract, character,
   56 canonical joints, one seamless body, morphs, default weights, UVs,
   materials/textures, weight sums, idle/walk/run. Budget and A-pose bind
   are warnings. v1 validator unchanged and still accepts v1.
6. Direct v2 tests: `omniAvatarV2Assets.test.ts` (7 tests) opens both GLBs:
   strict gate passes with 2 warnings each; identities and weights differ;
   both morphs displace ~14.5k verts by centimeters; manifest grounding math
   asserts soles within 0.1 mm of zero; rest-pose JSONs share all 56 names.
   NullEngine review tests still skip GLB fetch by design; these binary
   tests plus headless-Babylon captures are the v2 integration evidence.
7. Slow queue: isolated `createReviewAvatar.test.ts` runs in ~5 s. The 70 s
   queue was the FULL suite (82 files, `fileParallelism: false`): 74.8 s
   wall time. No defect in the test itself.
8. Isolated review mode: `review.html` + `src/review/main.ts` (neutral
   #26282d stage, hemi+key with shadows, ground plane, full-body checkpoints
   front/back/profiles/three-quarters, `?character=&view=&anim=&spin=`,
   stats bar with contract/source/offset/load/tris/file, `&debugMeshes=1`
   mesh audit). Main-stage runtime kept as second path. Fixed missing
   `shadowGeneratorSceneComponent` import found during capture.
9. Source/runtime split: `RUNTIME-PACKAGE.md` lists per-character package
   membership and the allowlist→WebP→LOD order. Current 46 MB / 121,576-tri
   GLBs stay unoptimized by decision; budget gate warns.
10. Rebind gate: `REBIND-PLAN.md` with exact operation, after-data list, and
    the rest-offset retarget rule. No pose edit executed. Blocker: shared
    locomotion is still sparse placeholders, so the rebind must land with
    re-authored locomotion, not before it.

Verification: `tsc --noEmit` clean. Full suite 82 files / 1177 tests green
(74.8 s), including a one-line mock repair in `createMainStageScene.test.ts`
(pre-existing worktree breakage: the mock lacked `applyModularProfileBoneScales`,
proven green on clean HEAD before the repair).

Captures: Blender `male-v1-front.png` / `female-v1-front.png` (full body,
ground plane, visibly different morphs); Babylon `babylon-male-front.png`,
`babylon-female-front.png`, `babylon-female-back.png`,
`babylon-male-three-quarter.png` (feet on ground, stats bar burned in).

## Pass 7 — Tripo segmentation probe + muse head/material foundation (2026-09-03)

Tripo (gated order, all recorded in tripo-benchmark/male/ledger-seg-v31.json):
- Balance 420 / frozen 0. Submitted v2.0-20260430 semantic segmentation on
  e18d98ae (balanced, split-by-connectivity). Task e5efa53c succeeded in
  57 s, 40 credits. Balance now 380.
- Output seg-v31-model.glb: 14 parts (tripo_part_0..13, bare indices, no
  labels), 14 materials, 42 textures, 1,454,358 tris, no skin, no anims.
- Blender flat-color inspection: parts are garment/limb-coherent (head+hair
  merged, jacket, shirt x2, arms L/R, legs L/R, shoes L/R, chain, hands).
- STOPPED further spending: no facial/hair separation and no labels, so no
  Tripo op serves the head-first pass. Retopo/texture deferred. 40 spent,
  380 remain. Key never printed or written.

Muse build (scripts/omniavatar-v2/build_muse_head_pass.py + fix_muse_visibility.py):
- Output OA_male_luxury_v2_muse.blend (146 MB), report JSON, 4 renders.
  v1, v2_work, and Tripo GLB hashes verified unchanged after the run.
- 13 OA_MUSE_* Principled materials; skin uses SSS 0.15, specular 0.35,
  noise roughness/bump (no plastic look in renders).
- Cornea caps (149 verts each, transmission, head-weighted) over hazel
  iris/pupil discs. Macro highlight behavior still unverified at close-up.
- Strict T-pose baked on the COPY: arms 0.0 deg, elbows 0.0, palms 0.0 deg
  both sides, thumbs ~30 deg relaxed, knee 0.02 deg, 56 joint names intact,
  0 bad weight verts, deform check 1.84x/0.15x on 60-deg raise.
- Environment lesson: pose-bone matrix reads lie in background runs; all
  posing math moved to tracked DATA-level computation with DATA-level
  post-bake asserts. Parent-hide does not propagate in Blender; meshes hid
  directly (23 hid, 7 shown).
- Honest state: face is still GENERIC (no likeness sculpt), hair is a
  starter crop (no quiff/streak), no necklaces/chains/teeth/sole split.
  Not complete; foundation only.

## Measured numbers (this checkpoint)

- Male GLB 46.1 MB, 121,576 tris total; visible 50,948 (front-3/4).
  Babylon load 135–178 ms (localhost, SwiftShader).
- Female GLB 46.1 MB, 121,576 tris total; visible 45,644 (back).
  Babylon load 128–169 ms.
- Ground offsets: male +0.0244 m, female +0.0210 m.
- Weights: 79,728 verts, sums in [0.99999985, 1.00000013], 0 out of tolerance.

## Next passes (scheduled, not started)

- 6: T-pose rebind with joint-name preservation + rest-offset retarget check.
- 7: Male sculpt (face identity, quiff, pearl bomber, black shirt, cargo
  joggers, high-tops, chains) and female sculpt (face, pony, crop+fishnet,
  holo shell, cargo joggers, LED sneakers, kandi/goggles).
- 8: Full PBR sets + WebP runtime derivatives + LOD1/LOD2.
- 9: Deformation stress set + Babylon animated captures + perf numbers.

## Tripo benchmark A — male multiview reconstruction (2026-09-03)

- Uploaded the approved male front/left/back/right T-pose references once and
  ran the two user-authorized models. No female reference was uploaded.
- `P1-20260311`: 50 credits, 1m38s, 1.1 MB, 4,302 triangles. Coherent but too
  smooth and generic for the likeness/material target.
- `v3.1-20260211`: 30 credits, 2m13s, 40 MB, 1,454,358 triangles. Clearly
  stronger silhouette, face, garment folds, hair, and accessory retention.
- Both outputs contain one node, one mesh, one primitive, one material, three
  2048 JPEG maps, no skin, and no animation. Both validate with no glTF errors;
  both omit authored tangent data required by their normal maps.
- Decision: v3.1 is admitted only as a high-resolution visual/conformance
  source. It is not a production avatar and must not be decimated and rigged
  directly because that would preserve its merged plastic-shell construction.

## Tripo benchmark B — canonical male conformance workfile (2026-09-03)

- Created `OA_male_luxury_v2_work.blend` from the existing v1 canonical male;
  the v1 source and both benchmark GLBs remain unchanged.
- Imported v3.1 under `SOURCE_TripoV31_DoNotExport`, co-oriented it with the
  current canonical source's legacy -Y working frame, placed its feet at Z=0,
  and uniformly scaled the complete dressed reference to 1.75 m. The eventual
  +Y v2 axis migration remains explicit and must rotate both together.
- Marked the Tripo mesh and collection reference-only/export-disabled. It is
  outside `AvatarAsset`; the canonical 56-bone skeleton, seamless body,
  separate eye geometry, 13 hair-option meshes, and 15 wardrobe meshes remain
  authoritative.
- The GLB probe reports semantic decomposition `insufficient`; semantic parts
  cannot be truthfully recovered from the single merged drawable. No guessed
  separation and no source topology transfer was performed.
- Evidence: `OA_male_luxury_v2_work.source-report.json`. Next stage is
  landmark and silhouette conformance, followed by human-specific material
  reconstruction on the canonical parts.
