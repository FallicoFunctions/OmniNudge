# T-pose rebind plan (NOT executed — prerequisites only)

Status: blocked until the checklist below is fully green. No rest-pose edit
has been made to any blend.

## Before-data (done, this checkpoint)

- `backups/OA_male_luxury_v1-pre-morph.blend` and
  `backups/OA_female_plurr_v1-pre-morph.blend`: byte copies before morph work.
- `OA_male_luxury_v1.rest-pose.json` / `OA_female_plurr_v1.rest-pose.json`:
  all 56 bone heads, tails, rest quaternions, rest locations, and parents.
  Both files share identical bone names and order (asserted in
  `omniAvatarV2Assets.test.ts`).
- Skin-weight validity proven on current exports: 79,728 weighted verts,
  sums within [0.99999985, 1.00000013], zero out-of-tolerance verts
  (asserted in `omniAvatarV2Assets.test.ts`).

## Exact operation (to run, in this order, on COPIES first)

1. Duplicate the v2 blend to `OA_<character>_tpose_work.blend`.
2. In Pose Mode, rotate `upperarm_l/r` (and `clavicle_l/r` if needed) so the
   arm chain lies horizontal (±X), elbows straight, palms down; straighten
   `thigh/calf/foot` to vertical, feet flat; head neutral, jaw closed.
3. `Pose → Apply → Apply Pose as Rest Pose`.
4. Fix bone roll (`Recalculate Roll → Global +Z`) on arms and legs; verify
   finger chains inherit sane roll.
5. Re-export to a `-tpose` GLB derivative; keep node names, skin indices,
   morph targets, slot roots, and materials identical.
6. Re-run the weight audit: zero unweighted verts, sums within ±0.001,
   max 4 influences, edge-ratio tear check on the stress set.

## After-data (required before acceptance)

- New `*.rest-pose.json` for the T-pose work blend.
- Before/after rest-quaternion diff per bone (explicit table, not a summary).
- Weight audit report delta (before vs after sums).

## Animation retarget proof (required before gameplay wiring)

- Existing `idle/walk/run` clips were authored against the A-pose rest.
- Retarget rule: per joint, `q_anim_tpose = q_rest_offset × q_anim_apose`
  where `q_rest_offset = q_rest_tpose × inverse(q_rest_apose)`, computed from
  the two recorded rest-pose JSONs — never hand-tuned per clip.
- Proof artifact: three retargeted clips playing on the T-pose derivative
  with the deformation stress set green, plus the quaternion table above.
- Blocker: no shared locomotion library exists beyond the sparse
  placeholders, so retarget quality cannot exceed placeholder quality until
  locomotion is re-authored. The rebind must therefore land together with
  (or after) real locomotion, not before it.
