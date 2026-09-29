# Pass 14 — female lower-abdomen depth

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female `spine_01` local Z scale only.
- Baseline: `[0.88, 1.02, 0.88]`.
- Candidate retained: `[0.88, 1.02, 0.84]`.
- Held fixed: `spine_01` X/Y, every other female bone scale, all male scales, global profile scale, pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the +35-degree view shows a modest reduction in lower-abdomen projection; the front silhouette remains stable with no visible waist-width change or hollowing.
- Clothed result: the crop top, exposed midriff, and shorts remain aligned with no new gap, clipping, or silhouette regression.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0038132752`; left -35-degree area ratio `0.9802910940`; collapse threshold `0.15`.
- Decision: retain. The depth-only correction moves the visible abdomen toward the flatter athletic reference without disturbing the established frontal proportions.
