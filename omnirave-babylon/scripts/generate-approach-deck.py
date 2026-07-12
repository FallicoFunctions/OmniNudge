# The missing foreground floor (player-flagged): V108_ForegroundBarricadeGoldRun
# (Z 0.90-1.06) and V108_ForegroundBarricadePearlRun (Z 0.52-0.65) are the rim
# curb and fascia of a raised deck whose floor was never authored - the gold
# trim floated at ankle height over bare pavers ("how are people supposed to
# walk here? The floor itself is missing").
#
# Builds:
#   V151_ApproachDeckSlab   deck floor, top Z 0.90 flush under the gold run,
#                           X +/-9.06 (a hair inside the +/-9.1 barricade line
#                           so the pearl fascia sits proud, never coplanar)
#   V151_ApproachDeckStair  two flared terraces stepping down to the walkway
#                           pavers: 0.635 then 0.365, widening to the V65
#                           threshold bands' +/-14.2
#   COL_ApproachDeck        walkable-top collision mesh, linked into the
#                           "Collision" collection so the player ground
#                           raycast rides the new floor
#
# Also retargets each V65 threshold band (and its paired shadow groove) to
# crown its step edge, and raises the V32 crowd figures standing inside the
# new footprint onto the floor (wearable glow accessories move with their
# nearest figure).
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-approach-deck.py -- --write
import math
import sys

import bpy
import bmesh

DECK_X = 9.06
DECK_Y0 = 0.1
DECK_Y1 = 42.0
DECK_TOP = 0.90
DECK_BASE = 0.05

T1_Y1 = 49.5
T1_X = 11.7
T1_TOP = 0.635
T2_Y1 = 57.0
T2_X = 14.2
T2_TOP = 0.365

# step-edge Y -> (band crown top, matching terrace)
EDGE_TARGETS = [
    (42.0, DECK_TOP + 0.06),
    (49.5, T1_TOP + 0.06),
    (57.0, T2_TOP + 0.06),
]
GROOVE_DROP = 0.19  # shadow grooves sit this far below their band's top

GENERATED = ("V151_ApproachDeckSlab", "V151_ApproachDeckStair", "COL_ApproachDeck")


def clear_previous():
    for name in GENERATED:
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)


