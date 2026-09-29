# Pass 17 — female shoulder width

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: mirrored female clavicle local X scale only.
- Baseline: left/right `[1.04, 1.00, 1.04]`.
- Candidate retained: left/right `[1.08, 1.00, 1.04]`.
- Held fixed: clavicle Y/Z, upper-chest width and depth, arms, abdomen, pelvis, legs, all male scales, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the shoulder line gains a modest amount of width, improving its balance with the retained narrow waist and corrected pelvis without broadening the ribcage.
- Three-quarter result: the shoulder and arm-root transitions remain smooth with no forward/backward distortion.
- Clothed result: the long-sleeve top remains symmetric, attached, and free of new gaps or clipping across the shoulder line.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0215100904`; left -35-degree area ratio `1.0120207606`; collapse threshold `0.15`.
- Decision: retain. The width-only adjustment better matches the visible shoulder-to-waist balance in the single approved reference while preserving the feminine torso contour.
