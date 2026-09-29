# Pass 28 — female upper-arm thickness

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: mirrored female upper-arm cross-section, changing local X and Z together as one radial-thickness variable.
- Baseline: left/right `[0.94, 1.02, 0.94]`.
- Candidate retained: left/right `[0.97, 1.02, 0.97]`.
- Held fixed: upper-arm Y length, forearms, hands, clavicles, torso, pelvis, legs, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the shoulder-to-elbow transition is fuller and more continuous while preserving the reference's lean arm silhouette.
- Three-quarter result: upper-arm depth remains rounded and stable with no flattening, shoulder separation, or elbow displacement.
- Clothed result: sleeve/arm junctions remain attached and symmetric with no visible clipping or gap.
- Tier-1 result: passed; silhouette IoU `1.0`, aspect-ratio delta `0.0`, scale delta `0.0`, bilateral-symmetry error `0.0187`. The adjustment is below the mask gate's silhouette resolution, so the retain decision also relies on the controlled visual and orbit comparisons.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0152236100`; left -35-degree area ratio `1.0049565242`; collapse threshold `0.15`.
- Visual review: the candidate removes the pinched upper-arm read without making the arms heavy and preserves the accepted forearm taper.
- Decision: retain. The radial-only correction improves physiological continuity without changing arm length or joint placement.
