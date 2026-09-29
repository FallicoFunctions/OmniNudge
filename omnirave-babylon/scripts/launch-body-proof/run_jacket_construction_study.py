"""Run the bounded construction comparison serially in a fresh output folder.

Use the isolated IPC Python with OPENBLAS_NUM_THREADS=2 and OMP_NUM_THREADS=2.
Models are read only. Every solver invocation has a 1,200-second process limit;
each independent export/check has a 180-second limit. Failed trials are kept.
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from probe_jacket_construction import read, sha, write


def execute(command, log, seconds):
    with log.open("w") as output:
        process = subprocess.Popen(
            command, stdout=output, stderr=subprocess.STDOUT, start_new_session=True
        )
        try:
            return process.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            # Include Blender descendants in this dedicated process group.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            # A descendant may outlive the group leader's graceful exit.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            return 124


def main(args):
    args.output.mkdir(parents=True, exist_ok=False)
    scripts = Path(__file__).resolve().parent
    base = [
        sys.executable,
        str(scripts / "probe_jacket_construction.py"),
        "--output",
        str(args.output),
        "--input",
        str(args.input),
        "--checkpoint",
        str(args.checkpoint),
        "--blender",
        args.blender,
    ]
    assert execute(base + ["--prepare"], args.output / "prepare.log", 180) == 0
    summary = {"protocol_sha256": sha(args.output / "protocol.json"), "trials": []}

    def save():
        write(args.output / "runs.json", summary)

    for name in ("control", "underarm_layout", "underarm_rest_depth"):
        prefix = args.output / name
        row = {"variant": name, "started_unix": time.time()}
        summary["trials"].append(row)
        save()
        row["solver_exit"] = execute(
            base + ["--variant", name], Path(str(prefix) + ".log"), 1200
        )
        row["elapsed_including_setup_seconds"] = time.time() - row["started_unix"]
        if Path(str(prefix) + ".json").exists():
            row["solver_report"] = read(str(prefix) + ".json")
            blender = [
                args.blender,
                "--background",
                "--threads",
                "2",
                "--python-exit-code",
                "1",
                "--python",
                str(scripts / "inspect_jacket_finite_walls.py"),
                "--",
            ]
            row["export_exit"] = execute(
                blender
                + [
                    "--export",
                    "--input",
                    str(prefix) + "-input.npz",
                    "--result",
                    str(prefix) + ".npz",
                    "--solver-report",
                    str(prefix) + ".json",
                    "--output",
                    str(prefix) + "-path.npz",
                ],
                Path(str(prefix) + "-export.log"),
                180,
            )
            if row["export_exit"] == 0:
                row["wall_check_exit"] = execute(
                    [
                        sys.executable,
                        str(scripts / "inspect_jacket_finite_walls.py"),
                        "--check",
                        "--input",
                        str(prefix) + "-path.npz",
                        "--output",
                        str(prefix) + "-path.json",
                        "--separation-bounds",
                        "--require-clear",
                    ],
                    Path(str(prefix) + "-check.log"),
                    180,
                )
                row["wall_area_exit"] = execute(
                    blender
                    + [
                        "--areas",
                        "--input",
                        str(prefix) + "-path.npz",
                        "--output",
                        str(prefix) + "-areas.json",
                        "--require-clear",
                    ],
                    Path(str(prefix) + "-areas.log"),
                    180,
                )
        passed = row.get("solver_report", {}).get("completed_all_segments") and all(
            row.get(k) == 0
            for k in ("solver_exit", "export_exit", "wall_check_exit", "wall_area_exit")
        )
        row["status"] = "COMPLETE_AND_CLEAR" if passed else "REJECTED_OR_INCOMPLETE"
        save()
        print(name, row["status"], flush=True)
        if name == "control" and not passed:
            break
    summary["finished"] = True
    save()
    if len(summary["trials"]) == 3 and all(
        row.get("solver_report", {}).get("result_source_frames") == [20.5, 20.0]
        for row in summary["trials"]
    ):
        summary["endpoint_force_check_exit"] = execute(
            [
                sys.executable,
                str(scripts / "inspect_jacket_construction_forces.py"),
                "--directory",
                str(args.output),
            ],
            args.output / "endpoint-gradients.log",
            180,
        )
        save()
    if summary["trials"][0]["status"] == "COMPLETE_AND_CLEAR":
        subprocess.run(
            [
                sys.executable,
                str(scripts / "summarize_jacket_construction.py"),
                "--directory",
                str(args.output),
                "--reference",
                str(args.output / "control"),
                "--output",
                str(args.output / "summary.json"),
            ],
            check=True,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--blender", default="/Applications/Blender.app/Contents/MacOS/Blender"
    )
    main(parser.parse_args())
