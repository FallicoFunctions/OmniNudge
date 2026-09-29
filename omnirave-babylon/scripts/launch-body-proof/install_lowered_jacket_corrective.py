"""Install two finite lowered-endpoint keys and audit the tested pose scope."""

import argparse
import hashlib
import json
import math
import sys
import types
from collections import Counter
from pathlib import Path

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[2]
TMP = Path("/tmp/omnirave-lowered-correspondence")
SOURCE = (
    ROOT
    / "omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-gated-study/male-rigged-jacket-gated.blend"
)
INPUTS = (
    ROOT
    / "omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-jacket-lowering-study/inputs"
)
M_TARGET = INPUTS / "lowered-target.npz"
M_REPORT = INPUTS / "lowered-target-audit.json"
CORRESPONDENCE = INPUTS / "body-correspondence.npz"
CURVE_FIT = INPUTS / "lowering-curve-fit.json"
OUTPUT_DIR = TMP / "rigged-endpoint"
OUTPUT_BLEND = OUTPUT_DIR / "male-rigged-jacket-lowering.blend"
OUTPUT_AUDIT = OUTPUT_DIR / "lowering-audit.json"
SIDES = (("l", 1.0), ("r", -1.0))
REVIEW_ACTIONS = (
    "Jacket review - elbow bend",
    "Jacket review - forward reach",
    "Jacket review - overhead reach",
)
EPSILON = 1e-6

sys.path.insert(0, str(SCRIPT_DIR))
import gate_rigged_jacket_correctives as gate


def helpers():
    module = types.ModuleType("lowered_endpoint_helpers")
    module.__file__ = str(SCRIPT_DIR / "build_lowered_jacket_target.py")
    source = Path(module.__file__).read_text()
    exec(source.rsplit("\nmain()", 1)[0], module.__dict__)  # noqa: S102
    return module


H = helpers()


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def update():
    bpy.context.view_layer.update()


def sample(scene, frame):
    whole = int(frame)
    scene.frame_set(whole, subframe=float(frame - whole))
    update()


def array(points):
    return np.asarray([tuple(point) for point in points], dtype=np.float64)


def bounds(points):
    points = array(points)
    return {"min": points.min(axis=0).tolist(), "max": points.max(axis=0).tolist()}


def key_prefix_hash(coat, count=13):
    points = np.asarray(
        [
            [point.co[:] for point in key.data]
            for key in coat.data.shape_keys.key_blocks[:count]
        ],
        dtype=np.float32,
    )
    return hashlib.sha256(points.tobytes()).hexdigest()


def handler_counts():
    return {
        name: len(getattr(bpy.app.handlers, name))
        for name in (
            "frame_change_pre",
            "frame_change_post",
            "depsgraph_update_pre",
            "depsgraph_update_post",
        )
    }


def driver_audit(coat, controls):
    curves = [
        curve
        for curve in list(coat.data.shape_keys.animation_data.drivers)
        + list(controls.animation_data.drivers)
        if "lowered_endpoint" in curve.data_path or "lower_" in curve.data_path
    ]
    if any(
        not curve.driver.is_valid or not curve.driver.is_simple_expression
        for curve in curves
    ):
        raise AssertionError("endpoint study has a non-simple or invalid driver")
    expressions = [curve.driver.expression for curve in curves]
    if any(
        "frame" in expression.lower() or "action" in expression.lower()
        for expression in expressions
    ):
        raise AssertionError("endpoint driver depends on frame or action")
    return {
        "driver_count": len(curves),
        "all_native_simple_valid": True,
        "maximum_expression_length": max(map(len, expressions)),
    }


def midpoint(coat, solidify, base_count):
    visible = solidify.show_viewport
    solidify.show_viewport = False
    try:
        update()
        points, faces = H.geometry(coat)
        if len(points) != base_count:
            raise AssertionError("midsurface base vertex count changed")
        return points, faces
    finally:
        solidify.show_viewport = visible
        update()


