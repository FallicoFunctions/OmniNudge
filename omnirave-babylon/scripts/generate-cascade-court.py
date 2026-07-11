# Procedural tiered-cascade water court for the Main Stage flank pockets.
#
# Each flank pocket is a bare ~38x37 floor. This builds a VOLCANO-like tiered
# fountain mound centered in each pocket: stacked irregular battered tiers
# tapering to a summit, each rimmed by a raised pearl coping curb, with a
# matching curb ringing the catch basin where the fountain meets the plaza.
#
# Tier geometry lives in cascade_court_params.py, shared with the water
# generator so the water always registers exactly with the stone.
#
# Pass 1 authors the STONE (shell + coping). Water/mist/crown come from
# generate-cascade-court-water.py under the same V150_CascadeCourt* namespace.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-cascade-court.py -- --write
import os
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cascade_court_params import (  # noqa: E402
    BASE_CURB_H,
    BASE_CURB_IN,
    BASE_CURB_OUT,
    BATTER,
    COPING_H,
    COPING_LIP,
    COPING_W,
    offset_polygon,
    tier_polygons,
)

GENERATED_PREFIX = "V150_CascadeCourt"
STONE_SUFFIXES = (
    "Shell_R", "Shell_L", "Coping_R", "Coping_L", "Waterline_R", "Waterline_L",
    "GoldInlay_R", "GoldInlay_L",
)

CHAMFER = 0.035     # eased edge on every curb: sharp 90-degree rims read as CG
WATERLINE_H = 0.13  # wet stain band height above each tier's base

# Gold inlay band set into every curb cap: ties the fountain into the venue's
# gold-and-pearl language. Sits proud of the cap by a real physical lift (the
# venue's seal-script convention) so it can never z-fight the stone.
INLAY_OUT = 0.12    # band outer edge, inset from the curb's outer face
INLAY_W = 0.12      # band width
INLAY_LIFT = 0.008


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and any(obj.name.startswith(GENERATED_PREFIX + s) for s in STONE_SUFFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)


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


def build_curb_ring(bm, outer_pts, inner_pts, z0, z1):
    """Raised curb: outer wall, chamfered shoulder, flat cap, inner wall.
    The eased 45-degree shoulder catches highlights the way machined stone
    does - dead-sharp rims are one of the strongest CG tells."""
    chamfered = offset_polygon(outer_pts, -CHAMFER)
    ob = [bm.verts.new((x, y, z0)) for (x, y) in outer_pts]
    om = [bm.verts.new((x, y, z1 - CHAMFER)) for (x, y) in outer_pts]
    ot = [bm.verts.new((x, y, z1)) for (x, y) in chamfered]
    it_ = [bm.verts.new((x, y, z1)) for (x, y) in inner_pts]
    ib = [bm.verts.new((x, y, z0)) for (x, y) in inner_pts]
    bm.verts.ensure_lookup_table()
    n = len(outer_pts)
    for i in range(n):
        j = (i + 1) % n
        for a, b in ((ob, om), (om, ot), (ot, it_), (it_, ib)):
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
    try:
        obj.data.calc_tangents()
    except Exception:
        pass


def build_side(side, mat, gold_mat):
    polys = tier_polygons()

    bm = bmesh.new()
    for (pts, z0, z1) in polys:
        build_tier(bm, pts, z0, z1)
    _finalize(bm, f"{GENERATED_PREFIX}Shell_{side}", mat, side)

    bm = bmesh.new()
    for (pts, _z0, z1) in polys:  # tier curbs
        build_curb_ring(
            bm,
            offset_polygon(pts, -BATTER + COPING_LIP),
            offset_polygon(pts, -BATTER - COPING_W),
            z1,
            z1 + COPING_H,
        )
    # floor curb ringing the catch basin - the fountain's edge against the
    # plaza, so the base doesn't just vanish into flat paving. Offset from
    # the base tier's own polygon so it always follows the stone.
    base = polys[0][0]
    build_curb_ring(
        bm,
        offset_polygon(base, BASE_CURB_OUT),
        offset_polygon(base, BASE_CURB_IN),
        0.0,
        BASE_CURB_H,
    )
    _finalize(bm, f"{GENERATED_PREFIX}Coping_{side}", mat, side)

    # waterline stain: a darker wet band ringing each tier's base where the
    # pool below laps the riser - real fountains carry this mark, and its
    # absence is a strong CG tell
    bm = bmesh.new()
    for (pts, z0, _z1) in polys:
        lo_pts = offset_polygon(pts, 0.02)
        hi_pts = offset_polygon(pts, 0.02 - WATERLINE_H * 0.45)  # follow the batter
        lo = [bm.verts.new((x, y, z0 + 0.02)) for (x, y) in lo_pts]
        hi = [bm.verts.new((x, y, z0 + 0.02 + WATERLINE_H)) for (x, y) in hi_pts]
        bm.verts.ensure_lookup_table()
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
            except ValueError:
                pass
    _finalize(bm, f"{GENERATED_PREFIX}Waterline_{side}", mat, side)

    # gold inlay bands set into every curb cap (tier curbs + base curb) -
    # the venue's gold-on-pearl signature, tracing the fountain's levels
    bm = bmesh.new()
    def add_inlay(ring_pts, cap_outer_off, z_cap):
        outer = offset_polygon(ring_pts, cap_outer_off - INLAY_OUT)
        inner = offset_polygon(ring_pts, cap_outer_off - INLAY_OUT - INLAY_W)
        z = z_cap + INLAY_LIFT
        ov = [bm.verts.new((x, y, z)) for (x, y) in outer]
        iv = [bm.verts.new((x, y, z)) for (x, y) in inner]
        bm.verts.ensure_lookup_table()
        n = len(ring_pts)
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new([ov[i], ov[j], iv[j], iv[i]])
            except ValueError:
                pass
    for (pts, _z0, z1) in polys:
        add_inlay(pts, -BATTER + COPING_LIP, z1 + COPING_H)
    add_inlay(base, BASE_CURB_OUT, BASE_CURB_H)
    _finalize(bm, f"{GENERATED_PREFIX}GoldInlay_{side}", gold_mat, side)


def main():
    write = "--write" in sys.argv
    clear_previous()
    pearl = bpy.data.materials.get("V15_PearlShellBeveled")
    gold = bpy.data.materials.get("V18_BrushedGoldTrim")
    build_side("R", pearl, gold)
    build_side("L", pearl, gold)
    count = len([o for o in bpy.data.objects
                 if any(o.name.startswith(GENERATED_PREFIX + s) for s in STONE_SUFFIXES)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"CASCADE_GENERATED objects={count} written={write}")


main()
