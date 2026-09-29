"""Compare two shirt-detail builds without modifying either source file."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_embroidery as E
import audit_rigged_jacket_sleeves as A
from audit_rigged_shirt_details import image_snapshot


def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    state = E.static_snapshot()
    state["images"] = image_snapshot()
    scene, rig, _coat, _body, _shirt = A.scene_objects()
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    evaluated = {}
    for frame in (31, 1):
        A.sample(scene, frame)
        evaluated[str(frame)] = {}
        for obj in bpy.data.objects:
            if obj.type != "MESH":
                continue
            points, faces = A.H.geometry(obj)
            evaluated[str(frame)][obj.name] = (
                A.array(points),
                np.asarray(faces, dtype=np.int32),
            )
    return state, evaluated


def run(args):
    hashes = {str(p): A.digest(p) for p in (args.first, args.second)}
    left, first_poses = snapshot(args.first)
    right, second_poses = snapshot(args.second)
    assert left == right, "Static geometry/skin/keys/rig/material/image mismatch"
    assert first_poses.keys() == second_poses.keys()
    for frame, objects in first_poses.items():
        assert objects.keys() == second_poses[frame].keys()
        for name, (points, faces) in objects.items():
            other_points, other_faces = second_poses[frame][name]
            assert np.array_equal(points, other_points), (frame, name, "points")
            assert np.array_equal(faces, other_faces), (frame, name, "faces")
    with np.load(args.first_provenance) as a, np.load(args.second_provenance) as b:
        assert set(a.files) == set(b.files)
        for key in a.files:
            assert np.array_equal(a[key], b[key]), key
        array_count = len(a.files)
    assert hashes == {str(p): A.digest(p) for p in (args.first, args.second)}
    record = {
        "accepted": True,
        "first_model_sha256": hashes[str(args.first)],
        "second_model_sha256": hashes[str(args.second)],
        "checked_static_snapshot_sha256": hashlib.sha256(
            json.dumps(left, sort_keys=True).encode()
        ).hexdigest(),
        "all_checked_static_and_packed_images_exact": True,
        "native_all_mesh_t_and_down_exact": True,
        "evaluated_mesh_count": len(first_poses["31"]),
        "provenance_arrays_exact": array_count,
        "model_files_preserved": True,
    }
    args.report.write_text(json.dumps(record, indent=2) + "\n")
    print("SHIRT_REPRODUCTION", json.dumps(record))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("first", "second", "first-provenance", "second-provenance", "report"):
        p.add_argument("--" + name, type=Path, required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
