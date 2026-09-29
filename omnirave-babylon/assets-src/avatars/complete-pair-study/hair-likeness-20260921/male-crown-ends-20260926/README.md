# Male crown and rear ends — 26 September 2026

## Change

The rear and crown strands gather around their existing wave guides. Their middle sections carry backward, and their final bend extends downward toward the measured scalp. This makes the rear ends follow the underlying shape instead of curling outward into small fans. Target layers vary from 3.5 to 5.5 mm above the scalp before the evaluated skin fitting step.

A total of 2,615 ribbons changed. The other 3,725 ribbons remain exact, including all 1,189 refined forehead ribbons. All 42 other native meshes, the lowered hairline and first two pairs of every ribbon are exact. Materials, textures, topology, UVs, weights and relative morph offsets are retained.

## Visual review

Layer-isolation renders showed the stiff fans came from the main groom. Two early candidates were too subtle and are archived in `first-candidate/` and `second-candidate/`. The final version gives the rear locks a clearer downward bend. Clumping and a blunt lower rear hair boundary remain visible in close rear/side views.

Native front, oblique, side and rear views are saved. Browser screenshots cover the usual hair and face views, close rear and side views, and sampled walk/run poses. A temporary copy of the existing review page changed only the hair camera angle for the close rear/side checks. That route and its module were removed afterward; their text is archived here. The standard male hair preview remains open.

## Checks

- Nine expression/secondary-motion samples: changed vertices clear the skin by at least 1.600 mm. Maximum ribbon width is 1.619 mm.
- All 27 standard movement samples pass attachment checks.
- 230,120 changed-crown triangle-center/edge-midpoint samples: no penetration; minimum 0.461 mm; one sample below 0.5 mm.
- 115,148 foreground samples: no penetration; minimum 0.148 mm; 11 samples below 0.5 mm.
- All three male GLBs have zero validation errors. Retained outfit, rig, animation, materials, textures, UVs and skin data checks pass.
- Asset/manifest hashes, gzip roundtrips and native/runtime source equality pass.
- Browser error logs are empty for the main preview and both camera probes.

Finite samples do not establish continuous or hair-to-hair collision freedom.

## Rebuild

Run from `omnirave-babylon`, using one Blender process at a time with two threads:

1. Run `build-candidate.py` in Blender background mode with `--python-exit-code 1`.
2. Run `validate-candidate.py` and `audit-fringe-faces.py -- --current` in Blender.
3. Run `node scripts/launch-body-proof/apply_reference_hair.mjs male`.
4. Run this folder's `deliver.mjs`, then inspect the standard male preview.

Source: `scripts/launch-body-proof/refine_male_crown_ends.py`, archived as `authored-refinement.py`. The cumulative male pipeline invokes it after the forehead-lock refinement. This pass rebuilt from its immutable `before/` snapshot; the full cumulative pipeline was not rerun.

`pass-summary.json` combines final checks. Native/portable reports, logs, diagnostic renders and browser views are saved alongside it.
