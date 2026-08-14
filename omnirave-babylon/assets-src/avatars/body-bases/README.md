# Avatar Body Bases (Pass 2)

Two rigged, skinned humanoid body bases - `male` and `female` - that will
replace the procedural capsule rig in `src/player/createReviewAvatar.ts` in a
later pass. This pass only authors the asset; nothing under `src/` is wired
up yet.

## Pass 2 changes (over pass 1)

Pass 1 shipped with three owner-confirmed problems, all addressed here:

1. **Undergarment boundary bug (jagged edge + stray dark square near the
   crotch) - FIXED.** Root cause: the boundary was decided by testing each
   existing polygon's centre against a flat world-Z plane. The
   pelvis-waist-chest chain tilts a few degrees off world Z (see the small y
   offsets on `waist`/`chest`/`yoke` in `avatar_params.py`), so the
   Catmull-Clark quad rings around the hip/crotch fork are themselves tilted
   relative to true horizontal - a flat-plane test crossing those tilted
   rings at an angle produced the zigzag, and the "stray dark square" was one
   of those tilted-ring quads landing on the wrong side of the plane from its
   neighbours. Fix: `clean_undergarment_boundary` in
   `generate-avatar-bodies.py` uses `bmesh.ops.bisect_plane` to actually SPLIT
   the mesh geometry exactly on each band boundary before any material is
   assigned, so no face can straddle a boundary afterwards - the edge is a
   single clean ring by construction, not a per-face guess. The male and
   female bodies also now share the exact same face-index classification
   (computed once on the male mesh, copied across since the two meshes are
   topologically identical) instead of each independently re-testing its own
   warped geometry, so the two bodies can never end up with a different
   boundary from each other.
2. **Fingers.** The hand used to be one merged "fingers" tip (a mitten) plus
   a separate thumb. `avatar_params.py`'s joint graph now fans FOUR separate
   finger branches (`thumb`/`index`/`middle`/`ring`/`pinky`, all children of
   `palm`) instead of one - real visual finger separation, not fully
   articulated (no per-finger bones; they deform with `hand.L`/`hand.R` via
   automatic weights, and the `hand` bone's tail now lands on `middle`
   instead of the old merged tip).
3. **Feet.** The heel/ball/toe graph nodes from pass 1 already encoded an
   ankle break + heel + forefoot shape correctly - it just wasn't visible in
   the pass-1 review renders, which cut off before the feet and never got a
   side-angle close enough to show it (see the new close-up renders below).
   Pass 2 additionally splits the single "toe" tip into a `bigtoe` (fanned
   medially) and a `toes` cluster (the other four), the same fan-off-a-shared-
   parent idea as the fingers, for a hint of toe separation - the ankle/heel/
   forefoot shape itself did not need rebuilding.
4. **Face.** Was a fully featureless egg. `sculpt_face` in
   `generate-avatar-bodies.py` now pushes a brow ridge, two eye-socket dents
   and a two-stage nose bump (bridge + tip) directly into the skull-region
   vertices. This is NOT modelled as more graph nodes: a Skin-modifier spur
   tapers linearly over its whole edge length from its parent's radius, and
   skull's radius is so much bigger than a nose-sized tip that a
   nose-as-skull-spur (tried first) came out as a beak/fin spanning half the
   face, not a localised bump - see the EDGES comment in `avatar_params.py`.
   The head region also gets one extra local topological subdivision
   (`refine_head_resolution`) before sculpting - the neck-skull-crown chain
   is only 3 graph nodes, so even post-subsurf the head carries barely ~10
   vertices per ring, which is too coarse for a small sculpt brush to read as
   anything (confirmed: the first sculpt attempt at that resolution was
   completely invisible in a render).

New review-render close-ups (`{sex}-closeup-{face,hand,foot,crotch}.png`,
see `scripts/render-avatar-bodies.py`) were added specifically because the
full-body views above are too small/badly framed to judge any of this - the
full-body renders are what let items 2-4 ship looking wrong in pass 1 in the
first place.

