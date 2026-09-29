"""Read-only motion audit for a deformation-only connected-collar refinement."""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_embroidery as E
import audit_rigged_jacket_sleeves as A
import audit_rigged_shirt_neckband as N

SOURCE = (
    SCRIPTS.parents[1]
    / "assets-src/avatars/launch-body-proof/rigged-shirt-neckband-study/"
    "male-rigged-shirt-neckband.blend"
)
TOL = 2e-6
EPS = 1e-6


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def images():
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


def without_connected(snapshot):
    value = dict(snapshot)
    value["meshes"] = {
        name: row for name, row in value["meshes"].items() if name != N.CONNECTED
    }
    value["mesh_names"] = sorted(value["meshes"])
    value["objects"] = {
        name: row for name, row in value["objects"].items() if name != N.CONNECTED
    }
    return value


def source_bridge(path, sha):
    report_path = path.parent / "neckband-audit.json"
    if not report_path.exists():
        raise AssertionError(f"missing source neckband audit: {report_path}")
    report = json.loads(report_path.read_text())
    if (
        not report.get("accepted")
        or report.get("model_sha256") != sha
        or len(report.get("arm_samples", [])) != 354
        or len(report.get("neck_samples", [])) != 36
    ):
        raise AssertionError("source neckband audit bridge")
    return {
        "path": str(report_path),
        "sha256": digest(report_path),
        "source_max_edge_strain_percent": report["motion_metrics"][
            "maximum_edge_strain_percent"
        ],
    }


def connected_core(core):
    result = {
        key: value
        for key, value in core.items()
        if key not in {"coordinates_sha256", "weights_sha256"}
    }
    # Blender's built-in POINT position attribute mirrors the deliberately
    # permitted new-band coordinates. Every authored/custom attribute remains
    # part of this exact comparison.
    result["attributes"] = {
        name: value
        for name, value in result["attributes"].items()
        if name != "position"
    }
    return result


def exact_detail_names():
    expected = {*N.REMAINING, N.CONNECTED}
    actual = {obj.name for obj in bpy.data.objects if obj.get("shirtDetail")}
    if actual != expected:
        raise AssertionError("shirt detail object set")


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def stable_top4(weights):
    result = np.asarray(weights, float).copy()
    order = np.argsort(-result, axis=1, kind="stable")
    for row, ranked in zip(result, order, strict=True):
        row[ranked[4:]] = 0
        if row.sum() <= EPS:
            raise AssertionError("non-positive smoothed weight row")
        row /= row.sum()
    return result


