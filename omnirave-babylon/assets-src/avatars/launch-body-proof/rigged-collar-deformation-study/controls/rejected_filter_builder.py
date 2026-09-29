"""Smooth a connected collar's skin field while preserving its fitted T shape."""

# Connection map: the existing 9,054-vertex collar stays one closed surface.
# Keep the first 1,152 original flap vertices/weights and shared seams intact.
# Only the band skin and compensating bind coordinates may change; the original
# shirt, jacket, body, hardware, topology and transforms remain untouched.
import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

S = Path(__file__).resolve().parent
sys.path.insert(0, str(S))
import audit_rigged_jacket_sleeves as A
from build_rigged_shirt_neckband import weight_array

SOURCE = S.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-shirt-neckband-study/"
    "male-rigged-shirt-neckband.blend"
)
NAME = "Shirt detail - connected collar"
OLD_COUNT = 1152


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def filtered(values, axis, passes):
    result = values.copy()
    for _ in range(passes):
        padding = [(0, 0)] * result.ndim
        padding[axis] = (1, 1)
        padded = np.pad(result, padding, mode="edge")
        slices = [slice(None)] * result.ndim
        pieces = []
        for i in range(3):
            slices[axis] = slice(i, i + result.shape[axis])
            pieces.append(padded[tuple(slices)])
        result = (pieces[0] + 2 * pieces[1] + pieces[2]) / 4
    return result


def run(args):
    for path in (args.output, args.provenance, args.report):
        if path.exists():
            raise FileExistsError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
    source_sha = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, _coat, _body, _shirt = A.scene_objects()
    obj = bpy.data.objects[NAME]
    assert len(obj.data.vertices) == 9054
    assert np.max(abs(np.asarray(obj.matrix_world) - np.eye(4))) < 1e-8
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, 31)
    goals = A.array(A.H.geometry(obj)[0])
    names = [group.name for group in obj.vertex_groups]
    original = weight_array(obj, names)
    raw = original[OLD_COUNT:].reshape(439, 9, 2, len(names))
    field = filtered(filtered(raw, 0, args.angular), 1, args.cross)
    angles = np.abs(
        np.rad2deg(np.arctan2(goals[OLD_COUNT:, 0], -(goals[OLD_COUNT:, 1] - 0.005)))
    ).reshape(439, 9, 2)
    factors = args.amount * smooth((angles - args.start_angle) / args.fade_angle)
    factors *= 1 - (1 - args.lower) * smooth((np.arange(9)[None, :, None] - 5) / 3)
    blended = (raw * (1 - factors[..., None]) + field * factors[..., None]).reshape(
        -1, len(names)
    )
    weights = original.copy()
    discarded = 0.0
    for index, row in enumerate(blended, start=OLD_COUNT):
        order = np.argsort(-row, kind="stable")
        discarded = max(discarded, float(row[order[4:]].sum()))
        row[order[4:]] = 0
        row /= row.sum()
        weights[index] = row.astype(np.float32)
    assert discarded < 0.01
    matrices = np.asarray(
        [
            rig.matrix_world
            @ rig.pose.bones[n].matrix
            @ rig.data.bones[n].matrix_local.inverted()
            @ rig.matrix_world.inverted()
            for n in names
        ]
    )
    skin = np.einsum("vg,gij->vij", weights[OLD_COUNT:], matrices)
    target = np.column_stack((goals[OLD_COUNT:], np.ones(len(blended))))
    coordinates = np.asarray([list(v.co) for v in obj.data.vertices], np.float32)
    coordinates[OLD_COUNT:] = np.linalg.solve(skin, target[..., None])[:, :3, 0].astype(
        np.float32
    )
    for vertex, point in zip(obj.data.vertices[OLD_COUNT:], coordinates[OLD_COUNT:]):
        vertex.co = point
    indices = list(range(OLD_COUNT, len(weights)))
    for group in obj.vertex_groups:
        group.remove(indices)
    for index in indices:
        for group_index in np.flatnonzero(weights[index]):
            obj.vertex_groups[int(group_index)].add(
                [index], float(weights[index, group_index]), "REPLACE"
            )
    A.update()
    residual = float(np.max(abs(A.array(A.H.geometry(obj)[0]) - goals)))
    assert residual < 2e-6
    np.savez_compressed(
        args.provenance,
        expected_coordinates=coordinates,
        expected_weights=weights.astype(np.float32),
        goals_t=goals,
        angular_passes=np.array(args.angular, np.int32),
        cross_passes=np.array(args.cross, np.int32),
        amount=np.array(args.amount, np.float64),
        lower=np.array(args.lower, np.float64),
        start_angle=np.array(args.start_angle, np.float64),
        fade_angle=np.array(args.fade_angle, np.float64),
    )
    A.sample(scene, 1)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    assert A.digest(args.input) == source_sha
    record = {
        "source_sha256": source_sha,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "smoothing": {
            key: getattr(args, key)
            for key in (
                "angular",
                "cross",
                "amount",
                "lower",
                "start_angle",
                "fade_angle",
            )
        },
        "maximum_dropped_weight": discarded,
        "maximum_weight_change": float(np.max(abs(weights - original))),
        "maximum_t_residual_m": residual,
        "acceptance": "Requires reopened independent static, motion and visual checks",
    }
    args.report.write_text(json.dumps(record, indent=2) + "\n")
    print("COLLAR_DEFORMATION_BUILD", json.dumps(record))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    for name in ("output", "provenance", "report"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--angular", type=int, default=18)
    parser.add_argument("--cross", type=int, default=6)
    parser.add_argument("--amount", type=float, default=1)
    parser.add_argument("--lower", type=float, default=1)
    parser.add_argument("--start-angle", type=float, default=45)
    parser.add_argument("--fade-angle", type=float, default=20)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
