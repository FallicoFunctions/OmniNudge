"""Read-only finite-motion audit for a connected replacement shirt neckband.

The input may replace only the two original shirt collar objects with one closed,
connected collar.  All other source state is compared through the finalized shirt
detail audit's embroidery-static snapshot and packed-image record.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_embroidery as E
import audit_rigged_jacket_sleeves as A

SOURCE = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-shirt-detail-study/"
    "male-rigged-shirt-detailed.blend"
)
PREFIX = "Shirt detail - "
LEFT = PREFIX + "left collar"
RIGHT = PREFIX + "right collar"
CONNECTED = PREFIX + "connected collar"
REMAINING = (
    PREFIX + "center placket",
    PREFIX + "button 1",
    PREFIX + "button 2",
    PREFIX + "button 3",
    PREFIX + "button 4",
)
OLD_COUNT = 1152
EPS = 1e-6
TOL = 2e-6


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def vector(value):
    return [float(x) for x in value]


def coordinates(obj):
    return np.asarray([[v.co.x, v.co.y, v.co.z] for v in obj.data.vertices], np.float32)


def dense_weights(obj, names, exact_order=True):
    group_names = [group.name for group in obj.vertex_groups]
    if exact_order and group_names != names:
        raise AssertionError(f"{obj.name} vertex group order")
    if len(set(group_names)) != len(group_names) or not set(names).issubset(
        group_names
    ):
        raise AssertionError(f"{obj.name} missing named vertex groups")
    name_indices = {name: index for index, name in enumerate(names)}
    result = np.zeros((len(obj.data.vertices), len(names)), np.float32)
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            name = obj.vertex_groups[group.group].name
            if name in name_indices:
                result[vertex.index, name_indices[name]] = group.weight
    return result


def oriented_faces(obj):
    if any(len(face.vertices) != 3 for face in obj.data.polygons):
        raise AssertionError(f"{obj.name} has non-triangles")
    return [tuple(face.vertices) for face in obj.data.polygons]


def oriented_cycle(face):
    return min(face[index:] + face[:index] for index in range(3))


def winding_conflicts(faces):
    directions = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1], strict=True):
            directions.setdefault(tuple(sorted((a, b))), []).append((a, b))
    conflicts = []
    for edge, traversals in directions.items():
        if len(traversals) != 2 or traversals[0] != traversals[1][::-1]:
            conflicts.append(
                {"edge": list(edge), "traversals": [list(x) for x in traversals]}
            )
    return conflicts


def image_snapshot():
    rows = {}
    for image in bpy.data.images:
        packed = bytes(image.packed_file.data) if image.packed_file else None
        rows[image.name] = {
            "size": list(image.size),
            "packed_sha256": hashlib.sha256(packed).hexdigest()
            if packed is not None
            else None,
            "colorspace": image.colorspace_settings.name,
        }
    return rows


def remove_objects(snapshot, names):
    snapshot = dict(snapshot)
    snapshot["meshes"] = {
        key: value for key, value in snapshot["meshes"].items() if key not in names
    }
    snapshot["mesh_names"] = sorted(snapshot["meshes"])
    snapshot["objects"] = {
        key: value for key, value in snapshot["objects"].items() if key not in names
    }
    return snapshot


def signed_volume(points, faces):
    points = A.array(points)
    return float(
        sum(
            np.dot(
                points[face[0]],
                np.cross(points[face[1]], points[face[2]]),
            )
            / 6
            for face in faces
        )
    )


def boundary_of_removed(faces, removed):
    edges = {}
    for index, face in enumerate(faces):
        if index in removed:
            continue
        for a, b in zip(face, face[1:] + face[:1], strict=True):
            edge = tuple(sorted((a, b)))
            edges[edge] = edges.get(edge, 0) + 1
    boundary = [edge for edge, count in edges.items() if count == 1]
    adjacency = {}
    for a, b in boundary:
        adjacency.setdefault(a, []).append(b)
        adjacency.setdefault(b, []).append(a)
    loops, seen = [], set()
    for start in sorted(adjacency):
        if start in seen:
            continue
        loop, previous, current = [], None, start
        while True:
            loop.append(current)
            seen.add(current)
            following = [value for value in adjacency[current] if value != previous]
            if previous is None:
                if len(following) != 2:
                    raise AssertionError("source cap boundary is not a loop")
                next_vertex = following[0]
            elif len(following) != 1:
                raise AssertionError("source cap boundary is not a loop")
            else:
                next_vertex = following[0]
            if next_vertex == start:
                break
            if next_vertex in seen:
                raise AssertionError("source cap boundary is open")
            previous, current = current, next_vertex
        loops.append(loop)
    return loops


def detail_coordinates(obj):
    attribute = obj.data.attributes.get("ShirtDetailCoordinates")
    if (
        attribute is None
        or attribute.domain != "POINT"
        or attribute.data_type != "FLOAT_VECTOR"
        or len(attribute.data) != len(obj.data.vertices)
    ):
        raise AssertionError(f"{obj.name} ShirtDetailCoordinates")
    return np.asarray([item.vector[:] for item in attribute.data], np.float32)


def source_flap(obj, shirt_names):
    faces = oriented_faces(obj)
    if len(obj.data.vertices) != 576 or len(faces) != 1148:
        raise AssertionError(f"unexpected source collar topology: {obj.name}")
    points, _ = A.H.geometry(obj)
    z = A.array(points)[:, 2]
    end_ids = set(np.flatnonzero(abs(z - np.max(z)) <= 1e-6).tolist())
    cap_face_indices = [
        index for index, face in enumerate(faces) if set(face).issubset(end_ids)
    ]
    if len(end_ids) != 18 or len(cap_face_indices) != 16:
        raise AssertionError(f"unexpected T endpoint/cap predicate: {obj.name}")
    cap = {faces[index] for index in cap_face_indices}
    loops = boundary_of_removed(faces, set(cap_face_indices))
    if len(loops) != 1 or len(loops[0]) != 18:
        raise AssertionError(f"unexpected source collar cap: {obj.name}")
    return {
        "coordinates": coordinates(obj),
        "detail_coordinates": detail_coordinates(obj),
        "weights": dense_weights(obj, shirt_names),
        "faces": faces,
        "preserved_faces": {
            face for index, face in enumerate(faces) if index not in cap_face_indices
        },
        "cap_faces": cap,
        "cap_face_indices": cap_face_indices,
        "cap_boundary": set(loops[0]),
        "materials": [
            material.name if material else None for material in obj.data.materials
        ],
    }


def shirt_audit_bridge(source, source_sha):
    path = source.parent / "shirt-audit.json"
    if not path.exists():
        raise AssertionError(f"missing finalized shirt audit beside source: {path}")
    record = json.loads(path.read_text())
    if not record.get("accepted") or record.get("model_sha256") != source_sha:
        raise AssertionError("shirt audit does not accept exact source")
    if (
        len(record.get("arm_samples", [])) != 354
        or len(record.get("neck_samples", [])) != 36
    ):
        raise AssertionError("shirt audit motion scope mismatch")
    return {
        "path": str(path),
        "sha256": digest(path),
        "model_sha256": source_sha,
        "mode": record.get("mode"),
    }


def stable_top4(weights):
    result = np.asarray(weights, float).copy()
    ranked = np.argsort(-result, axis=1, kind="stable")
    for row, indices in zip(result, ranked, strict=True):
        row[indices[4:]] = 0
        if row.sum() <= EPS:
            raise AssertionError("non-positive reconstructed weight sum")
        row /= row.sum()
    return result


def validate_contract(path, connected, old, shirt, body, shirt_names):
    values = np.load(path, allow_pickle=False)
    required = (
        "expected_coordinates",
        "expected_weights",
        "goals_t",
        "body_anchors",
        "body_barycentrics",
        "source_end_ids",
        "body_weight_blends",
        "shirt_anchors",
        "shirt_barycentrics",
        "shirt_weight_blends",
        "weight_smoothing_factors",
        "weight_smoothing_passes",
        "seams",
    )
    missing = [key for key in required if key not in values]
    if missing:
        raise AssertionError(f"neckband provenance missing {missing}")
    count = len(connected.data.vertices)
    new_count = count - OLD_COUNT
    if new_count <= 0:
        raise AssertionError("connected collar has no new band vertices")
    expected_coordinates = np.asarray(values["expected_coordinates"])
    expected_weights = np.asarray(values["expected_weights"])
    goals = np.asarray(values["goals_t"])
    anchors = np.asarray(values["body_anchors"])
    barycentrics = np.asarray(values["body_barycentrics"])
    source_end_ids = np.asarray(values["source_end_ids"])
    body_blend = np.asarray(values["body_weight_blends"])
    shirt_anchors = np.asarray(values["shirt_anchors"])
    shirt_barycentrics = np.asarray(values["shirt_barycentrics"])
    shirt_blend = np.asarray(values["shirt_weight_blends"])
    smoothing_factors = np.asarray(values["weight_smoothing_factors"])
    smoothing_passes = np.asarray(values["weight_smoothing_passes"])
    seams = np.asarray(values["seams"])
    expected_old_coordinates = np.vstack(
        (old[LEFT]["coordinates"], old[RIGHT]["coordinates"])
    )
    expected_old_weights = np.vstack((old[LEFT]["weights"], old[RIGHT]["weights"]))
    if (
        expected_coordinates.dtype != np.float32
        or expected_weights.dtype != np.float32
        or expected_coordinates.shape != (count, 3)
        or expected_weights.shape != (count, len(shirt_names))
        or not np.array_equal(
            expected_coordinates[:OLD_COUNT], expected_old_coordinates
        )
        or not np.array_equal(expected_weights[:OLD_COUNT], expected_old_weights)
    ):
        raise AssertionError("neckband provenance old source arrays")
    if (
        goals.shape != (count, 3)
        or anchors.shape != (new_count, 3)
        or not np.issubdtype(anchors.dtype, np.integer)
        or barycentrics.shape != (new_count, 3)
        or source_end_ids.shape != (new_count,)
        or not np.issubdtype(source_end_ids.dtype, np.integer)
        or body_blend.shape != (new_count,)
        or shirt_anchors.shape != (new_count, 3)
        or not np.issubdtype(shirt_anchors.dtype, np.integer)
        or shirt_barycentrics.shape != (new_count, 3)
        or shirt_blend.shape != (new_count,)
        or smoothing_factors.shape != (new_count,)
        or smoothing_passes.shape != ()
        or not np.issubdtype(smoothing_passes.dtype, np.integer)
        or int(smoothing_passes) != 6
        or seams.shape != (2, 18)
        or not np.issubdtype(seams.dtype, np.integer)
    ):
        raise AssertionError("neckband provenance new array shapes")
    if not all(
        np.isfinite(value).all()
        for value in (
            goals,
            expected_weights,
            barycentrics,
            body_blend,
            shirt_barycentrics,
            shirt_blend,
            smoothing_factors,
        )
    ):
        raise AssertionError("neckband provenance has nonfinite values")
    if (
        np.min(expected_weights) < -EPS
        or np.max(abs(expected_weights.sum(axis=1) - 1)) > EPS
        or np.max((expected_weights > 1e-8).sum(axis=1)) > 4
        or np.min(barycentrics) < -EPS
        or np.max(abs(barycentrics.sum(axis=1) - 1)) > EPS
        or np.min(shirt_barycentrics) < -EPS
        or np.max(abs(shirt_barycentrics.sum(axis=1) - 1)) > EPS
        or np.min(body_blend) < -EPS
        or np.max(body_blend) > 1 + EPS
        or np.min(shirt_blend) < -EPS
        or np.max(shirt_blend) > 1 + EPS
        or np.min(smoothing_factors) < -EPS
        or np.max(smoothing_factors) > 1 + EPS
    ):
        raise AssertionError("neckband provenance weights or blend")
    body.data.calc_loop_triangles()
    body_faces = {tuple(sorted(face.vertices)) for face in body.data.loop_triangles}
    if (
        np.min(anchors) < 0
        or np.max(anchors) >= len(body.data.vertices)
        or any(tuple(sorted(row)) not in body_faces for row in anchors)
    ):
        raise AssertionError("neckband provenance body anchors")
    shirt.data.calc_loop_triangles()
    shirt_faces = {tuple(sorted(face.vertices)) for face in shirt.data.loop_triangles}
    if (
        np.min(shirt_anchors) < 0
        or np.max(shirt_anchors) >= len(shirt.data.vertices)
        or any(tuple(sorted(row)) not in shirt_faces for row in shirt_anchors)
    ):
        raise AssertionError("neckband provenance shirt anchors")
    endpoint_sets = {
        LEFT: old[LEFT]["cap_boundary"],
        RIGHT: {vertex + 576 for vertex in old[RIGHT]["cap_boundary"]},
    }
    if (
        np.min(source_end_ids) < 0
        or np.max(source_end_ids) >= OLD_COUNT
        or not set(source_end_ids).issubset(endpoint_sets[LEFT] | endpoint_sets[RIGHT])
        or set(seams[0]) != endpoint_sets[LEFT]
        or set(seams[1]) != endpoint_sets[RIGHT]
    ):
        raise AssertionError("neckband provenance seam endpoints")
    actual_coordinates = coordinates(connected)
    actual_weights = dense_weights(connected, shirt_names)
    if not (
        np.array_equal(actual_coordinates, expected_coordinates)
        and np.array_equal(actual_weights, expected_weights)
    ):
        raise AssertionError("neckband exact coordinates or weights")
    body_weights = dense_weights(body, shirt_names, exact_order=False)
    body_reconstructed = np.einsum("vi,vij->vj", barycentrics, body_weights[anchors])
    shirt_weights = dense_weights(shirt, shirt_names)
    shirt_reconstructed = np.einsum(
        "vi,vij->vj", shirt_barycentrics, shirt_weights[shirt_anchors]
    )
    head_index, neck_index = shirt_names.index("head"), shirt_names.index("neck_01")
    body_reconstructed[:, neck_index] += body_reconstructed[:, head_index]
    body_reconstructed[:, head_index] = 0
    shirt_reconstructed[:, neck_index] += shirt_reconstructed[:, head_index]
    shirt_reconstructed[:, head_index] = 0
    reconstructed = (
        body_reconstructed * (1 - shirt_blend[:, None])
        + shirt_reconstructed * shirt_blend[:, None]
    )
    reconstructed = reconstructed * body_blend[:, None] + expected_old_weights[
        source_end_ids
    ] * (1 - body_blend[:, None])
    unfiltered = stable_top4(reconstructed)
    if new_count != 439 * 9 * 2:
        raise AssertionError(f"unexpected neckband smoothing shape: {new_count}")
    filtered = unfiltered.reshape(439, 9, 2, len(shirt_names)).copy()
    for _ in range(int(smoothing_passes)):
        padded = np.pad(filtered, ((1, 1), (0, 0), (0, 0), (0, 0)), mode="edge")
        filtered = (padded[:-2] + 2 * padded[1:-1] + padded[2:]) / 4
    smoothed = (
        unfiltered.reshape(439, 9, 2, len(shirt_names))
        * (1 - smoothing_factors.reshape(439, 9, 2, 1))
        + filtered * smoothing_factors.reshape(439, 9, 2, 1)
    ).reshape(new_count, len(shirt_names))
    final_weights = stable_top4(smoothed)
    reconstruction_delta = float(
        np.max(abs(final_weights.astype(np.float32) - expected_weights[OLD_COUNT:]))
    )
    if reconstruction_delta > 1e-6:
        raise AssertionError("neckband weights do not reconstruct")
    return {
        "goals": goals[OLD_COUNT:].astype(float),
        "new_vertex_count": new_count,
        "weight_reconstruction_max_abs_error": reconstruction_delta,
        "body_head_weight_merged_into_neck_before_top4": True,
        "weight_smoothing": {
            "passes": int(smoothing_passes),
            "factor_minimum": float(np.min(smoothing_factors)),
            "factor_maximum": float(np.max(smoothing_factors)),
            "max_abs_change_before_final_top4": float(
                np.max(abs(smoothed - unfiltered))
            ),
        },
        "weight_blends": {
            "body": {
                "minimum": float(np.min(body_blend)),
                "maximum": float(np.max(body_blend)),
            },
            "shirt": {
                "minimum": float(np.min(shirt_blend)),
                "maximum": float(np.max(shirt_blend)),
            },
        },
    }


def validate_connected(connected, old, shirt, rig, shirt_names):
    if connected.get("shirtDetail") is not True:
        raise AssertionError("connected collar needs shirtDetail=true")
    if [
        material.name if material else None for material in connected.data.materials
    ] != old[LEFT]["materials"]:
        raise AssertionError("connected collar material slots")
    if (
        connected.parent != shirt
        or connected.parent_type != "OBJECT"
        or connected.parent_bone
        or not np.allclose(
            np.asarray(connected.matrix_parent_inverse), np.eye(4), atol=1e-8, rtol=0
        )
        or not np.allclose(
            np.asarray(connected.matrix_basis), np.eye(4), atol=1e-8, rtol=0
        )
        or connected.data.shape_keys
        or (connected.animation_data and connected.animation_data.drivers)
    ):
        raise AssertionError("connected collar attachment, transforms, or drivers")
    if (
        len(connected.modifiers) != 1
        or connected.modifiers[0].type != "ARMATURE"
        or connected.modifiers[0].object != rig
    ):
        raise AssertionError("connected collar armature")
    actual_weights = dense_weights(connected, shirt_names)
    if (
        np.min(actual_weights) < -EPS
        or np.max(abs(actual_weights.sum(axis=1) - 1)) > EPS
        or np.max((actual_weights > 1e-8).sum(axis=1)) > 4
    ):
        raise AssertionError("connected collar weights")
    faces = oriented_faces(connected)
    old_faces = [face for face in faces if max(face) < OLD_COUNT]
    expected = {oriented_cycle(face) for face in old[LEFT]["preserved_faces"]} | {
        oriented_cycle(tuple(vertex + 576 for vertex in face))
        for face in old[RIGHT]["preserved_faces"]
    }
    if (
        len(old_faces) != 2 * (1148 - len(old[LEFT]["cap_face_indices"]))
        or {oriented_cycle(face) for face in old_faces} != expected
    ):
        raise AssertionError("old collar surface faces or winding changed beyond caps")
    if any(
        tuple(sorted(face)) in {tuple(sorted(row)) for row in old[LEFT]["cap_faces"]}
        for face in old_faces
    ) or any(
        tuple(sorted(face))
        in {
            tuple(sorted(vertex + 576 for vertex in row))
            for row in old[RIGHT]["cap_faces"]
        }
        for face in old_faces
    ):
        raise AssertionError("old collar cap face retained")
    interface = {LEFT: set(), RIGHT: set()}
    for face in faces:
        old_vertices = [vertex for vertex in face if vertex < OLD_COUNT]
        new_vertices = [vertex for vertex in face if vertex >= OLD_COUNT]
        if not old_vertices or not new_vertices:
            continue
        if min(old_vertices) < 576 <= max(old_vertices):
            raise AssertionError("direct left/right flap connection")
        side = LEFT if max(old_vertices) < 576 else RIGHT
        interface[side].update(
            vertex - (0 if side == LEFT else 576) for vertex in old_vertices
        )
    if (
        interface[LEFT] != old[LEFT]["cap_boundary"]
        or interface[RIGHT] != old[RIGHT]["cap_boundary"]
    ):
        raise AssertionError("band must join exactly the 18 cap endpoints on each flap")
    expected_detail = np.vstack(
        (old[LEFT]["detail_coordinates"], old[RIGHT]["detail_coordinates"])
    )
    if not np.array_equal(detail_coordinates(connected)[:OLD_COUNT], expected_detail):
        raise AssertionError("old ShirtDetailCoordinates changed")
    topology = A.topology(connected.data)
    if (
        topology["boundary_edges"]
        or topology["nonmanifold_edges"]
        or topology["degenerate_faces"]
        or topology["faces"] != topology["triangles"]
        or topology["connected_components"] != 1
    ):
        raise AssertionError(
            "connected collar must be one closed manifold triangle mesh"
        )
    conflicts = winding_conflicts(faces)
    if conflicts:
        raise AssertionError(f"connected collar winding conflicts: {len(conflicts)}")
    topology["winding_conflicts"] = 0
    return {"topology": topology}


def geometry(obj):
    return A.H.geometry(obj)


def edge_lengths(obj, points):
    return np.asarray(
        [
            (points[a] - points[b]).length
            for a, b in sorted(
                {tuple(sorted(edge.vertices)) for edge in obj.data.edges}
            )
        ]
    )


def record(rig, connected, shirt, body, coat, hardware, details, edge_reference):
    objects = [connected, shirt, body, coat, *hardware, *details]
    cache = {obj.name: geometry(obj) for obj in objects}
    for name, (points, _faces) in cache.items():
        if not np.isfinite(A.array(points)).all():
            raise AssertionError(f"{name} nonfinite evaluated geometry")

    def crossings(left, right):
        points, faces = cache[left.name]
        other_points, other_faces = cache[right.name]
        return len(A.H.between(points, faces, other_points, other_faces))

    points, faces = cache[connected.name]
    tree = BVHTree.FromPolygons(*cache[shirt.name], all_triangles=True)
    distances = [tree.find_nearest(point)[3] * 1000 for point in points]
    ratio = edge_lengths(connected, points) / edge_reference
    if not np.isfinite(distances).all() or not np.isfinite(ratio).all():
        raise AssertionError("connected collar nonfinite proximity or strain")
    detail_counts = {detail.name: crossings(connected, detail) for detail in details}
    result = {
        "contacts": {
            "body": crossings(connected, body),
            "shirt": crossings(connected, shirt),
            "coat": crossings(connected, coat),
            "hardware": {part.name: crossings(connected, part) for part in hardware},
            "remaining_details": detail_counts,
            "self": len(A.H.strict_pairs(points, faces)),
        },
        "shirt_proximity_mm": {
            "minimum": float(min(distances)),
            "maximum": float(max(distances)),
        },
        "edge_strain_percent": float(np.max(abs(ratio - 1)) * 100),
        "head_neck_skin_matrix_max_abs_difference": head_neck_skin_delta(rig),
    }
    counts = result["contacts"]
    result["accepted"] = not (
        counts["body"]
        or counts["shirt"]
        or counts["coat"]
        or counts["self"]
        or sum(counts["hardware"].values())
        or sum(counts["remaining_details"].values())
        or result["head_neck_skin_matrix_max_abs_difference"] > 1e-6
    )
    return result


def pose(scene, rig, frame):
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, frame)


def head_neck_skin_delta(rig):
    def skin(bone_name):
        bone = rig.pose.bones[bone_name]
        return bone.matrix @ rig.data.bones[bone_name].matrix_local.inverted()

    return float(
        np.max(
            abs(np.asarray(skin("head"), float) - np.asarray(skin("neck_01"), float))
        )
    )


def main(args):
    source_sha, input_sha = digest(args.source), digest(args.input)
    bridge = shirt_audit_bridge(args.source, source_sha)
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    source_snapshot = E.static_snapshot()
    source_snapshot["images"] = image_snapshot()
    scene, rig, _coat, _body, source_shirt = A.scene_objects()
    pose(scene, rig, 31.0)
    shirt_names = [group.name for group in source_shirt.vertex_groups]
    old = {
        name: source_flap(bpy.data.objects[name], shirt_names) for name in (LEFT, RIGHT)
    }
    source_snapshot = remove_objects(source_snapshot, {LEFT, RIGHT})

    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    if (
        LEFT in bpy.data.objects
        or RIGHT in bpy.data.objects
        or CONNECTED not in bpy.data.objects
    ):
        raise AssertionError("exact old-collar replacement objects required")
    connected = bpy.data.objects[CONNECTED]
    detail_names = {obj.name for obj in bpy.data.objects if obj.get("shirtDetail")}
    if detail_names != {*REMAINING, CONNECTED}:
        raise AssertionError(
            "exact five retained shirt details plus connected collar required"
        )
    candidate_snapshot = E.static_snapshot()
    candidate_snapshot["images"] = image_snapshot()
    candidate_snapshot = remove_objects(candidate_snapshot, {CONNECTED})
    if candidate_snapshot != source_snapshot:
        raise AssertionError("source static snapshot or packed images changed")
    topology = validate_connected(connected, old, shirt, rig, shirt_names)
    contract = validate_contract(
        args.provenance, connected, old, shirt, body, shirt_names
    )

    pose(scene, rig, 31.0)
    actual, actual_faces = geometry(connected)
    t_volume = signed_volume(actual, actual_faces)
    if t_volume <= 1e-12:
        raise AssertionError("connected collar T signed volume")
    residual = float(np.max(abs(A.array(actual)[OLD_COUNT:] - contract["goals"])))
    if residual > TOL:
        raise AssertionError(f"connected collar T residual {residual}")
    topology["t_residual_m"] = residual
    topology["t_signed_volume_m3"] = t_volume
    hardware = [obj for obj in bpy.data.objects if obj.get("jacketHardware")]
    if len(hardware) != 7:
        raise AssertionError("exact seven jacket hardware objects required")
    details = [bpy.data.objects[name] for name in REMAINING]
    edge_reference = edge_lengths(connected, actual)
    arm_rows, neck_rows, failures = [], [], []
    for action, frames in A.action_scopes(
        scene["riggedJacketOriginalLoweringAction"], args.quick
    ):
        rig.animation_data.action = bpy.data.actions[action]
        for frame in frames:
            A.sample(scene, frame)
            row = record(
                rig, connected, shirt, body, coat, hardware, details, edge_reference
            )
            row.update(
                scope="lowering"
                if action == scene["riggedJacketOriginalLoweringAction"]
                else action,
                frame=float(frame),
            )
            arm_rows.append(row)
            if not row["accepted"]:
                failures.append(row)
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, 31.0)
    t_basis = A.arm_basis(rig)
    A.sample(scene, 1.0)
    down_basis = A.arm_basis(rig)
    for active in A.SIDES:
        rig.animation_data.action = bpy.data.actions[
            scene["riggedJacketOriginalLoweringAction"]
        ]
        A.sample(scene, 31.0)
        rig.animation_data.action = None
        for side in A.SIDES:
            for part, matrix in (down_basis if side == active else t_basis)[
                side
            ].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        A.update()
        row = record(
            rig, connected, shirt, body, coat, hardware, details, edge_reference
        )
        row.update(scope="asymmetric", frame=None, full_down_side=active)
        arm_rows.append(row)
        if not row["accepted"]:
            failures.append(row)

    neck_values = (
        [("X", -10), ("X", 10), ("Z", -20), ("Z", 20)]
        if args.quick
        else [
            (axis, float(degrees))
            for axis, limit in (("X", 10), ("Z", 20))
            for degrees in np.linspace(-limit, limit, 9)
        ]
    )
    for frame in (31.0, 1.0):
        for axis, degrees in neck_values:
            pose(scene, rig, frame)
            rig.animation_data.action = None
            bone = rig.pose.bones["neck_01"]
            basis = bone.matrix_basis.copy()
            bone.matrix_basis = (
                basis
                @ Quaternion(
                    (1, 0, 0) if axis == "X" else (0, 0, 1), math.radians(degrees)
                )
                .to_matrix()
                .to_4x4()
            )
            A.update()
            row = record(
                rig, connected, shirt, body, coat, hardware, details, edge_reference
            )
            row.update(frame=frame, axis=axis, degrees=degrees)
            neck_rows.append(row)
            if not row["accepted"]:
                failures.append(row)
            bone.matrix_basis = basis
            A.update()
    expected_arm, expected_neck = (14, 8) if args.quick else (354, 36)
    if len(arm_rows) != expected_arm or len(neck_rows) != expected_neck:
        raise AssertionError("motion scope count")
    if digest(args.source) != source_sha or digest(args.input) != input_sha:
        raise AssertionError("blend file changed during read-only audit")
    output = {
        "source_sha256": source_sha,
        "model_sha256": input_sha,
        "auditor_sha256": digest(Path(__file__)),
        "provenance_sha256": digest(args.provenance),
        "mode": "quick14_plus_neck8" if args.quick else "full354_plus_neck36",
        "accepted": not failures,
        "source_static_snapshot_and_packed_images_exact": True,
        "inherited_shirt_audit": bridge,
        "replacement": {
            "removed_source_objects": [LEFT, RIGHT],
            "connected_object": CONNECTED,
            "preserved_original_vertices": OLD_COUNT,
            "removed_cap_triangles_per_flap": len(old[LEFT]["cap_face_indices"]),
            "cap_endpoint_vertices_per_flap": 18,
            **topology,
            "new_vertex_count": contract["new_vertex_count"],
            "weight_reconstruction_max_abs_error": contract[
                "weight_reconstruction_max_abs_error"
            ],
            "body_head_weight_merged_into_neck_before_top4": contract[
                "body_head_weight_merged_into_neck_before_top4"
            ],
            "weight_blends": contract["weight_blends"],
            "weight_smoothing": contract["weight_smoothing"],
        },
        "arm_samples": arm_rows,
        "neck_samples": neck_rows,
        "motion_metrics": {
            "maximum_edge_strain_percent": float(
                max(row["edge_strain_percent"] for row in [*arm_rows, *neck_rows])
            )
        },
        "failures": failures,
        "limits": [
            "Finite strict crossings only; no continuous or combined-motion certification.",
            "Unsigned shirt proximity and edge strain are reported metrics, not acceptance thresholds.",
            "The scope is 354 arm samples plus 36 single-axis neck perturbations; locomotion and combined neck/arm motion remain untested.",
            "The body- and shirt-derived head weights are merged into neck_01 for this scope; independent head motion is untested.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(output, indent=2) + "\n")
    print(
        "SHIRT_NECKBAND_AUDIT",
        json.dumps(
            {
                key: output[key]
                for key in ("mode", "accepted", "source_sha256", "model_sha256")
            }
        ),
    )
    if failures:
        raise AssertionError(f"{len(failures)} motion failures")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--quick", action="store_true")
    main(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