def check_provenance(
    path, connected, source_coordinates, source_weights, source_t_points, names
):
    values = np.load(path, allow_pickle=False)
    required = (
        "expected_coordinates",
        "expected_weights",
        "goals_t",
        "cross_arc_fractions",
        "amount",
        "start_angle",
        "fade_angle",
    )
    if missing := [key for key in required if key not in values]:
        raise AssertionError(f"missing deformation provenance: {missing}")
    coordinates = np.asarray(values["expected_coordinates"])
    weights = np.asarray(values["expected_weights"])
    goals = np.asarray(values["goals_t"])
    fractions = np.asarray(values["cross_arc_fractions"])
    parameters = {
        name: np.asarray(values[name])
        for name in ("amount", "start_angle", "fade_angle")
    }
    count = len(connected.data.vertices)
    if (
        coordinates.dtype != np.float32
        or weights.dtype != np.float32
        or coordinates.shape != (count, 3)
        or weights.shape != (count, len(names))
        or goals.dtype != np.float64
        or goals.shape != (count, 3)
        or fractions.dtype != np.float64
        or fractions.shape != (439, 9, 2)
        or any(
            value.shape != () or not np.issubdtype(value.dtype, np.floating)
            for value in parameters.values()
        )
        or not all(
            np.isfinite(value).all()
            for value in (coordinates, weights, goals, fractions, *parameters.values())
        )
    ):
        raise AssertionError("deformation provenance shapes or finite values")
    actual_coordinates = N.coordinates(connected)
    actual_weights = N.dense_weights(connected, names)
    if not (
        np.array_equal(actual_coordinates, coordinates)
        and np.array_equal(actual_weights, weights)
        and np.array_equal(
            actual_coordinates[: N.OLD_COUNT], source_coordinates[: N.OLD_COUNT]
        )
        and np.array_equal(actual_weights[: N.OLD_COUNT], source_weights[: N.OLD_COUNT])
    ):
        raise AssertionError("deformation coordinates or flap weights")
    if (
        np.min(weights) < -EPS
        or np.max(abs(weights.sum(axis=1) - 1)) > EPS
        or np.max((weights > 1e-8).sum(axis=1)) > 4
    ):
        raise AssertionError("deformation weights")
    amount, start, fade = (float(parameters[name]) for name in parameters)
    if not (0 <= amount <= 1 and fade > 0):
        raise AssertionError("deformation arc parameters")
    new_count = count - N.OLD_COUNT
    if new_count != 439 * 9 * 2:
        raise AssertionError(f"unexpected collar arc shape: {new_count}")
    source_band = (
        source_weights[N.OLD_COUNT :].reshape(439, 9, 2, len(names)).astype(float)
    )
    source_t = A.array(source_t_points)[N.OLD_COUNT :].reshape(439, 9, 2, 3)
    lengths = np.linalg.norm(source_t[:, 1:] - source_t[:, :-1], axis=3)
    cumulative = np.concatenate(
        (np.zeros((439, 1, 2)), np.cumsum(lengths, axis=1)), axis=1
    )
    reconstructed_fractions = cumulative / cumulative[:, -1:]
    fraction_delta = float(np.max(abs(reconstructed_fractions - fractions)))
    if fraction_delta > 1e-12:
        raise AssertionError("cross-arc fractions do not reconstruct")
    degrees = np.degrees(np.arctan2(source_t[..., 0], -(source_t[..., 1] - 0.005)))
    factor = amount * smooth((abs(degrees) - start) / fade)
    factor[:, 0] = 0
    factor[:, 8] = 0
    field = (1 - fractions[..., None]) * source_band[:, :1] + fractions[
        ..., None
    ] * source_band[:, 8:]
    mixed = source_band * (1 - factor[..., None]) + field * factor[..., None]
    reconstructed = source_band.reshape(new_count, len(names)).copy()
    changed = factor.reshape(new_count) > 0
    reconstructed[changed] = stable_top4(mixed.reshape(new_count, len(names))[changed])
    reconstructed = reconstructed.astype(np.float32)
    delta = float(np.max(abs(reconstructed - weights[N.OLD_COUNT :])))
    if delta > 1e-6:
        raise AssertionError("deformation arc weights do not reconstruct")
    rim = np.zeros((439, 9, 2), bool)
    rim[:, (0, 8)] = True
    rim = rim.reshape(new_count)
    if not (
        np.array_equal(
            coordinates[N.OLD_COUNT :][rim], source_coordinates[N.OLD_COUNT :][rim]
        )
        and np.array_equal(
            weights[N.OLD_COUNT :][rim], source_weights[N.OLD_COUNT :][rim]
        )
    ):
        raise AssertionError("fixed transverse rim coordinates or weights")
    return goals, {
        "cross_arc_fraction_max_abs_error": fraction_delta,
        "amount": amount,
        "start_angle": start,
        "fade_angle": fade,
        "weight_reconstruction_max_abs_error": delta,
        "fixed_rim_new_vertex_count": int(rim.sum()),
        "maximum_pre_top4_weight_change": float(
            np.max(
                abs(
                    mixed.reshape(new_count, len(names))
                    - source_band.reshape(new_count, len(names))
                )
            )
        ),
    }


def pose(scene, rig, frame):
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, frame)


def run_motion(
    scene, rig, collar, shirt, body, coat, hardware, details, edge_reference, quick
):
    arm, neck, failures = [], [], []
    original = scene["riggedJacketOriginalLoweringAction"]
    for action, frames in A.action_scopes(original, quick):
        rig.animation_data.action = bpy.data.actions[action]
        for frame in frames:
            A.sample(scene, frame)
            row = N.record(
                rig, collar, shirt, body, coat, hardware, details, edge_reference
            )
            row.update(
                scope="lowering" if action == original else action, frame=float(frame)
            )
            arm.append(row)
            if not row["accepted"]:
                failures.append(row)
    rig.animation_data.action = bpy.data.actions[original]
    A.sample(scene, 31.0)
    t_basis = A.arm_basis(rig)
    A.sample(scene, 1.0)
    down_basis = A.arm_basis(rig)
    for active in A.SIDES:
        rig.animation_data.action = bpy.data.actions[original]
        A.sample(scene, 31.0)
        rig.animation_data.action = None
        for side in A.SIDES:
            for part, matrix in (down_basis if side == active else t_basis)[
                side
            ].items():
                rig.pose.bones[f"{part}_{side}"].matrix_basis = matrix
        A.update()
        row = N.record(
            rig, collar, shirt, body, coat, hardware, details, edge_reference
        )
        row.update(scope="asymmetric", frame=None, full_down_side=active)
        arm.append(row)
        if not row["accepted"]:
            failures.append(row)
    values = (
        [("X", -10), ("X", 10), ("Z", -20), ("Z", 20)]
        if quick
        else [
            (axis, float(degrees))
            for axis, limit in (("X", 10), ("Z", 20))
            for degrees in np.linspace(-limit, limit, 9)
        ]
    )
    for frame in (31.0, 1.0):
        for axis, degrees in values:
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
            row = N.record(
                rig, collar, shirt, body, coat, hardware, details, edge_reference
            )
            row.update(frame=frame, axis=axis, degrees=degrees)
            neck.append(row)
            if not row["accepted"]:
                failures.append(row)
            bone.matrix_basis = basis
            A.update()
    expected = (14, 8) if quick else (354, 36)
    if (len(arm), len(neck)) != expected:
        raise AssertionError("motion scope count")
    return arm, neck, failures


