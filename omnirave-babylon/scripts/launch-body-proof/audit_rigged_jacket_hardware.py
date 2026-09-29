"""Read-only integrity, attachment, and finite-motion audit for native jacket hardware.

The audit accepts only the seven native-skinned hardware meshes emitted by
build_rigged_jacket_hardware.py.  It compares their dense expected shape/weight
arrays to provenance, preserves the satin source assets, and tests explicit
component-pair contact policy.  It never writes the supplied blend files.
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
import audit_rigged_jacket_sleeves as A

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-satin-study/"
    "male-rigged-jacket-satin.blend"
)
PREFIX = "Jacket detail - "
PART_NAMES = (
    "left hip pocket",
    "right hip pocket",
    "left sleeve utility pocket",
    "left hip pocket pull",
    "right hip pocket pull",
    "left sleeve utility pocket pull",
    "main zipper pull",
)
EPS = 1e-6
FLOAT_TOL = 2e-6


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def update():
    bpy.context.view_layer.update()


def sample(scene, frame):
    whole = int(frame)
    scene.frame_set(whole, subframe=float(frame - whole))
    update()


def shapes(obj):
    keys = obj.data.shape_keys
    if keys is None:
        return None
    return np.asarray(
        [
            [[point.co.x, point.co.y, point.co.z] for point in key.data]
            for key in keys.key_blocks
        ],
        dtype=np.float32,
    )


def weight_matrix(obj, names):
    if [group.name for group in obj.vertex_groups] != list(names):
        raise AssertionError(f"{obj.name}: vertex-group names/order diverge from coat")
    values = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float32)
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            values[vertex.index, group.group] = group.weight
    return values


def old_snapshot(coat, rig, body, shirt, source_object_names, old_material_names):
    result = A.preserved_snapshot(coat, rig, body, shirt)
    result["materials"] = [
        material
        for material in result["materials"]
        if material["name"] in old_material_names
    ]
    result["object_drivers"] = {
        name: data
        for name, data in result["object_drivers"].items()
        if name in source_object_names
    }
    return result


def mesh_geometry(obj):
    points, faces = A.H.geometry(obj)
    return points, [tuple(face) for face in faces]


def detail_objects():
    expected = {PREFIX + name for name in PART_NAMES}
    found = {obj.name for obj in bpy.data.objects if obj.get("jacketHardware")}
    prefixed = {obj.name for obj in bpy.data.objects if obj.name.startswith(PREFIX)}
    if found != expected or prefixed != expected:
        raise AssertionError(
            f"hardware object set must be exactly {sorted(expected)}, got marked={sorted(found)}, prefixed={sorted(prefixed)}"
        )
    return [bpy.data.objects[PREFIX + name] for name in PART_NAMES]


def matrix_identity(matrix, tolerance=1e-8):
    return (
        float(
            max(
                abs(value - expected)
                for value, expected in zip(
                    (value for row in matrix for value in row),
                    (value for row in np.eye(4) for value in row),
                )
            )
        )
        <= tolerance
    )


def component_info(obj):
    try:
        components = json.loads(obj["attachmentComponents"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise AssertionError(f"{obj.name}: invalid attachmentComponents") from exc
    attr = obj.data.attributes.get("AttachmentComponent")
    if attr is None or attr.domain != "FACE" or attr.data_type != "INT":
        raise AssertionError(f"{obj.name}: AttachmentComponent must be FACE/INT")
    if len(attr.data) != len(obj.data.polygons):
        raise AssertionError(f"{obj.name}: face attachment attribute length mismatch")
    if not components:
        raise AssertionError(f"{obj.name}: empty attachment component metadata")
    components = sorted(components, key=lambda row: row["id"])
    if [row["id"] for row in components] != list(range(len(components))):
        raise AssertionError(f"{obj.name}: component IDs must be consecutive")
    for index, component in enumerate(components):
        component["_next_first_vertex"] = (
            int(components[index + 1]["first_vertex"])
            if index + 1 < len(components)
            else len(obj.data.vertices)
        )
    ranges = {}
    for index, component in enumerate(components):
        first = int(component["first_face"])
        last = (
            int(components[index + 1]["first_face"])
            if index + 1 < len(components)
            else len(obj.data.polygons)
        )
        if not (0 <= first < last <= len(obj.data.polygons)):
            raise AssertionError(
                f"{obj.name}: invalid component face range {component}"
            )
        for face_index in range(first, last):
            if attr.data[face_index].value != component["id"]:
                raise AssertionError(
                    f"{obj.name}: attachment face tag differs from metadata"
                )
        ranges[component["id"]] = {
            "kind": component["kind"],
            "face_indices": list(range(first, last)),
            "faces": [tuple(obj.data.polygons[i].vertices) for i in range(first, last)],
            "metadata": component,
        }
    return ranges


def driver_report(obj, coat):
    detail = obj.data.shape_keys
    source = coat.data.shape_keys
    if detail is None or len(detail.key_blocks) != 15 or len(source.key_blocks) != 15:
        raise AssertionError(f"{obj.name}: requires 15 shape blocks")
    names = [key.name for key in detail.key_blocks]
    if names != [key.name for key in source.key_blocks]:
        raise AssertionError(f"{obj.name}: shape-block names/order differ from coat")
    if detail.key_blocks[0].relative_key != detail.key_blocks[0]:
        raise AssertionError(f"{obj.name}: Basis must be its own relative key")
    curves = list(detail.animation_data.drivers) if detail.animation_data else []
    if len(curves) != 14:
        raise AssertionError(f"{obj.name}: requires exactly 14 shape drivers")
    by_path = {curve.data_path: curve for curve in curves}
    for index, source_key in enumerate(source.key_blocks[1:], 1):
        key = detail.key_blocks[index]
        path = key.path_from_id("value")
        curve = by_path.get(path)
        if curve is None:
            raise AssertionError(f"{obj.name}: missing driver for {key.name}")
        driver = curve.driver
        if (
            driver.type != "SCRIPTED"
            or driver.expression != "coat_value"
            or len(driver.variables) != 1
        ):
            raise AssertionError(f"{obj.name}: invalid driver form for {key.name}")
        variable = driver.variables[0]
        if (
            variable.name != "coat_value"
            or variable.type != "SINGLE_PROP"
            or len(variable.targets) != 1
        ):
            raise AssertionError(
                f"{obj.name}: invalid SINGLE_PROP driver for {key.name}"
            )
        target = variable.targets[0]
        if (
            target.id_type != "KEY"
            or target.id != source
            or target.data_path != source_key.path_from_id("value")
        ):
            raise AssertionError(
                f"{obj.name}: driver {key.name} is not sourced from matching coat key"
            )
    return {"shape_blocks": len(names), "drivers": len(curves), "source": coat.name}


def static_contract(obj, part_index, provenance, coat, rig):
    prefix = f"part_{part_index}_"
    required = (
        "anchors",
        "barycentrics",
        "offsets_t",
        "expected_keys",
        "expected_weights",
        "goals_t",
    )
    missing = [prefix + name for name in required if prefix + name not in provenance]
    if missing:
        raise AssertionError(f"{obj.name}: missing provenance arrays {missing}")
    expected_keys = np.asarray(provenance[prefix + "expected_keys"], dtype=np.float32)
    expected_weights = np.asarray(
        provenance[prefix + "expected_weights"], dtype=np.float32
    )
    anchors = np.asarray(provenance[prefix + "anchors"], dtype=np.int32)
    bary = np.asarray(provenance[prefix + "barycentrics"], dtype=np.float64)
    offsets = np.asarray(provenance[prefix + "offsets_t"], dtype=np.float64)
    goals = np.asarray(provenance[prefix + "goals_t"], dtype=np.float64)
    actual_keys = shapes(obj)
    names = [group.name for group in coat.vertex_groups]
    actual_weights = weight_matrix(obj, names)
    count, groups = len(obj.data.vertices), len(names)
    if expected_keys.shape != (15, count, 3) or expected_weights.shape != (
        count,
        groups,
    ):
        raise AssertionError(f"{obj.name}: dense expected array shape mismatch")
    if (
        anchors.shape != (count, 3)
        or bary.shape != (count, 3)
        or offsets.shape != (count, 3)
        or goals.shape != (count, 3)
    ):
        raise AssertionError(f"{obj.name}: anchor/goal provenance shape mismatch")
    if not all(
        np.isfinite(value).all()
        for value in (expected_keys, expected_weights, bary, offsets, goals)
    ):
        raise AssertionError(f"{obj.name}: non-finite provenance data")
    if not np.array_equal(actual_keys, expected_keys):
        raise AssertionError(
            f"{obj.name}: shape blocks are not exact float32 provenance"
        )
    if not np.array_equal(actual_weights, expected_weights):
        raise AssertionError(f"{obj.name}: weights are not exact float32 provenance")
    if not (np.all(anchors >= 0) and np.all(anchors < len(coat.data.vertices))):
        raise AssertionError(f"{obj.name}: anchor indices outside coat")
    if np.max(np.abs(bary.sum(axis=1) - 1)) > EPS or np.min(bary) < -EPS:
        raise AssertionError(f"{obj.name}: invalid barycentric anchors")
    if (
        np.min(actual_weights) < -EPS
        or np.max(np.abs(actual_weights.sum(axis=1) - 1)) > EPS
    ):
        raise AssertionError(f"{obj.name}: non-normalized weights")
    support = (actual_weights > 1e-8).sum(axis=1)
    if int(support.max()) > 4:
        raise AssertionError(f"{obj.name}: more than four positive weights")
    if (
        obj.parent != coat
        or not matrix_identity(obj.matrix_parent_inverse)
        or not matrix_identity(obj.matrix_basis)
    ):
        raise AssertionError(f"{obj.name}: expected identity coat-local attachment")
    modifiers = list(obj.modifiers)
    if (
        len(modifiers) != 1
        or modifiers[0].type != "ARMATURE"
        or modifiers[0].object != rig
    ):
        raise AssertionError(
            f"{obj.name}: requires exactly one Armature modifier to source rig"
        )
    topology = A.topology(obj.data)
    if (
        topology["nonmanifold_edges"]
        or topology["degenerate_faces"]
        or topology["boundary_edges"]
    ):
        raise AssertionError(
            f"{obj.name}: hardware mesh must be closed manifold triangles"
        )
    if topology["faces"] != topology["triangles"]:
        raise AssertionError(f"{obj.name}: hardware must contain only triangles")
    driver = driver_report(obj, coat)
    components = component_info(obj)
    return {
        "name": obj.name,
        "vertices": count,
        "triangles": topology["triangles"],
        "components": {str(key): value["kind"] for key, value in components.items()},
        "topology": {
            key: topology[key]
            for key in (
                "boundary_edges",
                "nonmanifold_edges",
                "degenerate_faces",
                "connected_components",
            )
        },
        "weights": {
            "maximum_positive_influences": int(support.max()),
            "minimum_sum": float(actual_weights.sum(axis=1).min()),
            "maximum_sum": float(actual_weights.sum(axis=1).max()),
        },
        "driver": driver,
        "expected_goal_t": goals,
        "components_internal": components,
    }


def localized_tooth_panel_mating(panel, tooth, panel_face_index):
    """Permit only the three panel rows centered on a tooth's authored longitudinal anchor."""
    metadata = tooth["metadata"]
    if not {"along_m", "panel_rows", "panel_length_m"} <= set(metadata):
        return False
    rows = int(metadata["panel_rows"])
    next_vertex = int(panel["metadata"]["_next_first_vertex"])
    first_vertex = int(panel["metadata"]["first_vertex"])
    denominator = 2 * (rows + 1)
    cross_count = (next_vertex - first_vertex) // denominator
    length = float(metadata["panel_length_m"])
    if (
        rows <= 0
        or cross_count < 2
        or length <= 0
        or (next_vertex - first_vertex) % denominator
    ):
        return False
    row = min(rows - 1, max(0, int(float(metadata["along_m"]) / length * rows)))
    # Each crosswise cell has a top and bottom quad, each split into two
    # triangles: 4 faces per cell. The cross count is derived from the panel vertex range.
    faces_per_row = 4 * (cross_count - 1)
    first = int(panel["metadata"]["first_face"])
    nearby = set(
        range(
            first + max(0, row - 1) * faces_per_row,
            first + min(rows, row + 2) * faces_per_row,
        )
    )
    return panel_face_index in nearby


