# Pass 26 — female pelvis-width refinement

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female pelvis local X scale only.
- Baseline: `[0.80, 0.99, 0.78]`.
- Candidate retained: `[0.78, 0.99, 0.78]`.
- Held fixed: pelvis Y/Z, thighs, calves, torso, head, neck, shoulders, arms, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the iliac/hip shelf is slightly narrower, improving the athletic waist-to-hip transition while preserving the accepted curve.
- Three-quarter result: posterior depth and the hip-to-thigh profile remain stable with no flattening or lateral drift.
- Clothed result: the fitted shorts remain attached and symmetric with no visible gap, clipping, or waistband displacement.
- Tier-1 result: passed; silhouette IoU `1.0`, aspect-ratio delta `0.0`, scale delta `0.0`, bilateral-symmetry error `0.0187`. The mask-level score is unchanged because the adjustment is smaller than that gate's silhouette resolution; the retain decision therefore relies on the controlled visual comparison plus orbit and clothing checks.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0152236100`; left -35-degree area ratio `1.0049565242`; collapse threshold `0.15`.
- Visual review: the candidate improves the front-view waist-to-hip rhythm while preserving side volume, bilateral balance, and wardrobe fit.
- Decision: retain. The X-only refinement moves the pelvis closer to the approved reference without changing depth, height, or the already retained thigh proportions.
