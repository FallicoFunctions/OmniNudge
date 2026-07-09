# Run headless: blender -b assets-src/main-stage/main-stage.blend \
#   --python scripts/extend-wing-lanterns.py
import bpy
import bmesh

# The outer wing corridor (X -30 to -60, in front of the wing terrace/arcade)
# has zero ground-level lighting even though the basin lantern family already
# covers the inner VIP corridor (X -6 to -26) with an organic scatter pattern.
# Extend that same scatter into the outer corridor, mirrored L/R, using the
# existing lantern module as the template (matches the approved material,
# scale, and placement style already used elsewhere on this venue).

TEMPLATE_Y_CENTER = 0.00
TEMPLATE_X_CENTER_L = -6.20

# New lantern positions in the outer wing corridor, left side (X negative).
# Right side is the mirror (X * -1). Chosen to echo the organic scatter
# density of the existing inner cluster, filling toward the arcade at Y~-8
# and the terrace band at Y~0-5, without overlapping existing structures.
NEW_POSITIONS_L = [
    (-34.0, -20.0),
    (-42.0, -14.0),
    (-48.0, -22.0),
    (-54.0, -12.0),
    (-58.0, -3.0),
    (-38.0, 2.0),
]


def find_template_island(obj, y_center_target, x_center_target, tol=0.1):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    islands = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        island = []
        while stack:
            cur = stack.pop()
            if cur.index in seen:
                continue
            seen.add(cur.index)
            island.append(cur)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in seen:
                    stack.append(other)
        islands.append(island)

    for island in islands:
        xs = [v.co.x for v in island]
        ys = [v.co.y for v in island]
        xc = sum(xs) / len(xs)
        yc = sum(ys) / len(ys)
        if abs(xc - x_center_target) < tol and abs(yc - y_center_target) < tol:
            return bm, island
    bm.free()
    return None, None


def extend_lanterns(obj_name, template_x_center, positions):
    obj = bpy.data.objects[obj_name]
    bm, island = find_template_island(obj, TEMPLATE_Y_CENTER, template_x_center)
    if island is None:
        raise RuntimeError(f"template island not found for {obj_name}")

    template_faces = set()
    for v in island:
        for f in v.link_faces:
            template_faces.add(f)

    added = 0
    for (new_x, new_y) in positions:
        dx = new_x - template_x_center
        dy = new_y - TEMPLATE_Y_CENTER
        vert_map = {}
        for v in island:
            nv = bm.verts.new((v.co.x + dx, v.co.y + dy, v.co.z))
            vert_map[v] = nv
        bm.verts.ensure_lookup_table()
        for f in template_faces:
            try:
                bm.faces.new([vert_map[v] for v in f.verts])
            except ValueError:
                pass
        added += 1

    bm.faces.ensure_lookup_table()
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return added


total = 0
for suffix, x_center in (("L", TEMPLATE_X_CENTER_L), ("R", -TEMPLATE_X_CENTER_L)):
    positions = NEW_POSITIONS_L if suffix == "L" else [(-x, y) for (x, y) in NEW_POSITIONS_L]
    for family in ("V33_BasinLanternHousing_", "V33_BasinLanternCore_", "V33_BasinLanternStem_"):
        name = family + suffix
        total += extend_lanterns(name, x_center, positions)

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(f"WING_LANTERNS_ADDED count={total}")
