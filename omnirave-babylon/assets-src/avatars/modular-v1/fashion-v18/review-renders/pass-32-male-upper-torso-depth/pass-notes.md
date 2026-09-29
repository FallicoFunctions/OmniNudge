# Pass 32 — male upper-torso depth

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: male `spine_03` local Z depth only.
- Baseline: `[1.02, 1.00, 0.98]`.
- Candidate retained: `[1.02, 1.00, 0.92]`.
- Held fixed: upper-torso X width and Y height, lower torso, pelvis, limbs, head, neck, every female scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the front silhouette remains effectively unchanged, as intended for a depth-only correction.
- Three-quarter result: forward/back chest projection is reduced while shoulder breadth and ribcage continuity remain stable.
- Clothed result: the fitted torso shell remains attached with no new clipping or seam separation.
- Tier-1 result: passed; silhouette IoU `0.9716`, aspect-ratio delta `0.0097`, scale delta `0.0098`, bilateral-symmetry error `0.019`.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0220386050`; left -35-degree area ratio `1.0082491628`; collapse threshold `0.15`.
- Visual review: the candidate modestly flattens the upper torso and improves the male profile without narrowing the accepted chest width.
- Limitation: bone-depth scaling cannot remove the shared mesh's localized breast topology; that remaining mismatch requires geometry or morph-target reconstruction rather than another global torso scale.
- Decision: retain. The bounded depth-only correction improves the profile without harming volume, symmetry, joint placement, or clothing attachment.
