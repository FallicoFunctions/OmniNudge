# Procedural tiered-cascade water court for the Main Stage flank pockets.
#
# Each flank pocket is a bare ~38x37 floor bounded by the elevated wing terrace
# (front, blend Y~5, Z up to 7) and the spawn gallery/canopy (back, Y>42). This
# builds a tiered cascade descending from the terrace-adjacent head down into the
# pocket to a base collecting pool - designed architecture, not loose props.
#
# Pass 1 authors the STONE SHELL only (tier pans: floor + walls + coping + spill
# lips). Water, mist, planting and lighting are added by later passes under the
# same V150_CascadeCourt* namespace.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-cascade-court.py -- --write
import sys

import bpy
import bmesh

GENERATED_PREFIX = "V150_CascadeCourt"  # own namespace; safe to clear+regen

# Tiers in RIGHT-pocket coordinates (positive X); the left pocket is the mirror
# (every vertex X negated). Envelope: X(31,67) Y(17,40) Z(0,4.2). Head starts at
# Y17 to clear the pyro-pod shell (V45, which rises to Z5.6 out to Y15.5); base
# ends at Y40, clear of the spawn canopy (Y>=42.7).
# (x0, x1, y0, y1, floor_z, wall_top_z)
TIERS = [
    (37.0, 61.0, 17.0, 24.0, 2.8, 3.8),  # head tier (highest)
    (35.0, 63.0, 23.0, 30.0, 1.9, 2.9),
    (33.0, 65.0, 29.0, 35.0, 1.0, 2.0),
    (32.0, 66.0, 34.0, 40.0, 0.1, 1.1),  # base collecting pool (lowest, widest)
]
WALL_T = 0.7
LIP_H = 0.25
COP_T = 0.25


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith(GENERATED_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name, fallback):
    m = bpy.data.materials.get(name)
    return m if m else bpy.data.materials.get(fallback)


def add_box(bm, cx, cy, cz, sx, sy, sz):
    """Axis-aligned box centered at (cx,cy,cz) with full sizes s*."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    verts = []
    for dx in (-hx, hx):
        for dy in (-hy, hy):
            for dz in (-hz, hz):
                verts.append(bm.verts.new((cx + dx, cy + dy, cz + dz)))
    bm.verts.ensure_lookup_table()
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
    for f in faces:
        bm.faces.new([verts[i] for i in f])


def build_tier(bm, x0, x1, y0, y1, floor_z, wall_top):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wx, wy = x1 - x0, y1 - y0
    wall_h = wall_top - floor_z
    wall_cz = floor_z + wall_h / 2
    # pan floor (top surface at floor_z)
    add_box(bm, cx, cy, floor_z - 0.15, wx, wy, 0.3)
    # full-height walls on front (y0), left (x0), right (x1)
    add_box(bm, cx, y0 + WALL_T / 2, wall_cz, wx, WALL_T, wall_h)
    add_box(bm, x0 + WALL_T / 2, cy, wall_cz, WALL_T, wy, wall_h)
    add_box(bm, x1 - WALL_T / 2, cy, wall_cz, WALL_T, wy, wall_h)
    # low spill lip on the downhill (y1) edge - water overflows here to next tier
    add_box(bm, cx, y1 - WALL_T / 2, floor_z + LIP_H / 2, wx, WALL_T, LIP_H)
    # coping capstones on the three full-height walls
    cop_z = wall_top + COP_T / 2
    add_box(bm, cx, y0 + WALL_T / 2, cop_z, wx + 0.4, WALL_T + 0.4, COP_T)
    add_box(bm, x0 + WALL_T / 2, cy, cop_z, WALL_T + 0.4, wy + 0.4, COP_T)
    add_box(bm, x1 - WALL_T / 2, cy, cop_z, WALL_T + 0.4, wy + 0.4, COP_T)


def _box_project_uvs(mesh, cube_size=1.5):
    uv_layer = mesh.uv_layers.new(name="CascadeUV")
    for poly in mesh.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        u_axis, v_axis = [i for i in range(3) if i != axis]
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer.data[li].uv = (co[u_axis] / cube_size, co[v_axis] / cube_size)


def _ensure_tangents(obj):
    try:
        obj.data.calc_tangents()
    except Exception:
        pass


def build_side(side, mat):
    bm = bmesh.new()
    for tier in TIERS:
        build_tier(bm, *tier)
    if side == "L":
        for v in bm.verts:
            v.co.x = -v.co.x
    # triangulate for a well-defined tangent basis on export
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    mesh = bpy.data.meshes.new(f"{GENERATED_PREFIX}Shell_{side}_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    _box_project_uvs(mesh)
    obj = bpy.data.objects.new(f"{GENERATED_PREFIX}Shell_{side}", mesh)
    if mat:
        obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    _ensure_tangents(obj)


def main():
    write = "--write" in sys.argv
    clear_previous()
    pearl = get_material("V15_PearlShellBeveled", "V15_PearlShellBeveled")
    build_side("R", pearl)
    build_side("L", pearl)
    count = len([o for o in bpy.data.objects if o.name.startswith(GENERATED_PREFIX)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"CASCADE_GENERATED objects={count} written={write}")


main()
