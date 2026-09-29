"""Compare eight finite neck-axis controls on a source and refined jacket."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A
from audit_rigged_jacket_collar_refinement import SOURCE


def inspect(path):
    sha = A.digest(path)
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene, rig, coat, body, shirt = A.scene_objects()
    original = scene["riggedJacketOriginalLoweringAction"]
    solidify = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
    rows = []
    for frame in (1, 31):
        for axis, degrees in (("X", -10), ("X", 10), ("Z", -20), ("Z", 20)):
            rig.animation_data.action = bpy.data.actions[original]
            A.sample(scene, frame)
            rig.animation_data.action = None
            bone = rig.pose.bones["neck_01"]
            baseline = bone.matrix_basis.copy()
            rotation = (
                Quaternion(
                    (1, 0, 0) if axis == "X" else (0, 0, 1), math.radians(degrees)
                )
                .to_matrix()
                .to_4x4()
            )
            bone.matrix_basis = baseline @ rotation
            A.update()
            detail = A.record(coat, body, shirt, solidify, len(coat.data.vertices))
            native, native_faces = A.H.geometry(coat)
            shirt_points, shirt_faces = A.H.geometry(shirt)
            pairs = A.H.between(native, native_faces, shirt_points, shirt_faces)
            rows.append(
                {
                    "frame": frame,
                    "bone": "neck_01",
                    "local_axis": axis,
                    "degrees": degrees,
                    "accepted": not A.failing(detail),
                    "detail": detail,
                    "shirt_pairs": sorted([list(pair) for pair in pairs]),
                    "shirt_contact_coat_base_vertex_ids": sorted(
                        {
                            int(i) % len(coat.data.vertices)
                            for face, _ in pairs
                            for i in native_faces[face]
                        }
                    ),
                }
            )
            bone.matrix_basis = baseline
            A.update()
    assert A.digest(path) == sha
    return {"model_sha256": sha, "sample_rows": rows}


def main(args):
    source, candidate = inspect(args.source), inspect(args.input)
    comparisons = []
    for original, current in zip(source["sample_rows"], candidate["sample_rows"]):
        before, after = original["detail"], current["detail"]
        old_pairs = {tuple(pair) for pair in original["shirt_pairs"]}
        new_pairs = {tuple(pair) for pair in current["shirt_pairs"]}
        comparisons.append(
            {
                "frame": current["frame"],
                "local_axis": current["local_axis"],
                "degrees": current["degrees"],
                "source_counts": before["native_counts"],
                "candidate_counts": after["native_counts"],
                "introduced_shirt_pairs": sorted(new_pairs - old_pairs),
                "removed_shirt_pairs": sorted(old_pairs - new_pairs),
                "candidate_accepted": current["accepted"],
            }
        )
    report = {
        "scope": "Eight neck_01 local-basis rotations: X +/-10 and Z +/-20 degrees at the original down/T endpoints. Finite perturbations only; no general head-motion certification.",
        "source": source,
        "candidate": candidate,
        "comparisons": comparisons,
        "accepted_samples": sum(row["accepted"] for row in candidate["sample_rows"]),
        "samples": 8,
        "all_eight_accepted": all(row["accepted"] for row in candidate["sample_rows"]),
        "maximum_candidate_native_body_contacts": max(
            row["candidate_counts"]["body"] for row in comparisons
        ),
        "maximum_candidate_native_self_contacts": max(
            row["candidate_counts"]["self"] for row in comparisons
        ),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "NECK_PROBE",
        json.dumps(
            {
                k: v
                for k, v in report.items()
                if k not in {"source", "candidate", "comparisons"}
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    main(args)
