# Pass 20 — male lower-leg length

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: mirrored male calf local Y scale only.
- Baseline: left/right `[0.96, 1.06, 0.96]`.
- Candidate retained: left/right `[0.96, 1.02, 0.96]`.
- Held fixed: calf X/Z, thighs, pelvis, torso, head, shoulders, arms, every female scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: lower-leg length is moderated, improving the leg-to-torso balance while preserving the lean editorial silhouette and natural knee placement.
- Three-quarter result: knee-to-ankle contours remain continuous with no compression, bowing, or asymmetric foot displacement.
- Clothed result: trousers and footwear remain attached at both ankles with no gaps, clipping, or sole misalignment.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0288956858`; left -35-degree area ratio `1.0213699292`; collapse threshold `0.15`.
- Decision: retain. The Y-only correction moves the male physiology toward the approved reference's less leg-dominant proportions without changing limb thickness.
