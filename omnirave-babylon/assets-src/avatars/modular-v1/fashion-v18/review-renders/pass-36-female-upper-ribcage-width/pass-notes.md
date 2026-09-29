# Pass 36 — female upper-ribcage width

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female `spine_03` local X width only.
- Baseline: `[0.94, 1.00, 0.88]`.
- Candidate retained: `[0.98, 1.00, 0.88]`.
- Held fixed: upper-ribcage Y height and Z depth, lower torso, pelvis, thighs, calves, head, neck, shoulders, arms, every male scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the upper ribcage now meets the retained shoulder line more continuously, reducing the compressed chest-frame reading while leaving the exposed waist narrow.
- Three-quarter result: depth remains unchanged and rounded; there is no chest flattening, torso twist, or bilateral drift.
- Clothed result: the fitted top remains attached and symmetric without clipping, seam separation, or shoulder displacement.
- Tier-1 result: passed; silhouette IoU `0.9733`, aspect-ratio delta `0.0421`, scale delta `0.0421`, bilateral-symmetry error `0.0133`.
- Interior result: measured across `6,128` foreground cells with no warnings; normalized interior difference `0.0242263893`, confirming a bounded localized change rather than broad appearance drift.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0036916478`; left -35-degree area ratio `1.0080381122`; collapse threshold `0.15`.
- AI visual review: global `0.84`; upper-ribcage/shoulder continuity `0.85`; waist preservation `0.88`; wardrobe attachment `0.90`. All reviewed critical features exceed the `0.70` continuation threshold.
- Visual review: the candidate better balances the upper torso against the retained pelvis while preserving the reference-led athletic waist and visible abdomen.
- Limitation: the bust and ribcage remain coupled by the shared source topology, so bone width cannot independently sculpt breast root placement or rib contour.
- Decision: retain. The X-only correction improves the female upper-frame proportion without changing profile depth, torso length, joint placement, or clothing attachment.
