# Male forehead locks — 26 September 2026

## Change

The free forehead fibers now gather more tightly around their existing curl guides. The revised width profile keeps body closer to the endpoint, followed by a short fine taper. Small upward offsets stagger the ends instead of leaving them on the old shared eyebrow clamp.

The previous penultimate ribbon pairs were often only about 40 microns wide. Earlier browser isolation showed that removing the texture and shadows did not remove the speckling. This pass addresses the narrow geometry directly, retaining the current materials and render settings.

A total of 1,189 existing ribbons changed. The other 5,151 ribbons, all 42 other native meshes, and the first two pairs of every ribbon are exact. The lowered hairline, crown sweep, texture, brunette palette, topology, UVs, weights, and relative morph offsets are retained.

## Result

At the normal browser size, the main forehead curls now have continuous edges and visibly less speckling. Screenshots compare the same idle hair view in `before/runtime-hair.jpg` and `runtime-hair.jpg`. Front, run, and walk views also passed visual review. The outer crown and back retain some stiff, wispy ends; this pass did not change those areas.

## Checks

- Nine expression and secondary-motion samples: minimum changed-vertex skin clearance 1.601 mm; maximum ribbon width 1.619 mm.
- All 27 standard movement samples pass attachment checks.
- 115,248 foreground triangle-center/edge-midpoint samples: no penetration. Minimum 0.148 mm; 11 samples are below 0.5 mm. These near-skin minima are unchanged from the preceding pass.
- All three male GLBs: zero glTF validation errors; retained outfit, rig, animation, materials, textures, UVs, and weight data checks pass.
- Asset/manifest hashes, gzip roundtrips, and native/runtime source equality pass.
- Browser idle, front, run, and walk screenshots saved; no browser errors reported.

These finite samples do not prove continuous or hair-to-hair collision freedom.

## Rebuild

Run from `omnirave-babylon`, with one Blender process at a time and two threads:

1. Run `build-candidate.py` in Blender background mode with `--python-exit-code 1`.
2. Run `validate-candidate.py` and `audit-fringe-faces.py -- --current` in Blender.
3. Run `node scripts/launch-body-proof/apply_reference_hair.mjs male`.
4. Run this folder's `deliver.mjs`, then inspect the ordinary male preview.

Source: `scripts/launch-body-proof/refine_male_fringe_locks.py`, archived here as `authored-refinement.py`. The cumulative male pipeline invokes it after the swept-crest pass. Rebuilds use this folder's immutable `before/` snapshot; the full cumulative pipeline was not rerun in this pass.

`pass-summary.json` combines final checks. Native and portable validation reports, logs, four Blender views, and four browser views are saved alongside it.
