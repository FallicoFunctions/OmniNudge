# Pass 3 of the cascade court: GARDENS + LANTERNS around the fountain.
#
# Four planter-walled garden beds hug the court's diagonal corners - each an
# arc following the fountain's own base polygon (radial support + gap, so the
# beds can never clip the stone), with a raised pearl planter wall, a dark
# soil fill, and layered foliage mounds (understory + canopy). Four lantern
# posts (matte stem, gold housing, warm core - the venue's basin lantern
# vocabulary) mark the approach gaps between beds on the east and west sides.
#
# Families: V150_CascadeCourtPlanter_{L,R}         (V15_PearlShellBeveled)
#           V150_CascadeCourtUnderstory_{L,R}      (V16_DeepGardenPlanting)
#           V150_CascadeCourtCanopy_{L,R}          (V14_LayeredGardenPlanting)
#           V150_CascadeCourtLanternStem_{L,R}     (V14_MatteBlackProductionRig)
#           V150_CascadeCourtLanternHousing_{L,R}  (V20_ChasedGoldFiligree)
#           V150_CascadeCourtLanternCore_{L,R}     (V14_WarmBasinPractical)
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-cascade-court-gardens.py -- --write
import math
import os
import random
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cascade_court_params import (  # noqa: E402
    CENTER,
    _radial_support,
    base_polygon,
)

GENERATED_PREFIX = "V150_CascadeCourt"
GARDEN_SUFFIXES = (
    "Planter_R", "Planter_L", "Understory_R", "Understory_L",
    "Canopy_R", "Canopy_L", "LanternStem_R", "LanternStem_L",
    "LanternHousing_R", "LanternHousing_L", "LanternCore_R", "LanternCore_L",
)

# Beds hug the four diagonal corners of the pocket around the fountain.
BED_ANGLES = [math.pi * 0.25, math.pi * 0.75, math.pi * 1.25, math.pi * 1.75]
BED_HALF_ARC = 0.55   # radians each side of the bed's center angle
BED_ARC_STEPS = 9     # samples along the arc
BED_GAP = 1.15        # clearance between the base curb and the bed wall
BED_W = 2.0           # radial depth of the bed
PLANTER_H = 0.34
PLANTER_T = 0.16      # wall thickness
SOIL_Z = 0.26         # dark fill surface inside the planter

# Lanterns mark the approach gaps between beds, flanking east and west.
LANTERN_ANGLES = [0.44, -0.44, math.pi - 0.44, math.pi + 0.44]
LANTERN_GAP = 1.7
STEM_W = 0.09
STEM_H = 2.1
# Lantern head: the warm core is EXPOSED (glow must escape - a core sealed
# inside a solid housing reads as a dead post), capped by a wider gold lid.
CORE_W = 0.18
CORE_H = 0.34
CAP_W = 0.27
CAP_H = 0.16

# Pocket safety box (court coords): keep everything clear of the pyro pod,
# spawn canopy, and flanking structures.
BOX_X = (32.2, 66.2)
BOX_Y = (17.2, 39.8)


