"""Apply object-level transforms on the COL_VIP* collision meshes.

The collision GLB export (collection export in export-main-stage.py) drops
object-level node transforms, so every COL_ mesh must follow the baked
world-space-vertices convention (location 0, verts in world space). The four
VIP meshes (COL_VIPDeck_-1/1, COL_VIPRamp_-1/1) were authored with live
object transforms instead, so they collapsed to the origin in the runtime -
leaving the elevated VIP terrace with no walkable collision and dropping the
vip_terrace checkpoint player onto dark bare ground.

Run: blender -b assets-src/main-stage/main-stage.blend \
       --python scripts/apply-vip-collision-transforms.py -- --write
Without --write it prints what it would do and exits without saving.
"""

import sys

import bpy

WRITE = "--write" in sys.argv

targets = [o for o in bpy.data.objects if o.name.startswith("COL_VIP")]
if len(targets) != 4:
    raise RuntimeError(f"expected 4 COL_VIP* objects, found {[o.name for o in targets]}")

pending = [o for o in targets if any(abs(v) > 1e-6 for v in o.location)]
if not pending:
    print("all COL_VIP* transforms already applied; nothing to do")
    raise SystemExit(0)

bpy.ops.object.select_all(action="DESELECT")
for obj in targets:
    obj.hide_viewport = False
    obj.hide_set(False)
    obj.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

for obj in targets:
    lo, hi = obj.bound_box[0], obj.bound_box[6]
    print(
        f"APPLIED {obj.name} loc={tuple(round(v, 2) for v in obj.location)} "
        f"local-bb=({tuple(round(v, 1) for v in lo)})..({tuple(round(v, 1) for v in hi)})"
    )

if WRITE:
    bpy.ops.wm.save_mainfile()
    print("saved", bpy.data.filepath)
else:
    print("dry run (pass --write to save)")
