# Pass 2 of the cascade court: WATER for the volcano mound built by
# generate-cascade-court.py. Reuses the identical seeded tier polygons so the
# water aligns exactly with the stone tiers:
#   - a reflecting water sheet pooling on each tier tread
#   - spill curtains sheeting down every tier riser (water flows down all sides)
#   - mist plumes around the base where the water collects
#
# Families: V150_CascadeCourtWater_{L,R} (V14_DeepReflectingWater),
#           V150_CascadeCourtMist_{L,R}  (V18_CyanWaterMistGlow).
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-cascade-court-water.py -- --write
import math
import random
import sys

import bpy
import bmesh

GENERATED_PREFIX = "V150_CascadeCourt"
WATER_SUFFIXES = ("Water_R", "Water_L", "Mist_R", "Mist_L")

# MUST match generate-cascade-court.py exactly so water lands on the stone.
CENTER = (48.5, 28.5)
TIERS = [
    (13.0, 10.6, 0.00, 0.80, 11, 0.15, 0.0, 0.0, 11),
    (10.6, 8.6, 0.80, 1.60, 9, 0.55, 0.9, -0.6, 27),
    (8.2, 6.6, 1.60, 2.40, 10, 1.10, -0.8, 0.7, 43),
    (5.8, 4.7, 2.40, 3.20, 8, 0.30, 0.6, 0.5, 61),
    (3.6, 3.0, 3.20, 4.00, 7, 0.90, -0.5, -0.4, 79),
]
WATER_RISE = 0.02   # water sits a hair above the stone tread
INSET = 0.45        # water pulls in from the stone edge
OUTSET = 0.06       # spill curtain sits just outside the riser face


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and any(obj.name.startswith(GENERATED_PREFIX + s) for s in WATER_SUFFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name, fallback):
    m = bpy.data.materials.get(name)
    return m if m else bpy.data.materials.get(fallback)


def tier_polygon(cx, cy, rx, ry, n, phase, seed):
    rng = random.Random(seed)
    pts = []
    for k in range(n):
        a = phase + 2.0 * math.pi * k / n
        r_mult = 0.80 + 0.40 * rng.random()
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


def add_ngon(bm, pts, z):
    vs = [bm.verts.new((x, y, z)) for (x, y) in pts]
    bm.verts.ensure_lookup_table()
    try:
        bm.faces.new(vs)
    except ValueError:
        pass


def add_curtain(bm, pts, z_top, z_bottom):
    top = [bm.verts.new((x, y, z_top)) for (x, y) in pts]
    bot = [bm.verts.new((x, y, z_bottom)) for (x, y) in pts]
    bm.verts.ensure_lookup_table()
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        try:
            bm.faces.new([top[i], top[j], bot[j], bot[i]])
        except ValueError:
            pass


def _box_project_uvs(mesh, cube_size=1.5):
    uv_layer = mesh.uv_layers.new(name="CascadeWaterUV")
    for poly in mesh.polygons:
        nrm = poly.normal
        axis = max(range(3), key=lambda i: abs(nrm[i]))
        u_axis, v_axis = [i for i in range(3) if i != axis]
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer.data[li].uv = (co[u_axis] / cube_size, co[v_axis] / cube_size)


def _finalize(bm, name, mat, side):
    if side == "L":
        for v in bm.verts:
            v.co.x = -v.co.x
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


def build_water(side, mat):
    cx, cy = CENTER
    bm = bmesh.new()
    levels = []
    polys = []
    for (rx, ry, z0, z1, n, phase, ox, oy, seed) in TIERS:
        pts = tier_polygon(cx + ox, cy + oy, rx, ry, n, phase, seed)
        polys.append(pts)
        levels.append(z1 + WATER_RISE)
    for i, pts in enumerate(polys):
        add_ngon(bm, offset_polygon(pts, -INSET), levels[i])          # tread pool
        z_bottom = levels[i - 1] if i > 0 else 0.06                    # spill to tier below
        add_curtain(bm, offset_polygon(pts, OUTSET), levels[i], z_bottom)
    _finalize(bm, f"{GENERATED_PREFIX}Water_{side}", mat, side)


def build_mist(side, mat):
    cx, cy = CENTER
    rx, ry = TIERS[0][0], TIERS[0][1]
    rng = random.Random(97)
    bm = bmesh.new()
    # crossed vertical planes ringing the base where water collects; each plume
    # split into two stacked segments and height-jittered so it reads as spray
    # rather than a picket fence.
    plumes = 14
    for k in range(plumes):
        a = 0.4 + 2.0 * math.pi * k / plumes
        px = cx + rx * 0.98 * math.cos(a)
        py = cy + ry * 0.98 * math.sin(a)
        h = 1.3 + 0.9 * rng.random()
        w = 0.6
        mid = 0.1 + h * 0.55
        for (ux, uy) in ((math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))):
            for (zb, zt, taper) in ((0.1, mid, 1.0), (mid, 0.1 + h, 0.55)):
                q = [
                    (px - ux * w, py - uy * w, zb),
                    (px + ux * w, py + uy * w, zb),
                    (px + ux * w * taper, py + uy * w * taper, zt),
                    (px - ux * w * taper, py - uy * w * taper, zt),
                ]
                vs = [bm.verts.new(v) for v in q]
                bm.verts.ensure_lookup_table()
                try:
                    bm.faces.new(vs)
                except ValueError:
                    pass
    _finalize(bm, f"{GENERATED_PREFIX}Mist_{side}", mat, side)


def main():
    write = "--write" in sys.argv
    clear_previous()
    water = get_material("V14_DeepReflectingWater", "V14_DeepReflectingWater")
    mist = get_material("V18_CyanWaterMistGlow", "V18_CyanWaterMistGlow")
    for side in ("R", "L"):
        build_water(side, water)
        build_mist(side, mist)
    count = len([o for o in bpy.data.objects
                 if any(o.name.startswith(GENERATED_PREFIX + s) for s in WATER_SUFFIXES)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"CASCADE_WATER_GENERATED objects={count} written={write}")


main()
