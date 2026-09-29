# Pass 38 — male neck thickness

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: male `neck_01` radial X/Z cross-section only.
- Baseline: `[0.96, 0.98, 0.96]`.
- Candidate retained: `[0.99, 0.98, 0.99]`.
- Held fixed: neck Y length, head, shoulders, chest, abdomen, pelvis, arms, hands, legs, every female scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the neck has modestly greater lateral and front/back mass, reducing the stem-like transition while preserving the accepted compact length.
- Three-quarter result: the jaw-to-neck and neck-to-shoulder bridges remain continuous and rounded with no forward displacement, flattening, or asymmetric bulge.
- Clothed result: the garment neckline, hair, and earrings remain centered and attached with no new clipping.
- Tier-1 result: passed; silhouette IoU `0.9971`, aspect-ratio delta `0.0000`, scale delta `0.0000`, bilateral-symmetry error `0.0145`.
- Interior result: measured across `5,889` foreground cells with no warnings; normalized interior difference `0.0007953157`, confirming a very localized correction.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0047413392`; left -35-degree area ratio `1.0086797779`; collapse threshold `0.15`.
- AI visual review: global `0.83`; jaw-to-neck continuity `0.85`; neck-to-shoulder continuity `0.86`; length preservation `0.92`; wardrobe attachment `0.88`. All reviewed critical features exceed the `0.70` continuation threshold.
- Visual review: the candidate better supports the widened shoulder frame and reads closer to the approved reference's athletic neck without becoming bulky.
- Limitation: bone scaling cannot independently sculpt the sternocleidomastoid or trapezius insertions in the shared topology.
- Decision: retain. The radial-only correction improves neck mass while preserving length, head placement, shoulder width, symmetry, and clothing attachment.
