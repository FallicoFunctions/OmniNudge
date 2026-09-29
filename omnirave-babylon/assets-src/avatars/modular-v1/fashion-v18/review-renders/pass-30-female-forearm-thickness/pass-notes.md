# Pass 30 — female forearm thickness

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: mirrored female forearm cross-section, changing local X and Z together as one radial-thickness variable.
- Baseline: left/right `[0.97, 1.02, 0.97]`.
- Candidate retained: left/right `[0.99, 1.02, 0.99]`.
- Held fixed: forearm Y length, hands, upper arms, clavicles, torso, pelvis, legs, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the elbow-to-wrist taper is slightly fuller and forms a more continuous sequence with the retained upper-arm and hand scales.
- Three-quarter result: forearm depth stays rounded with no flattening, elbow displacement, wrist break, or bilateral drift.
- Clothed result: sleeves remain attached and symmetric at both wrists with no visible gap or clipping.
- Tier-1 result: passed; silhouette IoU `1.0`, aspect-ratio delta `0.0`, scale delta `0.0`, bilateral-symmetry error `0.0187`. The localized correction is below the mask gate's resolution, so direct controlled-view inspection remains the retain authority.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0152236100`; left -35-degree area ratio `1.0049565242`; collapse threshold `0.15`.
- Visual review: the candidate improves upper-arm-to-forearm-to-hand continuity without making the arms heavy or changing joint placement.
- Decision: retain. The radial-only correction improves the visible forearm proportion while preserving length, wrist attachment, and the approved lean silhouette.
