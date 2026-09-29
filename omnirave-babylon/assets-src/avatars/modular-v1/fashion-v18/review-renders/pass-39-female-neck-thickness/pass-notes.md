# Pass 39 — female neck thickness

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female `neck_01` radial X/Z cross-section only.
- Baseline: `[0.96, 1.00, 0.96]`.
- Candidate retained: `[0.98, 1.00, 0.98]`.
- Held fixed: neck Y length, head, shoulders, upper ribcage, abdomen, pelvis, arms, hands, legs, every male scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the neck has slightly greater lateral and front/back support, improving the jaw-to-upper-frame transition while remaining slender.
- Three-quarter result: the neck remains rounded and continuous with no forward displacement, flattening, or asymmetric bulge.
- Clothed result: the neckline, hair, and earrings remain centered and attached with no new clipping.
- Tier-1 result: passed; silhouette IoU `0.9982`, aspect-ratio delta `0.0000`, scale delta `0.0000`, bilateral-symmetry error `0.0134`.
- Interior result: measured across `6,318` foreground cells with no warnings; normalized interior difference `0.0005431304`, confirming an extremely localized correction.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0038098126`; left -35-degree area ratio `1.0080650511`; collapse threshold `0.15`.
- AI visual review: global `0.83`; jaw-to-neck continuity `0.84`; neck-to-ribcage continuity `0.86`; slenderness preservation `0.91`; wardrobe attachment `0.89`. All reviewed critical features exceed the `0.70` continuation threshold.
- Visual review: the candidate better connects the head to the broadened upper ribcage without making the neck heavy or changing the reference-led exposed abdomen.
- Limitation: the shared body topology does not permit independent sculpting of the sternocleidomastoid or trapezius insertions through this bone-scale layer.
- Decision: retain. The radial-only correction improves neck support while preserving length, head placement, shoulder width, torso proportions, symmetry, and clothing attachment.
