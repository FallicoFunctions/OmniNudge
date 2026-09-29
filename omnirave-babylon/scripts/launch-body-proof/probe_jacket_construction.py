"""Isolated construction comparison; never a model export or resume path.

All variants start at the same previously checked frame-20.5 coordinates.
Rest geometry is defined at frame 31. A changed construction has NOT been fit
from frame 31 to this warm start; this is a local sensitivity experiment only.
"""

# Connection map: torso and sleeves remain one shared-vertex sheet. Every
# boundary edge, collar/cuff/waist anchor, and obstacle trajectory is preserved.
# Topology flips replace interior diagonals only; no overlapping seam parts.
import argparse
import hashlib
import json
import resource
import subprocess
import time
from pathlib import Path

import numpy as np


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def edge_map(faces):
    edges = {}
    for i, face in enumerate(faces):
        for a, b, c in (face, np.roll(face, -1), np.roll(face, -2)):
            edges.setdefault(tuple(sorted((int(a), int(b)))), []).append(
                (i, int(a), int(b), int(c))
            )
    return edges


def quality(points, faces):
    p = points[faces]
    sides = np.stack([p[:, 1] - p[:, 0], p[:, 2] - p[:, 1], p[:, 0] - p[:, 2]], axis=1)
    twice_area = np.linalg.norm(np.cross(sides[:, 0], -sides[:, 2]), axis=1)
    return 2 * np.sqrt(3) * twice_area / np.sum(sides * sides, axis=(1, 2))


def flip_layout(rest, posed, faces, roi, anchors):
    """Improve worst triangle shape in BOTH states; preserve openings."""
    faces = faces.copy()
    history = []
    for _ in range(3):
        edges = edge_map(faces)
        touched = set()
        for edge, rows in edges.items():
            if len(rows) != 2:
                continue
            i, a, b, c = rows[0]
            j, bb, aa, d = rows[1]
            assert (a, b) == (aa, bb)
            ids = np.array([a, b, c, d])
            if (
                i in touched
                or j in touched
                or not roi[ids].all()
                or np.isin(ids, anchors).any()
            ):
                continue
            if c == d or tuple(sorted((c, d))) in edges:
                continue
            old = faces[[i, j]]
            new = np.array([[c, d, b], [d, c, a]])
            scores = []
            allowed = True
            for points in (rest, posed):
                old_p, new_p = points[old], points[new]
                old_n = np.cross(old_p[:, 1] - old_p[:, 0], old_p[:, 2] - old_p[:, 0])
                new_n = np.cross(new_p[:, 1] - new_p[:, 0], new_p[:, 2] - new_p[:, 0])
                normal = old_n.sum(axis=0)
                normal /= np.linalg.norm(normal)
                if (new_n @ normal <= 1e-12).any():
                    allowed = False
                    break
                # A bounded local plane deviation limits surface changes from
                # retriangulating a nonplanar quadrilateral; measured, not zero.
                plane = (points[ids] - points[ids].mean(axis=0)) @ normal
                if np.ptp(plane) > 0.00075:
                    allowed = False
                    break
                before, after = (
                    float(quality(points, old).min()),
                    float(quality(points, new).min()),
                )
                if after < 1.10 * before:
                    allowed = False
                    break
                scores.append([before, after])
            if allowed:
                faces[[i, j]] = new
                touched.update([i, j])
                history.append(
                    {
                        "old_edge": list(edge),
                        "new_edge": [c, d],
                        "rest_and_posed_quality": scores,
                    }
                )
    return faces, history