def clamp_pt(x, y):
    return (min(max(x, BOX_X[0]), BOX_X[1]), min(max(y, BOX_Y[0]), BOX_Y[1]))


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and any(obj.name.startswith(GENERATED_PREFIX + s) for s in GARDEN_SUFFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        raise RuntimeError(f"required material missing from blend: {name}")
    return mat


def bed_rings(base, angle):
    """Inner and outer arc samples for a bed, following the fountain's own
    base polygon so the gap to the stone is constant."""
    cx, cy = CENTER
    inner, outer = [], []
    for k in range(BED_ARC_STEPS):
        a = angle - BED_HALF_ARC + 2.0 * BED_HALF_ARC * k / (BED_ARC_STEPS - 1)
        ux, uy = math.cos(a), math.sin(a)
        s = _radial_support(base, cx, cy, ux, uy)
        r0 = s + BED_GAP
        r1 = r0 + BED_W
        inner.append(clamp_pt(cx + ux * r0, cy + uy * r0))
        outer.append(clamp_pt(cx + ux * r1, cy + uy * r1))
    return inner, outer


def bed_boundary(inner, outer):
    return inner + outer[::-1]


def shrink_boundary(pts, delta):
    """Pull a closed boundary inward by delta toward its centroid direction -
    adequate for these compact kidney-shaped bed outlines."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    out = []
    for (x, y) in pts:
        dx, dy = x - cx, y - cy
        d = math.hypot(dx, dy) or 1.0
        out.append((x - dx / d * delta, y - dy / d * delta))
    return out


def add_loop_wall(bm, outer_pts, inner_pts, z0, z1, chamfer=0.03):
    """Closed curb: outer wall, chamfered shoulder, flat top, inner wall -
    matches the fountain coping's eased-edge treatment."""
    shoulder = shrink_boundary(outer_pts, chamfer)
    ob = [bm.verts.new((x, y, z0)) for (x, y) in outer_pts]
    om = [bm.verts.new((x, y, z1 - chamfer)) for (x, y) in outer_pts]
    ot = [bm.verts.new((x, y, z1)) for (x, y) in shoulder]
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


def add_ngon(bm, pts, z):
    vs = [bm.verts.new((x, y, z)) for (x, y) in pts]
    bm.verts.ensure_lookup_table()
    try:
        bm.faces.new(vs)
    except ValueError:
        pass


def add_blob(bm, px, py, r, z0, z1, seed):
    """Irregular foliage mound: jittered 7-gon in two stacked stages (wide
    base, bulged middle, tight crown) so the silhouette reads rounded rather
    than as an obvious cone."""
    rng = random.Random(seed)
    n = 7
    zm = z0 + (z1 - z0) * 0.55
    lower, middle, upper = [], [], []
    for k in range(n):
        a = 2.0 * math.pi * k / n + rng.random() * 0.35
        rr = r * (0.8 + 0.4 * rng.random())
        lower.append((px + rr * math.cos(a), py + rr * math.sin(a)))
        middle.append((px + rr * 0.92 * math.cos(a + 0.2), py + rr * 0.92 * math.sin(a + 0.2)))
        upper.append((px + rr * 0.42 * math.cos(a + 0.4), py + rr * 0.42 * math.sin(a + 0.4)))
    lo = [bm.verts.new((x, y, z0)) for (x, y) in lower]
    mid = [bm.verts.new((x, y, zm)) for (x, y) in middle]
    hi = [bm.verts.new((x, y, z1)) for (x, y) in upper]
    bm.verts.ensure_lookup_table()
    for ring_a, ring_b in ((lo, mid), (mid, hi)):
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new([ring_a[i], ring_a[j], ring_b[j], ring_b[i]])
            except ValueError:
                pass
    try:
        bm.faces.new(hi)
    except ValueError:
        pass


def add_box(bm, px, py, w, z0, z1):
    corners = [(px - w, py - w), (px + w, py - w), (px + w, py + w), (px - w, py + w)]
    lo = [bm.verts.new((x, y, z0)) for (x, y) in corners]
    hi = [bm.verts.new((x, y, z1)) for (x, y) in corners]
    bm.verts.ensure_lookup_table()
    for i in range(4):
        j = (i + 1) % 4
        try:
            bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
        except ValueError:
            pass
    try:
        bm.faces.new(hi)
    except ValueError:
        pass
    try:
        bm.faces.new(list(reversed(lo)))
    except ValueError:
        pass


def _box_project_uvs(mesh, cube_size=1.5):
    uv_layer = mesh.uv_layers.new(name="CascadeGardenUV")
    for poly in mesh.polygons:
        nrm = poly.normal
        axis = max(range(3), key=lambda i: abs(nrm[i]))
        u_axis, v_axis = [i for i in range(3) if i != axis]
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer.data[li].uv = (co[u_axis] / cube_size, co[v_axis] / cube_size)


def _finalize(bm, name, mat, side, with_uv=True, smooth=False):
    if side == "L":
        for v in bm.verts:
            v.co.x = -v.co.x
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    # Untextured families (garden planting, warm cores) export POSITION+NORMAL
    # only, matching their existing V33 counterparts: the runtime merges
    # same-material meshes and requires identical vertex attribute sets.
    if with_uv:
        _box_project_uvs(mesh)
    if smooth:
        # foliage reads as painted boulders when flat-shaded; smooth normals
        # make the low-poly mounds read as soft plant mass
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    if with_uv:
        try:
            obj.data.calc_tangents()
        except Exception:
            pass


def lantern_positions(base):
    cx, cy = CENTER
    out = []
    for a in LANTERN_ANGLES:
        ux, uy = math.cos(a), math.sin(a)
        s = _radial_support(base, cx, cy, ux, uy)
        out.append(clamp_pt(cx + ux * (s + LANTERN_GAP), cy + uy * (s + LANTERN_GAP)))
    return out


def build_side(side, mats):
    base = base_polygon()
    beds = [bed_rings(base, a) for a in BED_ANGLES]

    bm = bmesh.new()
    for (inner, outer) in beds:
        boundary = bed_boundary(inner, outer)
        add_loop_wall(bm, boundary, shrink_boundary(boundary, PLANTER_T), 0.0, PLANTER_H)
    _finalize(bm, f"{GENERATED_PREFIX}Planter_{side}", mats["planter"], side)

    bm = bmesh.new()
    rng = random.Random(401)
    for bi, (inner, outer) in enumerate(beds):
        boundary = bed_boundary(inner, outer)
        add_ngon(bm, shrink_boundary(boundary, PLANTER_T * 0.5), SOIL_Z)  # soil fill
        # dense groundcover: sparse blobs left bare soil reading as empty
        for off in (-0.38, -0.13, 0.12, 0.36):
            k = int((len(inner) - 1) * (0.5 + off))
            mx = (inner[k][0] + outer[k][0]) / 2.0
            my = (inner[k][1] + outer[k][1]) / 2.0
            add_blob(bm, mx, my, 0.95, SOIL_Z, 0.72 + 0.1 * rng.random(), 500 + bi * 10 + k)
    _finalize(bm, f"{GENERATED_PREFIX}Understory_{side}", mats["understory"], side, with_uv=False, smooth=True)

    bm = bmesh.new()
    rng = random.Random(402)
    for bi, (inner, outer) in enumerate(beds):
        for off in (-0.33, 0.0, 0.35):
            k = int((len(inner) - 1) * (0.5 + off))
            mx = (inner[k][0] + outer[k][0]) / 2.0
            my = (inner[k][1] + outer[k][1]) / 2.0
            if off == 0.0:
                # one taller accent shrub per bed so the silhouette varies
                add_blob(bm, mx, my, 0.5, 0.45, 1.45 + 0.2 * rng.random(), 600 + bi * 10 + k)
            else:
                add_blob(bm, mx, my, 0.62, 0.45, 1.1 + 0.25 * rng.random(), 600 + bi * 10 + k)
    _finalize(bm, f"{GENERATED_PREFIX}Canopy_{side}", mats["canopy"], side, with_uv=False, smooth=True)

    posts = lantern_positions(base)
    bm = bmesh.new()
    for (px, py) in posts:
        add_box(bm, px, py, STEM_W, 0.0, STEM_H)
    _finalize(bm, f"{GENERATED_PREFIX}LanternStem_{side}", mats["stem"], side)

    bm = bmesh.new()
    for (px, py) in posts:
        add_box(bm, px, py, CAP_W, STEM_H + CORE_H, STEM_H + CORE_H + CAP_H)
    _finalize(bm, f"{GENERATED_PREFIX}LanternHousing_{side}", mats["housing"], side)

    bm = bmesh.new()
    for (px, py) in posts:
        add_box(bm, px, py, CORE_W, STEM_H, STEM_H + CORE_H)
    _finalize(bm, f"{GENERATED_PREFIX}LanternCore_{side}", mats["core"], side, with_uv=False)


def main():
    write = "--write" in sys.argv
    clear_previous()
    mats = {
        "planter": get_material("V15_PearlShellBeveled"),
        "understory": get_material("V16_DeepGardenPlanting"),
        "canopy": get_material("V14_LayeredGardenPlanting"),
        "stem": get_material("V14_MatteBlackProductionRig"),
        "housing": get_material("V20_ChasedGoldFiligree"),
        "core": get_material("V14_WarmBasinPractical"),
    }
    for side in ("R", "L"):
        build_side(side, mats)
    count = len([o for o in bpy.data.objects
                 if any(o.name.startswith(GENERATED_PREFIX + s) for s in GARDEN_SUFFIXES)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"CASCADE_GARDENS_GENERATED objects={count} written={write}")


main()
