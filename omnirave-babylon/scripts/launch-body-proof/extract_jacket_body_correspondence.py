"""Extract a topology-identical posed-body surface with interpolated down-pose positions."""

# Connection map: one continuous body-derived shoulder, torso and sleeve patch.
# The patch remains a single shared surface at torso/shoulder/sleeve joints.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets-src/avatars/launch-body-proof/male-outfit04.blend"
REFERENCE = (
    ROOT
    / "assets-src/avatars/launch-body-proof/rigged-jacket-study/inputs/body-patch-clean-rest.npz"
)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )


def snapshot_body(body, frame, keep_mesh=False):
    """Return evaluated body positions, normals and polygons for one frame."""
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(
        evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
    )
    positions = np.asarray([tuple(v.co) for v in mesh.vertices], dtype=np.float64)
    normals = np.asarray([tuple(v.normal) for v in mesh.vertices], dtype=np.float64)
    faces = np.asarray([tuple(p.vertices) for p in mesh.polygons], dtype=np.int64)
    if not keep_mesh:
        bpy.data.meshes.remove(mesh)
    return positions, normals, faces, mesh


def normalize_weights(raw_weights, group_names, allowed):
    selected = sorted(
        (
            (group_names[index], float(weight))
            for index, weight in raw_weights.items()
            if index < len(group_names)
            and group_names[index] in allowed
            and weight > 1e-8
        ),
        key=lambda item: -item[1],
    )[:4]
    total = sum(weight for _, weight in selected)
    if total <= 1e-10:
        raise AssertionError("unweighted body patch vertex")
    return {name: weight / total for name, weight in selected}


def pack_weights(vertices, deform_layer, group_names, allowed):
    names = np.full((len(vertices), 4), "", dtype="<U64")
    values = np.zeros((len(vertices), 4), dtype=np.float64)
    rows = []
    for row_index, vertex in enumerate(vertices):
        row = normalize_weights(vertex[deform_layer], group_names, allowed)
        rows.append(row)
        for slot, (name, weight) in enumerate(row.items()):
            names[row_index, slot] = name
            values[row_index, slot] = weight
    return rows, names, values


def build_patch(
    source_mesh,
    t_positions,
    t_normals,
    down_positions,
    down_normals,
    group_names,
    allowed_groups,
):
    """Apply the builder's exact cuts while carrying down positions through bmesh."""
    mesh = source_mesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    source_layer = bm.verts.layers.float_vector.new("source_t_position")
    down_layer = bm.verts.layers.float_vector.new("down_world_position")
    t_normal_layer = bm.verts.layers.float_vector.new("t_world_normal")
    down_normal_layer = bm.verts.layers.float_vector.new("down_world_normal")
    deform_layer = bm.verts.layers.deform.verify()
    for index, vert in enumerate(bm.verts):
        vert[source_layer] = Vector(t_positions[index])
        vert[down_layer] = Vector(down_positions[index])
        vert[t_normal_layer] = Vector(t_normals[index])
        vert[down_normal_layer] = Vector(down_normals[index])

    for plane_co, plane_no, clear_inner, clear_outer in [
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
            plane_co=plane_co,
            plane_no=plane_no,
            clear_inner=clear_inner,
            clear_outer=clear_outer,
        )
    bmesh.ops.delete(
        bm,
        geom=[
            face
            for face in bm.faces
            if abs(face.calc_center_median().x) < 0.012999
            and face.calc_center_median().y < -0.02
        ],
        context="FACES",
    )
    bmesh.ops.delete(
        bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS"
    )
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.normal_update()
    bm.verts.ensure_lookup_table()
    vertices = list(bm.verts)
    vertex_ids = {vert: index for index, vert in enumerate(vertices)}
    t_patch = np.asarray([tuple(v.co) for v in vertices], dtype=np.float64)
    propagated_t = np.asarray(
        [tuple(v[source_layer]) for v in vertices], dtype=np.float64
    )
    down_patch = np.asarray([tuple(v[down_layer]) for v in vertices], dtype=np.float64)
    t_normals_patch = np.asarray(
        [tuple(v[t_normal_layer]) for v in vertices], dtype=np.float64
    )
    down_normals_patch = np.asarray(
        [tuple(v[down_normal_layer]) for v in vertices], dtype=np.float64
    )
    weight_rows, weight_names, weight_values = pack_weights(
        vertices, deform_layer, group_names, allowed_groups
    )
    bmesh_faces = np.asarray(
        [[vertex_ids[v] for v in face.verts] for face in bm.faces], dtype=np.int64
    )
    bm.to_mesh(mesh)
    mesh.update()
    mesh_t = np.asarray([tuple(v.co) for v in mesh.vertices], dtype=np.float64)
    faces = np.asarray([tuple(p.vertices) for p in mesh.polygons], dtype=np.int64)
    if not np.array_equal(mesh_t, t_patch):
        raise AssertionError("bmesh-to-mesh changed vertex ordering or coordinates")
    if not np.array_equal(faces, bmesh_faces):
        print(
            "BMESH_FACE_ORDER_DIFF",
            len(bmesh_faces),
            len(faces),
            flush=True,
        )
    bm.free()
    bpy.data.meshes.remove(mesh)
    return (
        t_patch,
        down_patch,
        propagated_t,
        t_normals_patch,
        down_normals_patch,
        weight_rows,
        weight_names,
        weight_values,
        faces,
    )