def native_record(coat, body, top, solidify, base_count, include_geometry=True):
    native, native_faces = H.geometry(coat)
    body_points, body_faces = H.geometry(body)
    top_points, top_faces = H.geometry(top)
    pairs = {
        "self": H.strict_pairs(native, native_faces),
        "body": H.between(native, native_faces, body_points, body_faces),
        "shirt": H.between(native, native_faces, top_points, top_faces),
    }
    mid, mid_faces = midpoint(coat, solidify, base_count)
    _, outer_faces = H.verify_shirt_pairing(top_faces, len(top_points))
    result = {
        "native_counts": {kind: len(rows) for kind, rows in pairs.items()},
        "midsurface_self": len(H.strict_pairs(mid, mid_faces)),
        "offset_orientation": H.offset_orientation(
            native, native_faces, mid, mid_faces
        ),
        "containment": dynamic_containment(native, body_points, body_faces),
        "shirt_layering": H.shirt_layering_violations(
            mid, BVHTree.FromPolygons(top_points, outer_faces, all_triangles=True)
        ),
        "native_bounds": bounds(native),
        "midsurface_bounds": bounds(mid),
    }
    result["native_counts"]["total"] = sum(result["native_counts"].values())
    if include_geometry:
        return result, pairs, native_faces, mid
    return result, pairs, native_faces, None


def dynamic_containment(native_points, body_points, body_faces):
    tree = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
    direction = H.Vector((1.0, 0.371, 0.173)).normalized()
    counts = {"inside": 0, "outside": 0, "ambiguous": 0, "no_hit": 0}
    for point in native_points:
        counts[H.oriented_inside(point, tree, direction)] += 1
    return {"ray_direction": list(direction), "native_vertex_states": counts}


def simple_native_counts(coat, body, top):
    native, native_faces = H.geometry(coat)
    body_points, body_faces = H.geometry(body)
    top_points, top_faces = H.geometry(top)
    counts = {
        "self": len(H.strict_pairs(native, native_faces)),
        "body": len(H.between(native, native_faces, body_points, body_faces)),
        "shirt": len(H.between(native, native_faces, top_points, top_faces)),
    }
    counts["total"] = sum(counts.values())
    return counts


def pair_base_ids(pairs, native_faces, base_count):
    rows = []
    for pair in pairs:
        ids = sorted(
            {
                int(vertex) % base_count
                for face_id in pair
                for vertex in native_faces[int(face_id)]
            }
        )
        rows.append(
            {"native_face_ids": [int(value) for value in pair], "base_vertex_ids": ids}
        )
    return rows


