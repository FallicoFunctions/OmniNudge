# Run headless: blender -b assets-src/main-stage/main-stage.blend \
#   --python scripts/plant-promenade-borders.py
#
# The player walks the central promenade from spawn to the stage, but the
# floor they walk is bare - every bit of detail in this venue is ELEVATED
# on the flanking terraces (Z 2-16), so at eye level the approach reads
# empty (player-reported "nothing here" by the pyro pod). Plant continuous
# low borders in the open floor strip between the crowd barrier (x +/-13.4)
# and the truss/service line (x +/-17.9), running the back two-thirds of the
# approach so the greenery flanks the walk and leads the eye to the stage.
#
# Reuses the existing garden vocabulary (planting rim + foliage under/canopy)
# rotated 90deg so each strip's long axis runs ALONG the walkway, dropped
# from its terrace height down to the floor. No new materials.
import bpy
import bmesh

# Front-most template island of each bed family (measured in-file).
TEMPLATES = {
    "V35_BasinPlantingIslandRim_": (-43.90, -8.05),
    "V33_VipFoliageUnderstory_": (-44.01, -9.55),
    "V33_VipFoliageCanopy_": (-44.01, -9.55),
}
REF_ZBOTTOM = 3.16   # lowest family base; single ref keeps the layers stacked
FLOOR_Z = 0.05
X_LANE = 15.5        # centered in the 13.4->17.9 open floor strip
Z_CENTERS = [-40.0, -30.0]   # two strips per side -> continuous z-45..-25 border


def front_island(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    islands = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        isl = []
        while stack:
            c = stack.pop()
            if c.index in seen:
                continue
            seen.add(c.index)
            isl.append(c)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    stack.append(o)
        islands.append(isl)
    best = None
    best_cy = None
    for isl in islands:
        cy = sum(v.co.y for v in isl) / len(isl)
        if best is None or cy < best_cy:
            best, best_cy = isl, cy
    verts = [v.co.copy() for v in best]
    faces = []
    vset = {v.index for v in best}
    # collect faces whose verts are all in the island
    idx_of = {v.index: i for i, v in enumerate(best)}
    seen_faces = set()
    for v in best:
        for f in v.link_faces:
            if f.index in seen_faces:
                continue
            if all(fv.index in vset for fv in f.verts):
                seen_faces.add(f.index)
                faces.append([idx_of[fv.index] for fv in f.verts])
    bm.free()
    return verts, faces


added = 0
for family, (cx, cy) in TEMPLATES.items():
    tmpl_obj = bpy.data.objects[family + "L"]
    verts, faces = front_island(tmpl_obj)

    for side, sign in (("L", -1.0), ("R", 1.0)):
        obj = bpy.data.objects[family + side]
        bm = bmesh.new()
        bm.from_mesh(obj.data)

        for zc in Z_CENTERS:
            tx = X_LANE * sign
            new_verts = []
            for co in verts:
                # rotate island 90deg about its centroid: long X-axis -> along-walk
                dx_rot = (co.y - cy)
                dy_rot = -(co.x - cx)
                x = tx + (dx_rot if side == "L" else -dx_rot)
                y = zc + dy_rot
                z = (co.z - REF_ZBOTTOM) + FLOOR_Z
                new_verts.append(bm.verts.new((x, y, z)))
            bm.verts.ensure_lookup_table()
            for face in faces:
                try:
                    bm.faces.new([new_verts[i] for i in face])
                except (ValueError, IndexError):
                    pass
            added += 1

        bm.faces.ensure_lookup_table()
        bm.to_mesh(obj.data)
        obj.data.update()
        bm.free()

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(f"PROMENADE_BORDERS_ADDED count={added}")
