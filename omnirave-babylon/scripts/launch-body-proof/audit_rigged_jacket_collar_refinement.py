"""Read-only collar-refinement audit for the sleeve-tailored jacket."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A

SOURCE = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-jacket-sleeves-study/male-rigged-jacket-sleeves.blend"
)
OLD_VERTEX_COUNT = 2548
FLOAT_TOL = 2e-6
EPS = 1e-6


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def shapes(coat):
    return np.asarray(
        [
            [[*point.co] for point in key.data]
            for key in coat.data.shape_keys.key_blocks
        ],
        dtype=np.float32,
    )


def faces(coat):
    return np.asarray(
        [tuple(face.vertices) for face in coat.data.polygons], dtype=np.int32
    )


def protected_snapshot(coat, rig, body, shirt):
    """Snapshot data that collar-local coordinates and weights may not alter."""
    return A.preserved_snapshot(coat, rig, body, shirt)


def dense_weights(coat, names):
    actual_names = [group.name for group in coat.vertex_groups]
    if actual_names != list(names):
        raise AssertionError(
            "vertex-group names/order differ from provenance: "
            f"{actual_names!r} != {list(names)!r}"
        )
    result = np.zeros((len(coat.data.vertices), len(names)), dtype=np.float32)
    for vertex in coat.data.vertices:
        for assignment in vertex.groups:
            result[vertex.index, assignment.group] = assignment.weight
    return result


def provenance_arrays(provenance):
    required = {"expected_shapes", "expected_weights"}
    missing = sorted(required - set(provenance.files))
    if missing:
        raise AssertionError(f"collar provenance missing {missing}")
    name_key = next(
        (
            name
            for name in ("expected_weight_names", "weight_names")
            if name in provenance.files
        ),
        None,
    )
    if name_key is None:
        raise AssertionError(
            "collar provenance must contain expected_weight_names (or weight_names)"
        )
    expected_shapes = provenance["expected_shapes"]
    expected_weights = provenance["expected_weights"]
    names = [str(value) for value in provenance[name_key].tolist()]
    if expected_shapes.dtype != np.float32:
        raise AssertionError(
            f"expected_shapes must be float32, got {expected_shapes.dtype}"
        )
    if expected_weights.dtype != np.float32:
        raise AssertionError(
            f"expected_weights must be float32, got {expected_weights.dtype}"
        )
    if (
        expected_shapes.shape != (15, 2671, 3)
        or expected_weights.shape != (2671, len(names))
        or not names
        or len(set(names)) != len(names)
        or not np.isfinite(expected_shapes).all()
        or not np.isfinite(expected_weights).all()
    ):
        raise AssertionError(
            "invalid collar expected arrays: "
            f"shapes={expected_shapes.shape}, weights={expected_weights.shape}, "
            f"groups={len(names)}"
        )
    return expected_shapes, expected_weights, names, name_key


def main(args):
    source_hash, output_hash = digest(args.source), digest(args.input)
    provenance_hash = digest(args.provenance)
    provenance = np.load(args.provenance, allow_pickle=False)
    expected_shapes, expected_weights, weight_names, names_key = provenance_arrays(
        provenance
    )

    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    scene, rig, coat, body, shirt = A.scene_objects()
    original_name = scene["riggedJacketOriginalLoweringAction"]
    source_protected = protected_snapshot(coat, rig, body, shirt)
    source_shapes = shapes(coat)
    source_weights = A.weights(coat)
    source_faces = faces(coat)
    if source_shapes.shape != (15, 2671, 3):
        raise AssertionError(
            f"expected 15x2671 source shape data, got {source_shapes.shape}"
        )

    baseline = {}
    for action_name, frames in A.action_scopes(original_name, args.quick):
        rig.animation_data.action = bpy.data.actions[action_name]
        baseline[action_name] = []
        for value in frames:
            A.sample(scene, float(value))
            baseline[action_name].append(A.key_values(coat))

    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    if protected_snapshot(coat, rig, body, shirt) != source_protected:
        raise AssertionError(
            "protected body/shirt/rig/action/material/driver/modifier data changed"
        )
    solidify = next(
        modifier for modifier in coat.modifiers if modifier.type == "SOLIDIFY"
    )
    base_count = len(coat.data.vertices)
    output_shapes = shapes(coat)
    output_weights = A.weights(coat)
    output_faces = faces(coat)
    if (
        output_shapes.shape != source_shapes.shape
        or not np.isfinite(output_shapes).all()
    ):
        raise AssertionError("output shape-key coordinate array is invalid")
    if not np.array_equal(output_faces, source_faces):
        raise AssertionError("mesh faces changed")
    if not np.array_equal(
        output_shapes[:, :OLD_VERTEX_COUNT], source_shapes[:, :OLD_VERTEX_COUNT]
    ):
        raise AssertionError(f"first {OLD_VERTEX_COUNT} vertices changed")
    if output_weights[:OLD_VERTEX_COUNT] != source_weights[:OLD_VERTEX_COUNT]:
        raise AssertionError(f"first {OLD_VERTEX_COUNT} vertex weights changed")
    output_dense_weights = dense_weights(coat, weight_names)
    shape_residual = float(np.max(np.abs(output_shapes - expected_shapes)))
    weight_residual = float(np.max(np.abs(output_dense_weights - expected_weights)))
    if shape_residual > FLOAT_TOL or weight_residual > FLOAT_TOL:
        raise AssertionError(
            "output differs from collar provenance: "
            f"shape={shape_residual}, weight={weight_residual}"
        )
    if (
        not np.isfinite(output_dense_weights).all()
        or float(output_dense_weights.min()) < -EPS
        or not all(
            len(row) <= 4 and abs(sum(row.values()) - 1.0) < EPS
            for row in output_weights
        )
    ):
        raise AssertionError(
            "weights must be finite, nonnegative, normalized, and have no more than four influences"
        )
    mesh_topology = A.topology(coat.data)
    if (
        mesh_topology["connected_components"] != 1
        or mesh_topology["nonmanifold_edges"]
        or mesh_topology["degenerate_faces"]
    ):
        raise AssertionError("invalid collar mesh topology")

    rows, failures, max_key_delta = [], [], 0.0

    def capture(scope, value, key_delta=0.0, **extra):
        result = A.record(coat, body, shirt, solidify, base_count)
        states, orientation = (
            result["containment"]["native_vertex_states"],
            result["offset_orientation"],
        )
        compact = {
            "scope": scope,
            "frame": value,
            "native_counts": result["native_counts"],
            "midsurface_self": result["midsurface_self"],
            "inside": states["inside"],
            "ambiguous": states["ambiguous"],
            "shirt_layering": result["shirt_layering"]["count"],
            "reversed_faces": orientation["reversed_faces"],
            "minimum_area_m2": orientation["minimum_midsurface_triangle_area_m2"],
            "minimum_offset_ratio": orientation["minimum_ratio"],
            "key_delta": key_delta,
            **extra,
        }
        rows.append(compact)
        if A.failing(result) or key_delta > EPS:
            failures.append({"sample": compact, "detail": result})

    for action_name, frames in A.action_scopes(original_name, args.quick):
        rig.animation_data.action = bpy.data.actions[action_name]
        for index, value in enumerate(frames):
            A.sample(scene, float(value))
            delta = max(
                abs(A.key_values(coat)[key] - expected)
                for key, expected in baseline[action_name][index].items()
            )
            max_key_delta = max(max_key_delta, delta)
            capture(
                "lowering" if action_name == original_name else action_name,
                float(value),
                delta,
            )

    rig.animation_data.action = bpy.data.actions[original_name]
    A.sample(scene, 31.0)
    t_basis = A.arm_basis(rig)
    A.sample(scene, 1.0)
    down_basis = A.arm_basis(rig)
    for active in A.SIDES:
        rig.animation_data.action = bpy.data.actions[original_name]
        A.sample(scene, 31.0)
        rig.animation_data.action = None
        for side in A.SIDES:
            for part, matrix in (down_basis if side == active else t_basis)[
                side
            ].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        A.update()
        actual = {
            side: float(
                coat.data.shape_keys.key_blocks[f"lowered_endpoint_{side}"].value
            )
            for side in A.SIDES
        }
        expected = {side: float(side == active) for side in A.SIDES}
        capture(
            "asymmetric",
            None,
            max(abs(actual[side] - expected[side]) for side in A.SIDES),
            full_down_side=active,
            lowering_keys=actual,
            expected_lowering_keys=expected,
        )

    expected_samples = (3 if args.quick else 61) + (9 if args.quick else 291) + 2
    if len(rows) != expected_samples:
        raise AssertionError(f"expected {expected_samples} samples, found {len(rows)}")
    invalid = [
        curve.data_path
        for curve in coat.data.shape_keys.animation_data.drivers
        if not curve.is_valid
        or not curve.driver.is_valid
        or not curve.driver.is_simple_expression
    ]
    if invalid or protected_snapshot(coat, rig, body, shirt) != source_protected:
        raise AssertionError(f"invalid drivers or protected data changed: {invalid}")
    if digest(args.source) != source_hash or digest(args.input) != output_hash:
        raise AssertionError("audit mutated a blend file")

    maxima = {
        name: max(row[name] for row in rows)
        for name in (
            "midsurface_self",
            "inside",
            "ambiguous",
            "shirt_layering",
            "reversed_faces",
        )
    }
    maxima["native_counts"] = {
        name: max(row["native_counts"][name] for row in rows)
        for name in ("self", "body", "shirt", "total")
    }
    audit_key = "audit_quick14" if args.quick else "audit_354"
    report = {
        "scope": __doc__,
        "source_sha256": source_hash,
        "model_sha256": output_hash,
        "provenance_sha256": provenance_hash,
        "mode": "quick" if args.quick else "full_354",
        "source_and_model_preserved": True,
        "topology": mesh_topology,
        "preservation": {
            "body_shirt_skeleton_actions_modifiers_drivers_materials": True,
            "old_vertex_count_exact": OLD_VERTEX_COUNT,
            "old_shape_coordinates_exact": True,
            "old_weights_exact": True,
            "provenance_shape_key": "expected_shapes",
            "provenance_weight_key": "expected_weights",
            "provenance_weight_names_key": names_key,
            "maximum_expected_shape_residual": shape_residual,
            "maximum_expected_weight_residual": weight_residual,
            "maximum_bone_influences": max(map(len, output_weights)),
            "weights_finite_nonnegative_normalized": True,
            "all_shape_coordinates_finite": True,
            "all_fourteen_key_drivers_native_simple_valid": True,
            "input_mesh_attributes": A.attribute_snapshot(coat.data),
        },
        audit_key: {
            "samples": expected_samples,
            "lowering_samples": 3 if args.quick else 61,
            "review_samples": 9 if args.quick else 291,
            "asymmetric_samples": 2,
            "failed_samples": len(failures),
            "maximum_existing_key_delta": max_key_delta,
            "guard_maxima": maxima,
            "minimum_triangle_area_m2": min(row["minimum_area_m2"] for row in rows),
            "minimum_offset_ratio": min(row["minimum_offset_ratio"] for row in rows),
            "accepted": not failures,
        },
        "sample_rows": rows,
        "failure_rows": failures,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("COLLAR_REFINEMENT_AUDIT", json.dumps(report[audit_key]), flush=True)
    if failures:
        raise AssertionError(f"{len(failures)} collar-refinement samples failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Use the 14-pose diagnostic scope before the full 354-pose audit",
    )
    main(
        parser.parse_args(
            sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
        )
    )