def component_pair_allowed(left, right, left_face_index, right_face_index):
    kinds = frozenset((left["kind"], right["kind"]))
    if kinds == frozenset(("slider", "pull")):
        return True
    if kinds != frozenset(("tooth", "panel")):
        return False
    panel, tooth, panel_face = (
        (left, right, left_face_index)
        if left["kind"] == "panel"
        else (right, left, right_face_index)
    )
    return localized_tooth_panel_mating(panel, tooth, panel_face)


def contact_detail(obj, coat, body, shirt, static):
    points, faces = mesh_geometry(obj)
    coat_points, coat_faces = mesh_geometry(coat)
    body_points, body_faces = mesh_geometry(body)
    shirt_points, shirt_faces = mesh_geometry(shirt)
    result = {
        "coat": len(A.H.between(points, faces, coat_points, coat_faces)),
        "body": len(A.H.between(points, faces, body_points, body_faces)),
        "shirt": len(A.H.between(points, faces, shirt_points, shirt_faces)),
        "component_self": {},
        "allowed_mating_pairs": 0,
        "forbidden_component_pairs": 0,
        "pair_detail": [],
    }
    components = static["components_internal"]
    for component_id, component in components.items():
        count = len(A.H.strict_pairs(points, component["faces"]))
        result["component_self"][str(component_id)] = count
    ids = sorted(components)
    for left_index, left_id in enumerate(ids):
        for right_id in ids[left_index + 1 :]:
            left, right = components[left_id], components[right_id]
            count = len(A.H.between(points, left["faces"], points, right["faces"]))
            if not count:
                continue
            allowed_pairs = 0
            for left_local, right_local in A.H.between(
                points, left["faces"], points, right["faces"]
            ):
                allowed = component_pair_allowed(
                    left,
                    right,
                    left["face_indices"][left_local],
                    right["face_indices"][right_local],
                )
                allowed_pairs += int(allowed)
            forbidden_pairs = count - allowed_pairs
            result["allowed_mating_pairs"] += allowed_pairs
            result["forbidden_component_pairs"] += forbidden_pairs
            result["pair_detail"].append(
                {
                    "left_component": left_id,
                    "left_kind": left["kind"],
                    "right_component": right_id,
                    "right_kind": right["kind"],
                    "crossings": count,
                    "allowed_crossings": allowed_pairs,
                    "forbidden_crossings": forbidden_pairs,
                }
            )
    return result


