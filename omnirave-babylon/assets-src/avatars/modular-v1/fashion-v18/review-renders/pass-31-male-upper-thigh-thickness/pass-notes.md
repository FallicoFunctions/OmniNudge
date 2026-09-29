# Pass 31 — male upper-thigh thickness

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: mirrored male upper-thigh cross-section, changing local X and Z together as one radial-thickness variable.
- Baseline: left/right `[0.89, 1.04, 0.90]`.
- Candidate retained: left/right `[0.86, 1.04, 0.87]`.
- Held fixed: thigh Y length, pelvis, calves, torso, arms, hands, every female scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Evidence repair: before scoring, the standalone Three.js review harness was synchronized to all retained runtime values through Pass 30. The initially identical captures were rejected and overwritten; only the synchronized baseline/candidate set is admitted as Pass 31 evidence.
- Body-only result: the upper-leg column is modestly narrower from the hip transition toward the knee, reducing residual lower-body mass while retaining the accepted leg length.
- Three-quarter result: thigh depth decreases consistently without flattening, knee displacement, crotch separation, or bilateral drift.
- Clothed result: the pants remain attached and symmetric; the narrower underlying profile improves the lean read without creating gaps or visible clipping.
- Tier-1 result: passed; silhouette IoU `0.957`, aspect-ratio delta `0.0098`, scale delta `0.0097`, bilateral-symmetry error `0.019`. The foreground-fragment warnings concern separated extremity cells excluded from the largest-blob bounding box and do not indicate a thigh failure.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0278537136`; left -35-degree area ratio `1.0164429393`; collapse threshold `0.15`.
- Visual review: the candidate improves the shoulder-led, lean male proportion while preserving continuous hip-to-knee anatomy and stable clothing placement.
- Decision: retain. The radial-only correction reduces excess upper-thigh mass without changing length, joint placement, or the approved rigged GLB.
