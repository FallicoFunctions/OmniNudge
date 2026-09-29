"""Clear finite neck-test shirt contacts with small sewn-surface offsets."""

# Connection map: the existing neckline/shoulder/collar shared edges stay sewn.
# Contact vertices move outward; their immediate neighbors receive a smaller
# offset. No topology, skin weights, body masking or separate overlay is added.
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A
from build_rigged_jacket_collar import deformation_linear

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-collar-refinement-study/"
    "male-rigged-jacket-collar-refined.blend"
)


def run(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    original = scene["riggedJacketOriginalLoweringAction"]
    preserved = A.preserved_snapshot(coat, rig, body, shirt)
    weights = A.weights(coat)
    topology = A.topology(coat.data)
    count = len(coat.data.vertices)
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    normal_samples, control_rows = {}, []
    for frame in (1, 31):
        for axis, degrees in (("X", -10), ("X", 10), ("Z", -20), ("Z", 20)):
            rig.animation_data.action = bpy.data.actions[original]
            A.sample(scene, frame)
            rig.animation_data.action = None
            bone = rig.pose.bones["neck_01"]
            baseline = bone.matrix_basis.copy()
            bone.matrix_basis = (
                baseline
                @ Quaternion(
                    (1, 0, 0) if axis == "X" else (0, 0, 1), math.radians(degrees)
                )
                .to_matrix()
                .to_4x4()
            )
            A.update()
            native, native_faces = A.H.geometry(coat)
            shirt_points, shirt_faces = A.H.geometry(shirt)
            pairs = A.H.between(native, native_faces, shirt_points, shirt_faces)
            implicated = sorted(
                {int(v) % count for f, _ in pairs for v in native_faces[f]}
            )
            mid, _ = A.midpoint(coat, solidify, count)
            _, outer = A.H.verify_shirt_pairing(shirt_faces, len(shirt_points))
            tree = BVHTree.FromPolygons(shirt_points, outer, all_triangles=True)
            for vertex_id in implicated:
                _, normal, _, _ = tree.find_nearest(mid[vertex_id])
                if normal is None or normal.length < 0.5:
                    raise AssertionError(f"Missing outer-shirt normal at {vertex_id}")
                linear = coat.matrix_world.to_3x3() @ deformation_linear(
                    rig, coat, coat.data.vertices[vertex_id]
                )
                normal_samples.setdefault(vertex_id, []).append(
                    linear.inverted() @ normal.normalized()
                )
            control_rows.append(
                {
                    "frame": frame,
                    "local_axis": axis,
                    "degrees": degrees,
                    "source_shirt_pairs": len(pairs),
                    "implicated_vertices": implicated,
                }
            )
            bone.matrix_basis = baseline
            A.update()
    if not normal_samples:
        raise AssertionError("Input has no shirt contacts in the finite neck scope")
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 31)
    t_points, faces = A.midpoint(coat, solidify, count)
    t_points = A.array(t_points)
    neighbors = [set() for _ in range(count)]
    for face in faces:
        for vertex_id in face:
            neighbors[vertex_id].update(set(face) - {vertex_id})
    seed_ids = set(normal_samples)
    directions = {}
    for vertex_id, samples in normal_samples.items():
        bind_direction = sum(samples, Vector()) / len(samples)
        linear = coat.matrix_world.to_3x3() @ deformation_linear(
            rig, coat, coat.data.vertices[vertex_id]
        )
        direction = linear @ bind_direction
        directions[vertex_id] = direction.normalized()
    authored = np.zeros((count, 3), dtype=np.float64)
    for vertex_id in seed_ids:
        authored[vertex_id] = directions[vertex_id] * 0.00035
    feather_ids = set().union(*(neighbors[i] for i in seed_ids)) - seed_ids
    for vertex_id in feather_ids:
        adjacent_seeds = neighbors[vertex_id] & seed_ids
        direction = sum((directions[i] for i in adjacent_seeds), Vector()).normalized()
        authored[vertex_id] = direction * 0.00015
    # The tiny front collar junction must translate together: tapering inside
    # these triangles twists the native solidified wall during neck bending.
    junction_ids = {1354, 1420, 1718, 2587, 2588}
    for vertex_id in junction_ids:
        authored[vertex_id] = authored[1420]
    moved_ids = sorted(seed_ids | feather_ids | junction_ids)
    bind_deltas = np.zeros_like(authored)
    for vertex_id in moved_ids:
        linear = coat.matrix_world.to_3x3() @ deformation_linear(
            rig, coat, coat.data.vertices[vertex_id]
        )
        bind_deltas[vertex_id] = linear.inverted() @ Vector(authored[vertex_id])
    blocks = coat.data.shape_keys.key_blocks
    source_shapes = np.array(
        [[p.co[:] for p in key.data] for key in blocks], dtype=np.float32
    )
    for key in blocks:
        for vertex_id in moved_ids:
            key.data[vertex_id].co += Vector(bind_deltas[vertex_id])
    for vertex in coat.data.vertices:
        vertex.co = blocks[0].data[vertex.index].co
    coat.data.update()
    A.update()
    actual, _ = A.midpoint(coat, solidify, count)
    error = float(np.max(np.abs(A.array(actual) - t_points - authored)))
    assert error < 1e-6, error
    assert A.preserved_snapshot(coat, rig, body, shirt) == preserved
    assert A.weights(coat) == weights and A.topology(coat.data) == topology
    scene["riggedJacketNeckSeamStudy"] = (
        "Local outer-shirt contact correction with one-ring feather"
    )
    A.sample(scene, 1)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    for path in (args.provenance, args.report):
        path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.provenance,
        bind_deltas=bind_deltas,
        authored_t_deltas=authored,
        t_points=t_points,
        source_shapes=source_shapes,
        seed_vertex_ids=np.array(sorted(seed_ids), dtype=np.int32),
        feather_vertex_ids=np.array(sorted(feather_ids), dtype=np.int32),
        junction_vertex_ids=np.array(sorted(junction_ids), dtype=np.int32),
    )
    assert A.digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "seed_vertices": sorted(seed_ids),
        "feather_vertices": sorted(feather_ids),
        "coherent_junction_vertices": sorted(junction_ids),
        "moved_vertices": len(moved_ids),
        "seed_displacement_m": 0.00035,
        "feather_displacement_m": 0.00015,
        "maximum_t_reconstruction_error_m": error,
        "source_controls": control_rows,
        "source_preserved": True,
        "topology_weights_metadata_attributes_preserved": True,
        "acceptance": "Requires reopened native neck and established motion audits",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("NECK_SEAM_BUILD", json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