def main(args):
    source_sha, input_sha = digest(args.source), digest(args.input)
    bridge = source_bridge(args.source, source_sha)
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    source_snapshot = E.static_snapshot()
    source_snapshot["images"] = images()
    scene, rig, _coat, _body, source_shirt = A.scene_objects()
    source_collar = bpy.data.objects[N.CONNECTED]
    names = [group.name for group in source_shirt.vertex_groups]
    source_coordinates = N.coordinates(source_collar)
    source_weights = N.dense_weights(source_collar, names)
    source_core = E.mesh_core(source_collar)
    source_transform = E.transform(source_collar)
    pose(scene, rig, 31.0)
    source_points, source_faces = N.geometry(source_collar)
    edge_reference = N.edge_lengths(source_collar, source_points)
    source_snapshot = without_connected(source_snapshot)

    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    candidate_snapshot = E.static_snapshot()
    candidate_snapshot["images"] = images()
    candidate_snapshot = without_connected(candidate_snapshot)
    if candidate_snapshot != source_snapshot:
        raise AssertionError("non-collar static state or packed images changed")
    scene, rig, coat, body, shirt = A.scene_objects()
    exact_detail_names()
    collar = bpy.data.objects[N.CONNECTED]
    if (
        connected_core(E.mesh_core(collar)) != connected_core(source_core)
        or E.transform(collar) != source_transform
    ):
        raise AssertionError(
            "connected collar topology, attrs, material, or transform changed"
        )
    if N.winding_conflicts(N.oriented_faces(collar)):
        raise AssertionError("connected collar winding")
    goals, smoothing = check_provenance(
        args.provenance,
        collar,
        source_coordinates,
        source_weights,
        source_points,
        names,
    )
    pose(scene, rig, 31.0)
    actual_points, actual_faces = N.geometry(collar)
    if (
        actual_faces != source_faces
        or float(np.max(abs(A.array(actual_points) - A.array(source_points)))) > TOL
        or float(np.max(abs(A.array(actual_points) - goals))) > TOL
    ):
        raise AssertionError("inverse T goal preservation")
    hardware = [obj for obj in bpy.data.objects if obj.get("jacketHardware")]
    if len(hardware) != 7:
        raise AssertionError("hardware object set")
    details = [bpy.data.objects[name] for name in N.REMAINING]
    arm, neck, failures = run_motion(
        scene,
        rig,
        collar,
        shirt,
        body,
        coat,
        hardware,
        details,
        edge_reference,
        args.quick,
    )
    if digest(args.source) != source_sha or digest(args.input) != input_sha:
        raise AssertionError("blend mutated during read-only audit")
    rows = [*arm, *neck]
    maximum = float(max(row["edge_strain_percent"] for row in rows))
    if maximum >= bridge["source_max_edge_strain_percent"]:
        raise AssertionError(
            "candidate did not improve source-relative maximum edge strain"
        )
    output = {
        "source_sha256": source_sha,
        "model_sha256": input_sha,
        "auditor_sha256": digest(Path(__file__)),
        "provenance_sha256": digest(args.provenance),
        "mode": "quick14_plus_neck8" if args.quick else "full354_plus_neck36",
        "accepted": not failures,
        "source_neckband_audit": bridge,
        "source_t_shape_max_abs_delta_m": float(
            np.max(abs(A.array(actual_points) - A.array(source_points)))
        ),
        "candidate_t_goal_max_abs_residual_m": float(
            np.max(abs(A.array(actual_points) - goals))
        ),
        "source_relative_max_edge_strain_percent": maximum,
        "source_relative_improvement_percentage_points": bridge[
            "source_max_edge_strain_percent"
        ]
        - maximum,
        "smoothing": smoothing,
        "arm_samples": arm,
        "neck_samples": neck,
        "failures": failures,
        "limits": [
            "Finite strict crossings only; no continuous or combined-motion certification.",
            "Unsigned shirt proximity and edge strain are reported metrics, not physical acceptance thresholds.",
            "Source-relative strain uses the accepted source T edge lengths; independent head motion remains untested.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(output, indent=2) + "\n")
    print(
        "COLLAR_DEFORMATION_AUDIT",
        json.dumps({k: output[k] for k in ("mode", "accepted", "model_sha256")}),
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
