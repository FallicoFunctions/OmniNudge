# OmniAvatar Asset Contract v2 (draft v1)

Status: draft for male luxury-festival and female plurr-warehouse golden cases.
Legacy contract `omnirave-avatar/1` stays intact. New assets use
`omnirave-avatar/2` and remain backward compatible at the skeleton/slot level
so existing `idle`/`walk`/`run` clips retarget without code forks.

## 1. Coordinate system, units, scale, origin

- Blender authoring: Z-up, meters, real-world scale.
- glTF/Babylon.js runtime: Y-up, meters (Blender glTF exporter handles Z-up to Y-up).
- Forward axis: +Y in Blender authoring (face looks toward -Y in the luxury
  authoring script convention is legacy; v2 standard is face toward +Y in
  Blender, which exports to +Z face-forward in Babylon — documented per asset
  in the manifest; the loader does not rotate characters to fix authoring).
- Final decision for v2: face toward +Y in Blender, feet at Z=0, origin at
  midpoint between feet on the ground plane.
- Reference height: 1.75 m barefoot (body-bases convention) with runtime
  uniform scale to the 71in / 1.8034m rig reference. Record per-character
  measured height in the manifest; do not bake display-height scale into the GLB.
- Transforms on export: all objects at location 0 except armature root at
  origin, rotation 0, scale 1. No negative scale. No parented scale drift.

## 2. Neutral pose

- Canonical bind pose is a strict T-pose: arms horizontal (±X), elbows
  straight, palms face down, legs straight, feet flat, head neutral, jaw closed.
- Rationale: the current modular-v1 bind is an A-pose and body-bases rigs are
  custom 21-bone rigs. A-pose breaks strict-T retarget assumptions and makes
  shoulder weight validation ambiguous. v2 binds in T-pose.
- Migration: keep joint NAMES from the 56-bone MPFB rig (see §3) so existing
  clips retarget by name with a rest-pose offset. Ship a `tpose_source` action
  in the .blend plus the gameplay clips.

## 3. Canonical skeleton

- Base: the 56-bone MPFB-derived hierarchy already in
  `avatar-modular-v1.blend` (Root, pelvis, spine_01..03, clavicle_l/r,
  upperarm, lowerarm, hand, full finger chains, neck_01, head, eye_l/r, jaw,
  thigh, calf, foot, ball). This is the v2 canonical skeleton.
- Do not rename joints. Do not insert joints between canonical joints. Extra
  accessory joints (e.g. ponytail, chain physics) are leaf children only and
  must be listed in the manifest as non-canonical.
- Required joints for deformation tests: pelvis, spine_01..03, neck_01, head,
  jaw, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, thigh_l/r,
  calf_l/r, foot_l/r, ball_l/r, eye_l/r.
- Bind pose and inverse-bind validation: every skinned primitive carries
  JOINTS_0/WEIGHTS_0; skin has exactly N joints and N inverse-bind matrices;
  per-vertex weight sums within 0.001 of 1.0; zero unweighted verts; zero
  joint indices out of range; checked by script before export.

## 4. Body topology and deformation

- One seamless skinned anatomical body mesh (`AvatarBody`) per character.
  Do not split arms/legs/torso into disconnected parts.
- Semantic regions via materials, vertex groups, and face maps — not via
  mesh splits.
- Quad-dominant, watertight-as-practical, no n-gons on export (triangulate
  only n-gons; keep quads elsewhere), no loose verts/edges, normals outward,
  no custom split normals unless documented.
- Density target: body 13–18k quads; full character ≤ 60k triangles at LOD0
  including hair/clothing/footwear. LOD1 ≤ 30k, LOD2 ≤ 12k (decimated clones,
  same skeleton, same materials, generated at export).
- Weight rules: max 4 influences per vertex on export; smooth gradients at
  shoulder/elbow/wrist/spine/hip/knee/ankle/neck/jaw; no rigid finger/toe
  blocks unless the manifest declares them stylized; validate with the
  edge-ratio pose-tear check (no edge above 2x stretch or below 0.02x
  collapse on the stress set).

