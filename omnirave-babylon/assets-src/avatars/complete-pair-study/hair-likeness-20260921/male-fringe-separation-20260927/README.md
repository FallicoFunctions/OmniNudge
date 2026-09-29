# Male fringe separation — September 27, 2026

Layer-isolation renders show that the straight frontal support fills the spaces between the outer curls, adding a uniform sheet beneath the sweep. This pass fades its high free section and thins overlapping outer fibers between three coherent front-wave lanes. The first three pairs of every ribbon keep their prior coverage. The scalp, rear, temple support beyond the front-root boundary and all geometry stay exact.

## Authored change

- Polished male rooted hairline: 160 selected ribbons, 1,416 alpha values changed.
- Luxury retained swept groom: 1,215 selected ribbons, 13,590 alpha values changed.

Only alpha in the existing `MaleRearFinish` vertex attribute changes. RGB pigment, materials, shader nodes, packed texture bytes, mesh topology, positions, normals, UVs, weights, transforms, shape keys and rig are retained. Outer fading is restricted to the forehead-facing part of the fall; the crown-facing arch remains covered. Separate native checks preserve every pair behind the forward boundary. No geometry or textures are added.

The initial candidate was too subtle: residual coverage accumulated across overlapping cards. It is archived under `candidate-01-subtle-density/`. A second candidate also thinned 47 support ribbons beyond the front-root boundary; its failed scope check and renders are archived under `candidate-02-wide-support-mask/`. A third candidate exposed too much dark support between the fringe and crown in the browser upper view; it is archived under `candidate-03-open-upper-gap/`. The final candidate keeps all ribbons with root Y at or above -0.095 m exact and attenuates only pairs ahead of the mesh-specific forward boundary (-0.110 m for the outer groom and -0.085 m for the support).

## Verification

All 43 native mesh geometry/weight/UV/morph contracts are exact. Native material graphs and packed texture hashes pass. Blender rebases four relative image paths while saving the archive to the runtime path; `image-path-audit.json` records this, and packed filenames and bytes remain exact. Vertex RGB, root coverage and unselected ribbons pass separate comparisons.

All 27 idle/walk/run movement samples and scalp attachments pass. The prior pass's skin-clearance samples remain applicable because positions and relative secondary-motion shapes are exact; new surface sampling would duplicate those results.

All three male GLBs validate with zero errors. Strict exported comparison retains every accessor except the two selected `COLOR_0` arrays. Those arrays independently retain exact RGB and only reduce alpha. Geometry, outfit, rig, animation, UVs, weights, material values and embedded textures are exact. Gzip round-trips, final hashes/sizes, male manifest entries, source/runtime equality and the archived helper pass.

Eight browser views and empty error logs are archived. The temporary camera-only route is removed and the standard male hair preview is restored. Blender uses dithered alpha and the browser uses alpha testing, so browser evidence establishes the final visible result.

## Reproduction and remaining work

`before/` contains immutable sources, all three GLB/gzip files, the previous manifest and previous views. `inspect-fringe-layers.py` creates the isolation renders. `build-candidate.py` applies the helper archived as `authored-refinement.py`. `validate-candidate.py` proves the coverage-only change and checks movement. `deliver.mjs` verifies retained exported data, compresses assets, copies the runtime source and merges only male manifest entries. `finalize-evidence.py` verifies final files and writes this record.

The live helper is `scripts/launch-body-proof/refine_male_fringe_separation.py`, called after the fringe-sweep stage in the male branch of `refine_reference_hair.py`. The full cumulative authoring pipeline was not rerun.

The front curl shape remains broad and the hairstyle is not a finished likeness match. This pass improves visible separation rather than changing the curves.
