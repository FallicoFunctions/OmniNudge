# Pass 24 — female lower-leg length

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: mirrored female calf local Y scale only.
- Baseline: left/right `[0.98, 1.06, 0.98]`.
- Candidate retained: left/right `[0.98, 1.02, 0.98]`.
- Held fixed: calf X/Z, thighs, pelvis, torso, head, neck, shoulders, arms, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: lower-leg length is moderated, improving the leg-to-torso balance while preserving the approved reference's long-legged fashion silhouette.
- Three-quarter result: knee-to-ankle contours remain continuous with no compression, bowing, or asymmetric foot displacement.
- Clothed result: socks and footwear remain attached at both ankles; shorts and upper-leg fit remain unchanged.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0152236100`; left -35-degree area ratio `1.0049565242`; collapse threshold `0.15`.
- Decision: retain. The Y-only correction improves physiological balance without changing limb thickness or the retained waist and pelvis proportions.
