# Procedural gothic arcade/colonnade kit for the Main Stage wings.
#
# The concept art (approved-concept-*.png) is a Tomorrowland-grade ornate
# palace whose grandeur is built from ONE repeated motif: the pointed-arch
# colonnade, tiled across every facade. The blockout has smooth shell masses
# where those arcades belong. This script generates the module procedurally
# and tiles it along the wing facade lines, so the density scales without
# hand-modelling every arch.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-main-stage-arcades.py -- --write
import math
import sys

import bpy
import bmesh
from mathutils import Vector

GENERATED_PREFIX = "V140_WingArcade"  # own namespace; safe to clear+regen


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith(GENERATED_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name, fallback):
    m = bpy.data.materials.get(name)
    if m:
        return m
    return bpy.data.materials.get(fallback)


def add_box(bm, cx, cy, cz, sx, sy, sz):
    """Axis-aligned box centered at (cx,cy,cz) with half-extents given by s*/2."""
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    verts = []
    for dx in (-hx, hx):
        for dy in (-hy, hy):
            for dz in (-hz, hz):
                verts.append(bm.verts.new((cx + dx, cy + dy, cz + dz)))
    bm.verts.ensure_lookup_table()
    # 6 faces of the cuboid (indices into the 8-corner order above)
    faces = [(0,1,3,2),(4,6,7,5),(0,2,6,4),(1,5,7,3),(0,4,5,1),(2,3,7,6)]
    for f in faces:
        bm.faces.new([verts[i] for i in f])


def _arch_top_edge(x_left, x_right, z_spring, segments):
    """Points along a pointed (equilateral) arch's underside, left->apex->right."""
    w = x_right - x_left
    r = w
    apex_x = (x_left + x_right) / 2
    pts = []
    for i in range(segments + 1):
        t = i / segments
        if t <= 0.5:
            cx = x_right
            a = math.pi + (math.acos((apex_x - cx) / r) - math.pi) * (t / 0.5)
        else:
            cx = x_left
            a0 = math.acos((apex_x - cx) / r)
            a = a0 + (0.0 - a0) * ((t - 0.5) / 0.5)
        pts.append((cx + r * math.cos(a), z_spring + r * math.sin(a)))
    return pts


def add_arch_spandrel(bm, x_left, x_right, z_spring, z_top, y, depth, segments=12):
    """Solid spandrel wall spanning [x_left,x_right] from z_spring up to z_top,
    with a pointed-arch opening cut into its underside. Built as a filled
    outline extruded in Y - robust, no swept-tube winding issues."""
    arch = _arch_top_edge(x_left, x_right, z_spring, segments)
    # outline (CCW in XZ): along arch underside L->R, up right jamb, across
    # top R->L, down left jamb back to start.
    outline = list(arch) + [(x_right, z_top), (x_left, z_top)]
    front = [bm.verts.new((px, y - depth / 2, pz)) for (px, pz) in outline]
    back = [bm.verts.new((px, y + depth / 2, pz)) for (px, pz) in outline]
    bm.verts.ensure_lookup_table()
    try:
        bm.faces.new(front)
    except ValueError:
        pass
    try:
        bm.faces.new(list(reversed(back)))
    except ValueError:
        pass
    # side walls connecting the two caps so it reads solid
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        try:
            bm.faces.new([front[i], front[j], back[j], back[i]])
        except ValueError:
            pass


def _box_project_uvs(mesh, cube_size=1.5):
    """Cube-projected UVs, matching the venue's own generated-UV convention
    (see scripts/apply-main-stage-pbr-textures.py) - dominant-axis planar
    projection per face, scaled to a fixed world-space tile size."""
    uv_layer = mesh.uv_layers.new(name="ArcadeUV")
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


