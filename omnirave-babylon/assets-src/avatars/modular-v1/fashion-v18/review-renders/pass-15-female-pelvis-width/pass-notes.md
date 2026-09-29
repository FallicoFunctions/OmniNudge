# Pass 15 — female pelvis width

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female pelvis local X scale only.
- Baseline: `[0.83, 0.99, 0.78]`.
- Candidate retained: `[0.80, 0.99, 0.78]`.
- Held fixed: pelvis Y/Z, every torso and limb scale, all male scales, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the frontal hip flare is modestly reduced, producing a cleaner transition from the fully visible waist and abdomen into the upper legs. The established waist width and thigh volume remain unchanged.
- Three-quarter result: the curve remains continuous with no pinching, hollowing, or discontinuity at the pelvis-to-thigh junction.
- Clothed result: the shorts follow the narrower pelvis without gaps, clipping, or asymmetric deformation.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0218984262`; left -35-degree area ratio `1.0079745714`; collapse threshold `0.15`.
- Review correction: an initial capture used the plain `female` route and was rejected before scoring. All retained evidence was recaptured with the correct `female-lean` profile and identical strict T-pose settings for baseline and candidate.
- Decision: retain. The width-only correction better matches the reference's visible waist-to-waistband transition while preserving the intended feminine curve.
