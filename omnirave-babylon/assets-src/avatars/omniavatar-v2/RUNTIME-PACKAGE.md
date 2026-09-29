# OmniAvatar v2 runtime packages (source vs runtime split)

Source truth: `OA_male_luxury_v1.blend` / `OA_female_plurr_v1.blend` (43 MB
each). Sources keep the FULL option catalog so any option can be fitted
later. Nothing is deleted from the sources in this pass.

Runtime v1 deliverables (current, unoptimized):
`public/assets/avatars/omniavatar-v2/male-luxury-festival-v1.glb` and
`female-plurr-warehouse-v1.glb` (46 MB each, 121,576 tris). They embed the
entire catalog and exceed the 60k LOD0 budget. This is documented, not
approved: the binary v2 tests raise an over-budget warning until the package
pass lands.

## Golden-case runtime package (planned, not yet exported)

Shared core (both characters):

- `AvatarAsset` root, `AvatarSkeleton` (56 joints), `AvatarBody`
- Face details: `AvatarEyebrows`, `AvatarEyelashes`, eye/iris/pupil meshes
- Slot roots for all six slots (empty `none` options retained)

Male `male-luxury-festival` package:

- Hair: quiff successor (new sculpt; interim: `textured-crop`)
- Top: black camp shirt (new sculpt; interim: `graphic-tee`)
- Jacket: pearl bomber with gold trim (new sculpt; interim: `bomber`)
- Bottoms: black-gold cargo joggers (new sculpt; interim: `tech-joggers`)
- Shoes: pearl-gold high-tops (new sculpt; interim: `high-tops`)
- Accessories: layered necklaces + hoop (new; interim: `gold-hoops`)

Female `female-plurr-warehouse` package:

- Hair: magenta high pony (new sculpt; interim: `high-pony` + long mass)
- Top: paint-splatter crop + fishnet (new sculpt; interim: `mesh-crop`)
- Jacket: holographic shell (new; interim: `cropped-puffer`)
- Bottoms: black neon-rigged cargo joggers (new; interim: `mesh-shorts`)
- Shoes: LED platform sneakers + mismatched socks (new; interim:
  `platform-boots`)
- Accessories: kandi stacks + goggles + beads (new; interim: `gold-hoops`)

Excluded from each runtime package: every non-listed catalog option, the
opposite body morph target values (keep both targets, ship only the active
default weight), and all review furniture.

## Optimization order (no destructive step runs before sign-off)

1. Allowlist export per character from the same source blend.
2. 1024px WebP texture derivatives (shared `avatar:optimize` pattern).
3. LOD1 (30k) / LOD2 (12k) decimated clones, same skeleton.
4. Binary budget gate flips from warning to error only after 1–3 land.
