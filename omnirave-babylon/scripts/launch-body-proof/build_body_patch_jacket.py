"""Retain native body articulation loops for a fitted open jacket base."""

# Connection map: one continuous body-derived shoulder, torso and sleeve patch;
# trim neck/front/hem and cuffs, retaining shared vertices at every joint.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

S = Path(__file__).resolve().parent
sys.path.insert(0, str(S))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE, collect_weights
from validate_body05_tops import geometry

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args(
    sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
)
out = args.output
out.parent.mkdir(parents=True, exist_ok=True)
source = SOURCE / "male-outfit04.blend"
digest = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.context.scene.frame_set(31)
bpy.context.view_layer.update()
body = bpy.data.objects["AvatarBody"]
top = bpy.data.objects["AvatarTop_tailored"]
rig = bpy.data.objects["AvatarSkeleton"]
dg = bpy.context.evaluated_depsgraph_get()
mesh = bpy.data.meshes.new_from_object(
    body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg
)
obj = bpy.data.objects.new("Native shoulder topology patch", mesh)
bpy.context.scene.collection.objects.link(obj)
for g in body.vertex_groups:
    obj.vertex_groups.new(name=g.name)
bm = bmesh.new()
bm.from_mesh(mesh)
for co, no, inner, outer in [
    ((0, 0, 1.015), (0, 0, 1), True, False),
    ((0, 0, 1.505), (0, 0, 1), False, True),
    ((0.735, 0, 0), (1, 0, 0), False, True),
    ((-0.735, 0, 0), (1, 0, 0), True, False),
    ((0.013, 0, 0), (1, 0, 0), False, False),
    ((-0.013, 0, 0), (1, 0, 0), False, False),
]:
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        dist=1e-7,
        plane_co=co,
        plane_no=no,
        clear_inner=inner,
        clear_outer=outer,
    )
bmesh.ops.delete(
    bm,
    geom=[
        f
        for f in bm.faces
        if abs(f.calc_center_median().x) < 0.012999 and f.calc_center_median().y < -0.02
    ],
    context="FACES",
)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bmesh.ops.triangulate(bm, faces=list(bm.faces))
for _ in range(15):
    bmesh.ops.smooth_vert(
        bm,
        verts=[v for v in bm.verts if not v.is_boundary],
        factor=0.3,
        use_axis_x=True,
        use_axis_y=True,
        use_axis_z=True,
    )
bm.normal_update()
bm.to_mesh(mesh)
bm.free()
mesh.update()
weights = collect_weights(obj, {b.name for b in rig.pose.bones})
tree = BVHTree.FromPolygons(*geometry(top), all_triangles=True)
bodytree = BVHTree.FromPolygons(*geometry(body), all_triangles=True)
original = np.array([v.co[:] for v in mesh.vertices])
normals = [v.normal.copy() for v in mesh.vertices]
allowances = []
from surface_crossings import strict_pairs

print("RAW_PATCH_SELF", len(strict_pairs(*geometry(obj))), flush=True)
for v, n in zip(mesh.vertices, normals):
    p = v.co.copy()
    side = abs(p.x)
    allowance = 0.004
    if side < 0.205 and p.z < 1.43:
        center = Vector((0, -0.02, p.z))
        n = (p - center).normalized()
        hits = []
        for tr in [tree, bodytree]:
            hit, _, _, dist = tr.ray_cast(center + n * 0.35, -n, 0.35)
            if hit is not None:
                hits.append(0.35 - dist)
        allowance = 0.006 if side < 0.145 else 0.002
        if hits:
            v.co = center + n * (max(hits) + allowance)
    else:
        hit, _, _, dist = bodytree.ray_cast(p + n * 0.03, -n, 0.06)
        if hit is not None:
            v.co = hit + n * allowance
    allowances.append(allowance)
mesh.update()
bpy.context.view_layer.update()
points, faces = geometry(obj)
points = np.array(points)
faces = np.array(faces)
row, _, _ = screen(points, faces, body, top)
np.savez_compressed(out, points=points, quads=faces)
report = {
    "scope": __doc__,
    "source_sha256": digest,
    "weights": weights,
    "vertex_records": [
        {"region": "torso" if abs(p[0]) < 0.21 else "sleeve"} for p in points
    ],
    "native_body_patch": True,
    "output_sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
    "initial": row,
    "vertices": len(points),
    "triangles": len(faces),
    "offset_range_m": [min(allowances), max(allowances)],
}
out.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
print("BODY_PATCH", len(points), len(faces), row, flush=True)

assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
