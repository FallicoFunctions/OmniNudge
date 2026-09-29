"""Install and audit a driver-only confidence gate for the jacket correctives."""

import argparse
import hashlib
import json
import math
import sys
from importlib import import_module
from pathlib import Path

import bpy
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

armhole = import_module("armhole_pose_correctives")
build_bodies = import_module("build_bodies")
crossings = import_module("surface_crossings")
validate_tops = import_module("validate_body05_tops")
validate_contacts = import_module("validate_body_contacts")
saved_actions = import_module("save_rigged_jacket_review_actions")

POSES = armhole.POSES
feature = armhole.feature
point_bone = build_bodies.point_bone
strict_pairs = crossings.strict_pairs
between = validate_tops.between
body_snapshot = validate_tops.body_snapshot
geometry = validate_tops.geometry
bones_snapshot = validate_contacts.bones_snapshot
key_hash = saved_actions.key_hash

INPUT = (
    Path(__file__).resolve().parents[2]
    / "assets-src"
    / "avatars"
    / "launch-body-proof"
    / "rigged-jacket-study"
    / "male-rigged-jacket-study.blend"
)
OUTPUT_DIR = Path("/tmp/omnirave-luna-lowering-study/gated")
OUTPUT_BLEND = OUTPUT_DIR / "male-rigged-jacket-gated.blend"
OUTPUT_AUDIT = OUTPUT_DIR / "male-rigged-jacket-gated-audit.json"
MUTED_PROBE = Path("/tmp/omnirave-luna-lowering-study/luna-lowering-study.json")
MUTED_ARRAY = Path(
    "/tmp/omnirave-luna-lowering-study/drivers-muted-zero-midsurface.npz"
)
REVIEW_ACTIONS = (
    "Jacket review - elbow bend",
    "Jacket review - forward reach",
    "Jacket review - overhead reach",
)
SIDES = ("l", "r")
PARTS = ("upperarm", "lowerarm", "hand")
FEATURES = ("elbow_bend", "forward_reach", "overhead_reach")
AXES = ("ux", "uy", "uz", "lx", "ly", "lz")
ZERO_EPSILON = 1.0e-6


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def update():
    bpy.context.view_layer.update()


def sample_frame(scene, frame):
    integer = int(frame)
    scene.frame_set(integer, subframe=frame - integer)
    update()


def key_values(coat):
    return {key.name: float(key.value) for key in coat.data.shape_keys.key_blocks[1:]}


