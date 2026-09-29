# Pass 29 — female hand scale

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: mirrored female hand uniform scale only.
- Baseline: inherited shared left/right `[0.90, 0.90, 0.90]`.
- Candidate retained: female override left/right `[0.94, 0.94, 0.94]`.
- Held fixed: wrists, forearms, upper arms, arm length, clavicles, torso, pelvis, legs, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: palm and finger scale is better balanced against the retained forearm taper without reading oversized.
- Three-quarter result: wrists remain continuous and both hands retain full volumetric separation with no lateral drift.
- Clothed result: sleeves remain attached at both wrists; no cuff gap or clipping is visible.
- Tier-1 result: passed; silhouette IoU `1.0`, aspect-ratio delta `0.0`, scale delta `0.0`, bilateral-symmetry error `0.0187`. The change is below the mask gate's resolution, so the retain decision also relies on direct hand inspection in the controlled views.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0152236100`; left -35-degree area ratio `1.0049565242`; collapse threshold `0.15`.
- Visual review: the candidate improves hand-to-forearm proportion while preserving wrist attachment, finger separation, and bilateral balance.
- Decision: retain. The female-only uniform correction moves visible hand size toward the approved reference without altering either arm or the male avatar.
