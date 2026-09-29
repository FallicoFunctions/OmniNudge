# Pass 16 — female mid-abdomen width

- Approved reference: `avatar-plurr-warehouse.png` (single-reference constraint preserved).
- Variable tested: female `spine_02` local X scale only.
- Baseline: `[0.86, 1.02, 0.84]`.
- Candidate retained: `[0.84, 1.02, 0.84]`.
- Held fixed: `spine_02` Y/Z, pelvis, every other torso and limb scale, all male scales, global profile scale, strict T-pose, camera, lighting, wardrobe, meshes, materials, and protected GLBs.
- Body-only result: the fully visible mid-abdomen narrows modestly, producing a closer athletic waist read without changing torso height or profile depth.
- Three-quarter result: the waist-to-pelvis curve remains continuous with no pinching, hollowing, or abrupt ribcage transition.
- Clothed result: the crop top and shorts preserve their attachment and spacing with no new clipping or gaps.
- Multi-angle result: non-degenerate at both orbit views. Right +35-degree area ratio `1.0210644115`; left -35-degree area ratio `1.0097176774`; collapse threshold `0.15`.
- Decision: retain. The width-only adjustment moves the exposed abdomen toward the single approved reference without disturbing the retained pelvis correction from Pass 15.