def simple_value(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if hasattr(value, "name") and hasattr(value, "bl_rna"):
        return {"rna_type": value.bl_rna.identifier, "name": value.name}
    if isinstance(value, (list, tuple, set)):
        converted = [simple_value(item) for item in value]
        return converted if all(item is not None for item in converted) else None
    return None


def modifier_snapshot(obj):
    snapshot = []
    for modifier in obj.modifiers:
        properties = {}
        for prop in modifier.bl_rna.properties:
            if prop.identifier == "rna_type":
                continue
            try:
                converted = simple_value(getattr(modifier, prop.identifier))
            except (AttributeError, TypeError, ValueError):
                continue
            if converted is not None:
                properties[prop.identifier] = converted
        snapshot.append(
            {"name": modifier.name, "type": modifier.type, "properties": properties}
        )
    return snapshot


def action_snapshot():
    snapshot = {}
    for action in sorted(bpy.data.actions, key=lambda item: item.name):
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for curve in channelbag.fcurves:
                        curves.append(
                            {
                                "data_path": curve.data_path,
                                "array_index": curve.array_index,
                                "keys": [
                                    [
                                        float(key.co.x),
                                        float(key.co.y),
                                        key.interpolation,
                                        key.handle_left_type,
                                        key.handle_right_type,
                                        float(key.handle_left.x),
                                        float(key.handle_left.y),
                                        float(key.handle_right.x),
                                        float(key.handle_right.y),
                                    ]
                                    for key in curve.keyframe_points
                                ],
                            }
                        )
        payload = {"frame_range": list(action.frame_range), "curves": curves}
        snapshot[action.name] = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
    return snapshot


def vector_tuple(value):
    return tuple(float(value[index]) for index in range(3))


def axis_variables(rig, side):
    variables = []
    for prefix, part in (("u", "upperarm"), ("l", "lowerarm")):
        for axis, axis_name in enumerate(("x", "y", "z")):
            variables.append(
                (
                    f"{prefix}{axis_name}",
                    rig,
                    f'pose.bones["{part}_{side}"].matrix[1][{axis}]',
                )
            )
    return variables


def add_variable(driver, name, owner, data_path):
    variable = driver.variables.new()
    variable.name = name
    variable.type = "SINGLE_PROP"
    variable.targets[0].id = owner
    variable.targets[0].data_path = data_path


def validate_driver_expression(expression, variables):
    names = {name for name, _, _ in variables}
    environment = {name: 0.25 for name in names}
    environment.update({"max": max, "min": min, "sqrt": math.sqrt})
    try:
        value = eval(
            compile(expression, "<native-driver>", "eval"),
            {"__builtins__": {}},
            environment,
        )
    except (ArithmeticError, SyntaxError, ValueError) as error:
        raise AssertionError(
            f"Invalid native driver expression {expression!r}"
        ) from error
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise AssertionError(f"Non-finite native driver expression {expression!r}")


def add_property_driver(owner, prop, expression, variables):
    validate_driver_expression(expression, variables)
    owner[prop] = 0.0
    fcurve = owner.driver_add(f'["{prop}"]')
    driver = fcurve.driver
    for name, target, path in variables:
        add_variable(driver, name, target, path)
    driver.expression = expression
    if driver.expression != expression:
        raise AssertionError(f"Native driver expression changed: {expression!r}")
    return fcurve


def prop_path(prop):
    return f'["{prop}"]'


def gate_prop(kind, family, side):
    return f"gate_{kind}_{side}" if family is None else f"gate_{kind}_{family}_{side}"


def predicted_components(sign, f, target):
    tx, ty, tz = target
    x_delta = tx - 1.0

    def scaled(value):
        if abs(value) < 1.0e-12:
            return "0"
        if abs(value - 1.0) < 1.0e-12:
            return f
        if abs(value + 1.0) < 1.0e-12:
            return f"-{f}"
        return f"{value:.8g}*{f}"

    x_base = f"1{x_delta:+.8g}*{f}" if abs(x_delta) > 1.0e-12 else "1"
    x_component = f"({x_base})" if sign > 0 else f"-({x_base})"
    return (
        x_component,
        scaled(ty),
        scaled(tz),
    )


def install_gate(coat, rig, controls):
    keys = coat.data.shape_keys
    drivers = list(keys.animation_data.drivers) if keys.animation_data else []
    if len(drivers) != 12 or len(keys.key_blocks) != 13:
        raise AssertionError("Expected 12 existing corrective drivers and 13 keys")
    for side in SIDES:
        observed = feature(rig, side)
        for index, value in enumerate(observed):
            part = "upperarm" if index < 3 else "lowerarm"
            axis = index % 3
            path = f'pose.bones["{part}_{side}"].matrix[1][{axis}]'
            resolved = float(rig.path_resolve(path))
            if abs(resolved - value) > 1.0e-6:
                raise AssertionError(f"RNA feature mismatch for {side} {path}")

    gate_paths = []
    for side, sign in (("l", 1.0), ("r", -1.0)):
        variables = axis_variables(rig, side)
        for family in FEATURES:
            if family == "elbow_bend":
                amount = "max(0,-uz)"
                denominator = f"max(1e-8,.8660254*{sign:.1f}*ux+0.5*({amount}))"
            elif family == "forward_reach":
                amount = "max(0,-uy)"
                denominator = f"max(1e-8,{sign:.1f}*ux+0.75*({amount}))"
            else:
                amount = "max(0,uz)"
                denominator = f"max(1e-8,{sign:.1f}*ux+0.65*({amount}))"
            fraction = gate_prop("f", family, side)
            fraction_expression = f"min(1,max(0,({amount})/{denominator}))"
            add_property_driver(controls, fraction, fraction_expression, variables)

            fvar = ("f", controls, prop_path(fraction))
            upper_inv = gate_prop("iu", family, side)
            lower_inv = gate_prop("il", family, side)
            upper, lower = POSES[family]
            upper_components = predicted_components(sign, "f", upper)
            lower_components = predicted_components(sign, "f", lower)
            upper_norm = "+".join(
                f"({component})*({component})" for component in upper_components
            )
            lower_norm = "+".join(
                f"({component})*({component})" for component in lower_components
            )
            add_property_driver(
                controls,
                upper_inv,
                f"1/max(1e-8,sqrt({upper_norm}))",
                [fvar],
            )
            add_property_driver(
                controls,
                lower_inv,
                f"1/max(1e-8,sqrt({lower_norm}))",
                [fvar],
            )
            distance = gate_prop("d", family, side)
            distance_variables = [
                fvar,
                ("iu", controls, prop_path(upper_inv)),
                ("il", controls, prop_path(lower_inv)),
                *variables,
            ]
            observed = ("ux", "uy", "uz")
            predicted = [
                (component, "iu", observed_axis)
                for component, observed_axis in zip(upper_components, observed)
            ] + [
                (component, "il", observed_axis)
                for component, observed_axis in zip(lower_components, AXES[3:])
            ]
            terms = []
            for component, inverse, observed_axis in predicted:
                if component == "0":
                    terms.append(f"{observed_axis}*{observed_axis}")
                else:
                    delta = f"{component}*{inverse}-{observed_axis}"
                    terms.append(f"({delta})*({delta})")
            add_property_driver(controls, distance, "+".join(terms), distance_variables)
            gate_paths.extend([fraction, upper_inv, lower_inv, distance])

        distances = [gate_prop("d", family, side) for family in FEATURES]
        confidence = gate_prop("confidence", None, side)
        confidence_variables = [
            (f"d{index}", controls, prop_path(distance))
            for index, distance in enumerate(distances)
        ]
        t = "min(1,max(0,(sqrt(max(0,min(d0,min(d1,d2))))-.01)/.03))"
        add_property_driver(
            controls,
            confidence,
            f"1-({t})*({t})*(3-2*({t}))",
            confidence_variables,
        )
        gate_paths.append(confidence)

    for curve in drivers:
        key_name = curve.data_path.split('key_blocks["', 1)[1].split('"]', 1)[0]
        if not key_name.endswith(("_l", "_r")):
            raise AssertionError(f"Unexpected key driver path {curve.data_path}")
        side = key_name[-1]
        confidence = gate_prop("confidence", None, side)
        add_variable(curve.driver, "g", controls, prop_path(confidence))
        expression = f"({curve.driver.expression})*g"
        curve.driver.expression = expression
        if curve.driver.expression != expression:
            raise AssertionError(f"Key driver expression changed: {expression!r}")
    update()
    return gate_paths


def all_driver_audit(coat, controls, gate_paths):
    control_curves = (
        list(controls.animation_data.drivers) if controls.animation_data else []
    )
    key_curves = (
        list(coat.data.shape_keys.animation_data.drivers)
        if coat.data.shape_keys.animation_data
        else []
    )
    curves = control_curves + key_curves
    gate_paths = {prop_path(prop) for prop in gate_paths}
    gate_curves = [curve for curve in control_curves if curve.data_path in gate_paths]
    portable_curves = gate_curves + key_curves
    if not curves or any(not curve.driver.is_valid for curve in curves):
        raise AssertionError("One or more native drivers is invalid")
    if any(not curve.driver.is_simple_expression for curve in portable_curves):
        raise AssertionError("One or more gate/key drivers is not simple")
    expressions = [curve.driver.expression for curve in portable_curves]
    if any(
        "frame" in expression.lower() or "action" in expression.lower()
        for expression in expressions
    ):
        raise AssertionError("A gate expression contains frame/action conditions")
    return {
        "driver_count": len(curves),
        "portable_gate_key_driver_count": len(portable_curves),
        "all_valid": True,
        "maximum_expression_length": max(map(len, expressions)),
        "handlers_added": False,
    }


def midsurface(coat, solidify, base_count):
    previous = solidify.show_viewport
    solidify.show_viewport = False
    try:
        update()
        points, _ = geometry(coat)
        if len(points) != base_count:
            raise AssertionError("Midsurface vertex count changed")
        return np.asarray([vector_tuple(point) for point in points], dtype=np.float64)
    finally:
        solidify.show_viewport = previous
        update()


def native_counts(coat, body, top, base_count):
    coat_points, coat_triangles = geometry(coat)
    if len(coat_points) != 2 * base_count:
        raise AssertionError("Solidify evaluated vertex count changed")
    body_points, body_triangles = geometry(body)
    top_points, top_triangles = geometry(top)
    counts = {
        "self": len(strict_pairs(coat_points, coat_triangles)),
        "body": len(between(coat_points, coat_triangles, body_points, body_triangles)),
        "top": len(between(coat_points, coat_triangles, top_points, top_triangles)),
    }
    counts["native_total"] = sum(counts.values())
    return counts


def confidence_snapshot(controls, side):
    values = {}
    for family in FEATURES:
        values[family] = {
            kind: float(controls[gate_prop(kind, family, side)])
            for kind in ("f", "iu", "il", "d")
        }
    values["confidence"] = float(controls[gate_prop("confidence", None, side)])
    return values


def review_baseline(rig, coat, default_action_name):
    rows = {}
    endpoint = None
    for action_name in REVIEW_ACTIONS:
        action = bpy.data.actions.get(action_name)
        if action is None:
            raise AssertionError(f"Missing review action {action_name}")
        rig.animation_data.action = action
        action_rows = []
        for index in range(97):
            frame = 1.0 + 0.5 * index
            sample_frame(bpy.context.scene, frame)
            values = key_values(coat)
            action_rows.append(values)
            if action_name == REVIEW_ACTIONS[0] and abs(frame - 49.0) < 1.0e-8:
                endpoint = values
        rows[action_name] = action_rows
    if endpoint is None:
        raise AssertionError("Missing elbow endpoint baseline")
    rig.animation_data.action = bpy.data.actions[default_action_name]
    sample_frame(bpy.context.scene, 31.0)
    return rows, endpoint


def audit_review(rig, coat, body, top, controls, base_count, baseline):
    max_key_delta = 0.0
    min_confidence = 1.0
    max_confidence_delta = 0.0
    contact_frames = 0
    for action_name in REVIEW_ACTIONS:
        rig.animation_data.action = bpy.data.actions[action_name]
        for index in range(97):
            frame = 1.0 + 0.5 * index
            sample_frame(bpy.context.scene, frame)
            values = key_values(coat)
            max_key_delta = max(
                max_key_delta,
                max(
                    abs(values[name] - baseline[action_name][index][name])
                    for name in values
                ),
            )
            confidence = [
                float(controls[gate_prop("confidence", None, side)]) for side in SIDES
            ]
            min_confidence = min(min_confidence, *confidence)
            max_confidence_delta = max(
                max_confidence_delta, *(abs(value - 1.0) for value in confidence)
            )
            counts = native_counts(coat, body, top, base_count)
            if counts["native_total"]:
                contact_frames += 1
                raise AssertionError(f"Review contact at {action_name} frame {frame}")
    if max_key_delta > ZERO_EPSILON or max_confidence_delta > ZERO_EPSILON:
        raise AssertionError("Review keys or confidence changed beyond tolerance")
    return {
        "samples": 291,
        "confidence_min": min_confidence,
        "maximum_confidence_delta": max_confidence_delta,
        "maximum_key_delta": max_key_delta,
        "native_actualSolidify_self_body_top_allclear": contact_frames == 0,
        "contact_frames": contact_frames,
    }


def audit_lowering(rig, coat, body, top, controls, solidify, base_count, input_hash):
    if not MUTED_PROBE.exists() or not MUTED_ARRAY.exists():
        raise FileNotFoundError("Muted lowering probe outputs are required")
    muted_report = json.loads(MUTED_PROBE.read_text())
    if (
        muted_report.get("input_sha256_before") != input_hash
        or muted_report.get("input_sha256_after") != input_hash
    ):
        raise AssertionError("Muted probe source hash does not match gated input")
    array_metadata = muted_report["modes"]["drivers_muted_zero"]["midsurface_arrays"]
    if Path(array_metadata["path"]).resolve() != MUTED_ARRAY.resolve():
        raise AssertionError("Muted probe NPZ path does not match expected artifact")
    muted_array_hash = sha256(MUTED_ARRAY)
    recorded_array_hash = array_metadata.get("sha256")
    if recorded_array_hash is not None and recorded_array_hash != muted_array_hash:
        raise AssertionError("Muted probe NPZ hash does not match artifact")
    muted_rows = muted_report["modes"]["drivers_muted_zero"]["frames"]
    muted_arrays = np.load(MUTED_ARRAY)
    expected_positions = np.asarray(
        muted_arrays["midsurface_positions"], dtype=np.float64
    )
    expected_frames = np.asarray(muted_arrays["frames"], dtype=np.float64)
    if expected_positions.shape != (61, base_count, 3):
        raise AssertionError("Muted probe midsurface shape mismatch")
    rows = []
    max_delta = 0.0
    counts_exact = True
    confidence_max = 0.0
    rig.animation_data.action = bpy.data.actions[
        bpy.context.scene["riggedJacketOriginalLoweringAction"]
    ]
    for sample in range(61):
        frame = 31.0 - 0.5 * sample
        if abs(expected_frames[sample] - frame) > 1.0e-9:
            raise AssertionError("Muted probe frame schedule mismatch")
        sample_frame(bpy.context.scene, frame)
        counts = native_counts(coat, body, top, base_count)
        expected_counts = muted_rows[sample]["contact_counts"]
        if counts != expected_counts:
            counts_exact = False
            raise AssertionError(f"Gated lowering count mismatch at frame {frame}")
        position_delta = float(
            np.max(
                np.abs(
                    midsurface(coat, solidify, base_count) - expected_positions[sample]
                )
            )
        )
        max_delta = max(max_delta, position_delta)
        confidence = [
            float(controls[gate_prop("confidence", None, side)]) for side in SIDES
        ]
        confidence_max = max(confidence_max, *confidence)
        if frame <= 30.5 and any(value > ZERO_EPSILON for value in confidence):
            raise AssertionError(f"Lowering gate was nonzero at frame {frame}")
        rows.append(
            {
                "sample": sample,
                "frame": frame,
                "counts": counts,
                "confidence": confidence,
            }
        )
    if max_delta > ZERO_EPSILON:
        raise AssertionError(f"Lowering midsurface delta {max_delta} exceeds tolerance")
    return {
        "samples": len(rows),
        "maximum_midsurface_position_delta": max_delta,
        "native_counts_exact_muted_probe": counts_exact,
        "maximum_lowering_confidence": confidence_max,
        "muted_probe_npz_sha256": muted_array_hash,
        "muted_probe_npz_hash_recorded_in_probe_json": recorded_array_hash is not None,
        "frame31_counts": rows[0]["counts"],
        "frame1_counts": rows[-1]["counts"],
    }


def audit_transition(rig, coat, body, top, controls, base_count):
    values = {side: [] for side in SIDES}
    rows = []
    rig.animation_data.action = bpy.data.actions[
        bpy.context.scene["riggedJacketOriginalLoweringAction"]
    ]
    for index in range(21):
        frame = 31.0 - 0.5 * index / 20.0
        sample_frame(bpy.context.scene, frame)
        snapshot = {side: confidence_snapshot(controls, side) for side in SIDES}
        if any(
            not math.isfinite(value)
            for side in SIDES
            for family in FEATURES
            for value in snapshot[side][family].values()
        ):
            raise AssertionError(f"Non-finite transition driver at frame {frame}")
        counts = native_counts(coat, body, top, base_count)
        if counts["native_total"]:
            raise AssertionError(f"Transition contact at frame {frame}")
        for side in SIDES:
            values[side].append(snapshot[side]["confidence"])
        rows.append({"frame": frame, "confidence": snapshot, "counts": counts})
    for side in SIDES:
        if any(
            next_value > value + ZERO_EPSILON
            for value, next_value in zip(values[side], values[side][1:])
        ):
            raise AssertionError(f"Confidence is not non-increasing for {side}")
    return {
        "samples": len(rows),
        "confidence_by_side": values,
        "native_contacts_all_zero": True,
    }


def apply_mixed_pose(rig, original_action, supported_side, full_down_basis):
    scene = bpy.context.scene
    rig.animation_data.action = original_action
    sample_frame(scene, 31.0)
    rig.animation_data.action = None
    unsupported = "r" if supported_side == "l" else "l"
    for part in PARTS:
        bone_name = f"{part}_{unsupported}"
        rig.pose.bones[bone_name].matrix_basis = full_down_basis[bone_name].copy()
    upper, lower = POSES["elbow_bend"]
    sign = 1.0 if supported_side == "l" else -1.0
    for part, target in (("upperarm", upper), ("lowerarm", lower), ("hand", lower)):
        point_bone(
            rig,
            f"{part}_{supported_side}",
            (sign * target[0], target[1], target[2]),
        )
    update()
    return supported_side, unsupported


def audit_mixed_controls(rig, coat, controls, original_action, baseline_endpoint):
    scene = bpy.context.scene
    sample_frame(scene, 1.0)
    full_down_basis = {
        f"{part}_{side}": rig.pose.bones[f"{part}_{side}"].matrix_basis.copy()
        for side in SIDES
        for part in PARTS
    }
    rows = []
    for supported in SIDES:
        supported, unsupported = apply_mixed_pose(
            rig, original_action, supported, full_down_basis
        )
        confidence = {
            side: float(controls[gate_prop("confidence", None, side)]) for side in SIDES
        }
        values = key_values(coat)
        supported_delta = max(
            abs(value - baseline_endpoint[name])
            for name, value in values.items()
            if name.endswith(f"_{supported}")
        )
        unsupported_abs = max(
            abs(value)
            for name, value in values.items()
            if name.endswith(f"_{unsupported}")
        )
        if (
            abs(confidence[supported] - 1.0) > ZERO_EPSILON
            or confidence[unsupported] > ZERO_EPSILON
            or supported_delta > ZERO_EPSILON
            or unsupported_abs > ZERO_EPSILON
        ):
            raise AssertionError(f"Mixed control failed for supported side {supported}")
        rows.append(
            {
                "supported_side": supported,
                "unsupported_side": unsupported,
                "confidence": confidence,
                "maximum_supported_key_delta": supported_delta,
                "maximum_unsupported_key_abs": unsupported_abs,
            }
        )
    return {"controls": rows, "whole_pose_contact_clear_claim": False}


def update_scope_note():
    note = bpy.data.texts.get("RIGGED_JACKET_SCOPE")
    if note is None:
        raise AssertionError("Missing RIGGED_JACKET_SCOPE text")
    addition = (
        "Driver-only confidence gate is 1 on the three calibrated review curves; "
        "outside calibrated curves the jacket uses ordinary skinning after a smooth "
        "six-dimensional distance fade from 0.01 to 0.04. General motion STILL "
        "fails and remains outside acceptance.\n"
    )
    current = note.as_string()
    if addition not in current:
        note.write("\n" + addition)
    return note.as_string()


def run(input_path=INPUT, output_blend=OUTPUT_BLEND, audit_path=OUTPUT_AUDIT):
    input_path = Path(input_path).resolve()
    output_blend = Path(output_blend)
    audit_path = Path(audit_path)
    if not input_path.exists():
        raise FileNotFoundError(input_path)
    if output_blend.exists():
        raise FileExistsError(output_blend)
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    source_hash = sha256(input_path)
    bpy.ops.wm.open_mainfile(filepath=str(input_path))
    scene = bpy.context.scene
    coat = bpy.data.objects["Structured armhole jacket"]
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    controls = bpy.data.objects["Jacket pose weights"]
    original_action_name = scene["riggedJacketOriginalLoweringAction"]
    default_action = rig.animation_data.action
    default_action_name = default_action.name if default_action else None
    if default_action_name is None or default_action_name == original_action_name:
        raise AssertionError("Input default action is not a separate review action")
    preserved = {
        "body": body_snapshot(body),
        "top": body_snapshot(top),
        "skeleton": bones_snapshot(rig),
        "shape_keys": key_hash(coat),
        "modifiers": modifier_snapshot(coat),
        "actions": action_snapshot(),
    }
    baseline, baseline_endpoint = review_baseline(rig, coat, default_action_name)
    solidifies = [
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    ]
    if len(solidifies) != 1 or not solidifies[0].show_viewport:
        raise AssertionError("Expected one live Solidify modifier")
    solidify = solidifies[0]
    base_count = len(coat.data.vertices)
    sample_frame(scene, 31.0)
    gate_paths = install_gate(coat, rig, controls)
    update_scope_note()
    rig.animation_data.action = bpy.data.actions[default_action_name]
    sample_frame(scene, 1.0)
    update()
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend), compress=True)
    output_hash = sha256(output_blend)

    bpy.ops.wm.open_mainfile(filepath=str(output_blend))
    scene = bpy.context.scene
    coat = bpy.data.objects["Structured armhole jacket"]
    rig = bpy.data.objects["AvatarSkeleton"]
    body = bpy.data.objects["AvatarBody"]
    top = bpy.data.objects["AvatarTop_tailored"]
    controls = bpy.data.objects["Jacket pose weights"]
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    if (
        body_snapshot(body) != preserved["body"]
        or body_snapshot(top) != preserved["top"]
    ):
        raise AssertionError("Body or top changed in saved gated copy")
    if bones_snapshot(rig) != preserved["skeleton"]:
        raise AssertionError("Rest skeleton changed in saved gated copy")
    if key_hash(coat) != preserved["shape_keys"]:
        raise AssertionError("Shape-key coordinates changed in saved gated copy")
    if modifier_snapshot(coat) != preserved["modifiers"]:
        raise AssertionError(
            "Jacket modifier configuration changed in saved gated copy"
        )
    if action_snapshot() != preserved["actions"]:
        raise AssertionError("Existing action datablocks changed in saved gated copy")
    if scene.get("riggedJacketOriginalLoweringAction") != original_action_name:
        raise AssertionError("Original lowering action property changed")
    if (
        rig.animation_data.action is None
        or rig.animation_data.action.name != default_action_name
    ):
        raise AssertionError("Saved default review action changed")
    if (
        "outside calibrated curves the jacket uses ordinary skinning"
        not in bpy.data.texts["RIGGED_JACKET_SCOPE"].as_string()
    ):
        raise AssertionError("Scope note lacks ordinary-skinning statement")
    if (
        "General motion STILL fails"
        not in bpy.data.texts["RIGGED_JACKET_SCOPE"].as_string()
    ):
        raise AssertionError("Scope note lacks general-motion failure statement")
    sample_frame(scene, 31.0)
    driver_report = all_driver_audit(coat, controls, gate_paths)
    review_report = audit_review(rig, coat, body, top, controls, base_count, baseline)
    lower_report = audit_lowering(
        rig, coat, body, top, controls, solidify, base_count, source_hash
    )
    transition_report = audit_transition(rig, coat, body, top, controls, base_count)
    mixed_report = audit_mixed_controls(
        rig, coat, controls, bpy.data.actions[original_action_name], baseline_endpoint
    )
    source_hash_after = sha256(input_path)
    if source_hash_after != source_hash:
        raise AssertionError("Input .blend hash changed")
    report = {
        "scope": __doc__,
        "input_path": str(input_path),
        "output_blend": str(output_blend),
        "output_audit": str(audit_path),
        "source_sha256_before": source_hash,
        "source_sha256_after": source_hash_after,
        "output_blend_sha256": output_hash,
        "blender_version": bpy.app.version_string,
        "action_name": original_action_name,
        "default_review_action": default_action_name,
        "base_vertex_count": base_count,
        "native_solidify_vertex_count": 2 * base_count,
        "gate_properties": sorted(gate_paths),
        "driver_audit": driver_report,
        "preservation": {
            "body_top_skeleton_shape_keys_modifiers_actions": True,
            "body_snapshot": preserved["body"],
            "top_snapshot": preserved["top"],
            "skeleton_snapshot": preserved["skeleton"],
            "shape_key_coordinates_sha256": preserved["shape_keys"],
            "modifier_snapshot": preserved["modifiers"],
            "actions_sha256": preserved["actions"],
        },
        "review_audit": review_report,
        "lowering_audit": lower_report,
        "transition_audit": transition_report,
        "mixed_controls": mixed_report,
        "scope_note_updated": True,
        "original_failing_control_preserved": True,
        "passed": True,
    }
    audit_path.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "LUNA_GATED_RESULT",
        json.dumps(
            {
                "passed": True,
                "input": str(input_path),
                "output_blend": str(output_blend),
                "audit": str(audit_path),
                "review291": review_report,
                "lower61": lower_report,
                "transition21": {
                    "native_contacts_all_zero": transition_report[
                        "native_contacts_all_zero"
                    ],
                    "confidence": transition_report["confidence_by_side"],
                },
                "mixed": mixed_report,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=INPUT)
    parser.add_argument("--output-blend", type=Path, default=OUTPUT_BLEND)
    parser.add_argument("--audit", type=Path, default=OUTPUT_AUDIT)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.input, args.output_blend, args.audit)
