# Pass 40 — female upper-thigh width refinement

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: bilateral female `thigh_l` / `thigh_r` local X width only.
- Baseline: `[0.89, 1.04, 0.89]` per thigh.
- Candidate retained: `[0.87, 1.04, 0.89]` per thigh.
- Held fixed: thigh Y length and Z depth, head, neck, shoulders, ribcage, fully visible abdomen, pelvis, calves, arms, hands, every male scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the lateral upper-thigh flare immediately below the pelvis is reduced slightly, producing a cleaner pelvis-to-leg taper without opening an artificial thigh gap.
- Three-quarter result: front/back thigh volume and leg length remain unchanged; both hip-to-thigh transitions stay attached and symmetric.
- Clothed result: shorts remain seated at the pelvis and no new clipping, separation, or visible discontinuity appears.
- Tier-1 result: passed; silhouette IoU `0.9915`, aspect-ratio delta `0.0051`, scale delta `0.0051`, bilateral-symmetry error `0.0134`.
- Interior result: measured across `6,269` foreground cells with no warnings; normalized interior difference `0.0024272999`, confirming a localized adjustment.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0055109838`; left -35-degree area ratio `1.0096275072`; collapse threshold `0.15`.
- AI visual review: global `0.82`; pelvis-to-thigh continuity `0.86`; bilateral symmetry `0.91`; thigh-gap preservation `0.90`; depth/length preservation `0.89`; wardrobe attachment `0.88`. All reviewed critical features exceed the `0.70` continuation threshold.
- Visual review: the candidate modestly reduces the remaining upper-leg flare while preserving the already corrected pelvis and the reference-led exposed abdomen.
- Limitation: the approved reference uses loose black pants, so the exact underlying upper-thigh contour is obscured. This is a conservative silhouette inference, not proof of exact hidden anatomy.
- Decision: retain. The X-only correction improves the upper-leg taper without changing thigh depth or length, torso anatomy, pelvis width, symmetry, or clothing attachment.
