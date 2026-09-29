# Pass 25 — female upper-thigh width

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: mirrored female thigh local X scale only.
- Baseline: left/right `[0.91, 1.04, 0.89]`.
- Candidate retained: left/right `[0.89, 1.04, 0.89]`.
- Held fixed: thigh Y/Z, calves, pelvis, torso, head, neck, shoulders, arms, every male scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the frontal upper-thigh spread is slightly narrower, producing a smoother athletic transition from the retained pelvis into the legs.
- Three-quarter result: thigh depth and the hip-to-knee profile remain stable; no flattening, bowing, or left/right drift is visible.
- Clothed result: the fitted shorts remain attached and symmetric with no visible gap, clipping, or waistband displacement.
- Tier-1 result: passed; silhouette IoU `1.0`, aspect-ratio delta `0.0`, scale delta `0.0`, bilateral-symmetry error `0.0187`.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0152236100`; left -35-degree area ratio `1.0049565242`; collapse threshold `0.15`.
- Visual review: the change is deliberately subtle but localized to the identified mismatch. The candidate improves the front-view thigh rhythm while preserving the accepted side volume and wardrobe fit.
- Decision: retain. The X-only correction moves the model toward the approved reference without changing leg length or depth.