Two smaller export-hygiene fixes landed alongside the above: the bisect and
local-subdivide passes occasionally leave a 5-sided face where a cut crosses
an existing quad at an angle, which broke the glTF exporter's tangent
calculation ("Could not calculate tangents...") - `triangulate_ngons` cleans
up just those faces (quads are left alone). Automatic bone-heat weights can
also leave an individual vertex-group weight a hair over 1.0
(1.0000001-1.0000002) from its own floating-point solve, which is harmless in
practice but makes `Mesh.validate()` (and therefore the exporter) call the
mesh invalid - `clamp_weights` clamps it. A handful of vertices right at the
new, thinner thumb tip (60-64 per body) also came back with zero weight from
bone-heat - heat diffusion pinching off on a thin, sharply-tapering
appendage - `repair_unweighted` snaps any such vertex to its nearest bone by
straight-line distance instead of raising the "would tear" error pass 1 used.

## What's here

- `avatar.blend` - source file. Owned entirely by
  `scripts/generate-avatar-bodies.py`; do not hand-edit the generated
  objects (`Avatar*`) since a regeneration will overwrite them. Hand-tuned
  material settings survive regeneration (materials are looked up by name and
  only created if missing) but geometry/armature edits do not.
- `avatar.blend1` - Blender's automatic single-slot backup, not a project
  artifact.
- `backups/` - dated snapshots made by `scripts/backup-avatar-bodies-blend.sh`
  before each destructive regeneration.
- `review-renders/` - PNGs from `scripts/render-avatar-bodies.py`: front /
  side / three-quarter full-body views, plus face/hand/foot/crotch close-ups
  (both bodies). Regenerate after any proportion change.

## Regenerating

```
scripts/backup-avatar-bodies-blend.sh          # snapshot the blend first
blender -b assets-src/avatars/body-bases/avatar.blend \
  --python scripts/generate-avatar-bodies.py -- --write
```

Or run the full pipeline (backup -> regenerate -> export GLB) in one step:

```
scripts/export-avatar-bodies.sh
```

Change proportions in `scripts/avatar_params.py` only - it is the single
source of truth for the joint graph, per-node cross-section radii, bone
list, reference height, and surfacing constants. Both bodies are built from
the SAME joint graph (identical node names/order/edges) so they come out of
the Skin + Subdivision pipeline with identical topology (vertex count, face
order); the female body is a graph-space warp of the male surface, not a
separately inflated mesh. This is deliberate: it is what lets a later
wardrobe pass fit one garment mesh to both bodies via shape keys instead of
authoring two.

Re-running the generator is idempotent: every object it owns is prefixed
`Avatar` (`AvatarBody_male`, `AvatarBody_female`, `AvatarRig_male`,
`AvatarRig_female`), and `clear_previous()` deletes those (and their orphaned
mesh/armature datablocks) before rebuilding, so running it twice in a row
produces identical vertex/face/bone counts.

## Reference height

`REFERENCE_HEIGHT = 1.75` m (`scripts/avatar_params.py`). Each body is
normalised so its bounding box is exactly this tall with the feet at z = 0
(y = 0 after the Y-up glTF export). The runtime scales each avatar from this
height (design doc sec 6.5) - do not bake a different height in here.

Proportions follow classical figure canon (7.5 heads tall) with real
anthropometric shoulder/waist/hip ratios: male biacromial:waist:hip lands
near 1.00:0.79:0.89, female near 1.00:0.72:0.95 (the ratio, not a uniform
scale, is what reads male vs. female).

## Bone list (both rigs, `AvatarRig_male` / `AvatarRig_female`)

Standard-ish humanoid names, still 21 bones each (pass 2 added a lot of
graph nodes for fingers/toes, but no new bones - those extra vertices just
deform with the existing `hand`/`toe` bone via automatic weights):

```
hips
spine
chest
neck
head
shoulder.L / shoulder.R
upperarm.L / upperarm.R
forearm.L / forearm.R
hand.L / hand.R
thigh.L / thigh.R
shin.L / shin.R
foot.L / foot.R
toe.L / toe.R
```

Skinning is Blender's bone-heat automatic weights (`ARMATURE_AUTO`), with an
envelope fallback if bone-heat ever fails to converge on a given Blender
build. `finish_body` in `generate-avatar-bodies.py` still refuses to write if
any vertex comes out unweighted, but as of pass 2 that check runs AFTER
`repair_unweighted` has had a chance to rigidly snap any bone-heat gap (seen
on the new, thinner thumb tip - see "Pass 2 changes" above) to its nearest
bone, so a completed run keeps guaranteeing full skin coverage without
falling back to the cruder envelope method just because of one thin
appendage. Weight quality (no gross tearing when posed) has been separately
verified - see the pose-tear check below.

