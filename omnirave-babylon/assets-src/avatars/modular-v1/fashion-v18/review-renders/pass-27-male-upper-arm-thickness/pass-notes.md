# Pass 27 — male upper-arm thickness

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: mirrored male upper-arm cross-section, changing local X and Z together as one radial-thickness variable.
- Baseline: left/right `[0.95, 1.02, 0.95]`.
- Candidate retained: left/right `[0.98, 1.02, 0.98]`.
- Held fixed: upper-arm Y length, forearms, hands, clavicles, torso, pelvis, legs, every female scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the shoulder-to-elbow transition is fuller and less pinched while retaining the approved reference's lean build.
- Three-quarter result: upper-arm volume remains rounded and continuous with no flattening, shoulder separation, or elbow displacement.
- Clothed result: sleeve/arm junctions remain attached and symmetric with no visible clipping or gap.
- Tier-1 result: passed; silhouette IoU `1.0`, aspect-ratio delta `0.0`, scale delta `0.0`, bilateral-symmetry error `0.0189`. The gate excluded `2.6%` of separated foreground cells on both baseline and candidate, so the retain decision also relies on direct front and orbit inspection.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0297245338`; left -35-degree area ratio `1.0215775110`; collapse threshold `0.15`.
- Visual review: the candidate improves upper-arm continuity without creating a bulky or muscular silhouette and preserves the accepted forearm taper.
- Decision: retain. The radial-only correction moves the male arm proportions toward the approved reference without changing length or joint placement.
