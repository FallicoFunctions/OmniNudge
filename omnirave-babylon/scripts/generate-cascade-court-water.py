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
OUTSET = 0.10       # spill curtain top sits just outside the riser lip
SPILL_FLARE = 0.55  # spill curtain bottom flares outward - falling water is
                    # visibly proud of the stone instead of shrink-wrapping it
CATCH_RX = 14.2     # irregular catch basin pooling around the mound base
CATCH_RY = 11.4
CATCH_Z = 0.07


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and any(obj.name.startswith(GENERATED_PREFIX + s) for s in WATER_SUFFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name, fallback):
    m = bpy.data.materials.get(name)
    return m if m else bpy.data.materials.get(fallback)


def tier_polygon(cx, cy, rx, ry, n, phase, seed, j_lo=0.80, j_hi=1.20):
    rng = random.Random(seed)
    pts = []
    for k in range(n):
        a = phase + 2.0 * math.pi * k / n
        r_mult = j_lo + (j_hi - j_lo) * rng.random()
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


def jitter_polygon(pts, seed, amount=0.3):
    """Radial jitter so water edges never run parallel to the stone edges."""
    rng = random.Random(seed)
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for (x, y) in pts:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy) or 1.0
        delta = (rng.random() * 2.0 - 1.0) * amount
        out.append((x + dx / d * delta, y + dy / d * delta))
    return out


def build_water(side, mat):
    cx, cy = CENTER
    bm = bmesh.new()
    levels = []
    polys = []
    for (rx, ry, z0, z1, n, phase, ox, oy, seed) in TIERS:
        pts = tier_polygon(cx + ox, cy + oy, rx, ry, n, phase, seed)
        polys.append(pts)
        levels.append(z1 + WATER_RISE)
    rng = random.Random(211)
    for i, pts in enumerate(polys):
        # tread pool, edge-jittered so it reads as water lapping the stone
        add_ngon(bm, jitter_polygon(offset_polygon(pts, -INSET), 300 + i), levels[i])
        # discrete spill ribbons through 2-3 notches per tier. A continuous
        # flared skirt off every edge produced stray angular wedges that read
        # as solid slabs (player-flagged); real cascades pour at a few points.
        z_bottom = levels[i - 1] if i > 0 else CATCH_Z + 0.02
        n = len(pts)
        cx0 = sum(p[0] for p in pts) / n
        cy0 = sum(p[1] for p in pts) / n
        spills = rng.sample(range(n), 3 if i < 3 else 2)
        for k in spills:
            x0, y0 = pts[k]
            x1, y1 = pts[(k + 1) % n]
            # ribbon spans the middle 60% of the edge
            ax, ay = x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2
            bx, by = x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.8
            def push(px, py, dist):
                dx, dy = px - cx0, py - cy0
                d = math.hypot(dx, dy) or 1.0
                return (px + dx / d * dist, py + dy / d * dist)
            top = [push(ax, ay, OUTSET), push(bx, by, OUTSET)]
            bot = [push(ax, ay, OUTSET + SPILL_FLARE), push(bx, by, OUTSET + SPILL_FLARE)]
            vs = [
                bm.verts.new((top[0][0], top[0][1], levels[i])),
                bm.verts.new((top[1][0], top[1][1], levels[i])),
                bm.verts.new((bot[1][0], bot[1][1], z_bottom)),
                bm.verts.new((bot[0][0], bot[0][1], z_bottom)),
            ]
            bm.verts.ensure_lookup_table()
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
    # irregular catch basin pooling around the whole mound base (tight jitter
    # so the pool stays inside the pocket envelope)
    catch = tier_polygon(cx, cy, CATCH_RX, CATCH_RY, 13, 0.75, 113, j_lo=0.88, j_hi=1.06)
    add_ngon(bm, catch, CATCH_Z)
    _finalize(bm, f"{GENERATED_PREFIX}Water_{side}", mat, side)


def build_mist(side, mat):
    cx, cy = CENTER
    (rx, ry, _z0, _z1, n, phase, ox, oy, seed) = TIERS[0]
    base = tier_polygon(cx + ox, cy + oy, rx, ry, n, phase, seed)
    rng = random.Random(97)
    bm = bmesh.new()
    # low crossed spray panels anchored to the ACTUAL base-tier edge midpoints
    # (exactly where the bottom spill sheets land in the catch basin), tapered
    # hard toward the top so they read as spray kicking up, not floating slabs
    m = len(base)
    for k in range(m):
        x0, y0 = base[k]
        x1, y1 = base[(k + 1) % m]
        px, py = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        # nudge the panel just outside the spill line
        dx, dy = px - cx, py - cy
        d = math.hypot(dx, dy) or 1.0
        px += dx / d * (OUTSET + SPILL_FLARE * 0.6)
        py += dy / d * (OUTSET + SPILL_FLARE * 0.6)
        h = 0.5 + 0.45 * rng.random()
        w = 0.45 + 0.25 * rng.random()
        el = math.hypot(x1 - x0, y1 - y0) or 1.0
        ex, ey = (x1 - x0) / el, (y1 - y0) / el  # along-edge direction
        for (ux, uy) in ((ex, ey), (-ey, ex)):
            q = [
                (px - ux * w, py - uy * w, 0.08),
                (px + ux * w, py + uy * w, 0.08),
                (px + ux * w * 0.3, py + uy * w * 0.3, 0.08 + h),
                (px - ux * w * 0.3, py - uy * w * 0.3, 0.08 + h),
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
