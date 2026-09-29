"""Redistribute collar skin weights between fixed rims along measured cross arcs."""

# Connection map: the existing 9,054-vertex collar stays one closed surface.
# Keep the first 1,152 original flap vertices/weights and shared seams intact.
# Both rims of all 439 band cross sections also retain exact skin and coordinates.
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


def run(args):
    assert 0 <= args.amount <= 1 and 0 <= args.start_angle < 180
    assert 0 < args.fade_angle <= 180
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
    band_goals = goals[OLD_COUNT:].reshape(439, 9, 2, 3)
    # Arc distance follows the flared lower band; uniform row spacing would
    # concentrate the transition where the physical cross section is narrower.
    lengths = np.linalg.norm(np.diff(band_goals, axis=1), axis=-1)
    assert np.all(lengths > 1e-8)
    fractions = np.concatenate(
        (np.zeros((439, 1, 2)), np.cumsum(lengths, axis=1)), axis=1
    )
    fractions /= fractions[:, -1:]
    field = raw[:, :1] * (1 - fractions[..., None]) + raw[:, -1:] * fractions[..., None]
    angles = np.abs(
        np.rad2deg(np.arctan2(goals[OLD_COUNT:, 0], -(goals[OLD_COUNT:, 1] - 0.005)))
    ).reshape(439, 9, 2)
    factors = args.amount * smooth((angles - args.start_angle) / args.fade_angle)
    factors[:, (0, -1)] = 0
    blended = (raw * (1 - factors[..., None]) + field * factors[..., None]).reshape(
        -1, len(names)
    )
    weights = original.copy()
    discarded = 0.0
    for index, row in enumerate(blended, start=OLD_COUNT):
        if factors.reshape(-1)[index - OLD_COUNT] == 0:
            continue
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
    changed = np.flatnonzero(np.any(weights != original, axis=1))
    skin = np.einsum("vg,gij->vij", weights[changed], matrices)
    target = np.column_stack((goals[changed], np.ones(len(changed))))
    coordinates = np.asarray([list(v.co) for v in obj.data.vertices], np.float32)
    coordinates[changed] = np.linalg.solve(skin, target[..., None])[:, :3, 0].astype(
        np.float32
    )
    for index in changed:
        obj.data.vertices[int(index)].co = coordinates[index]
    indices = changed.tolist()
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
        cross_arc_fractions=fractions,
        amount=np.array(args.amount, np.float64),
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
                "amount",
                "start_angle",
                "fade_angle",
            )
        },
        "method": "measured_cross_arc_interpolation_between_fixed_rims",
        "changed_vertices": len(changed),
        "cross_section_rims_preserved_exactly": True,
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
    parser.add_argument("--amount", type=float, default=0.5)
    parser.add_argument("--start-angle", type=float, default=45)
    parser.add_argument("--fade-angle", type=float, default=20)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
