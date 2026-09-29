"""Audit intermediate neck-axis rotations at the lowered and T arm endpoints."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A


def run(args):
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    original = scene["riggedJacketOriginalLoweringAction"]
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    rows = []
    for frame in (1, 31):
        for axis, limit in (("X", 10), ("Z", 20)):
            for degrees in np.linspace(-limit, limit, 9):
                rig.animation_data.action = bpy.data.actions[original]
                A.sample(scene, frame)
                rig.animation_data.action = None
                bone = rig.pose.bones["neck_01"]
                baseline = bone.matrix_basis.copy()
                rotation = (
                    Quaternion(
                        (1, 0, 0) if axis == "X" else (0, 0, 1),
                        math.radians(float(degrees)),
                    )
                    .to_matrix()
                    .to_4x4()
                )
                bone.matrix_basis = baseline @ rotation
                A.update()
                detail = A.record(coat, body, shirt, solidify, len(coat.data.vertices))
                rows.append(
                    {
                        "arm_frame": frame,
                        "local_axis": axis,
                        "degrees": float(degrees),
                        "accepted": not A.failing(detail),
                        "detail": detail,
                    }
                )
                bone.matrix_basis = baseline
                A.update()
    assert A.digest(args.input) == source_hash
    report = {
        "model_sha256": source_hash,
        "scope": "36 finite neck_01 local-axis controls: X -10..10 in 2.5-degree steps and Z -20..20 in 5-degree steps, each at lowered/T arm endpoints. Zero rotations overlap the established motion scope. Combined-axis/general motion and continuous clearance are not certified.",
        "samples": len(rows),
        "accepted_samples": sum(row["accepted"] for row in rows),
        "accepted": all(row["accepted"] for row in rows),
        "sample_rows": rows,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "NECK_SWEEP",
        json.dumps({k: v for k, v in report.items() if k != "sample_rows"}),
        flush=True,
    )
    if not report["accepted"]:
        raise AssertionError("Neck sweep has native guard failures")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