def build_colonnade(name, x0, x1, y, z_base, bays, col_height, col_radius,
                    arch_depth, mat_col, mat_arch):
    """One tier: `bays` columns across [x0,x1] with pointed arches between."""
    # Normalize order: on the mirrored (left) wing, x0 (inner) can be less
    # negative than x1 (outer) is negative, i.e. x0 > x1. A negative span
    # flips the sign of every arch radius downstream, inverting every arch
    # to bulge below its springers instead of peaking above them.
    x0, x1 = min(x0, x1), max(x0, x1)
    bm = bmesh.new()
    span = (x1 - x0) / bays
    z_cap = z_base + col_height
    xs = [x0 + span * i for i in range(bays + 1)]

    # columns: base, shaft (octagonal prism approximated by box), capital
    for x in xs:
        add_box(bm, x, y, z_base + 0.25, col_radius * 2.4, arch_depth * 1.3, 0.5)          # base
        add_box(bm, x, y, z_base + col_height / 2, col_radius * 2, arch_depth, col_height)  # shaft
        add_box(bm, x, y, z_cap - 0.3, col_radius * 2.6, arch_depth * 1.35, 0.6)            # capital

    col_mesh = bpy.data.meshes.new(name + "_ColMesh")
    bm.to_mesh(col_mesh)
    bm.free()
    _box_project_uvs(col_mesh)
    col_obj = bpy.data.objects.new(name + "Colonnade", col_mesh)
    if mat_col:
        col_obj.data.materials.append(mat_col)
    bpy.context.collection.objects.link(col_obj)
    _ensure_tangents(col_obj)

    # arch spandrels between adjacent columns, capped by a cornice line
    bm2 = bmesh.new()
    apex = z_cap + span * math.sqrt(3) / 2
    z_top = apex + 0.4
    for i in range(bays):
        add_arch_spandrel(bm2, xs[i] + col_radius, xs[i + 1] - col_radius,
                          z_cap, z_top, y, arch_depth * 0.85)
    # entablature cornice across the top
    add_box(bm2, (x0 + x1) / 2, y, z_top + 0.4, (x1 - x0) + span * 0.2, arch_depth * 1.4, 0.8)
    # Triangulate before conversion: the spandrel caps are concave n-gons,
    # and tangent-space calculation (both calc_tangents and the glTF
    # exporter) requires triangulated geometry to produce a well-defined
    # per-triangle tangent basis.
    bmesh.ops.triangulate(bm2, faces=bm2.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    arch_mesh = bpy.data.meshes.new(name + "_ArchMesh")
    bm2.to_mesh(arch_mesh)
    bm2.free()
    _box_project_uvs(arch_mesh)
    arch_obj = bpy.data.objects.new(name + "Arch", arch_mesh)
    if mat_arch:
        arch_obj.data.materials.append(mat_arch)
    bpy.context.collection.objects.link(arch_obj)
    _ensure_tangents(arch_obj)
    return apex


def build_wing(side):
    sx = 1 if side == "R" else -1
    pearl = get_material("V20_LayeredPearlShell", "V15_PearlShellBeveled")
    gold = get_material("V20_ChasedGoldFiligree", "V14_BurnishedCelestialGold")
    # Left wing facade spans blend X(-57..-22) at Y~-16, Z 5..19. Mirror for R.
    x_inner, x_outer = 24.0, 56.0
    y_face = -15.6
    # lower tier: (name, x0, x1, y, z_base, bays, col_height, col_radius, arch_depth, mat_col, mat_arch)
    apex1 = build_colonnade(f"{GENERATED_PREFIX}_{side}_Lower", sx * x_inner, sx * x_outer,
                            y_face, 5.0, bays=7, col_height=6.0, col_radius=0.55,
                            arch_depth=1.2, mat_col=pearl, mat_arch=gold)
    # upper tier, set slightly back
    build_colonnade(f"{GENERATED_PREFIX}_{side}_Upper", sx * (x_inner + 1.5), sx * (x_outer - 1.5),
                    y_face + 0.8, apex1 + 0.6, bays=6, col_height=5.0, col_radius=0.5,
                    arch_depth=1.0, mat_col=pearl, mat_arch=gold)


def main():
    write = "--write" in sys.argv
    clear_previous()
    build_wing("L")
    build_wing("R")
    count = len([o for o in bpy.data.objects if o.name.startswith(GENERATED_PREFIX)])
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"ARCADES_GENERATED objects={count} written={write}")


main()