def face_diagnosis(faces, reference_faces):
    """Describe a mismatch without guessing a vertex permutation."""
    direct_equal = np.array_equal(faces, reference_faces)
    canonical_equal = {tuple(sorted(face)) for face in faces} == {
        tuple(sorted(face)) for face in reference_faces
    }
    return {
        "direct_equal": bool(direct_equal),
        "canonical_equal_under_current_vertex_ids": bool(canonical_equal),
        "output_face_count": len(faces),
        "reference_face_count": len(reference_faces),
        "first_output_faces": faces[:5].tolist(),
        "first_reference_faces": reference_faces[:5].tolist(),
    }


def bounds(points):
    return {
        "min": points.min(axis=0).tolist(),
        "max": points.max(axis=0).tolist(),
    }


def normalize_rows(rows):
    lengths = np.linalg.norm(rows, axis=1)
    if np.any(lengths < 1e-10):
        raise AssertionError("interpolated body normal has near-zero length")
    normalized = rows / lengths[:, None]
    return normalized, float(np.max(np.abs(np.linalg.norm(normalized, axis=1) - 1.0)))


def compare_weights(actual, expected):
    if len(actual) != len(expected):
        raise AssertionError(
            f"weight row count differs: {len(actual)} vs {len(expected)}"
        )
    errors = []
    exact_rows = 0
    for actual_row, expected_row in zip(actual, expected):
        keys = set(actual_row) | set(expected_row)
        error = sum(
            abs(actual_row.get(key, 0.0) - expected_row.get(key, 0.0)) for key in keys
        )
        errors.append(error)
        if not error:
            exact_rows += 1
    maximum = max(errors, default=0.0)
    if maximum > 2e-6:
        raise AssertionError(
            f"transferred weights differ from clean-rest metadata: {maximum:.9g}"
        )
    return {"rows": len(actual), "exact_rows": exact_rows, "maximum_l1_error": maximum}


def known_crossing_control(strict_pairs):
    points = [
        Vector((-1.0, -1.0, 0.0)),
        Vector((1.0, -1.0, 0.0)),
        Vector((0.0, 1.0, 0.0)),
        Vector((0.0, -0.5, -1.0)),
        Vector((0.0, 0.5, 1.0)),
        Vector((0.0, 0.5, -1.0)),
    ]
    triangles = [(0, 1, 2), (3, 4, 5)]
    return len(strict_pairs(points, triangles))