def inter_detail_contacts(details):
    geometries = [(obj.name, *mesh_geometry(obj)) for obj in details]
    result, total = [], 0
    for index, (name, points, faces) in enumerate(geometries):
        for other_name, other_points, other_faces in geometries[index + 1 :]:
            count = len(A.H.between(points, faces, other_points, other_faces))
            if count:
                result.append({"left": name, "right": other_name, "crossings": count})
                total += count
    return {"crossings": total, "pairs": result}


def nearest_distances(points, coat_points, coat_faces):
    tree = BVHTree.FromPolygons(coat_points, coat_faces, all_triangles=True)
    rows = [tree.find_nearest(tuple(point))[3] for point in points]
    return {
        "minimum_mm": float(min(rows) * 1000),
        "maximum_mm": float(max(rows) * 1000),
        "mean_mm": float(np.mean(rows) * 1000),
    }


def metal_edges(obj, points, faces):
    # The builder reserves material slot 2 for gold teeth, sliders, and pulls.
    metal_faces = [
        tuple(poly.vertices) for poly in obj.data.polygons if poly.material_index == 2
    ]
    edges = set()
    for face in metal_faces:
        for index, a in enumerate(face):
            edges.add(tuple(sorted((a, face[(index + 1) % len(face)]))))
    return np.asarray(
        [np.linalg.norm(points[a] - points[b]) for a, b in sorted(edges)],
        dtype=np.float64,
    )


