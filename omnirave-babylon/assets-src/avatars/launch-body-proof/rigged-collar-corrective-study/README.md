# Collar pose corrections

`male-rigged-collar-correctives.blend` adds four driven collar shape keys for left/right overhead and forward reach. The existing jacket corrective values activate them. The source is `../rigged-collar-deformation-study/male-rigged-collar-deformation.blend`. This is an authoring study; the runtime candidate has not changed.

The normal collar fit, raw basis coordinates, skin weights, mesh topology, attributes, materials and all other source meshes/rig/actions remain exact. The 1,152 original flap vertices are identical in every new key. Both walls of each band section receive the same displacement at its target pose. This preserves their separation at the target, without claiming thickness preservation at arbitrary mixed poses. Shape offsets are split between sides with a 20 mm smooth transition around the center and transformed back through each vertex's weighted skin matrix.

`fit/overhead-optimized.npz` and `fit/forward-optimized.npz` are the retained posed displacement inputs. They were fitted in millimeters with SciPy 1.9.1 L-BFGS-B: penalize edge strain beyond 32%, spatially varying displacement, total displacement and crossing local nearest-surface planes. Only band sections beyond 65 degrees from the front can move; paired wall vertices share a variable. Every coordinate is bounded to ±2 mm. Maximum displacement is 1.252 mm overhead and 0.664 mm forward. Both searches stopped at the fixed 240-iteration budget, so mathematical convergence is not claimed. Nearest planes are only optimization constraints: their normals are oriented toward the source collar point, and their margin is the smaller of source distance and 0.25 mm. Actual triangle crossing tests determine finite-motion acceptance.

The auditor independently reconstructs all four exact float32 key arrays from the saved fit inputs and source pose matrices. It verifies driver targets, exact source data, unchanged T/down geometry and the preceding accepted audit's model hash. It uses source T edge lengths throughout. Motion scope is the established 354 arm and 36 single-axis neck samples, plus 16 unilateral reach samples (each side, forward/overhead, frames 13/25/37/49). These are overlapping finite checks, not independent probability trials. The report lists every sample and any failures.

A fresh build with three Blender threads is compared with the four-thread build: static data, packed image bytes, all 25 native T/down meshes and all five provenance arrays match exactly. Different .blend file hashes are expected; checked scene content must match. Four reviewed target-pose renders and their hashes accompany the model. The full numerical result is in `corrective-audit.json`.

The jacket-hidden images still show the open shirt pattern and the separate gap below the collar band. Sewing, physical cloth acceptance, independent head motion, combined controls, continuous/coplanar collision, positive minimum clearance, full avatar likeness/outfits, material baking and runtime corrective export remain unfinished.

## Reproduce

Run from the repository root with Blender 5.1.2; replace `blender` with its executable path as needed.

```sh
blender -b -t 4 --python omnirave-babylon/scripts/launch-body-proof/build_rigged_collar_correctives.py -- --fit omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-collar-corrective-study/fit --output /tmp/collar-rebuild.blend --provenance /tmp/collar-rebuild.npz
blender -b -t 4 --python omnirave-babylon/scripts/launch-body-proof/audit_rigged_collar_correctives.py -- --input /tmp/collar-rebuild.blend --fit omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-collar-corrective-study/fit --report /tmp/collar-rebuild-audit.json
blender -b -t 3 --python omnirave-babylon/scripts/launch-body-proof/render_rigged_collar_deformation.py -- --input /tmp/collar-rebuild.blend --output /tmp/collar-rebuild-views
```

The fit helpers retain the search method with only their output paths parameterized. To repeat the optimization separately, create an empty work directory, run `fit/constraints.py` in Blender with `-- /absolute/work/directory`, then run `python fit/optimize.py /absolute/work/directory` in a SciPy environment. Exact rebuilding uses the retained NPZ inputs; optimizer equivalence across numerical-library versions is not asserted.

## Recorded result

Peak sampled strain: **53.807% → 39.316%** (26.93% relative reduction). All 406 sampled configurations pass the strict crossing checks. `motion-comparison.json` retains maxima by scope. Physical cloth acceptance remains open.
