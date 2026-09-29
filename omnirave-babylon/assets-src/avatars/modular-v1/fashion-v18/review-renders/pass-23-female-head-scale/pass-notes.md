# Pass 23 — female head scale

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female head uniform local scale only.
- Baseline: inherited shared head scale `[0.95, 0.95, 0.95]`.
- Candidate retained: female override `[0.98, 0.98, 0.98]`.
- Held fixed: neck, shoulders, torso, pelvis, arms, legs, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the head-to-body ratio moves closer to the approved female reference while preserving the elongated fashion silhouette and retained neck correction.
- Three-quarter result: cranial volume remains coherent with no flattening, neck gap, or jaw-profile discontinuity.
- Clothed result: hair and earrings follow the uniform scale without detachment, asymmetry, or garment interference.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0198391951`; left -35-degree area ratio `1.0134946092`; collapse threshold `0.15`.
- Decision: retain. The conservative uniform increase corrects the undersized-head read without changing facial structure or any body proportion.
