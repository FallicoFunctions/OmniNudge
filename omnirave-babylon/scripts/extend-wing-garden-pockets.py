# Run headless: blender -b assets-src/main-stage/main-stage.blend \
#   --python scripts/extend-wing-garden-pockets.py
#
# The VIP garden vignette (reflecting pool, gold-rib canopy, fountain,
# planting rim, balustrade, foliage) is a single self-contained feature
# cluster at X(-22,-34), Y(-10,-3.5) - real objects, not just lighting.
# The outer wing corridor (X -35 to -62, in front of the wing arcade) has
# none of this: only bare ground and the lantern posts added separately.
# Duplicate the whole vignette twice along the corridor at the same
# relative Y-band the original already safely occupies (the arcade is a
# walk-through colonnade, so sharing its Y band is the proven pattern).
import bpy
import bmesh

FAMILIES = [
    "V67_VipGardenReflectingPool_",
    "V67_VipGardenGoldRibCanopy_",
    "V35_BasinFountainNozzleArray_",
    "V35_BasinFountainMist_",
    "V35_BasinPlantingIslandRim_",
    "V102_VipBalustradeFiligreeArray_",
    "V101_VipBalustradeLowerChordArray_",
    "V33_VipFoliageCanopy_",
    "V33_VipFoliageUnderstory_",
]

# (dx, dy) offsets for the left side; right side mirrors dx.
OFFSETS_L = [
    (-16.5, -0.4),
    (-30.5, -0.4),
]

added = 0
for family in FAMILIES:
    for side, sign in (("L", 1.0), ("R", -1.0)):
        name = family + side
        obj = bpy.data.objects.get(name)
        if obj is None:
            print(f"SKIP missing {name}")
            continue

        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()

        base_verts = [v.co.copy() for v in bm.verts]
        base_faces = [[v.index for v in f.verts] for f in bm.faces]

        for (dx, dy) in OFFSETS_L:
            actual_dx = dx * sign
            new_verts = [bm.verts.new((co.x + actual_dx, co.y + dy, co.z)) for co in base_verts]
            bm.verts.ensure_lookup_table()
            for face in base_faces:
                try:
                    bm.faces.new([new_verts[i] for i in face])
                except ValueError:
                    pass
            added += 1

        bm.faces.ensure_lookup_table()
        bm.to_mesh(obj.data)
        obj.data.update()
        bm.free()

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(f"GARDEN_POCKETS_ADDED count={added}")
