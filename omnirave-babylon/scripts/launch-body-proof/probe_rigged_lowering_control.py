"""Bounded comparison of the authored jacket lowering with corrective keys."""

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

strict_pairs = import_module("surface_crossings").strict_pairs
validate_tops = import_module("validate_body05_tops")
between = validate_tops.between
geometry = validate_tops.geometry


INPUT = (
    Path(__file__).resolve().parents[2]
    / "assets-src"
    / "avatars"
    / "launch-body-proof"
    / "rigged-jacket-study"
    / "male-rigged-jacket-study.blend"
)
OUTPUT_DIR = Path("/tmp/omnirave-luna-lowering-study")
OUTPUT_JSON = OUTPUT_DIR / "luna-lowering-study.json"
SAMPLES = 61
START_FRAME = 31.0
END_FRAME = 1.0
ZERO_EPSILON = 1.0e-8

SIDES = {"l": "left", "r": "right"}
POSE_BONES = ("upperarm", "lowerarm", "hand")
FEATURES = (
    "basis",
    "elbow_bend",
    "forward_reach",
    "overhead_reach",
    "elbow_bend_mid",
    "forward_reach_mid",
    "overhead_reach_mid",
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def update():
    bpy.context.view_layer.update()


def vector_list(value):
    return [float(value[i]) for i in range(3)]


def bbox(points, vertex_ids):
    if not vertex_ids:
        return None
    selected = [points[index] for index in vertex_ids]
    return {
        "min": [float(min(point[axis] for point in selected)) for axis in range(3)],
        "max": [float(max(point[axis] for point in selected)) for axis in range(3)],
        "vertex_count": len(vertex_ids),
    }


def feature_snapshot(weights):
    return {
        side_name: {
            feature: float(weights[f"score_{feature}_{side}"]) for feature in FEATURES
        }
        for side, side_name in SIDES.items()
    }


def direction_snapshot(rig):
    rotation = rig.matrix_world.to_3x3()
    directions = {}
    for side, side_name in SIDES.items():
        directions[side_name] = {}
        for part in POSE_BONES:
            bone = rig.pose.bones[f"{part}_{side}"]
            direction = rotation @ (bone.tail - bone.head)
            if direction.length <= 1.0e-12:
                raise AssertionError(f"Degenerate {part}_{side} direction")
            directions[side_name][part] = vector_list(direction.normalized())
    return directions


def key_snapshot(keys):
    return {key.name: float(key.value) for key in keys.key_blocks[1:]}


def midsurface_geometry(coat, solidify, base_count):
    previous = solidify.show_viewport
    solidify.show_viewport = False
    try:
        update()
        points, triangles = geometry(coat)
        if len(points) != base_count:
            raise AssertionError(
                f"Midsurface vertex count {len(points)} != base count {base_count}"
            )
        return points, triangles
    finally:
        solidify.show_viewport = previous
        update()


def native_snapshot(coat, body, top, base_count):
    coat_points, coat_triangles = geometry(coat)
    if len(coat_points) != 2 * base_count:
        raise AssertionError(
            "Native Solidify vertex count "
            f"{len(coat_points)} != 2 * base count {2 * base_count}"
        )
    body_points, body_triangles = geometry(body)
    top_points, top_triangles = geometry(top)
    self_pairs = strict_pairs(coat_points, coat_triangles)
    body_pairs = between(coat_points, coat_triangles, body_points, body_triangles)
    top_pairs = between(coat_points, coat_triangles, top_points, top_triangles)
    if not all(
        math.isfinite(value)
        for points in (coat_points, body_points, top_points)
        for point in points
        for value in point
    ):
        raise AssertionError("Non-finite native evaluated geometry")
    return {
        "coat_points": coat_points,
        "coat_triangles": coat_triangles,
        "self_pairs": self_pairs,
        "body_pairs": body_pairs,
        "top_pairs": top_pairs,
    }


def contact_face_snapshot(native, midsurface_points, tpose_points, base_count):
    self_pairs = native["self_pairs"]
    body_pairs = native["body_pairs"]
    top_pairs = native["top_pairs"]
    coat_triangles = native["coat_triangles"]
    garment_triangles = {
        triangle_id
        for pairs in (self_pairs, body_pairs, top_pairs)
        for pair in pairs
        for triangle_id in (pair if pairs is self_pairs else (pair[0],))
    }
    # The Solidify evaluation duplicates the authored mesh. Mapping every
    # contacted evaluated vertex through modulo recovers its midsurface id.
    affected = sorted(
        {
            vertex_id % base_count
            for triangle_id in garment_triangles
            for vertex_id in coat_triangles[triangle_id]
        }
    )
    return {
        "self_contact_face_ids": [[int(a), int(b)] for a, b in self_pairs],
        "body_contact_face_ids": [[int(a), int(b)] for a, b in body_pairs],
        "top_contact_face_ids": [[int(a), int(b)] for a, b in top_pairs],
        "garment_contact_triangle_ids": sorted(
            int(value) for value in garment_triangles
        ),
        "affected_midsurface_vertex_ids": affected,
        "affected_world_bbox": bbox(midsurface_points, affected),
        "original_tpose_bbox": bbox(tpose_points, affected),
    }


def sample_frame(scene, frame):
    integer = int(frame)
    scene.frame_set(integer, subframe=frame - integer)
    update()


def configure_mode(coat, mode):
    keys = coat.data.shape_keys
    drivers = list(keys.animation_data.drivers) if keys.animation_data else []
    if len(drivers) != 12:
        raise AssertionError(f"Expected 12 key drivers, got {len(drivers)}")
    muted = mode == "drivers_muted_zero"
    for driver in drivers:
        driver.mute = muted
    if muted:
        for key in keys.key_blocks[1:]:
            key.value = 0.0
    update()
    if any(driver.mute != muted for driver in drivers):
        raise AssertionError(f"Driver mute state was not applied for {mode}")
    values = key_snapshot(keys)
    if muted and any(abs(value) > ZERO_EPSILON for value in values.values()):
        raise AssertionError(f"Muted key values were not evaluated to zero: {values}")
    return {
        "driver_count": len(drivers),
        "drivers_muted": muted,
        "all_nonbasis_key_values_zero_verified": muted,
    }


def failure_details(row, localization):
    return {
        "sample": row["sample"],
        "frame": row["frame"],
        "contact_counts": row["contact_counts"],
        "contact_faces_and_localization": localization,
    }


def run_mode(mode, input_hash, input_path, array_path):
    # Reopen the immutable source for every mode so driver edits cannot leak.
    bpy.ops.wm.open_mainfile(filepath=str(input_path))
    scene = bpy.context.scene
    rig = bpy.data.objects.get("AvatarSkeleton")
    coat = bpy.data.objects.get("Structured armhole jacket")
    body = bpy.data.objects.get("AvatarBody")
    top = bpy.data.objects.get("AvatarTop_tailored")
    weights = bpy.data.objects.get("Jacket pose weights")
    if not all((rig, coat, body, top, weights)):
        raise AssertionError("Required rigged jacket objects are missing")
    original_action_name = scene.get("riggedJacketOriginalLoweringAction")
    if not isinstance(original_action_name, str) or not original_action_name:
        raise AssertionError("Missing riggedJacketOriginalLoweringAction")
    original_action = bpy.data.actions.get(original_action_name)
    if original_action is None:
        raise AssertionError(f"Missing original action {original_action_name}")
    if rig.animation_data is None or rig.animation_data.action is None:
        raise AssertionError("Rig has no default action")
    default_action_name = rig.animation_data.action.name
    if default_action_name == original_action_name:
        raise AssertionError("Input default action unexpectedly equals original action")
    rig.animation_data.action = original_action
    solidifies = [
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    ]
    if len(solidifies) != 1 or not solidifies[0].show_viewport:
        raise AssertionError("Expected one live viewport Solidify modifier")
    solidify = solidifies[0]
    base_count = len(coat.data.vertices)
    if base_count <= 0:
        raise AssertionError("Jacket has no base vertices")
    mode_state = configure_mode(coat, mode)

    sample_frame(scene, START_FRAME)
    tpose_points, _ = midsurface_geometry(coat, solidify, base_count)
    initial_tpose = [vector_list(point) for point in tpose_points]
    midsurface_frames = []
    first_failure_localization = None
    full_down_localization = None
    rows = []
    for sample in range(SAMPLES):
        frame = START_FRAME + (END_FRAME - START_FRAME) * sample / (SAMPLES - 1)
        sample_frame(scene, frame)
        keys = key_snapshot(coat.data.shape_keys)
        if mode == "drivers_muted_zero" and any(
            abs(value) > ZERO_EPSILON for value in keys.values()
        ):
            raise AssertionError(
                f"Evaluated muted key is nonzero at frame {frame}: {keys}"
            )
        native = native_snapshot(coat, body, top, base_count)
        midsurface_points, _ = midsurface_geometry(coat, solidify, base_count)
        midsurface = [vector_list(point) for point in midsurface_points]
        midsurface_frames.append(midsurface)
        self_count = len(native["self_pairs"])
        body_count = len(native["body_pairs"])
        top_count = len(native["top_pairs"])
        counts = {
            "self": self_count,
            "body": body_count,
            "top": top_count,
            "native_total": self_count + body_count + top_count,
        }
        localization = contact_face_snapshot(
            native, midsurface_points, tpose_points, base_count
        )
        if counts["native_total"] > 0 and first_failure_localization is None:
            first_failure_localization = localization
        if sample == SAMPLES - 1:
            full_down_localization = localization
        rows.append(
            {
                "sample": sample,
                "frame": frame,
                "contact_counts": counts,
                "bone_directions": direction_snapshot(rig),
                "features": feature_snapshot(weights),
                "key_values": keys,
            }
        )

    first_failed = next(
        (row for row in rows if row["contact_counts"]["native_total"] > 0), None
    )
    full_down = rows[-1]
    if full_down_localization is None:
        raise AssertionError("Missing full-down localization sample")
    midsurface_array = np.asarray(midsurface_frames, dtype=np.float32)
    initial_tpose_array = np.asarray(initial_tpose, dtype=np.float32)
    np.savez_compressed(
        array_path,
        midsurface_positions=midsurface_array,
        initial_tpose_midsurface=initial_tpose_array,
        frames=np.asarray([row["frame"] for row in rows], dtype=np.float64),
    )
    summary = {
        **mode_state,
        "samples": len(rows),
        "first_failure": (
            {"sample": first_failed["sample"], "frame": first_failed["frame"]}
            if first_failed
            else None
        ),
        "frames_with_native_contacts": sum(
            row["contact_counts"]["native_total"] > 0 for row in rows
        ),
        "maximum_native_contact_count": max(
            row["contact_counts"]["native_total"] for row in rows
        ),
        "endpoint_counts": {
            "frame31_initial_t": rows[0]["contact_counts"],
            "frame1_full_down": full_down["contact_counts"],
        },
    }
    return {
        "mode": mode,
        "action_name": original_action_name,
        "default_action_at_input": default_action_name,
        "base_vertex_count": base_count,
        "native_evaluated_vertex_count": 2 * base_count,
        "solidify_vertex_mapping": "evaluated_vertex_id % base_vertex_count",
        "midsurface_arrays": {
            "path": str(array_path),
            "midsurface_positions_key": "midsurface_positions",
            "initial_tpose_key": "initial_tpose_midsurface",
            "frames_key": "frames",
            "shape": list(midsurface_array.shape),
            "dtype": str(midsurface_array.dtype),
        },
        "_initial_tpose_positions": initial_tpose,
        "summary": summary,
        "scoped_failure_info": {
            "first_failed": (
                failure_details(first_failed, first_failure_localization)
                if first_failed
                else None
            ),
            "full_down": failure_details(full_down, full_down_localization),
        },
        "frames": rows,
        "input_hash_during_mode": input_hash,
    }


def compare_tpose(modes):
    enabled = modes["drivers_enabled"]["_initial_tpose_positions"]
    muted = modes["drivers_muted_zero"]["_initial_tpose_positions"]
    if len(enabled) != len(muted):
        raise AssertionError("T-pose midsurface arrays have different lengths")
    maximum_delta = max(
        math.sqrt(sum((enabled[i][axis] - muted[i][axis]) ** 2 for axis in range(3)))
        for i in range(len(enabled))
    )
    enabled_count = modes["drivers_enabled"]["summary"]["endpoint_counts"][
        "frame31_initial_t"
    ]
    muted_count = modes["drivers_muted_zero"]["summary"]["endpoint_counts"][
        "frame31_initial_t"
    ]
    return {
        "initial_tpose_max_vertex_delta_m": maximum_delta,
        "initial_tpose_native_contact_counts_equal": enabled_count == muted_count,
        "initial_tpose_native_contact_counts": {
            "drivers_enabled": enabled_count,
            "drivers_muted_zero": muted_count,
        },
    }


def run(input_path=INPUT, output_path=OUTPUT_JSON):
    input_path = Path(input_path).resolve()
    output_path = Path(output_path)
    if not input_path.exists():
        raise FileNotFoundError(input_path)
    input_hash = sha256(input_path)
    output_dir = output_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    modes = {
        "drivers_enabled": run_mode(
            "drivers_enabled",
            input_hash,
            input_path,
            output_dir / "drivers-enabled-midsurface.npz",
        ),
        "drivers_muted_zero": run_mode(
            "drivers_muted_zero",
            input_hash,
            input_path,
            output_dir / "drivers-muted-zero-midsurface.npz",
        ),
    }
    after_hash = sha256(input_path)
    if after_hash != input_hash:
        raise AssertionError("Input .blend hash changed during diagnostic")
    tpose_parity = compare_tpose(modes)
    for mode in modes.values():
        del mode["_initial_tpose_positions"]
    report = {
        "scope": __doc__,
        "input_path": str(input_path),
        "model_hash": input_hash,
        "input_sha256_before": input_hash,
        "input_sha256_after": after_hash,
        "blender_version": bpy.app.version_string,
        "action_name": modes["drivers_enabled"]["action_name"],
        "sample_schedule": {
            "count": SAMPLES,
            "frames": "31.0 down to 1.0 in 0.5-frame steps",
        },
        "native_acceptance": "Solidify-evaluated jacket strict self/body/top triangle crossings",
        "mode_parity_at_t": tpose_parity,
        "modes": modes,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n")
    first_failure_summary = {}
    for mode, value in modes.items():
        first_failure = value["summary"]["first_failure"]
        first_failure_summary[mode] = (
            None
            if first_failure is None
            else {
                **first_failure,
                "bone_directions": value["frames"][first_failure["sample"]][
                    "bone_directions"
                ],
            }
        )
    print(
        "LUNA_LOWERING_SUMMARY",
        json.dumps(
            {
                "input": str(input_path),
                "firstfailure": first_failure_summary,
                "endpointcounts": {
                    mode: value["summary"]["endpoint_counts"]
                    for mode, value in modes.items()
                },
                "mode_parity_atT": tpose_parity,
                "json": str(output_path),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=INPUT)
    parser.add_argument("--output", type=Path, default=OUTPUT_JSON)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.input, args.output)
