# Procedural tiered-cascade water court for the Main Stage flank pockets.
#
# Each flank pocket is a bare ~38x37 floor. This builds a VOLCANO-like tiered
# fountain mound centered in each pocket: stacked irregular stepped tiers that
# taper to a summit, so water can spill down all sides. Each tier is a distinct
# irregular polygon (different size, side-count, orientation and jitter) so the
# top-down silhouette never reads as a stack of concentric circles.
#
# Pass 1 authors the STONE SHELL only (the stepped mound). Water, mist, planting
# and lighting are added by later passes under the same V150_CascadeCourt*
# namespace.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-cascade-court.py -- --write
import math
import random
import sys

import bpy
import bmesh

GENERATED_PREFIX = "V150_CascadeCourt"  # own namespace; safe to clear+regen

# Mound center in RIGHT-pocket coordinates (left pocket mirrors X). Pocket
# envelope X(31,67) Y(17,40); center it and keep the base radius inside that.
CENTER = (48.5, 28.5)

# Stacked tiers, base (widest, lowest) -> summit (smallest, highest). Each:
# (radius_x, radius_y, z_bottom, z_top, n_sides, phase_rad, off_x, off_y, seed)
# Distinct n_sides/phase/offset/seed per tier keeps the shapes irregular and
# non-concentric. Base at Y18..39 clears the pyro pod (Y<=15.5) and spawn
# canopy (Y>=42.7); summit at Z~4.0 stays under the envelope (Z<=4.2).
TIERS = [
    (13.0, 10.6, 0.00, 0.80, 11, 0.15, 0.0, 0.0, 11),
    (10.6, 8.6, 0.80, 1.60, 9, 0.55, 0.9, -0.6, 27),
    (8.2, 6.6, 1.60, 2.40, 10, 1.10, -0.8, 0.7, 43),
    (5.8, 4.7, 2.40, 3.20, 8, 0.30, 0.6, 0.5, 61),
    (3.6, 3.0, 3.20, 4.00, 7, 0.90, -0.5, -0.4, 79),
]

# Battered (inward-leaning) riser walls: each tier's top ring pulls toward its
# centroid so the tiers flow into one carved mound instead of reading as a
# stack of vertical-walled prisms (player-flagged).
BATTER = 0.35
# Raised coping curb rimming each tread: brighter pearl band that traces every
# level and contains the tread pool. Separate object family so the polish
# table can tint it lighter than the shell stone.
COPING_W = 0.5
COPING_H = 0.09
COPING_LIP = 0.06  # curb outer face sits slightly proud of the riser top


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith(GENERATED_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name, fallback):
    m = bpy.data.materials.get(name)
    return m if m else bpy.data.materials.get(fallback)


def tier_polygon(cx, cy, rx, ry, n, phase, seed):
    """An irregular closed n-gon: per-vertex radius jitter, seeded so the shape
    is deterministic but unique to this tier."""
    rng = random.Random(seed)
    pts = []
    for k in range(n):
        a = phase + 2.0 * math.pi * k / n
        r_mult = 0.80 + 0.40 * rng.random()  # 0.80..1.20
        pts.append((cx + rx * r_mult * math.cos(a), cy + ry * r_mult * math.sin(a)))
    return pts


def offset_polygon(pts, delta):
    """Move each vertex toward (delta<0) or away from (delta>0) the centroid."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for (x, y) in pts:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy) or 1.0
        out.append((x + dx / d * delta, y + dy / d * delta))
    return out


def build_tier(bm, pts, z0, z1):
    """Frustum tier: full-size ring at the base, battered (inset) ring at the
    top, so the riser leans inward and the mound reads as one carved form."""
    top_pts = offset_polygon(pts, -BATTER)
    bottom = [bm.verts.new((x, y, z0)) for (x, y) in pts]
    top = [bm.verts.new((x, y, z1)) for (x, y) in top_pts]
    bm.verts.ensure_lookup_table()
    n = len(pts)
    try:
        bm.faces.new(list(reversed(bottom)))  # downward normal
    except ValueError:
        pass
    try:
        bm.faces.new(top)  # the step tread
    except ValueError:
        pass
    for i in range(n):  # sloped riser walls
        j = (i + 1) % n
        try:
            bm.faces.new([bottom[i], bottom[j], top[j], top[i]])
        except ValueError:
            pass


def build_coping_ring(bm, pts, z1):
    """Raised curb on the tread's outer edge: outer wall, flat cap, inner
    wall - a bright band tracing the tier and containing the tread pool."""
    outer_pts = offset_polygon(pts, -BATTER + COPING_LIP)
    inner_pts = offset_polygon(pts, -BATTER - COPING_W)
    ob = [bm.verts.new((x, y, z1)) for (x, y) in outer_pts]
    ot = [bm.verts.new((x, y, z1 + COPING_H)) for (x, y) in outer_pts]
    it_ = [bm.verts.new((x, y, z1 + COPING_H)) for (x, y) in inner_pts]
    ib = [bm.verts.new((x, y, z1)) for (x, y) in inner_pts]
    bm.verts.ensure_lookup_table()
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        for a, b in ((ob, ot), (ot, it_), (it_, ib)):
            try:
                bm.faces.new([a[i], a[j], b[j], b[i]])
            except ValueError:
                pass


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


def _finalize(bm, name, mat, side):
    if side == "L":
        for v in bm.verts:
            v.co.x = -v.co.x
    # triangulate n-gon caps for a well-defined tangent basis on export
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    _box_project_uvs(mesh)
    obj = bpy.data.objects.new(name, mesh)
    if mat:
        obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    _ensure_tangents(obj)


def build_side(side, mat):
    cx, cy = CENTER
    polys = []
    for (rx, ry, z0, z1, n, phase, ox, oy, seed) in TIERS:
        polys.append((tier_polygon(cx + ox, cy + oy, rx, ry, n, phase, seed), z0, z1))

    bm = bmesh.new()
    for (pts, z0, z1) in polys:
        build_tier(bm, pts, z0, z1)
    _finalize(bm, f"{GENERATED_PREFIX}Shell_{side}", mat, side)

    bm = bmesh.new()
    for (pts, _z0, z1) in polys:
        build_coping_ring(bm, pts, z1)
    _finalize(bm, f"{GENERATED_PREFIX}Coping_{side}", mat, side)


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
