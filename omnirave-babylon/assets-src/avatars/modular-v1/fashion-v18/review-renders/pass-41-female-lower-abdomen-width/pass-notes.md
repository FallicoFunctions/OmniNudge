# Pass 41 — female lower-abdomen width

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female `spine_01` local X width only.
- Baseline: `[0.88, 1.02, 0.84]`.
- Candidate retained: `[0.90, 1.02, 0.84]`.
- Held fixed: lower-abdomen Y length and Z depth, mid-abdomen, upper ribcage, pelvis, thighs, head, neck, shoulders, arms, hands, every male scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the clearly visible lower abdomen gains slight lateral support, reducing the residual hourglass pinch while preserving an athletic waist.
- Three-quarter result: abdomen depth remains unchanged and the ribcage-to-pelvis transition stays continuous without a side bulge.
- Clothed result: the cropped top and shorts preserve their placement with no new clipping or separation across the exposed waist.
- Tier-1 result: passed; silhouette IoU `0.9804`, aspect-ratio delta `0.0202`, scale delta `0.0202`, bilateral-symmetry error `0.0132`.
- Interior result: measured across `6,045` foreground cells with no warnings; normalized interior difference `0.0158124803`.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0030960045`; left -35-degree area ratio `1.0070251846`; collapse threshold `0.15`.
- AI visual review: global `0.83`; reference-led abdomen width `0.84`; ribcage-to-pelvis continuity `0.87`; waist athleticism `0.85`; depth preservation `0.90`; wardrobe attachment `0.89`. All reviewed critical features exceed the `0.70` continuation threshold.
- Visual review: the candidate better matches the reference's visible, supported lower abdomen without undoing the narrow mid-waist or widening the pelvis.
- Limitation: bone scaling can correct the broad lower-abdomen envelope but cannot independently reproduce rectus-abdominis, oblique, or iliac-crest surface landmarks in the shared topology.
- Decision: retain. The X-only correction improves visible abdominal proportion while preserving depth, height, torso taper, pelvis, symmetry, and clothing attachment.
