# Pass 19 — male pelvis width

- Approved reference: `avatar-luxury-festival.png` (single-reference constraint preserved).
- Variable tested: male pelvis local X scale only.
- Baseline: `[0.76, 0.99, 0.78]`.
- Candidate retained: `[0.72, 0.99, 0.78]`.
- Held fixed: pelvis Y/Z, torso, thighs, calves, head, shoulders, arms, every female scale, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the frontal pelvis flare is reduced, giving the male waist a straighter transition into the upper legs and reducing the unintended hourglass silhouette.
- Three-quarter result: the pelvis-to-thigh junction remains continuous with no pinching, hollowing, or hip-joint displacement.
- Clothed result: the fitted lower garment remains centered and attached with no new gaps, clipping, or asymmetry.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0296874791`; left -35-degree area ratio `1.0238837107`; collapse threshold `0.15`.
- Decision: retain. The width-only adjustment moves the male physiology toward the approved reference's narrower hip structure without altering the already-retained torso or thigh proportions.
