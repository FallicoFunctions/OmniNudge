# Pass 2 of the cascade court: WATER for the volcano mound built by
# generate-cascade-court.py. Tier geometry comes from cascade_court_params.py
# (shared with the stone generator) so the water registers exactly:
#   - a reflecting pool inside the coping curb on each tier tread
#   - translucent glowing spill ribbons pouring over the curb at 2-3 notches
#     per tier (falling water is aerated and bright, not dark glass)
#   - a catch pool ringing the base, inside the floor curb
#   - low spray panels where the bottom spills land
#   - a summit crown: gold nozzle collar + rising translucent jet
#
# Families: V150_CascadeCourtWater_{L,R}  (V14_DeepReflectingWater)
#           V150_CascadeCourtSpill_{L,R}  (V18_CyanWaterMistGlow)
#           V150_CascadeCourtMist_{L,R}   (V18_CyanWaterMistGlow)
#           V150_CascadeCourtCrown_{L,R}  (V18_BrushedGoldTrim)
#           V150_CascadeCourtJet_{L,R}    (V18_CyanWaterMistGlow)
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-cascade-court-water.py -- --write
import math
import os
import random
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cascade_court_params import (  # noqa: E402
    BASE_POOL_OFF,
    BATTER,
    CATCH_Z,
    CENTER,
    COPING_H,
    COPING_W,
    TIERS,
    base_polygon,
    jitter_polygon,
    offset_polygon,
    tier_polygons,
)

GENERATED_PREFIX = "V150_CascadeCourt"
WATER_SUFFIXES = (
    "Water_R", "Water_L", "Spill_R", "Spill_L", "Mist_R", "Mist_L",
    "Crown_R", "Crown_L", "Jet_R", "Jet_L",
)

WATER_RISE = 0.02                      # pool sits a hair above the stone tread
POOL_INSET = BATTER + COPING_W + 0.12  # pool fills the tread inside the curb
SPILL_TOP = -(BATTER - 0.12)           # ribbon top just outside the curb face
SPILL_FLARE = 0.45                     # ribbon bottom flares past the tier base

# Summit crown: nozzle collar + jet sized against the top tier (z_top 4.0).
CROWN_R = 0.55       # nozzle collar radius
CROWN_H = 0.28       # nozzle collar height above the summit pool
JET_H = 2.1          # jet rises this far above the nozzle
JET_W = 0.5          # jet half-width at the nozzle


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and any(obj.name.startswith(GENERATED_PREFIX + s) for s in WATER_SUFFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)


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


def build_water(side, mat):
    bm = bmesh.new()
    polys = tier_polygons()
    for i, (pts, _z0, z1) in enumerate(polys):
        # tread pool inside the coping curb, edge-jittered so it reads as
        # water lapping the stone (pool surface sits below the curb top)
        add_ngon(bm, jitter_polygon(offset_polygon(pts, -POOL_INSET), 300 + i, amount=0.18), z1 + WATER_RISE)
    # catch pool ringing the base, offset from the base stone so it always
    # follows the mound's irregular footprint (edge concealed by the floor curb)
    add_ngon(bm, offset_polygon(polys[0][0], BASE_POOL_OFF), CATCH_Z)
    _finalize(bm, f"{GENERATED_PREFIX}Water_{side}", mat, side)


def build_spill(side, mat):
    """Discrete spill ribbons through 2-3 notches per tier, in the translucent
    glowing mist material: falling water is aerated and bright, not the dark
    pool glass (dark ribbons read as broken shards from above,
    player-flagged). Each ribbon starts just over the curb and lands on the
    tier below (or the catch pool)."""
    bm = bmesh.new()
    polys = tier_polygons()
    rng = random.Random(211)
    for i, (pts, _z0, z1) in enumerate(polys):
        z_top = z1 + COPING_H + 0.03
        z_bottom = (polys[i - 1][2] + WATER_RISE) if i > 0 else CATCH_Z + 0.02
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
            top = [push(ax, ay, SPILL_TOP), push(bx, by, SPILL_TOP)]
            bot = [push(ax, ay, SPILL_FLARE), push(bx, by, SPILL_FLARE)]
            vs = [
                bm.verts.new((top[0][0], top[0][1], z_top)),
                bm.verts.new((top[1][0], top[1][1], z_top)),
                bm.verts.new((bot[1][0], bot[1][1], z_bottom)),
                bm.verts.new((bot[0][0], bot[0][1], z_bottom)),
            ]
            bm.verts.ensure_lookup_table()
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
    _finalize(bm, f"{GENERATED_PREFIX}Spill_{side}", mat, side)


