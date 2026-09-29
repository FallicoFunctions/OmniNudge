"""Collect independently checked batches of one fresh rest-shape trajectory.

This does not merge constructions, recover incomplete optimizer snapshots, or
accept a garment. All joins must match exactly, including reconstructed walls
and independently evaluated body/top geometry.
"""

import argparse
from pathlib import Path

import numpy as np
from probe_jacket_construction import read, sha, write


def collect(directory, input_path):
    run = read(directory / "batches.json")
    input_hash = sha(input_path)
    assert run["input_sha256"] == input_hash
    with np.load(input_path) as archive:
        source_hash = str(archive["source_sha256"])
        input_start = archive["panel"][0]
    checked, rejected = [], []
    previous = None
    last_frame = 31.0
    fit_poses = wall_poses = 0
    fit_intervals = wall_transitions = 0
    for batch in run["batches"]:
        prefix = Path(batch["prefix"])
        assert prefix.resolve().parent == directory.resolve()
        if batch.get("status") != "BATCH_CLEAR_NOT_PROMOTED":
            rejected.append(batch)
            continue
        assert not rejected, "A later batch cannot bridge an unchecked attempt"
        solver = read(str(prefix) + ".json")
        wall = read(str(prefix) + "-path.json")
        area = read(str(prefix) + "-areas.json")
        assert solver["input_sha256"] == input_hash
        assert solver["source_sha256"] == source_hash
        assert solver["completed_all_segments"] and solver["linear_motion_gate_passed"]
        assert all(row["passed"] for row in solver["screens"])
        assert (
            solver["actual_wall_barrier"]
            and solver["fast_bounds"]
            and solver["bounded_ccd"]
        )
        assert solver["settings"]["position_tolerance_m"] == 1e-9
        assert wall["passed_bounded_wall_checks"] and area["passed"]
        assert wall["construction"]["solver_result_sha256"] == sha(str(prefix) + ".npz")
        assert wall["construction"]["solver_report_sha256"] == sha(
            str(prefix) + ".json"
        )
        assert (
            area["input_sha256"]
            == wall["input_sha256"]
            == sha(str(prefix) + "-path.npz")
        )
        with np.load(str(prefix) + ".npz") as archive:
            panels = archive["panels"]
        with np.load(str(prefix) + "-path.npz") as archive:
            paths = {k: archive[k] for k in ("walls", "body", "top", "frames")}
        frames = solver["result_source_frames"]
        assert frames[0] == last_frame and frames[-1] == batch["target_source_frame"]
        assert np.all(np.diff(frames) < 0)
        assert len(panels) == len(frames) == len(solver["segments"]) + 1
        assert len(paths["frames"]) == 4 * (len(frames) - 1) + 1
        if previous is None:
            assert solver["resumed_checkpoint"] is None
            assert np.array_equal(panels[0], input_start)
        else:
            assert np.array_equal(panels[0], previous["panel"])
            for key in ("walls", "body", "top"):
                assert np.array_equal(paths[key][0], previous[key]), (
                    prefix,
                    key,
                    "Join differs",
                )
            assert solver["resumed_checkpoint"]["original_rest_state_retained"]
        previous = {
            "panel": panels[-1],
            **{k: paths[k][-1] for k in ("walls", "body", "top")},
        }
        fit_poses += len(frames) - bool(checked)
        wall_poses += len(paths["frames"]) - bool(checked)
        fit_intervals += len(solver["segments"])
        wall_transitions += len(wall["transitions"])
        last_frame = frames[-1]
        checked.append(
            {
                "batch": batch,
                "solver": solver,
                "wall_path": wall,
                "wall_areas": area,
                "result_sha256": sha(str(prefix) + ".npz"),
                "solver_report_sha256": sha(str(prefix) + ".json"),
                "wall_path_npz_sha256": sha(str(prefix) + "-path.npz"),
                "wall_report_sha256": sha(str(prefix) + "-path.json"),
                "area_report_sha256": sha(str(prefix) + "-areas.json"),
                "all_join_positions_exact": True,
            }
        )
    return {
        "scope": __doc__,
        "input_sha256": input_hash,
        "source_sha256": source_hash,
        "checked_batches": checked,
        "unchecked_or_rejected_attempts": rejected,
        "checked_source_frame_range": [31.0, last_frame] if checked else None,
        "fit_poses": fit_poses,
        "fit_intervals": fit_intervals,
        "independent_wall_poses": wall_poses,
        "independent_linear_wall_transitions": wall_transitions,
        "minimum_measured_wall_body_top_gap_m": min(
            (
                pose["minimum_wall_obstacle_distance_m"]
                for row in checked
                for pose in row["wall_path"]["poses"]
            ),
            default=None,
        ),
        "minimum_analytic_wall_triangle_area_m2": min(
            (row["wall_areas"]["minimum_area_m2"] for row in checked), default=None
        ),
        "completed_full_sampled_lowering": bool(
            checked and last_frame == 1.0 and not rejected
        ),
        "runner_finished": run.get("finished", False),
        "new_model_binaries": 0,
        "accepted": False,
        "scope_limits": "Straight wall paths between quarter-interval reconstructions; not the exact nonlinear rig/normal trajectory, original detail, full exported actions, gameplay, likeness or a proven automated pipeline.",
    }


def archive_panels(report, output):
    """Save exactly the checked midsurface positions for diagnostic inspection."""
    assert report["checked_batches"], "No independently checked positions to archive"
    panels, frames = [], []
    for i, row in enumerate(report["checked_batches"]):
        path = row["batch"]["prefix"] + ".npz"
        assert sha(path) == row["result_sha256"]
        with np.load(path) as archive:
            panels.append(archive["panels"][int(i > 0) :])
        frames.extend(row["solver"]["result_source_frames"][int(i > 0) :])
    positions = np.concatenate(panels)
    assert len(positions) == len(frames) == report["fit_poses"]
    np.savez_compressed(output, panels=positions, frames=np.asarray(frames))
    with np.load(output) as archive:
        assert np.array_equal(archive["panels"], positions)
        assert np.array_equal(archive["frames"], frames)
    report["result_source_frames"] = frames
    report["archived_checked_panels"] = {
        "path": str(output),
        "sha256": sha(output),
        "shape": list(positions.shape),
        "scope": "Checked reduced midsurface diagnostic positions only. Not a garment/model export, wall geometry, runtime asset or solver resume report.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--archive-panels", type=Path)
    args = parser.parse_args()
    report = collect(args.directory, args.input)
    if args.archive_panels:
        archive_panels(report, args.archive_panels)
    write(args.output, report)
