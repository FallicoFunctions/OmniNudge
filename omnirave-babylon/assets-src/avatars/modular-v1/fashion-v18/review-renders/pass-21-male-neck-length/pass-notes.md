# Pass 21 — male neck length

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: male `neck_01` local Y scale only.
- Baseline: inherited shared neck scale `[0.96, 1.05, 0.96]`.
- Candidate retained: male override `[0.96, 0.98, 0.96]`.
- Held fixed: neck X/Z, head, shoulders, torso, pelvis, arms, legs, every female scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the head sits closer to the shoulder line, correcting the elongated-neck read while retaining the established neck thickness and male head scale.
- Three-quarter result: the jaw-to-neck and neck-to-shoulder transitions remain continuous with no gap, compression fold, or forward displacement.
- Clothed result: hair and earrings follow the lowered head position correctly; the garment neckline remains centered with no clipping.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0297245338`; left -35-degree area ratio `1.0215775110`; collapse threshold `0.15`.
- Decision: retain. The Y-only correction moves the male physiology toward the approved reference's more compact neck-to-head relationship without altering thickness or facial structure.