def pose_metrics(details, coat):
    coat_points, coat_faces = mesh_geometry(coat)
    result = {}
    for obj in details:
        points, faces = mesh_geometry(obj)
        result[obj.name] = {
            "surface_distance": nearest_distances(points, coat_points, coat_faces),
            "metal_edge_lengths": metal_edges(obj, points, faces),
        }
    return result


def compact_metrics(current, t_reference, static):
    result = {}
    for name, row in current.items():
        reference = t_reference[name]["metal_edge_lengths"]
        lengths = row["metal_edge_lengths"]
        if len(reference):
            ratios = lengths / reference
            metal = {
                "minimum_edge_ratio": float(ratios.min()),
                "maximum_edge_ratio": float(ratios.max()),
                "maximum_absolute_strain_percent": float(
                    np.max(np.abs(ratios - 1)) * 100
                ),
            }
        else:
            metal = {
                "minimum_edge_ratio": None,
                "maximum_edge_ratio": None,
                "maximum_absolute_strain_percent": None,
            }
        result[name] = {
            "surface_distance": row["surface_distance"],
            "metal_strain": metal,
        }
    return result


def detail_key_delta(details, coat):
    values = [float(key.value) for key in coat.data.shape_keys.key_blocks]
    return max(
        abs(float(key.value) - values[index])
        for obj in details
        for index, key in enumerate(obj.data.shape_keys.key_blocks)
    )