def prepare(args):
    with np.load(args.input) as archive:
        data = {k: archive[k] for k in archive.files}
    checkpoint = read(str(args.checkpoint) + ".json")
    assert checkpoint["linear_motion_gate_passed"]
    index = checkpoint["result_source_frames"].index(20.5)
    with np.load(str(args.checkpoint) + ".npz") as archive:
        posed = archive["panels"][index]
    rest = data["panel"][0].astype(float)
    radial = ((np.abs(rest[:, 0]) - 0.20) / 0.12) ** 2 + (
        (rest[:, 2] - 1.40) / 0.13
    ) ** 2
    roi = radial < 1
    anchors = data["anchors"]
    weight = np.maximum(0, 1 - radial) ** 2
    weight[anchors] = 0
    variants = {}
    for name in ("control", "underarm_layout", "underarm_rest_depth"):
        variant = {k: v.copy() for k, v in data.items()}
        changes = {}
        if name == "underarm_layout":
            variant["faces"], flips = flip_layout(
                rest, posed, data["faces"], roi, anchors
            )
            changes = {
                "flipped_edges": flips,
                "count": len(flips),
                "plane_span_limit_m": 0.00075,
            }
            assert flips, "No permitted layout changes"
        elif name == "underarm_rest_depth":
            variant["panel"] = data["panel"].astype(float)
            variant["panel"][0, :, 2] -= 0.004 * weight
            changes = {
                "maximum_depth_change_m": float(0.004 * weight.max()),
                "changed_rest_vertices": int(np.sum(weight > 0)),
                "rest_shape_only": True,
            }
        old_edges, new_edges = edge_map(data["faces"]), edge_map(variant["faces"])
        assert {e for e, v in old_edges.items() if len(v) == 1} == {
            e for e, v in new_edges.items() if len(v) == 1
        }
        assert all(len(v) in (1, 2) for v in new_edges.values())
        assert len(variant["faces"]) == len(data["faces"])
        assert np.array_equal(variant["panel"][:, anchors], data["panel"][:, anchors])
        assert np.array_equal(variant["panel"][1:], data["panel"][1:])
        path = args.output / (name + "-input.npz")
        np.savez_compressed(path, **variant)
        face_roi = roi[variant["faces"]].all(axis=1)
        variants[name] = {
            "input": str(path),
            "input_sha256": sha(path),
            "changes": changes,
            "roi_triangle_quality_rest_p0_p50": np.percentile(
                quality(variant["panel"][0], variant["faces"])[face_roi], [0, 50]
            ).tolist(),
            "roi_triangle_quality_start_p0_p50": np.percentile(
                quality(posed, variant["faces"])[face_roi], [0, 50]
            ).tolist(),
        }
    report = {
        "scope": __doc__,
        "original_input_sha256": sha(args.input),
        "checkpoint_npz_sha256": sha(str(args.checkpoint) + ".npz"),
        "roi": {
            "center_abs_x_z_m": [0.20, 1.40],
            "radii_x_z_m": [0.12, 0.13],
            "vertices": int(roi.sum()),
            "fixed_vertices": int(roi[anchors].sum()),
        },
        "variants": variants,
        "protocol": {
            "source_frames": [20.5, 20.0],
            "reference_iterations": 55,
            "maximum_iterations": 55,
            "maximum_solver_wall_seconds": 1200,
            "position_tolerance_m": 1e-9,
            "subdivision_allowed": False,
            "required": "Completed convergence, original fixed positions, independent 1mm wall native-zero/0.2mm-obstacle and area gates.",
            "benefit": "At most40iterations (at least27% fewer than55) or at least20% lower underarm p95 absolute edge strain, without increasing global p95 strain by more than10% or underarm p95 fold angle by more than5degrees. Each strain uses its own physical rest construction; cross-construction energy values are not comparable.",
            "scope_limit": "Common checked warm start, not evidence of a new construction fitted from T-pose or a joined replacement trajectory.",
        },
    }
    write(args.output / "protocol.json", report)
    print(json.dumps(report), flush=True)


