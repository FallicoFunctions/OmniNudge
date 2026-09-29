# Pass 22 — female neck length

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female `neck_01` local Y scale only.
- Baseline: inherited shared neck scale `[0.96, 1.05, 0.96]`.
- Candidate retained: female override `[0.96, 1.00, 0.96]`.
- Held fixed: neck X/Z, head, shoulders, torso, pelvis, arms, legs, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the head sits closer to the shoulders while retaining the graceful visible neck line and established thickness.
- Three-quarter result: jaw-to-neck and neck-to-shoulder contours remain continuous with no compression, gap, or profile distortion.
- Clothed result: hair, earrings, and the garment neckline remain centered and attached with no new clipping.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0222779644`; left -35-degree area ratio `1.0133497725`; collapse threshold `0.15`.
- Decision: retain. The Y-only correction moves the female physiology closer to the approved reference without altering neck thickness or the retained shoulder balance.