def audit_target(target, faces, report):
    if not report.get("accepted"):
        raise AssertionError("endpoint target report is not accepted")
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    coat = bpy.data.objects["Structured armhole jacket"]
    action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.data.pose_position = "POSE"
    rig.animation_data.action = action
    sample(scene, 1.0)
    if not np.array_equal(
        faces, np.asarray([tuple(face.vertices) for face in coat.data.polygons])
    ):
        raise AssertionError("endpoint target faces differ from gated jacket topology")
    candidate = H.make_candidate(
        "independent endpoint audit",
        [H.Vector(point) for point in target],
        [tuple(face) for face in faces],
        scene,
    )
    try:
        solidify = next(
            modifier for modifier in candidate.modifiers if modifier.type == "SOLIDIFY"
        )
        native, native_faces = H.geometry(candidate)
        body_points, body_faces = H.geometry(body)
        top_points, top_faces = H.geometry(top)
        mid, mid_faces = midpoint(candidate, solidify, len(target))
        native_counts = {
            "self": len(H.strict_pairs(native, native_faces)),
            "body": len(H.between(native, native_faces, body_points, body_faces)),
            "shirt": len(H.between(native, native_faces, top_points, top_faces)),
        }
        result = {
            "accepted_input_report": True,
            "native_counts": native_counts,
            "midsurface_self": len(H.strict_pairs(mid, mid_faces)),
            "offset_orientation": H.offset_orientation(
                native, native_faces, mid, mid_faces
            ),
            "containment": H.containment(
                native,
                BVHTree.FromPolygons(body_points, body_faces, all_triangles=True),
            ),
            "shirt_layering": H.shirt_layering_violations(
                mid,
                BVHTree.FromPolygons(
                    top_points,
                    H.verify_shirt_pairing(top_faces, len(top_points))[1],
                    all_triangles=True,
                ),
            ),
        }
        if (
            any(native_counts.values())
            or result["midsurface_self"]
            or result["offset_orientation"]["reversed_faces"]
            or result["containment"]["native_vertex_states"]["inside"]
            or result["shirt_layering"]["count"]
        ):
            raise AssertionError("independent endpoint geometry audit failed")
        return result
    finally:
        mesh = candidate.data
        bpy.data.objects.remove(candidate, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def feature(rig, side):
    values = []
    for part in ("upperarm", "lowerarm"):
        bone = rig.pose.bones[f"{part}_{side}"]
        for axis in range(3):
            path = f'pose.bones["{part}_{side}"].matrix[1][{axis}]'
            rna = float(rig.path_resolve(path))
            actual = float(bone.matrix[axis][1])
            if abs(rna - actual) > 1e-6:
                raise AssertionError(f"RNA path mismatch: {path}")
            values.append(actual)
    return values


def add_variable(driver, name, owner, path):
    variable = driver.variables.new()
    variable.name = name
    variable.type = "SINGLE_PROP"
    variable.targets[0].id = owner
    variable.targets[0].data_path = path


def add_property_driver(owner, prop, expression, variables):
    owner[prop] = 0.0
    curve = owner.driver_add(f'["{prop}"]')
    for name, target, path in variables:
        add_variable(curve.driver, name, target, path)
    curve.driver.expression = expression
    if curve.driver.expression != expression or not curve.driver.is_valid:
        raise AssertionError(f"invalid driver for {prop}")
    return curve


def axis_variables(rig, side):
    return [
        (f"{prefix}{axis_name}", rig, f'pose.bones["{part}_{side}"].matrix[1][{axis}]')
        for prefix, part in (("u", "upperarm"), ("l", "lowerarm"))
        for axis, axis_name in enumerate(("x", "y", "z"))
    ]


def horner(coefficients):
    value = f"{coefficients[-1]:.12g}"
    for coefficient in reversed(coefficients[:-1]):
        value = f"({value}*u+{coefficient:.12g})"
    return value


def install_drivers(coat, rig, controls, coefficients):
    paths = []
    for side, sign in SIDES:
        axes = axis_variables(rig, side)
        u_name = f"lower_u_{side}"
        u_expression = f"min(1,max(0,atan2(-uz,{sign:.1f}*ux)/atan2(1,.1)))"
        add_property_driver(controls, u_name, u_expression, axes)
        paths.append(u_name)
        predicted = []
        for index, values in enumerate(coefficients):
            name = f"lower_pred{index}_{side}"
            add_property_driver(
                controls, name, horner(values), [("u", controls, f'["{u_name}"]')]
            )
            paths.append(name)
            predicted.append(name)
        canonical_axes = (f"{sign:.1f}*ux", "uy", "uz", f"{sign:.1f}*lx", "ly", "lz")
        error_name = f"lower_error_{side}"
        terms = [
            f"({actual}-p{index})*({actual}-p{index})"
            for index, actual in enumerate(canonical_axes)
        ]
        add_property_driver(
            controls,
            error_name,
            "sqrt(" + "+".join(terms) + ")",
            [
                *axes,
                *[
                    (f"p{index}", controls, f'["{name}"]')
                    for index, name in enumerate(predicted)
                ],
            ],
        )
        paths.append(error_name)
        fade_name = f"lower_fade_{side}"
        add_property_driver(
            controls,
            fade_name,
            "min(1,max(0,(e-.002)/.008))",
            [("e", controls, f'["{error_name}"]')],
        )
        confidence_name = f"lower_confidence_{side}"
        add_property_driver(
            controls,
            confidence_name,
            "1-f*f*(3-2*f)",
            [("f", controls, f'["{fade_name}"]')],
        )
        paths.extend([fade_name, confidence_name])
        key = coat.data.shape_keys.key_blocks[f"lowered_endpoint_{side}"]
        curve = key.driver_add("value")
        for name, path in (
            ("u", f'["{u_name}"]'),
            ("lg", f'["{confidence_name}"]'),
            ("kg", f'["gate_confidence_{side}"]'),
        ):
            add_variable(curve.driver, name, controls, path)
        curve.driver.expression = "u*lg*(1-kg)"
        if curve.driver.expression != "u*lg*(1-kg)" or not curve.driver.is_valid:
            raise AssertionError("invalid endpoint key driver")
    update()
    return paths


def install_keys(coat, rig, target, t_coordinates):
    scene = bpy.context.scene
    original = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.data.pose_position = "POSE"
    rig.animation_data.action = original
    sample(scene, 1.0)
    if not np.allclose(
        np.asarray(rig.matrix_world), np.eye(4), atol=1e-8
    ) or not np.allclose(np.asarray(coat.matrix_world), np.eye(4), atol=1e-8):
        raise AssertionError(
            "endpoint inverse LBS requires identity rig and jacket transforms"
        )
    names = [bone.name for bone in rig.pose.bones]
    weights = np.zeros((len(target), len(names)))
    for vertex in coat.data.vertices:
        for group in vertex.groups:
            name = coat.vertex_groups[group.group].name
            if name in names:
                weights[vertex.index, names.index(name)] = group.weight
    if np.max(np.abs(weights.sum(axis=1) - 1.0)) > 1e-6:
        raise AssertionError("jacket bone weights are not normalized")
    skin = np.asarray(
        [
            rig.pose.bones[name].matrix @ rig.data.bones[name].matrix_local.inverted()
            for name in names
        ]
    )
    transforms = np.einsum("vb,bij->vij", weights, skin)
    rest = np.asarray(
        [point.co[:] for point in coat.data.shape_keys.key_blocks[0].data]
    )
    local = np.einsum(
        "vij,vj->vi",
        np.linalg.inv(transforms),
        np.column_stack([target, np.ones(len(target))]),
    )[:, :3]
    delta = local - rest
    delta[np.abs(t_coordinates[:, 0]) >= 0.729] = 0.0
    left = np.clip(0.5 + t_coordinates[:, 0] / 0.08, 0.0, 1.0)
    for side, mask in (("l", left), ("r", 1.0 - left)):
        key = coat.shape_key_add(name=f"lowered_endpoint_{side}")
        key.data.foreach_set(
            "co", (rest + delta * mask[:, None]).astype(np.float32).ravel()
        )
    return {
        "maximum_inverse_lbs_delta_m": float(np.linalg.norm(delta, axis=1).max()),
        "cuff_zero_delta_vertices": int((np.abs(t_coordinates[:, 0]) >= 0.729).sum()),
    }


def numeric_curve_residual(rig, side, coefficients):
    sign = 1.0 if side == "l" else -1.0
    actual = np.asarray(feature(rig, side), dtype=np.float64)
    canonical = actual.copy()
    canonical[[0, 3]] *= sign
    u = min(
        1.0, max(0.0, math.atan2(-actual[2], sign * actual[0]) / math.atan2(1.0, 0.1))
    )
    predicted = np.asarray(
        [np.polynomial.polynomial.polyval(u, values) for values in coefficients]
    )
    return {
        "u": u,
        "residual": float(np.linalg.norm(canonical - predicted)),
        "actual": canonical.tolist(),
        "predicted": predicted.tolist(),
    }


def review_baseline(scene, rig, coat, old_names):
    rows = {}
    for action_name in REVIEW_ACTIONS:
        rig.animation_data.action = bpy.data.actions[action_name]
        action_rows = []
        for frame in np.linspace(1.0, 49.0, 97):
            sample(scene, float(frame))
            action_rows.append(
                {
                    name: float(coat.data.shape_keys.key_blocks[name].value)
                    for name in old_names
                }
            )
        rows[action_name] = action_rows
    return rows


def audit_review(
    scene, rig, coat, body, top, solidify, base_count, baseline, old_names
):
    maximum_old_delta = 0.0
    maximum_new_key = 0.0
    contact_frames = []
    for action_name in REVIEW_ACTIONS:
        rig.animation_data.action = bpy.data.actions[action_name]
        for index, frame in enumerate(np.linspace(1.0, 49.0, 97)):
            sample(scene, float(frame))
            maximum_old_delta = max(
                maximum_old_delta,
                *(
                    abs(
                        float(coat.data.shape_keys.key_blocks[name].value)
                        - baseline[action_name][index][name]
                    )
                    for name in old_names
                ),
            )
            maximum_new_key = max(
                maximum_new_key,
                *(
                    abs(
                        float(
                            coat.data.shape_keys.key_blocks[
                                f"lowered_endpoint_{side}"
                            ].value
                        )
                    )
                    for side, _ in SIDES
                ),
            )
            counts = simple_native_counts(coat, body, top)
            if counts["total"]:
                contact_frames.append(
                    {"action": action_name, "frame": float(frame), "counts": counts}
                )
    if maximum_old_delta > EPSILON or maximum_new_key > EPSILON or contact_frames:
        raise AssertionError("review key parity or contact audit failed")
    return {
        "samples": 291,
        "maximum_existing_key_delta": maximum_old_delta,
        "maximum_new_key_value": maximum_new_key,
        "contact_frames": 0,
    }


def audit_lowering(
    scene, rig, coat, body, top, solidify, base_count, controls, coefficients
):
    action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.animation_data.action = action
    rows = []
    recurrence = Counter()
    first_failure = None
    max_failure = None
    maximum_counts = {"self": 0, "body": 0, "shirt": 0, "total": 0}
    maximum_mid_self = maximum_inside = maximum_ambiguous = maximum_reversed = 0
    maximum_layering = 0
    minimum_area = float("inf")
    maximum_key_weight_error = 0.0
    failed_samples = 0
    for frame in np.linspace(31.0, 1.0, 61):
        sample(scene, float(frame))
        residuals = {
            side: numeric_curve_residual(rig, side, coefficients) for side, _ in SIDES
        }
        if any(row["residual"] >= 1e-4 for row in residuals.values()):
            raise AssertionError(f"curve residual exceeded 0.0001 at frame {frame}")
        record, pairs, native_faces, _ = native_record(
            coat, body, top, solidify, base_count
        )
        for kind, value in record["native_counts"].items():
            maximum_counts[kind] = max(maximum_counts[kind], value)
        maximum_mid_self = max(maximum_mid_self, record["midsurface_self"])
        states = record["containment"]["native_vertex_states"]
        maximum_inside = max(maximum_inside, states["inside"])
        maximum_ambiguous = max(maximum_ambiguous, states["ambiguous"])
        maximum_reversed = max(
            maximum_reversed, record["offset_orientation"]["reversed_faces"]
        )
        maximum_layering = max(maximum_layering, record["shirt_layering"]["count"])
        minimum_area = min(
            minimum_area,
            record["offset_orientation"]["minimum_midsurface_triangle_area_m2"],
        )
        contact = pair_base_ids(pairs["self"], native_faces, base_count)
        for row in contact:
            recurrence[
                (tuple(row["native_face_ids"]), tuple(row["base_vertex_ids"]))
            ] += 1
        key_weights = {}
        for side, _ in SIDES:
            expected = residuals[side]["u"] * (
                1.0 - float(controls[f"gate_confidence_{side}"])
            )
            actual = float(
                coat.data.shape_keys.key_blocks[f"lowered_endpoint_{side}"].value
            )
            maximum_key_weight_error = max(
                maximum_key_weight_error, abs(actual - expected)
            )
            key_weights[side] = {"actual": actual, "expected": expected}
        if maximum_key_weight_error > EPSILON:
            raise AssertionError(f"endpoint driver mismatch at frame {frame}")
        failed = bool(
            record["native_counts"]["total"]
            or record["midsurface_self"]
            or states["inside"]
            or states["ambiguous"]
            or record["offset_orientation"]["reversed_faces"]
            or record["shirt_layering"]["count"]
            or record["offset_orientation"]["minimum_midsurface_triangle_area_m2"]
            <= 1e-12
        )
        row = {
            "frame": float(frame),
            "curve": residuals,
            "key_weights": key_weights,
            "record": record,
            "self_contacts": contact,
        }
        if failed and first_failure is None:
            first_failure = row
        if failed:
            failed_samples += 1
        if failed and (
            max_failure is None
            or record["native_counts"]["total"]
            > max_failure["record"]["native_counts"]["total"]
        ):
            max_failure = row
        rows.append(row)
    return {
        "samples": len(rows),
        "clear_samples": len(rows) - failed_samples,
        "failed_samples": failed_samples,
        "first_failure": first_failure,
        "max_failure": max_failure,
        "recurring_self_native_faces_and_base_ids": [
            {
                "native_face_ids": list(faces),
                "base_vertex_ids": list(ids),
                "samples": count,
            }
            for (faces, ids), count in recurrence.most_common()
        ],
        "t_bounds": rows[0]["record"],
        "full_down_bounds": rows[-1]["record"],
        "maximum_native_counts": maximum_counts,
        "maximum_midsurface_self": maximum_mid_self,
        "maximum_containment_inside": maximum_inside,
        "maximum_containment_ambiguous": maximum_ambiguous,
        "maximum_reversed_offset_faces": maximum_reversed,
        "maximum_near_normal_shirt_layering": maximum_layering,
        "minimum_midsurface_triangle_area_m2": minimum_area,
        "maximum_key_weight_error": maximum_key_weight_error,
        "accepted": failed_samples == 0,
    }


def arm_basis(rig):
    return {
        side: {
            part: rig.pose.bones[f"{part}_{side}"].matrix_basis.copy()
            for part in ("upperarm", "lowerarm", "hand")
        }
        for side, _ in SIDES
    }


def audit_asymmetric(scene, rig, coat, body, top, solidify, base_count):
    action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.animation_data.action = action
    sample(scene, 31.0)
    t_basis = arm_basis(rig)
    sample(scene, 1.0)
    down_basis = arm_basis(rig)
    rows = []
    for active, _ in SIDES:
        rig.animation_data.action = action
        sample(scene, 31.0)
        rig.animation_data.action = None
        for side, _ in SIDES:
            source = down_basis if side == active else t_basis
            for part, matrix in source[side].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        update()
        expected = {side: 1.0 if side == active else 0.0 for side, _ in SIDES}
        actual = {
            side: float(
                coat.data.shape_keys.key_blocks[f"lowered_endpoint_{side}"].value
            )
            for side, _ in SIDES
        }
        if max(abs(actual[side] - expected[side]) for side, _ in SIDES) > EPSILON:
            raise AssertionError(f"asymmetric endpoint key mismatch for {active}")
        record, _, _, _ = native_record(coat, body, top, solidify, base_count)
        rows.append(
            {
                "full_down_side": active,
                "key_values": actual,
                "native_record": record,
            }
        )
    rig.animation_data.action = action
    sample(scene, 1.0)
    return {
        "samples": len(rows),
        "rows": rows,
        "all_native_clear": all(
            not row["native_record"]["native_counts"]["total"]
            and not row["native_record"]["midsurface_self"]
            and not row["native_record"]["shirt_layering"]["count"]
            and not row["native_record"]["containment"]["native_vertex_states"][
                "inside"
            ]
            and not row["native_record"]["containment"]["native_vertex_states"][
                "ambiguous"
            ]
            and not row["native_record"]["offset_orientation"]["reversed_faces"]
            and row["native_record"]["offset_orientation"][
                "minimum_midsurface_triangle_area_m2"
            ]
            > 1e-12
            for row in rows
        ),
    }


def run(args):
    for path in (
        args.input,
        args.m_target,
        args.m_report,
        args.correspondence,
        args.curve_fit,
    ):
        if not Path(path).exists():
            raise FileNotFoundError(path)
    if args.output_blend.exists():
        raise FileExistsError(args.output_blend)
    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    source_hash = sha256(args.input)
    with np.load(args.m_target) as data:
        target = np.asarray(data["points"], dtype=np.float64)
        faces = np.asarray(data["faces"], dtype=np.int64)
    with np.load(args.correspondence) as data:
        t_coordinates = np.asarray(data["body_patch_t"], dtype=np.float64)
    m_report = json.loads(args.m_report.read_text())
    recorded_target_hash = m_report.get("target_sha256")
    if recorded_target_hash and sha256(args.m_target) != recorded_target_hash:
        raise AssertionError("endpoint target SHA-256 differs from its audit")
    curve_fit = json.loads(args.curve_fit.read_text())
    coefficients = curve_fit["coefficients_ascending"]
    if (
        target.shape != (2636, 3)
        or faces.shape != (5062, 3)
        or t_coordinates.shape != target.shape
        or len(coefficients) != 6
    ):
        raise AssertionError("endpoint input shapes or curve coefficients are invalid")
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    controls = bpy.data.objects["Jacket pose weights"]
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    if (
        len(coat.data.shape_keys.key_blocks) != 13
        or len(list(coat.data.shape_keys.animation_data.drivers)) != 12
    ):
        raise AssertionError(
            "expected Basis plus twelve existing driven corrective keys"
        )
    preserved = {
        "body": H.data_snapshot(body),
        "top": H.data_snapshot(top),
        "rest_skeleton": gate.bones_snapshot(rig),
        "original_12_key_data": key_prefix_hash(coat),
        "modifiers": gate.modifier_snapshot(coat),
        "actions": gate.action_snapshot(),
    }
    handlers_before = handler_counts()
    old_names = [key.name for key in coat.data.shape_keys.key_blocks[1:13]]
    baseline = review_baseline(scene, rig, coat, old_names)
    original_action = bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
    rig.animation_data.action = original_action
    sample(scene, 31.0)
    t_before, _ = midpoint(coat, solidify, len(target))
    endpoint_audit = audit_target(target, faces, m_report)
    install_report = install_keys(coat, rig, target, t_coordinates)
    driver_properties = install_drivers(coat, rig, controls, coefficients)
    if "loweredEndpointStudyStatus" in scene:
        del scene["loweredEndpointStudyStatus"]
    scene["riggedJacketStudyReport"] = args.audit.name
    note = bpy.data.texts.get("RIGGED_JACKET_SCOPE")
    if note is not None:
        note.clear()
        note.write(
            "Fourteen-key lowered-jacket study. The original lowering action is tested from frames 1 through 31, and the three existing review curves remain tested. See the adjacent audit for measured scope. General motion, reference appearance, and runtime export remain pending.\n"
        )
    rig.animation_data.action = original_action
    sample(scene, 31.0)
    t_after, _ = midpoint(coat, solidify, len(target))
    t_parity = float(np.max(np.abs(array(t_after) - array(t_before))))
    if t_parity > 3e-6:
        raise AssertionError(f"T endpoint parity failed: {t_parity}")
    sample(scene, 1.0)
    full_down_mid, _ = midpoint(coat, solidify, len(target))
    endpoint_parity = float(np.max(np.abs(array(full_down_mid) - target)))
    if endpoint_parity > 3e-6:
        raise AssertionError(f"full-down endpoint parity failed: {endpoint_parity}")
    scene.frame_start = 1
    scene.frame_end = 31
    rig.animation_data.action = original_action
    sample(scene, 1.0)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend), compress=True)
    output_hash = sha256(args.output_blend)
    bpy.ops.wm.open_mainfile(filepath=str(args.output_blend))
    scene = bpy.context.scene
    rig = bpy.data.objects["AvatarSkeleton"]
    coat = bpy.data.objects["Structured armhole jacket"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    controls = bpy.data.objects["Jacket pose weights"]
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    if (
        H.data_snapshot(body) != preserved["body"]
        or H.data_snapshot(top) != preserved["top"]
        or gate.bones_snapshot(rig) != preserved["rest_skeleton"]
        or key_prefix_hash(coat) != preserved["original_12_key_data"]
        or gate.modifier_snapshot(coat) != preserved["modifiers"]
        or gate.action_snapshot() != preserved["actions"]
    ):
        raise AssertionError("saved endpoint study changed preserved source data")
    if (
        rig.animation_data.action
        != bpy.data.actions[scene["riggedJacketOriginalLoweringAction"]]
        or scene.frame_start != 1
        or scene.frame_end != 31
        or scene.frame_current != 1
    ):
        raise AssertionError("saved endpoint presentation state changed")
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    sample(scene, 31.0)
    t_reopen, _ = midpoint(coat, solidify, len(target))
    sample(scene, 1.0)
    down_reopen, _ = midpoint(coat, solidify, len(target))
    reopened_parity = {
        "T_max_error_m": float(np.max(np.abs(array(t_reopen) - array(t_before)))),
        "full_down_max_error_m": float(np.max(np.abs(array(down_reopen) - target))),
    }
    if max(reopened_parity.values()) > 3e-6:
        raise AssertionError("reopened endpoint parity failed")
    drivers = driver_audit(coat, controls)
    handlers_after = handler_counts()
    if handlers_after != handlers_before:
        raise AssertionError("endpoint study added a runtime handler")
    review = audit_review(
        scene, rig, coat, body, top, solidify, len(target), baseline, old_names
    )
    lowering = audit_lowering(
        scene, rig, coat, body, top, solidify, len(target), controls, coefficients
    )
    asymmetric = audit_asymmetric(scene, rig, coat, body, top, solidify, len(target))
    source_hash_after = sha256(args.input)
    if source_hash_after != source_hash:
        raise AssertionError("gated source hash changed")
    report = {
        "scope": __doc__,
        "study_status": "tested lowering and review scope; general motion, appearance, and export remain pending",
        "input": str(args.input),
        "output_blend": str(args.output_blend),
        "source_sha256_before": source_hash,
        "source_sha256_after": source_hash_after,
        "output_sha256": output_hash,
        "endpoint_audit": endpoint_audit,
        "install": install_report,
        "driver_properties": driver_properties,
        "driver_audit": drivers,
        "runtime_handlers": {
            "before": handlers_before,
            "after": handlers_after,
            "added": False,
        },
        "initial_parity": {
            "T_max_error_m": t_parity,
            "full_down_max_error_m": endpoint_parity,
        },
        "reopened_parity": reopened_parity,
        "default_presentation": {
            "action": scene["riggedJacketOriginalLoweringAction"],
            "frame_start": 1,
            "frame_end": 31,
            "frame_current": 1,
        },
        "preservation_hashes": preserved,
        "review_291": review,
        "lowering_61": lowering,
        "asymmetric_2": asymmetric,
        "accepted_tested_scope": bool(
            lowering["accepted"]
            and review["contact_frames"] == 0
            and asymmetric["all_native_clear"]
        ),
    }
    args.audit.parent.mkdir(parents=True, exist_ok=True)
    args.audit.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "LOWERED_ENDPOINT_RESULT",
        json.dumps(
            {
                "output": str(args.output_blend),
                "audit": str(args.audit),
                "lower_failed_samples": lowering["failed_samples"],
                "accepted_tested_scope": lowering["accepted"]
                and asymmetric["all_native_clear"],
            },
            sort_keys=True,
        ),
        flush=True,
    )


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--m-target", type=Path, default=M_TARGET)
    parser.add_argument("--m-report", type=Path, default=M_REPORT)
    parser.add_argument("--correspondence", type=Path, default=CORRESPONDENCE)
    parser.add_argument("--curve-fit", type=Path, default=CURVE_FIT)
    parser.add_argument("--output-blend", type=Path, default=OUTPUT_BLEND)
    parser.add_argument("--audit", type=Path, default=OUTPUT_AUDIT)
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )


if __name__ == "__main__":
    run(parse_args())
