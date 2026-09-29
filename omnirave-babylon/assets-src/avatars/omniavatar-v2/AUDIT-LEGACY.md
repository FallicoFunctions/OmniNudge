# Legacy avatar audit (Phase 1, read-only)

Date: 2026-09-03. No legacy file was modified by this audit.

## 1. What exists

- `assets-src/avatars/body-bases/avatar.blend` (1.6 MB): procedural Skin+Subsurf
  bodies `AvatarBody_male/female`, 21-bone rigs `AvatarRig_male/female`
  (hips/spine/chest/neck/head/limbs, no fingers, no jaw, no eyes), plus a
  fully procedural male luxury-festival outfit (~200 `AvatarLuxury_male_*`
  objects: face shell, quiff locks, pearl bomber panels, black shirt, cargo
  joggers, high-top sneakers, chains, eyelets, curves for piping/necklaces).
  No female plurr outfit in this file. No actions.
- `assets-src/avatars/modular-v1/avatar-modular-v1.blend` (43 MB): MPFB 2.0.17
  canonical source. 79 objects, 39 meshes, 1 armature (56 bones, full fingers,
  eyes, jaw), 63 materials, 22 images, 3 actions. Body `AvatarBody`
  (13,380 verts, 1 UV layer, shape keys Basis/male/female, 210 vertex groups).
  This is the reusable topology + skeleton + slot system.
- `public/assets/avatars/modular-v1/avatar-base.glb` (9.6 MB, WebP): 135
  nodes, 39 meshes/42 prims, 26 materials, 19 WebP textures, 1 skin/56 joints,
  clips idle (2ch) / walk (6ch) / run (7ch). Contract `omnirave-avatar/1`.
- `avatar-base-fashion.glb` / `avatar-base-editorial.glb` (47 MB each, PNG):
  same structure, editorial has idle 4ch. Fashion-v18 audit confirms sparse
  placeholder animation (idle touches 4 bones, walk 6, run 7; no pelvis/feet/
  hands/head), A-pose bind, base-color-only PBR on most parts, 2 shoe normal
  maps, no full roughness/metallic/AO set.
- `public/assets/avatars/avatar-bodies.glb` (3.7 MB, no textures, no anims):
  procedural male/female bodies + luxury male outfit parts mushed into one
  export (275 nodes, 2 skins × 21 joints). Legacy research artifact, not a
  runtime avatar.
- `assets-src/avatars/modular-v1/fashion-v*/`, `lean-v1/`: proportion-variant
  working dirs with mesh JSONs, validation reports, review renders. Pattern so
  far is bone-scale + morph tweaks, which the task explicitly forbids as the
  route for this work.

## 2. Babylon.js integration today

- `src/player/modularAvatarContract.ts`: contract `omnirave-avatar/1`, root
  `AvatarAsset`, skeleton `AvatarSkeleton`, body `AvatarBody`, morphs
  male/female, slots hair/top/jacket/bottoms/shoes/accessories, profile URLs
  (classic/lean/fashion/editorial, default editorial).
- `src/player/createReviewAvatar.ts` (734 lines): loads the modular GLB,
  applies profile proportion scales + per-bone cross-section scales at runtime
  (e.g. male pelvis [0.72,0.99,0.78], clavicles ×1.16), toggles slot options,
  drives morph influences, plays `idle/walk/run` by speed
  (`avatarAnimationState.ts`: idle <0.15 m/s, walk <3.5, else run).
- `src/player/applyAvatarDefinition.ts`: tints PBR materials from the
  wardrobe catalog; forces opaque footwear; hides procedural fallback once an
  authored base exists.
- `src/player/createPlayerRig.ts`: 1.8 m capsule, 1.65 m eye, uniform height
  scale, crouch ×0.62. No retargeting layer — animation comes from the GLB.
- Main stage is untouched by this task. Runtime fallback stays editorial.

## 3. What can be reused vs replaced

- Reuse: the 56-bone skeleton + joint names, the slot/root naming, the
  `AvatarBody` topology family, the contract validator shape, the
  idle/walk/run state machine, the optimize-to-WebP step.
- Replace: bind pose (A→T for v2), animation content (sparse placeholders →
  real locomotion), PBR sets (base-color-only → full maps), identity (generic
  MPFB face → luxury male / plurr female likeness), outfits (starter tee/
  bomber/joggers → golden-case garments), hair (catalog wigs → quiff / magenta
  pony), feet/shoes (fitted generic → pearl high-tops / LED sneakers).
- Keep as legacy research: all existing .blend, .blend1, .glb, review renders,
  fashion/lean dirs, `generate-luxury-festival-avatar.py` (valuable as a
  construction recipe even though its output topology is fragmented and its
  forward axis is -Y).

## 4. Key risks

- Photoreal likeness from one image + inferred turnarounds needs real sculpt/
  texture work; procedural params alone cannot do it (hence this v2 plan).
- 47 MB PNG GLBs are too heavy; v2 must ship WebP runtime derivatives.
- Sparse clips + runtime bone-scale proportion passes mask fit problems; v2
  bans bone-scale-as-modeling and revalidates with a real stress set.
- No paid reconstruction services without approval; all v2 geometry is
  authored locally in Blender.