def get_material(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        raise RuntimeError(f"required material missing from blend: {name}")
    return mat


def add_prism(bm, corners_lo_y, corners_hi_y, y0, y1, z0, z1):
    """A box-like prism between two Y planes; X half-width may differ at each
    end (flared stair treads)."""
    xl0, xl1 = corners_lo_y, corners_hi_y
    pts = [
        (-xl0, y0, z0), (xl0, y0, z0), (xl1, y1, z0), (-xl1, y1, z0),
        (-xl0, y0, z1), (xl0, y0, z1), (xl1, y1, z1), (-xl1, y1, z1),
    ]
    vs = [bm.verts.new(p) for p in pts]
    bm.verts.ensure_lookup_table()
    faces = [
        (3, 2, 1, 0),  # bottom (down)
        (4, 5, 6, 7),  # top
        (0, 1, 5, 4),  # front (y0)
        (2, 3, 7, 6),  # back (y1)
        (1, 2, 6, 5),  # +x side
        (3, 0, 4, 7),  # -x side
    ]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass


def _box_project_uvs(mesh, cube_size=1.5):
    uv_layer = mesh.uv_layers.new(name="DeckUV")
    for poly in mesh.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        u_axis, v_axis = [i for i in range(3) if i != axis]
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv_layer.data[li].uv = (co[u_axis] / cube_size, co[v_axis] / cube_size)


def finalize(bm, name, mat, collection=None):
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    _box_project_uvs(mesh)
    obj = bpy.data.objects.new(name, mesh)
    if mat:
        obj.data.materials.append(mat)
    (collection or bpy.context.collection).objects.link(obj)
    try:
        obj.data.calc_tangents()
    except Exception:
        pass
    return obj


def build_deck(paver_mat):
    bm = bmesh.new()
    add_prism(bm, DECK_X, DECK_X, DECK_Y0, DECK_Y1, DECK_BASE, DECK_TOP)
    finalize(bm, "V151_ApproachDeckSlab", paver_mat)

    bm = bmesh.new()
    add_prism(bm, DECK_X, T1_X, DECK_Y1, T1_Y1, DECK_BASE, T1_TOP)
    add_prism(bm, T1_X, T2_X, T1_Y1, T2_Y1, DECK_BASE, T2_TOP)
    finalize(bm, "V151_ApproachDeckStair", paver_mat)


def build_collision():
    collision = bpy.data.collections.get("Collision")
    if collision is None:
        raise RuntimeError('Expected a "Collision" collection')
    bm = bmesh.new()
    for (x0, x1, y0, y1, top) in (
        (DECK_X, DECK_X, DECK_Y0, DECK_Y1, DECK_TOP),
        (DECK_X, T1_X, DECK_Y1, T1_Y1, T1_TOP),
        (T1_X, T2_X, T1_Y1, T2_Y1, T2_TOP),
    ):
        vs = [
            bm.verts.new((-x0, y0, top)), bm.verts.new((x0, y0, top)),
            bm.verts.new((x1, y1, top)), bm.verts.new((-x1, y1, top)),
        ]
        bm.verts.ensure_lookup_table()
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new("COL_ApproachDeck_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("COL_ApproachDeck", mesh)
    collision.objects.link(obj)


def mesh_islands(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    islands = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        isl = []
        while stack:
            c = stack.pop()
            if c.index in seen:
                continue
            seen.add(c.index)
            isl.append(c.index)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    stack.append(o)
        islands.append(isl)
    bm.free()
    return islands


def shift_islands(obj, island_dzs):
    """Apply per-island Z shifts (list aligned with mesh_islands order)."""
    islands = mesh_islands(obj)
    for isl, dz in zip(islands, island_dzs):
        if dz == 0.0:
            continue
        for vi in isl:
            obj.data.vertices[vi].co.z += dz
    obj.data.update()


def island_stats(obj):
    out = []
    for isl in mesh_islands(obj):
        xs = [obj.data.vertices[i].co.x for i in isl]
        ys = [obj.data.vertices[i].co.y for i in isl]
        zs = [obj.data.vertices[i].co.z for i in isl]
        out.append({
            "cx": sum(xs) / len(xs),
            "cy": sum(ys) / len(ys),
            "min_z": min(zs),
            "max_z": max(zs),
        })
    return out


def retarget_threshold_bands():
    """Each V65 band (and its shadow groove) crowns its step edge."""
    for name, top_offset in (("V65_ArrivalThresholdGoldBands", 0.0),
                             ("V65_ArrivalThresholdShadowGrooves", -GROOVE_DROP)):
        obj = bpy.data.objects.get(name)
        if not obj:
            continue
        stats = island_stats(obj)
        dzs = []
        for s in stats:
            edge = min(EDGE_TARGETS, key=lambda e: abs(e[0] - s["cy"]))
            dzs.append((edge[1] + top_offset) - s["max_z"])
        shift_islands(obj, dzs)


def floor_top_at(cx, cy):
    if abs(cx) <= DECK_X and DECK_Y0 <= cy <= DECK_Y1:
        return DECK_TOP
    if DECK_Y1 < cy <= T1_Y1:
        limit = DECK_X + (T1_X - DECK_X) * (cy - DECK_Y1) / (T1_Y1 - DECK_Y1)
        if abs(cx) <= limit:
            return T1_TOP
    if T1_Y1 < cy <= T2_Y1:
        limit = T1_X + (T2_X - T1_X) * (cy - T1_Y1) / (T2_Y1 - T1_Y1)
        if abs(cx) <= limit:
            return T2_TOP
    return None


def raise_crowd():
    """Stand the near-crowd figures on the new floor. Wearable glow islands
    follow their nearest figure. Only figures still at ground level move, so
    re-running the script never double-raises."""
    raised = 0
    for side in ("L", "R"):
        figures = bpy.data.objects.get(f"V32_CrowdCluster_{side}_Near")
        wearables = bpy.data.objects.get(f"V32_CrowdWearableGlow_{side}_Near")
        if not figures:
            continue
        fig_stats = island_stats(figures)
        fig_dzs = []
        moved_centroids = []
        for s in fig_stats:
            top = floor_top_at(s["cx"], s["cy"])
            if top is not None and s["min_z"] < 0.3:
                dz = top - s["min_z"]
                fig_dzs.append(dz)
                moved_centroids.append((s["cx"], s["cy"], dz))
                raised += 1
            else:
                fig_dzs.append(0.0)
        shift_islands(figures, fig_dzs)

        if wearables and moved_centroids:
            wear_stats = island_stats(wearables)
            wear_dzs = []
            for s in wear_stats:
                best = None
                for (fx, fy, dz) in moved_centroids:
                    d = math.hypot(fx - s["cx"], fy - s["cy"])
                    if d < 1.2 and (best is None or d < best[0]):
                        best = (d, dz)
                wear_dzs.append(best[1] if best else 0.0)
            shift_islands(wearables, wear_dzs)
    return raised


def main():
    write = "--write" in sys.argv
    clear_previous()
    paver = get_material("V18_WetStonePaver")
    build_deck(paver)
    build_collision()
    retarget_threshold_bands()
    raised = raise_crowd()
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print(f"APPROACH_DECK_GENERATED figuresRaised={raised} written={write}")


main()