## 5. UVs

- One UV map `UVMap` per mesh, 0..1, no overlaps on visible skin/clothing
  except mirrored small parts where documented. Texel density ~10 px/cm at
  2048 for body, ~8 px/cm for clothing. No lightmap UV required (Babylon PBR
  direct lighting).

## 6. PBR textures and materials

- Per material, author at minimum: baseColor, normal (OpenGL), roughness.
  Add metallic, AO, alpha, emissive only where the surface needs them.
- Do not bake studio lighting or colored rim light into albedo.
- Skin: albedo + normal + roughness + subtle AO in creases; no painted
  highlights. Clothing leather/satin: albedo + normal (weave/fold micro) +
  roughness variation; metal trim uses metallic 1.0 with roughness map.
- Transparent shell (female holographic jacket): alpha + transmission or
  alpha-blend with documented mode; keep opaque body beneath to avoid
  see-through holes.
- Emissive: only for light strips on female sneakers and small glow charms;
  each emissive material needs an emissive map, not just a flat color.
- Texture delivery: 2048px PNG in source; runtime converts to 1024px WebP via
  `npm run avatar:optimize` equivalent for v2. Power-of-two sizes.
- Material naming: `OA_<Character>_<Part>_<Surface>` e.g.
  `OA_Male_Jacket_Satin`. Mesh naming: `OA_<Character>_<Slot>_<Option>`
  e.g. `OA_Female_Jacket_HoloShell`. Slot roots keep the v1 runtime names
  (`AvatarSlot_hair`, etc.) so the existing loader finds them.

## 7. Slots and modularity

- Slots: hair, top, jacket, bottoms, shoes, accessories (same IDs as v1).
- Each slot has `none` plus at least the golden-case option. Golden options:
  male `textured-crop`-successor quiff, pearl bomber, black camp shirt,
  black-gold cargo joggers, pearl-gold high-tops, layered necklaces + hoop;
  female high pony with magenta mass, paint-splatter crop + fishnet, holo
  shell jacket, black cargo joggers with neon rigging, mismatched-sock LED
  sneakers, kandi + goggles + beads.
- Body-occlusion: skin beneath opaque clothing stays (no holes); mark
  always-hidden faces with the `occluded` face map so LOD1 can cull them.
- Face: jaw bone + minimum viseme/blink shape keys (`jawOpen`, `blink_L/R`,
  `browUp`) on the body mesh; full FACS is out of scope for v1 of the contract.

## 8. GLB export settings

- Blender glTF I/O: export skins, shape keys, actions as NLA clips
  (`idle`, `walk`, `run` minimum), Y-up, +Z forward, materials PBR,
  images embedded for source GLB then externalized+WebP for runtime.
- Scene extras: `avatarContract: omnirave-avatar/2`,
  `avatarCharacter: male-luxury-festival | female-plurr-warehouse`,
  `avatarSourceBlend`, `avatarExportDate`.
- Node names stable: `AvatarAsset` root, `AvatarSkeleton` skin,
  `AvatarBody` body, `AvatarSlot_*`, `AvatarOption_*`.

## 9. Babylon.js runtime

- Loader: `SceneLoader.ImportMeshAsync` with the v1 contract validator
  extended to accept `omnirave-avatar/2`; new characters load through a
  preview route (`?avatarPreview=male|female`) while default gameplay keeps
  the editorial GLB as fallback.
- Animation: retarget by joint name from the shared clip library; validate
  `idle/walk/run` plus the stress set (turn, jump, crouch, arms-raised,
  dance) before wiring new clips.
- Budgets: ≤ 60k tris, ≤ 30 draw calls, ≤ 100 MB texture memory, load
  < 2 s on desktop broadband, 60 fps single avatar in the review scene.
