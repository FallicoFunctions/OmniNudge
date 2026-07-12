# Extends the V40_ApproachLight* lamp array to cover the front section of
# the spawn approach walkway. The existing array only covers Y[104,286]
# (8 posts at 26-unit spacing); the front section Y[-16,104] toward spawn
# had zero light dressing, reading as an unfinished bare walkway.
#
# Run:  blender -b assets-src/main-stage/main-stage.blend \
#         --python scripts/generate-main-stage-approach-lights.py -- --write
import sys

import bpy
import bmesh

OBJECT_NAMES = [
    "V40_ApproachLightCore_L", "V40_ApproachLightCore_R",
    "V40_ApproachLightHalo_L", "V40_ApproachLightHalo_R",
    "V40_ApproachLightHousing_L", "V40_ApproachLightHousing_R",
    "V40_ApproachLightStem_L", "V40_ApproachLightStem_R",
]
SPACING = 26.0
SOURCE_Y = 104.0
POSITION_TOLERANCE = 0.05
NEW_POST_COUNT = 4  # fills Y[104,286] -> extends to Y=0, matching the
                    # walkway start (Y=-15.9) closely enough that the
                    # residual ~16m gap reads as intentional foreground.


def mesh_islands(bm):
    """Connected-component islands (each = one repeated lamp instance)."""
    visited = set()
    islands = []
    for v in bm.verts:
        if v.index in visited:
            continue
        stack = [v]
        comp = []
        while stack:
            cur = stack.pop()
            if cur.index in visited:
                continue
            visited.add(cur.index)
            comp.append(cur)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in visited:
                    stack.append(other)
        islands.append(comp)
    return islands


def extend_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"Missing approach light object: {name}")

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()

    islands = mesh_islands(bm)
    centers = [sum(v.co.y for v in comp) / len(comp) for comp in islands]
    template_index = min(range(len(islands)), key=lambda index: abs(centers[index] - SOURCE_Y))
    if abs(centers[template_index] - SOURCE_Y) > POSITION_TOLERANCE:
        bm.free()
        raise RuntimeError(f"Missing stable Y={SOURCE_Y:g} approach-light template in {name}")
    template = islands[template_index]
    template_verts = list(template)
    template_vert_set = set(template_verts)
    template_faces = [f for f in bm.faces if all(v in template_vert_set for v in f.verts)]

    added = 0
    for n in range(1, NEW_POST_COUNT + 1):
        target_y = SOURCE_Y - SPACING * n
        if any(abs(center - target_y) <= POSITION_TOLERANCE for center in centers):
            continue
        delta_y = target_y - SOURCE_Y
        vert_map = {}
        for v in template_verts:
            nv = bm.verts.new((v.co.x, v.co.y + delta_y, v.co.z))
            vert_map[v] = nv
        for f in template_faces:
            try:
                bm.faces.new([vert_map[v] for v in f.verts])
            except ValueError:
                pass  # duplicate face guard
        centers.append(target_y)
        added += 1

    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return len(template_verts), len(template_faces), added


def main():
    write = "--write" in sys.argv
    totals = []
    for name in OBJECT_NAMES:
        nv, nf, added = extend_object(name)
        totals.append((name, nv, nf, added))
    if write:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    for name, nv, nf, added in totals:
        print(f"EXTENDED {name}: template {nv}v/{nf}f added={added}")
    print(f"APPROACH_LIGHTS_EXTENDED objects={len(totals)} copiesAdded={sum(item[3] for item in totals)} written={write}")


main()
