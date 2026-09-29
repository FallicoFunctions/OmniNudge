# Male scalp underpainting pass — 2026-09-27

The cap beneath the male hair cards read as a smooth, reflective dome. This pass gives the existing cap texture directional dark-brown fibers and reduces its specular response. The original alpha coverage remains exact, so the authored hairline and undercut boundary stay where they were.

`before/` holds the native source, male portable assets, reports, and manifest before this pass. `build-candidate.py` creates the revised packed cap image in the native source and renders front, oblique, side, and upper views. `validate-candidate.py` checks all 43 meshes, 56 bones, seven actions, vertex mapping, and texture alpha. `deliver.mjs` checks every glTF accessor, node, skin, animation, other material, and existing texture across three male detail levels, then compresses and updates only male download records.

The Blender renders and `runtime-hair.jpg` show the result. The material change is modest because the main and rooted hair cards cover most of the cap. The strong high-fade side silhouette and heavy frontal clumps remain the main reference mismatch; those require changing the hair geometry, not just the cap finish.
