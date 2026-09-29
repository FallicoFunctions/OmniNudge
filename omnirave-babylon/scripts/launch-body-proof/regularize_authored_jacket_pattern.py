"""Retopologize the independently authored jacket surface for cloth trials.

Project onto the authored pattern, never onto the old body-derived garment.
Reject nonmanifold topology and preserve three intentional opening loops.
QuadriFlow cuff caps are removed explicitly before projection.
"""

# Connection map: retain the single torso/sleeve surface and its three openings.
# Remeshed vertices share edges; no overlapping sleeve or seam components.
import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree


def run(input_path, output, count, raw_surface, fair_neck):
    data = np.load(input_path)
    points, faces = data["points"], data["faces"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new("Authored pattern")
    mesh.from_pydata(points.tolist(), [], faces.tolist())
    obj = bpy.data.objects.new("Authored pattern", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.quadriflow_remesh(
        target_faces=count,
        use_mesh_symmetry=True,
        use_preserve_boundary=True,
        use_preserve_sharp=False,
        seed=0,
    )
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    cuff_limit = np.max(abs(points[:, 0])) - 0.02
    caps = [
        face
        for face in bm.faces
        if abs(face.normal.x) > 0.75 and abs(face.calc_center_median().x) > cuff_limit
    ]
    removed = len(caps)
    bmesh.ops.delete(bm, geom=caps, context="FACES")
    bmesh.ops.delete(
        bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS"
    )
    bm.to_mesh(obj.data)
    bm.free()
    tree = BVHTree.FromPolygons(points.tolist(), faces.tolist(), all_triangles=True)
    distances = []
    for vertex in obj.data.vertices:
        position, _normal, _face, distance = tree.find_nearest(vertex.co)
        if not raw_surface:
            vertex.co = position
        distances.append(distance)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    neck_movement = 0.0
    if fair_neck:
        selected = [
            v
            for v in bm.verts
            if abs(v.co.x) < 0.14 and v.co.z > 1.44 and v.co.y > 0.03
        ]
        before = {v: v.co.copy() for v in selected}
        for _ in range(8):
            bmesh.ops.smooth_vert(
                bm,
                verts=selected,
                factor=0.35,
                use_axis_x=True,
                use_axis_y=True,
                use_axis_z=True,
            )
        for v, original in before.items():
            delta = v.co - original
            if delta.length > 0.010:
                v.co = original + delta.normalized() * 0.010
            neck_movement = max(neck_movement, (v.co - original).length)
    bm.normal_update()
    assert all(edge.is_manifold or edge.is_boundary for edge in bm.edges)
    assert all(not edge.is_manifold or edge.is_contiguous for edge in bm.edges)
    assert min(face.calc_area() for face in bm.faces) > 1e-8
    bm.to_mesh(obj.data)
    bm.free()
    result = np.array([v.co[:] for v in obj.data.vertices])
    triangles = np.array([tuple(face.vertices) for face in obj.data.polygons])
    counts = Counter(
        tuple(sorted((int(a), int(b))))
        for face in triangles
        for a, b in zip(face, np.roll(face, -1))
    )
    graph = defaultdict(set)
    for (a, b), uses in counts.items():
        if uses == 1:
            graph[a].add(b)
            graph[b].add(a)
    assert all(len(ns) == 2 for ns in graph.values())
    seen, loops = set(), []
    for start in graph:
        if start in seen:
            continue
        pending, loop = [start], []
        while pending:
            vertex = pending.pop()
            if vertex in seen:
                continue
            seen.add(vertex)
            loop.append(vertex)
            pending.extend(graph[vertex] - seen)
        loops.append(loop)
    assert len(loops) == 3, [len(loop) for loop in loops]
    lengths = [np.linalg.norm(result[a] - result[b]) for a, b in counts]
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, points=result, faces=triangles, anchors=sorted(graph))
    report = {
        "scope": __doc__,
        "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "requested_quad_faces": count,
        "raw_surface_without_projection": raw_surface,
        "fair_neck": fair_neck,
        "max_neck_displacement_m": neck_movement,
        "removed_cuff_caps": removed,
        "vertices": len(result),
        "triangles": len(triangles),
        "boundary_loop_counts": [len(loop) for loop in loops],
        "maximum_projection_m": max(distances),
        "edge_quantiles_m": np.quantile(lengths, [0, 0.01, 0.1, 0.5, 1]).tolist(),
        "status": "PENDING_FIT_AND_MOTION_CHECKS",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--faces", type=int, default=3000)
    parser.add_argument("--raw-surface", action="store_true")
    parser.add_argument("--fair-neck", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.input, args.output, args.faces, args.raw_surface, args.fair_neck)
