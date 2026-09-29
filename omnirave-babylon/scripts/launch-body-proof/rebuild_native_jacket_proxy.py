"""Retopologize the T-pose jacket and retain mapped opening motion for cloth.

This is an isolated construction trial. QuadriFlow proposes topology; nearest
surface projection restores the fitted reference surface. Only boundary
vertices are pinned. The resulting faces and actual 1 mm walls must pass the
native inspector before any garment can be accepted.
"""

# Connection map: one open torso-and-sleeves surface. Preserve its openings;
# no disconnected overlapping sleeve primitives or implicit sewing.
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from probe_blender_garment_transfer import SOURCE, new_mesh


def run(output, count, ease, keep_caps_control=False):
    data = np.load(SOURCE / "outfit04-rest-tpose-input.npz")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    points, faces = data["panel"][0], data["faces"]
    obj = new_mesh("Regular T-pose cloth proxy", points.tolist(), faces.tolist(), [])
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.quadriflow_remesh(
        target_faces=count,
        use_mesh_symmetry=True,
        use_preserve_boundary=True,
        use_preserve_sharp=False,
        seed=0,
    )
    # QuadriFlow can cap the small sleeve openings despite preserve_boundary.
    # Delete those end-facing cap proposals before nearest-surface projection;
    # projecting cap vertices can otherwise fold them back down the sleeve.
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.normal_update()
    cuff_limit = float(np.max(abs(points[:, 0]))) - 0.035
    caps = [
        face
        for face in mesh.faces
        if abs(face.normal.x) > 0.75 and abs(face.calc_center_median().x) > cuff_limit
    ]
    if keep_caps_control:
        caps = []
    removed_caps = len(caps)
    bmesh.ops.delete(mesh, geom=caps, context="FACES")
    bmesh.ops.delete(
        mesh, geom=[v for v in mesh.verts if not v.link_faces], context="VERTS"
    )
    mesh.to_mesh(obj.data)
    mesh.free()
    tree = BVHTree.FromPolygons(points.tolist(), faces.tolist(), all_triangles=True)
    ids, barycentric, deviations = [], [], []
    for vertex in obj.data.vertices:
        position, _normal, face, distance = tree.find_nearest(vertex.co)
        tri = faces[face]
        bary = barycentric_transform(
            position,
            *[Vector(points[i]) for i in tri],
            Vector((1, 0, 0)),
            Vector((0, 1, 0)),
            Vector((0, 0, 1)),
        )
        assert min(bary) >= -1e-4 and max(bary) <= 1.0001
        ids.append(tri)
        barycentric.append(bary)
        deviations.append(distance)
        vertex.co = position
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    result_faces = np.array([tuple(p.vertices) for p in obj.data.polygons])
    edges = {}
    for face in result_faces:
        for a, b in zip(face, np.roll(face, -1)):
            edge = tuple(sorted((int(a), int(b))))
            edges[edge] = edges.get(edge, 0) + 1
    assert max(edges.values()) == 2
    anchors = sorted({v for edge, uses in edges.items() if uses == 1 for v in edge})
    graph = {v: set() for v in anchors}
    for (a, b), uses in edges.items():
        if uses == 1:
            graph[a].add(b)
            graph[b].add(a)
    assert all(len(neighbors) == 2 for neighbors in graph.values())
    seen, loops = set(), []
    for start in anchors:
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
    assert len(loops) == (1 if keep_caps_control else 3), (
        f"Expected front/neck/hem and two sleeve openings, got {len(loops)}"
    )
    samples = np.einsum(
        "tvij,vi->tvj", data["panel"][:, np.asarray(ids)], np.asarray(barycentric)
    )
    mapped = data["panel"][:, np.asarray(ids)]
    normals = np.cross(
        mapped[:, :, 1] - mapped[:, :, 0], mapped[:, :, 2] - mapped[:, :, 0]
    )
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    samples += normals * ease
    assert samples.shape[1] == len(obj.data.vertices)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        panel=samples,
        faces=result_faces,
        anchors=anchors,
        body=data["body"],
        top=data["top"],
        frames=data["frames"],
        source_sha256=data["source_sha256"],
    )
    lengths = [np.linalg.norm(samples[0, a] - samples[0, b]) for a, b in edges]
    report = {
        "scope": __doc__,
        "requested_quad_faces": count,
        "extra_normal_ease_m": ease,
        "keep_caps_negative_control": keep_caps_control,
        "removed_quad_cuff_caps": removed_caps,
        "boundary_loop_vertex_counts": [len(loop) for loop in loops],
        "vertices": len(samples[0]),
        "triangles": len(result_faces),
        "boundary_pins": len(anchors),
        "max_initial_projection_m": max(deviations),
        "edge_length_quantiles_m": np.quantile(
            lengths, [0, 0.01, 0.1, 0.5, 1]
        ).tolist(),
        "status": "REJECTED_CUFF_CAP_CONTROL"
        if keep_caps_control
        else "PENDING_GEOMETRY_AND_MOTION_CHECKS",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print("REGULAR_PROXY", report, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--faces", type=int, default=2500)
    parser.add_argument("--ease", type=float, default=0.0)
    parser.add_argument("--keep-caps-control", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.output, args.faces, args.ease, args.keep_caps_control)