## Material slots

- Slot 0, `AvatarSkinBase` - the tintable skin. Ships with a neutral base
  color; the runtime's 10 skin tones multiply/tint this at render time. Do
  not paint a final skin tone here.
- Slot 1, `AvatarUndergarmentBase` - a neutral undergarment (briefs on both
  bodies, plus a bra band on the female body). This is a material-only face
  assignment on the body surface itself - zero extra triangles, and it can't
  clip. No clothing/wardrobe geometry - that's a later pass.

Both materials expose `diffuse_color` in sync with the Principled BSDF's
Base Color: Blender's Workbench preview shading (used by the review
renderer) reads `Material.diffuse_color` rather than the node's Base Color
input, so keeping both set is what makes the skin tone and undergarment
actually visible in the PNG review renders instead of coming out flat grey.

## Review-render workflow

```
blender -b assets-src/avatars/body-bases/avatar.blend \
  --python scripts/render-avatar-bodies.py
```

Read-only - it never saves the blend. Writes fourteen PNGs to
`review-renders/`: the original six full-body views
(`{male,female}-{front,side,three-quarter}.png`) PLUS eight close-ups added
in pass 2 (`{male,female}-closeup-{face,hand,foot,crotch}.png`, see
`CLOSEUPS` in the script) using Blender Workbench with studio lighting and
cavity/shadow shading, so proportions AND small-scale sculpt/boundary detail
can both be judged without opening Blender. The close-ups exist because the
full-body views are what let the pass-1 crotch zigzag, mitten hands and
egg-face all ship looking wrong - they're too small, and in the foot's case
the frame cuts off before the feet entirely. Re-run after any
`avatar_params.py` change and actually look at the output, close-ups
included - the geometry math checks out correctly long before the silhouette
reads as intended.

## Exporting the runtime GLB

```
scripts/export-avatar-bodies.sh
```

Backs the blend up, regenerates both bodies, then exports
`public/assets/avatars/avatar-bodies.glb` directly via Blender's glTF
exporter (`export_skins`/`export_def_bones` on, so both armatures and their
skin bindings round-trip). This is a simpler direct export than the Main
Stage pipeline's Draco + tangent-repair passes
(`scripts/export-main-stage.sh`) - reused where it applied cleanly (the
backup step), but the Main Stage optimiser script is venue-geometry specific
and wasn't a fit for a two-object skinned-character export. Revisit Draco
compression here if avatar GLB size becomes a real budget concern; at ~9.8k
tris/body it currently isn't (file size ~1.0MB uncompressed for both bodies
together).

Pass 2 also fixed two export-time warnings that appeared once the boundary
bisect and finger/toe/face geometry were added - "Could not calculate
tangents" (n-gons left by `bisect_plane`/`subdivide_edges` - see
`triangulate_ngons`) and a "Mesh ... is not valid" warning (a handful of
bone-heat vertex-group weights landing a hair over 1.0 - see
`clamp_weights`). Both are fixed in `generate-avatar-bodies.py` itself, so a
normal `--write` run already ships clean; exporting now produces no
warnings beyond glTF's routine ">4 joint influences" notice (every skinned
glTF mesh gets this if any vertex has 5+ non-negligible bone weights - it's
the format's own 4-influence limit, not a defect here).

## Pose-tear check

Weight quality was verified by posing one arm and one leg on each rig well
past a walk-cycle range (upper arm -60 deg, forearm -70 deg, thigh 45 deg,
shin -70 deg), PLUS - new in pass 2, now that fingers/toes/face exist -
`hand.L` -35 deg (wrist bend, carries the new fingers with it) and `foot.L`
-25 deg (ankle bend, carries the new toes with it), and diffing per-edge
lengths against bind pose on the evaluated (post-armature-deform) mesh. Out
of 9960 edges per body: min edge ratio 0.16-0.20 (normal skin-crease
compression at an aggressive joint angle, same range as pass 1's 0.16-0.19),
p99 ratio ~1.2, max ratio under 2x, zero edges above a 2x stretch or below a
0.02x collapse - the signature of an actual weighting tear, which does not
appear. The new finger/toe geometry deforms rigidly with its parent bone (no
dedicated per-digit bones) and stays attached throughout - confirmed by this
edge-ratio check (it covers every edge in the mesh, fingers/toes included,
not just the main limb chain).
