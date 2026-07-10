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
STONE_SUFFIXES = ("Shell_R", "Shell_L", "Coping_R", "Coping_L")


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
    """Raised curb: outer wall, flat cap, inner wall - a bright band that
    traces a level and contains the water inside it."""
    ob = [bm.verts.new((x, y, z0)) for (x, y) in outer_pts]
    ot = [bm.verts.new((x, y, z1)) for (x, y) in outer_pts]
    it_ = [bm.verts.new((x, y, z1)) for (x, y) in inner_pts]
    ib = [bm.verts.new((x, y, z0)) for (x, y) in inner_pts]
    bm.verts.ensure_lookup_table()
    n = len(outer_pts)
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


def build_side(side, mat):
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


def main():
    write = "--write" in sys.argv
    clear_previous()
    pearl = bpy.data.materials.get("V15_PearlShellBeveled")
    build_side("R", pearl)
    build_side("L", pearl)
    count = len([o for o in bpy.data.objects
                 if any(o.name.startswith(GENERATED_PREFIX + s) for s in STONE_SUFFIXES)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"CASCADE_GENERATED objects={count} written={write}")


main()