def run(args):
    from batch_clearance_filter import batch_controls
    from probe_jacket_actual_walls import ActualWallProbe
    from probe_jacket_finite import finite_controls
    from probe_jacket_ipc import attachment_control

    protocol = read(args.output / "protocol.json")
    entry = protocol["variants"][args.variant]
    input_path = Path(entry["input"])
    assert sha(input_path) == entry["input_sha256"]
    with np.load(input_path) as archive:
        data = {k: archive[k] for k in archive.files}
    prefix = args.output / args.variant
    probe = ActualWallProbe(data, bounds=True)
    probe.bounded_ccd = probe.fast_bounds = True
    checkpoint = read(str(args.checkpoint) + ".json")
    index = checkpoint["result_source_frames"].index(20.5)
    with np.load(str(args.checkpoint) + ".npz") as archive:
        start = archive["panels"][index]
    first = int(np.flatnonzero(data["frames"] == 20.5)[0])
    probe.data = {
        k: v[first : first + 2] if k in ("panel", "body", "top", "frames") else v
        for k, v in data.items()
    }
    probe.x = probe.kinematics(0)
    probe.x[: probe.n] = start
    probe.path_start = probe.x.copy()
    assert (
        np.max(abs(start[probe.anchors] - probe.data["panel"][0, probe.anchors])) < 1e-9
    )
    assert probe.step_clear(probe.x, probe.x), (
        "Changed construction invalid at common start"
    )
    calibration = {
        "finite": finite_controls(),
        "batch": batch_controls(),
        "attachment_motion": attachment_control(probe.data),
        "gradient": probe.derivative_control(),
        "wall_derivative": probe.wall_derivative_control(),
    }
    screens = []

    def screen(row, surface):
        p = Path(str(prefix) + f"-screen{len(screens):03d}")
        np.savez_compressed(str(p) + ".npz", panels=surface[None])
        write(str(p) + ".json", {"result_source_frames": [row["source_frame"]]})
        command = [
            args.blender,
            "--background",
            "--threads",
            "2",
            "--python-exit-code",
            "1",
            "--python",
            str(Path(__file__).with_name("inspect_jacket_ipc.py")),
            "--",
            "--input",
            str(input_path),
            "--result",
            str(p) + ".npz",
            "--solver-report",
            str(p) + ".json",
            "--report",
            str(p) + "-independent.json",
            "--all-samples",
        ]
        with open(str(p) + ".log", "w") as log:
            subprocess.run(
                command, stdout=log, stderr=subprocess.STDOUT, timeout=180, check=True
            )
        independent = read(str(p) + "-independent.json")
        pose = independent["poses"][0]
        passed = not any(pose["direct_coarse_1mm_walls"].values()) and not any(
            pose["simulation"].values()
        )
        screens.append(
            {
                "source_frame": row["source_frame"],
                "passed": passed,
                "report_sha256": sha(str(p) + "-independent.json"),
                "pose": pose,
            }
        )
        print("CONSTRUCTION_SCREEN", row["source_frame"], passed, flush=True)
        return passed

    assert screen({"source_frame": 20.5}, start), "Initial wall screen failed"
    probe.segment_observer = screen
    probe.progress_snapshot_prefix = prefix
    started = time.monotonic()
    result, panels = probe.solve(max_iterations=55, max_subdivisions=0)
    result.pop("remaining_jacket_and_wall_thickness_included", None)
    result.update(
        scope=__doc__,
        construction_variant=args.variant,
        construction_changes=entry["changes"],
        controls=calibration,
        screens=screens,
        input_sha256=sha(input_path),
        elapsed_fit_and_screens_seconds=time.monotonic() - started,
        process_peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        wall_variant="direct_coarse_1mm_walls",
        actual_wall_barrier=True,
        bounded_ccd=True,
        fast_bounds=True,
        model_exported=False,
        warm_start_only=True,
        rest_lengths_sha256=hashlib.sha256(probe.rest.tobytes()).hexdigest(),
        bound_statistics=probe.bounded_statistics,
    )
    np.savez_compressed(str(prefix) + ".npz", panels=panels)
    write(str(prefix) + ".json", result)
    print(
        "CONSTRUCTION_RESULT",
        json.dumps(
            {
                k: result[k]
                for k in (
                    "construction_variant",
                    "completed_all_segments",
                    "elapsed_fit_and_screens_seconds",
                )
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument(
        "--input", type=Path, default=Path("/tmp/omnirave-jacket-motion-clean.npz")
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("/tmp/omnirave-finite-wall-batch-19-prefix20"),
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--variant", choices=["control", "underarm_layout", "underarm_rest_depth"]
    )
    parser.add_argument(
        "--blender", default="/Applications/Blender.app/Contents/MacOS/Blender"
    )
    args = parser.parse_args()
    if not args.prepare and args.variant is None:
        parser.error("--variant is required unless --prepare is selected")
    args.output.mkdir(parents=True, exist_ok=True)
    prepare(args) if args.prepare else run(args)