def record_sample(details, coat, body, shirt, statics, reference):
    contacts = {
        obj.name: contact_detail(obj, coat, body, shirt, statics[obj.name])
        for obj in details
    }
    inter = inter_detail_contacts(details)
    metrics = compact_metrics(pose_metrics(details, coat), reference, statics)
    key_delta = detail_key_delta(details, coat)
    failure = (
        key_delta > EPS
        or inter["crossings"]
        or any(
            row["coat"]
            or row["body"]
            or row["shirt"]
            or any(row["component_self"].values())
            or row["forbidden_component_pairs"]
            for row in contacts.values()
        )
    )
    return {
        "accepted": not failure,
        "hardware_shape_key_delta": key_delta,
        "contacts": contacts,
        "inter_detail": inter,
        "attachment_and_metal_metrics": metrics,
    }


def main(args):
    source_hash, input_hash = digest(args.source), digest(args.input)
    provenance = np.load(args.provenance)
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    scene, rig, coat, body, shirt = A.scene_objects()
    source_object_names = {obj.name for obj in bpy.data.objects}
    old_material_names = {material.name for material in bpy.data.materials}
    source_snapshot = old_snapshot(
        coat, rig, body, shirt, source_object_names, old_material_names
    )
    source_shapes = shapes(coat)
    source_weights = A.weights(coat)
    source_faces = np.asarray(
        [tuple(poly.vertices) for poly in coat.data.polygons], dtype=np.int32
    )
    original = scene["riggedJacketOriginalLoweringAction"]
    baseline = {}
    for action, frames in A.action_scopes(original, args.quick):
        rig.animation_data.action = bpy.data.actions[action]
        baseline[action] = []
        for frame in frames:
            sample(scene, frame)
            baseline[action].append(A.key_values(coat))

    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    candidate_snapshot = old_snapshot(
        coat, rig, body, shirt, source_object_names, old_material_names
    )
    if candidate_snapshot != source_snapshot:
        raise AssertionError(
            "coat/body/shirt/rig/actions/source materials or protected source metadata changed"
        )
    if (
        not np.array_equal(shapes(coat), source_shapes)
        or A.weights(coat) != source_weights
    ):
        raise AssertionError("source coat shapes or weights changed")
    if not np.array_equal(
        np.asarray(
            [tuple(poly.vertices) for poly in coat.data.polygons], dtype=np.int32
        ),
        source_faces,
    ):
        raise AssertionError("source coat topology changed")
    details = detail_objects()
    statics = {}
    for index, obj in enumerate(details):
        statics[obj.name] = static_contract(obj, index, provenance, coat, rig)

    rig.animation_data.action = bpy.data.actions[original]
    sample(scene, 31.0)
    t_metrics = pose_metrics(details, coat)
    for obj in details:
        actual, _ = mesh_geometry(obj)
        goals = statics[obj.name]["expected_goal_t"]
        residual = float(np.max(np.abs(A.array(actual) - goals)))
        statics[obj.name]["t_attachment_reconstruction_error_m"] = residual
        if residual > FLOAT_TOL:
            raise AssertionError(
                f"{obj.name}: T attachment reconstruction error {residual}"
            )
        del statics[obj.name]["expected_goal_t"]
        del statics[obj.name]["components_internal"]

    rows, failures = [], []

    def capture(scope, frame, baseline_values=None, **extra):
        actual_coat_keys = A.key_values(coat)
        coat_delta = (
            max(
                abs(actual_coat_keys[key] - expected)
                for key, expected in baseline_values.items()
            )
            if baseline_values is not None
            else 0.0
        )
        detail = record_sample(details, coat, body, shirt, component_statics, t_metrics)
        row = {
            "scope": scope,
            "frame": frame,
            "coat_shape_key_delta": coat_delta,
            **extra,
            **detail,
        }
        rows.append(row)
        if coat_delta > EPS or not detail["accepted"]:
            failures.append(row)

    # record_sample needs component maps retained independently of public report data.
    component_statics = {}
    for index, obj in enumerate(details):
        # Reconstruct only component data from live source; this remains checked in static_contract.
        component_statics[obj.name] = {"components_internal": component_info(obj)}

    for action, frames in A.action_scopes(original, args.quick):
        rig.animation_data.action = bpy.data.actions[action]
        for index, frame in enumerate(frames):
            sample(scene, frame)
            capture(
                "lowering" if action == original else action,
                float(frame),
                baseline[action][index],
            )

    # Same two asymmetric lowered-arm endpoints used by the jacket audit.
    rig.animation_data.action = bpy.data.actions[original]
    sample(scene, 31.0)
    t_basis = A.arm_basis(rig)
    sample(scene, 1.0)
    down_basis = A.arm_basis(rig)
    for active in A.SIDES:
        rig.animation_data.action = bpy.data.actions[original]
        sample(scene, 31.0)
        rig.animation_data.action = None
        for side in A.SIDES:
            for part, matrix in (down_basis if side == active else t_basis)[
                side
            ].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        update()
        capture("asymmetric", None, full_down_side=active)

    # Neck scope is independent of the arm action scope: +/- X10 and +/- Z20 at T/down.
    neck_rows = []
    neck_frames = (31.0, 1.0)
    neck_values = (
        (("X", -10.0), ("X", 10.0), ("Z", -20.0), ("Z", 20.0))
        if args.quick
        else tuple(
            (axis, float(degrees))
            for axis, limit in (("X", 10.0), ("Z", 20.0))
            for degrees in np.linspace(-limit, limit, 9)
        )
    )
    for frame in neck_frames:
        for axis, degrees in neck_values:
            rig.animation_data.action = bpy.data.actions[original]
            sample(scene, frame)
            rig.animation_data.action = None
            bone = rig.pose.bones["neck_01"]
            baseline_basis = bone.matrix_basis.copy()
            rotation = (
                Quaternion(
                    (1, 0, 0) if axis == "X" else (0, 0, 1), math.radians(degrees)
                )
                .to_matrix()
                .to_4x4()
            )
            bone.matrix_basis = baseline_basis @ rotation
            update()
            detail = record_sample(
                details, coat, body, shirt, component_statics, t_metrics
            )
            row = {"arm_frame": frame, "axis": axis, "degrees": degrees, **detail}
            neck_rows.append(row)
            if not detail["accepted"]:
                failures.append({"scope": "neck", **row})
            bone.matrix_basis = baseline_basis
            update()

    if len(rows) != (14 if args.quick else 354) or len(neck_rows) != (
        8 if args.quick else 36
    ):
        raise AssertionError("unexpected finite sample count")
    if digest(args.source) != source_hash or digest(args.input) != input_hash:
        raise AssertionError("source or candidate changed during read-only audit")
    report = {
        "source_sha256": source_hash,
        "model_sha256": input_hash,
        "mode": "quick14_plus_neck8" if args.quick else "full354_plus_neck36",
        "scope": "Fourteen shared arm samples plus eight finite neck perturbations in quick mode. Full mode uses the shared 354 arm samples plus the 36-sample finite neck sweep; neither establishes continuous or general-motion clearance.",
        "source_preservation": {
            "coat_body_shirt_rig_actions_old_materials_and_metadata_exact": True,
            "coat_shape_coordinates_weights_and_topology_exact": True,
        },
        "static_parts": statics,
        "arm_samples": rows,
        "neck_samples": neck_rows,
        "accepted_arm_samples": sum(
            row["accepted"] and row["coat_shape_key_delta"] <= EPS for row in rows
        ),
        "accepted_neck_samples": sum(row["accepted"] for row in neck_rows),
        "accepted": not failures,
        "failures": failures,
        "limits": [
            "Attachment-distance and metal-edge-strain values are measured at the finite samples and reported without a fabricated universal tolerance.",
            "Strict non-coplanar crossings are tested. Coplanar touch, continuous motion, physical cloth response, and runtime/export behavior are outside this audit.",
            "Only tooth-to-panel contacts on the two longitudinal panel rows adjacent to that tooth's recorded along_m anchor, and pull-to-slider contacts within one pull object, are allowed; every other inter-component or inter-object crossing fails.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "HARDWARE_AUDIT",
        json.dumps(
            {
                key: report[key]
                for key in (
                    "mode",
                    "accepted",
                    "accepted_arm_samples",
                    "accepted_neck_samples",
                    "source_sha256",
                    "model_sha256",
                )
            }
        ),
        flush=True,
    )
    if failures:
        raise AssertionError(f"hardware audit failed at {len(failures)} finite samples")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--quick", action="store_true")
    main(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
