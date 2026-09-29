# Pass 35 — female pelvis-width refinement

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female pelvis local X scale only.
- Baseline: `[0.78, 0.99, 0.78]`.
- Initial candidate rejected: `[0.74, 0.99, 0.78]`; visually coherent, but its automatically reframed full-body silhouette missed Tier 1 (`0.8398` IoU versus the `0.85` threshold).
- Corrected candidate retained: `[0.76, 0.99, 0.78]`.
- Held fixed: pelvis Y height and Z depth, thighs, calves, torso, head, neck, shoulders, arms, every male scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the retained upper pelvis is slightly narrower, reducing residual lateral flare while preserving the exposed abdomen-to-hip curve and continuous thigh attachment.
- Three-quarter result: posterior depth stays unchanged and rounded; the hip-to-thigh profile remains stable with no flattening, twist, or bilateral drift.
- Clothed result: the fitted shorts remain attached and symmetric with no visible gap, clipping, or waistband displacement.
- Tier-1 result: passed; silhouette IoU `0.8783`, aspect-ratio delta `0.0355`, scale delta `0.0453`, bilateral-symmetry error `0.0130`.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0064326305`; left -35-degree area ratio `1.0109902789`; collapse threshold `0.15`.
- Visual review: the corrected candidate improves the athletic waist-to-hip transition without pinching the abdomen or creating a crotch/hip seam discontinuity.
- Limitation: the remaining localized hip contour is inherited from the shared source topology and cannot be fully reshaped through a pelvis-bone width scale alone.
- Decision: retain. The X-only refinement moves the pelvis toward the approved reference while preserving depth, height, volume, bilateral balance, and wardrobe fit.
