# Adds walkable collision floors for the basin coping walkways.
#
# The basin flanks are bordered by knee-high coping stone (V90, top z 1.0)
# forming two walkways per side - inner (|x| 5.1..8.3) and outer
# (|x| 17.3..24.8) - around a sunken water strip (|x| 8.3..17.3, water at
# z 0.22, ends at blender Y 39.2). The playtest route stands on the outer
# walkway (cascade_court checkpoint), so the coping is FLOOR, not wall:
# these boxes join the Collision collection so the avatar's ground raycast
# walks up onto the stone, mirroring the COL_VIPDeck/COL_ApproachDeck
# convention. The matching code change drops the V90 blocker and hedges the
# water strip with the basin foliage banks instead.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/add-basin-coping-collision.py -- --write
import sys

import bpy

COPING_TOP = 1.0
COPING_BOTTOM = 0.0
# (name, x_lo, x_hi, y_lo, y_hi) in blender coordinates
SLABS = [
    ("COL_BasinCopingInner_R", 5.1, 8.3, -14.7, 47.9),
    ("COL_BasinCopingInner_L", -8.3, -5.1, -14.7, 47.9),
    ("COL_BasinCopingOuter_R", 17.3, 24.8, -14.7, 47.9),
    ("COL_BasinCopingOuter_L", -24.8, -17.3, -14.7, 47.9),
    # south connector behind the water strip's end: joins inner and outer
    ("COL_BasinCopingSouth_R", 8.3, 17.3, 39.2, 47.9),
    ("COL_BasinCopingSouth_L", -17.3, -8.3, 39.2, 47.9),
]


def main():
    write = "--write" in sys.argv
    collection = bpy.data.collections.get("Collision")
    if collection is None:
        raise RuntimeError('Expected a "Collision" collection')

    for obj in list(collection.all_objects):
        if obj.name.startswith("COL_BasinCoping"):
            bpy.data.objects.remove(obj, do_unlink=True)

    for (name, x_lo, x_hi, y_lo, y_hi) in SLABS:
        mesh = bpy.data.meshes.new(name + "_Mesh")
        w = (x_hi - x_lo) / 2
        d = (y_hi - y_lo) / 2
        h = (COPING_TOP - COPING_BOTTOM) / 2
        cx = (x_lo + x_hi) / 2
        cy = (y_lo + y_hi) / 2
        cz = (COPING_BOTTOM + COPING_TOP) / 2
        verts = [
            (cx - w, cy - d, cz - h), (cx + w, cy - d, cz - h),
            (cx + w, cy + d, cz - h), (cx - w, cy + d, cz - h),
            (cx - w, cy - d, cz + h), (cx + w, cy - d, cz + h),
            (cx + w, cy + d, cz + h), (cx - w, cy + d, cz + h),
        ]
        faces = [
            (0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
            (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
        ]
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)

    count = len([o for o in collection.all_objects if o.name.startswith("COL_BasinCoping")])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"BASIN_COPING_COLLISION objects={count} written={write}")


main()
