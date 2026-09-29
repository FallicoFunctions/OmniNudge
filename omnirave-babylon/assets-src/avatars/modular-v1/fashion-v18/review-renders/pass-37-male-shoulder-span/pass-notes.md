# Pass 37 — male shoulder span

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: bilateral male clavicle local X scale only.
- Baseline: left/right `[1.12, 1.00, 1.12]`.
- Candidate retained: left/right `[1.16, 1.00, 1.12]`.
- Held fixed: clavicle Y height and Z depth, chest, abdomen, pelvis, arms, hands, legs, head, neck, every female scale, global profile scale, strict T-pose, camera specification, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the skeletal shoulder span is modestly wider, strengthening the reference-led V-frame without increasing chest or arm mass.
- Three-quarter result: chest depth remains unchanged and rounded; no flattening, torso twist, shoulder-height drift, or left/right asymmetry appears.
- Clothed result: both fitted shoulder pieces remain attached and symmetric with no visible gap or clipping introduced by the span change.
- Tier-1 result: passed; silhouette IoU `0.9745`, aspect-ratio delta `0.0000`, scale delta `0.0000`, bilateral-symmetry error `0.0146`.
- Interior result: measured across `5,790` foreground cells with no warnings; normalized interior difference `0.0096833853`, confirming the edit remained tightly localized.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0044715068`; left -35-degree area ratio `1.0085365131`; collapse threshold `0.15`.
- AI visual review: global `0.84`; shoulder-to-waist proportion `0.86`; bilateral shoulder continuity `0.90`; profile-volume preservation `0.89`; wardrobe attachment `0.86`. All reviewed critical features exceed the `0.70` continuation threshold.
- Visual review: the candidate improves upper-frame balance against the narrow retained pelvis and torso while keeping the intended lean male physiology.
- Limitation: the current male wardrobe is not a visual match for the approved reference's jacket and is used here only as an attachment/clipping check; this pass does not claim clothing likeness.
- Decision: retain. The bilateral X-only correction improves shoulder span without changing clavicle depth, joint height, chest mass, arm thickness, or wardrobe attachment.
