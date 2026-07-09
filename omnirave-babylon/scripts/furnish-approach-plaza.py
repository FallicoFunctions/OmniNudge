# Run headless: blender -b assets-src/main-stage/main-stage.blend \
#   --python scripts/furnish-approach-plaza.py
#
# Furnish the open approach plaza the player walks: stamp full-size garden
# features (reflecting pool, gold-rib canopy, fountain, foliage, planting
# rim) across the floor flanking the central walk, dropped from terrace
# height down to the plaza floor. Four stations per side leave a clear
# center corridor (sightline to the stage) while filling the bare floor.
import bpy
import bmesh

# Full vignette = these families. Each is sampled from its ORIGINAL VIP
# garden island (Blender X in the terrace region, Y in [-11,-4]).
FAMILIES = [
    "V67_VipGardenReflectingPool_",
    "V67_VipGardenGoldRibCanopy_",
    "V35_BasinPlantingIslandRim_",
    "V35_BasinFountainNozzleArray_",
    "V35_BasinFountainMist_",
    "V33_VipFoliageUnderstory_",
    "V33_VipFoliageCanopy_",
]

# Region of the original (untouched) VIP garden vignette, per side.
ORIG_X = {"L": (-36.0, -19.0), "R": (19.0, 36.0)}
ORIG_Y = (-11.5, -4.0)

REF_ZBOTTOM = 3.16   # pool/planting base on the terrace
FLOOR_Z = 0.05
X_LANE = 9.5         # flanks the walk, clear center corridor x +/-4.5
Z_STATIONS = [-6.0, -18.0, -30.0, -42.0]


def original_vignette(obj, xlo, xhi, ylo, yhi):
    """Return ALL faces/verts of every island whose centroid is in the
    original VIP-garden region - the whole vignette's worth for this family
    (e.g. all 7 canopy ribs, both foliage clumps), not just the first."""
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
            isl.append(c)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    stack.append(o)
        islands.append(isl)

    picked = []
    for isl in islands:
        cx = sum(v.co.x for v in isl) / len(isl)
        cy = sum(v.co.y for v in isl) / len(isl)
        if xlo <= cx <= xhi and ylo <= cy <= yhi:
            picked.extend(isl)
    if not picked:
        bm.free()
        return None, None, None, None

    idx_of = {v.index: i for i, v in enumerate(picked)}
    vset = set(idx_of)
    verts = [v.co.copy() for v in picked]
    faces = []
    seen_f = set()
    for v in picked:
        for f in v.link_faces:
            if f.index in seen_f:
                continue
            if all(fv.index in vset for fv in f.verts):
                seen_f.add(f.index)
                faces.append([idx_of[fv.index] for fv in f.verts])
    cx0 = sum(c.x for c in verts) / len(verts)
    cy0 = sum(c.y for c in verts) / len(verts)
    bm.free()
    return verts, faces, cx0, cy0


added = 0
for family in FAMILIES:
    for side in ("L", "R"):
        obj = bpy.data.objects[family + side]
        xlo, xhi = ORIG_X[side]
        verts, faces, cx0, cy0 = original_vignette(obj, xlo, xhi, *ORIG_Y)
        if verts is None:
            print(f"SKIP no original island for {family+side}")
            continue

        bm = bmesh.new()
        bm.from_mesh(obj.data)
        tx = X_LANE if side == "R" else -X_LANE

        for zc in Z_STATIONS:
            new_verts = []
            for co in verts:
                x = tx + (co.x - cx0)
                y = zc + (co.y - cy0)
                z = (co.z - REF_ZBOTTOM) + FLOOR_Z
                new_verts.append(bm.verts.new((x, y, z)))
            bm.verts.ensure_lookup_table()
            for face in faces:
                try:
                    bm.faces.new([new_verts[i] for i in face])
                except (ValueError, IndexError):
                    pass
            added += 1

        bm.faces.ensure_lookup_table()
        bm.to_mesh(obj.data)
        obj.data.update()
        bm.free()

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(f"PLAZA_FURNITURE_ADDED count={added}")
