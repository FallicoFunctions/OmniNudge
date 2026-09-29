"""Fit a fresh rest-shape trajectory in bounded batches, checking walls before each resume.

Run with the isolated IPC Python and two BLAS/OpenMP threads. A new output
folder is required. Failed/timeout attempts are retained and stop continuation.
This driver never exports or accepts a model.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

S = Path(__file__).resolve().parent
from run_jacket_construction_study import execute

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument(
    "--blender", default="/Applications/Blender.app/Contents/MacOS/Blender"
)
parser.add_argument(
    "--targets",
    type=float,
    nargs="+",
    default=[28.0, 25.0, 22.0, 20.0] + [19.5 - i * 0.5 for i in range(38)],
)
args = parser.parse_args()
assert all(1 <= x < 31 and x * 2 == int(x * 2) for x in args.targets)
assert all(a > b for a, b in zip(args.targets, args.targets[1:]))
B = args.blender
I = args.input.resolve()
O = args.output.resolve()
O.mkdir(parents=True, exist_ok=False)


def read(p):
    return json.loads(Path(p).read_text())


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


summary = {
    "scope": "Fresh T-pose fit of the separately tested underarm rest-shape construction. Every batch requires independent actual-wall path and area checks before resuming; no older construction checkpoint is used. No model export or acceptance.",
    "input_sha256": sha(I),
    "batches": [],
    "complete_arm_lowering": False,
}


def save():
    temporary = O / "batches.pending.json"
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.replace(O / "batches.json")


previous = None
for target in args.targets:
    p = O / f"to-{target:g}"
    row = {
        "target_source_frame": target,
        "prefix": str(p),
        "resume_prefix": previous,
        "started_unix": time.time(),
    }
    summary["batches"].append(row)
    save()
    print("START", target, flush=True)
    cmd = [
        sys.executable,
        str(S / "probe_jacket_finite.py"),
        "--input",
        str(I),
        "--output-prefix",
        str(p),
        "--intervals",
        str(int((31 - target) * 2)),
        "--wall-construction",
        "reduced",
        "--clearance-bounds",
        "--actual-wall-barrier",
        "--bounded-ccd",
        "--fast-bounds",
        "--require-wall-clear",
        "--blender",
        B,
    ]
    if previous is not None:
        cmd += ["--resume-prefix", previous]
    row["solver_exit"] = execute(cmd, Path(str(p) + ".log"), 1200)
    save()
    if not Path(str(p) + ".json").exists():
        row["status"] = (
            "SOLVER_TIMED_OUT_WITHOUT_REPORT"
            if row["solver_exit"] == 124
            else "SOLVER_FAILED_WITHOUT_REPORT"
        )
        save()
        break
    solver = read(str(p) + ".json")
    row["result_source_frames"] = solver["result_source_frames"]
    blender = [
        B,
        "--background",
        "--threads",
        "2",
        "--python-exit-code",
        "1",
        "--python",
        str(S / "inspect_jacket_finite_walls.py"),
        "--",
    ]
    row["export_exit"] = execute(
        blender
        + [
            "--export",
            "--input",
            str(I),
            "--result",
            str(p) + ".npz",
            "--solver-report",
            str(p) + ".json",
            "--output",
            str(p) + "-path.npz",
        ],
        Path(str(p) + "-export.log"),
        180,
    )
    save()
    if row["export_exit"]:
        row["status"] = "WALL_EXPORT_FAILED"
        save()
        break
    row["wall_check_exit"] = execute(
        [
            sys.executable,
            str(S / "inspect_jacket_finite_walls.py"),
            "--check",
            "--input",
            str(p) + "-path.npz",
            "--output",
            str(p) + "-path.json",
            "--separation-bounds",
            "--require-clear",
        ],
        Path(str(p) + "-check.log"),
        300,
    )
    row["wall_area_exit"] = execute(
        blender
        + [
            "--areas",
            "--input",
            str(p) + "-path.npz",
            "--output",
            str(p) + "-areas.json",
            "--require-clear",
        ],
        Path(str(p) + "-areas.log"),
        180,
    )
    row["elapsed_seconds"] = time.time() - row["started_unix"]
    row["status"] = (
        "BATCH_CLEAR_NOT_PROMOTED"
        if all(
            row[k] == 0
            for k in ["solver_exit", "export_exit", "wall_check_exit", "wall_area_exit"]
        )
        and solver["completed_all_segments"]
        else "BATCH_REJECTED_NOT_PROMOTED"
    )
    save()
    print("END", target, row["status"], row["elapsed_seconds"], flush=True)
    if row["status"] != "BATCH_CLEAR_NOT_PROMOTED":
        break
    previous = str(p)
    summary["last_independently_checked_frame"] = target
    summary["complete_arm_lowering"] = target == 1.0
    save()
summary["finished"] = True
save()
