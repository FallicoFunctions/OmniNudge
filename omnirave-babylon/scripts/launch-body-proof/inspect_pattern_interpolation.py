"""Check quarter-step linear interpolation between saved corrective poses.

The body and complete shirt use their actual rig evaluation at each subframe.
This checks a proposed linear mesh playback, not Blender cloth between steps,
and does not establish continuous collision clearance or an exported animation.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE


def run(directory):
    report = json.loads((directory / "native-cloth.json").read_text())
    archive = directory / "native-panels.npz"
    assert (
        hashlib.sha256(archive.read_bytes()).hexdigest()
        == report["native_panels_sha256"]
    )
    source = SOURCE / "male-outfit04.blend"
    assert (
        hashlib.sha256(source.read_bytes()).hexdigest()
        == report["source_hashes"][source.name]
    )
    input_path = Path(report["source_input"])
    assert (
        hashlib.sha256(input_path.read_bytes()).hexdigest()
        == report["source_hashes"][input_path.name]
    )
    data, inputs = np.load(archive), np.load(input_path)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    body, top = bpy.data.objects["AvatarBody"], bpy.data.objects["AvatarTop_tailored"]
    rows = []
    for index in range(len(data["frames"]) - 1):
        a, b = map(int, data["frames"][index : index + 2])
        assert b == a + 1
        ia, ib = [
            min(len(inputs["frames"]) - 1, max(0, f - report["schedule"]["warmup_end"]))
            for f in [a, b]
        ]
        for fraction in [0.25, 0.5, 0.75]:
            frame = float(
                (1 - fraction) * inputs["frames"][ia] + fraction * inputs["frames"][ib]
            )
            bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
            bpy.context.view_layer.update()
            points = (1 - fraction) * data["panels"][index] + fraction * data["panels"][
                index + 1
            ]
            row, _, _ = screen(points, data["faces"], body, top)
            row.update(simulation_frame=a + fraction, source_frame=frame)
            rows.append(row)
    result = {
        "scope": __doc__,
        "input_result_kind": report.get("result_kind"),
        "archive_sha256": report["native_panels_sha256"],
        "samples": rows,
        "all_sampled_interpolations_clear": all(r["passed"] for r in rows),
        "continuous_motion_checked": False,
    }
    (directory / "interpolation-check.json").write_text(
        json.dumps(result, indent=2) + "\n"
    )
    failures = [r for r in rows if not r["passed"]]
    print(
        "PATTERN_INTERPOLATION",
        len(rows),
        "failures",
        len(failures),
        "first",
        failures[:1],
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.directory)