def main():
    args = parse_args()
    output = args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    source_hash_before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    reference = np.load(REFERENCE)
    reference_faces = np.asarray(reference["quads"], dtype=np.int64)
    reference_points = np.asarray(reference["points"], dtype=np.float64)
    reference_metadata = json.loads(REFERENCE.with_suffix(".json").read_text())
    reference_weights = reference_metadata["weights"]

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    body = bpy.data.objects["AvatarBody"]
    rig = bpy.data.objects["AvatarSkeleton"]
    action = rig.animation_data.action if rig.animation_data else None
    if action is None or action.name != "Body joint test":
        raise AssertionError(f"unexpected original body action: {action}")
    if not np.allclose(np.asarray(body.matrix_world), np.eye(4), atol=1e-8):
        raise AssertionError(
            "AvatarBody has a non-identity transform; cut planes are world-space"
        )

    group_names = [group.name for group in body.vertex_groups]
    allowed_groups = {bone.name for bone in rig.pose.bones}
    t_positions, t_normals, t_faces, t_mesh = snapshot_body(body, 31, keep_mesh=True)
    down_positions, down_normals, down_faces, _ = snapshot_body(body, 1)
    if len(t_positions) != len(down_positions) or not np.array_equal(
        t_faces, down_faces
    ):
        raise AssertionError(
            f"evaluated body topology changed: T={t_positions.shape}/{t_faces.shape}, "
            f"down={down_positions.shape}/{down_faces.shape}"
        )
    if len(t_positions) != 13380:
        raise AssertionError(
            f"unexpected evaluated body vertex count: {len(t_positions)}"
        )

    (
        t_patch,
        down_patch,
        propagated_t,
        t_normals_patch,
        down_normals_patch,
        weight_rows,
        weight_names,
        weight_values,
        faces,
    ) = build_patch(
        t_mesh,
        t_positions,
        t_normals,
        down_positions,
        down_normals,
        group_names,
        allowed_groups,
    )
    correspondence_error = float(np.max(np.abs(t_patch - propagated_t)))
    if correspondence_error > 2e-6:
        raise AssertionError(
            f"bmesh source-position interpolation mismatch: {correspondence_error:.9g}"
        )
    if not np.isfinite(down_patch).all():
        raise AssertionError(
            "bmesh down-position correspondence contains non-finite values"
        )

    face_info = face_diagnosis(faces, reference_faces)
    if len(t_patch) != 2636:
        raise AssertionError(f"unexpected patch vertex count: {len(t_patch)}")
    if not face_info["direct_equal"]:
        raise AssertionError(
            "retained patch face index arrays differ: " + json.dumps(face_info)
        )
    if not np.isfinite(reference_points).all() or len(reference_points) != len(t_patch):
        raise AssertionError("clean-rest reference point array is incompatible")

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from surface_crossings import strict_pairs

    t_vectors = [Vector(point) for point in t_patch]
    down_vectors = [Vector(point) for point in down_patch]
    self_cross_t = len(strict_pairs(t_vectors, faces))
    self_cross_down = len(strict_pairs(down_vectors, faces))
    if self_cross_t or self_cross_down:
        raise AssertionError(
            f"zero-offset body control self-crossings: T={self_cross_t}, down={self_cross_down}"
        )
    known_crossings = known_crossing_control(strict_pairs)
    if known_crossings != 1:
        raise AssertionError(
            f"known positive crossing control failed: {known_crossings}"
        )

    t_normals_patch, t_normal_length_error = normalize_rows(t_normals_patch)
    down_normals_patch, down_normal_length_error = normalize_rows(down_normals_patch)
    normal_length_error = max(t_normal_length_error, down_normal_length_error)
    t_normals_output = t_normals_patch.astype(np.float32)
    down_normals_output = down_normals_patch.astype(np.float32)
    output_normal_length_error = max(
        float(np.max(np.abs(np.linalg.norm(t_normals_output, axis=1) - 1.0))),
        float(np.max(np.abs(np.linalg.norm(down_normals_output, axis=1) - 1.0))),
    )
    if output_normal_length_error > 1e-6:
        raise AssertionError(
            f"float32 output normal length error is too large: {output_normal_length_error:.9g}"
        )
    weights_comparison = compare_weights(weight_rows, reference_weights)

    source_hash_after = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if source_hash_before != source_hash_after:
        raise AssertionError("source blend hash changed during read-only extraction")

    np.savez_compressed(
        output,
        body_patch_t=t_patch.astype(np.float32),
        body_patch_down=down_patch.astype(np.float32),
        body_normal_t=t_normals_output,
        body_normal_down=down_normals_output,
        body_weight_names=weight_names,
        body_weight_values=weight_values.astype(np.float32),
        faces=faces,
    )
    metadata = {
        "scope": __doc__,
        "source_blend": str(SOURCE),
        "source_blend_sha256_before": source_hash_before,
        "source_blend_sha256_after": source_hash_after,
        "body_object": body.name,
        "skeleton_object": rig.name,
        "original_action": action.name,
        "t_frame": 31,
        "down_frame": 1,
        "evaluated_body_vertices": len(t_positions),
        "evaluated_body_faces": len(t_faces),
        "evaluated_body_topology_equal": True,
        "patch_vertices": len(t_patch),
        "patch_faces": len(faces),
        "bounds": {"t": bounds(t_patch), "down": bounds(down_patch)},
        "reference_clean_rest": str(REFERENCE),
        "reference_clean_rest_vertices": len(reference_points),
        "reference_clean_rest_faces": len(reference_faces),
        "retained_face_arrays_match": True,
        "face_diagnosis": face_info,
        "correspondence": {
            "method": "bmesh float_vector layer interpolation",
            "source_position_max_abs_error_m": correspondence_error,
            "nearest_projection_used": False,
            "finite_down_positions": True,
        },
        "normals": {
            "method": "bmesh float_vector layer interpolation then row normalization",
            "t_normal_length_max_error": t_normal_length_error,
            "down_normal_length_max_error": down_normal_length_error,
            "normal_length_max_error": normal_length_error,
            "float32_output_normal_length_max_error": output_normal_length_error,
        },
        "weights": {
            "method": "bmesh deform layer interpolation with collect_weights top-4 normalization",
            "allowed_group_count": len(allowed_groups),
            "comparison_to_clean_rest_metadata": weights_comparison,
        },
        "zero_offset_controls": {
            "t_self_crossings": self_cross_t,
            "down_self_crossings": self_cross_down,
            "known_positive_crossing_count": known_crossings,
        },
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    }
    metadata_path = output.with_suffix(".json")
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    print("LOWERED_CORRESPONDENCE", json.dumps(metadata, sort_keys=True), flush=True)


main()