def build_mist(side, mat):
    base = base_polygon()
    cx, cy = CENTER
    rng = random.Random(97)
    bm = bmesh.new()
    # low crossed spray panels anchored to the ACTUAL base-tier edge midpoints
    # (exactly where the bottom spill sheets land in the catch pool), tapered
    # hard toward the top so they read as spray kicking up, not floating slabs
    m = len(base)
    for k in range(m):
        x0, y0 = base[k]
        x1, y1 = base[(k + 1) % m]
        px, py = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        # nudge the panel out over the catch pool ring
        dx, dy = px - cx, py - cy
        d = math.hypot(dx, dy) or 1.0
        px += dx / d * (BASE_POOL_OFF * 0.55)
        py += dy / d * (BASE_POOL_OFF * 0.55)
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


def build_crown(side, gold_mat, jet_mat):
    """Summit focal point: a low octagonal gold nozzle collar at the center of
    the summit pool, and a tapered translucent jet rising from it."""
    cx, cy = CENTER
    summit_top = TIERS[-1][3]
    ox, oy = TIERS[-1][6], TIERS[-1][7]
    px, py = cx + ox, cy + oy
    z0 = summit_top + WATER_RISE

    bm = bmesh.new()
    n = 8
    outer = [(px + CROWN_R * math.cos(2 * math.pi * k / n),
              py + CROWN_R * math.sin(2 * math.pi * k / n)) for k in range(n)]
    inner = [(px + CROWN_R * 0.55 * math.cos(2 * math.pi * k / n),
              py + CROWN_R * 0.55 * math.sin(2 * math.pi * k / n)) for k in range(n)]
    ob = [bm.verts.new((x, y, z0)) for (x, y) in outer]
    ot = [bm.verts.new((x, y, z0 + CROWN_H)) for (x, y) in outer]
    it_ = [bm.verts.new((x, y, z0 + CROWN_H)) for (x, y) in inner]
    bm.verts.ensure_lookup_table()
    for i in range(n):
        j = (i + 1) % n
        for a, b in ((ob, ot), (ot, it_)):
            try:
                bm.faces.new([a[i], a[j], b[j], b[i]])
            except ValueError:
                pass
    _finalize(bm, f"{GENERATED_PREFIX}Crown_{side}", gold_mat, side)

    # jet: four crossed sheets rising from inside the collar, each in two
    # stacked segments - wide at the nozzle, bulging slightly at mid-height,
    # tapering hard at the crest like a real pressure jet
    bm = bmesh.new()
    jz0 = z0 + CROWN_H * 0.5
    jz_mid = jz0 + JET_H * 0.45
    jz_top = jz0 + JET_H
    for k in range(4):
        a = math.pi * k / 4.0
        ux, uy = math.cos(a), math.sin(a)
        for (za, zb, wa, wb) in ((jz0, jz_mid, 1.0, 1.15), (jz_mid, jz_top, 1.15, 0.15)):
            q = [
                (px - ux * JET_W * wa, py - uy * JET_W * wa, za),
                (px + ux * JET_W * wa, py + uy * JET_W * wa, za),
                (px + ux * JET_W * wb, py + uy * JET_W * wb, zb),
                (px - ux * JET_W * wb, py - uy * JET_W * wb, zb),
            ]
            vs = [bm.verts.new(v) for v in q]
            bm.verts.ensure_lookup_table()
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
    _finalize(bm, f"{GENERATED_PREFIX}Jet_{side}", jet_mat, side)


def main():
    write = "--write" in sys.argv
    clear_previous()
    water = bpy.data.materials.get("V14_DeepReflectingWater")
    mist = bpy.data.materials.get("V18_CyanWaterMistGlow")
    gold = bpy.data.materials.get("V18_BrushedGoldTrim")
    for side in ("R", "L"):
        build_water(side, water)
        build_spill(side, mist)
        build_mist(side, mist)
        build_crown(side, gold, mist)
    count = len([o for o in bpy.data.objects
                 if any(o.name.startswith(GENERATED_PREFIX + s) for s in WATER_SUFFIXES)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"CASCADE_WATER_GENERATED objects={count} written={write}")


main()
