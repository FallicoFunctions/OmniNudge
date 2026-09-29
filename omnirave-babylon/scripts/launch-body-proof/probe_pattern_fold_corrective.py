"""Test a bounded local mesh corrective on a failed authored-pattern cloth frame.

The raw simulation remains a failed control. Candidate fairing preserves all
hard attachments, has a strict displacement cap, and must pass full 1 mm wall,
body, full-shirt and orientation checks. This is a sampled pose corrective,
not a change to cloth physics or proof of continuous/portable animation.
"""

# Connection map: unchanged connected garment topology; local vertex fairing
# around measured crossings tapers to zero at the surrounding retained mesh.
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE
from surface_crossings import strict_pairs


def correct_frame(points, faces, anchors, body, top, limit):
    assert 0 < limit <= 0.01
    initial, walls, wall_faces = screen(points, faces, body, top)
    hits = strict_pairs([Vector(p) for p in walls], wall_faces)
    if initial["passed"]:
        return points.copy(), {
            "initial": initial,
            "selected_vertices": 0,
            "trials": [],
            "passed": True,
        }
    if not hits:
        return None, {
            "initial": initial,
            "selected_vertices": 0,
            "trials": [],
            "passed": False,
            "reason": "No wall self-crossing seed for this corrective",
        }
    neighbors = defaultdict(set)
    for a, b, c in faces:
        for u, v in [(a, b), (b, c), (c, a)]:
            neighbors[int(u)].add(int(v))
            neighbors[int(v)].add(int(u))
    seeds = {
        v % len(points)
        for pair in hits
        for face_id in pair
        for v in wall_faces[face_id]
    }
    weights = np.zeros(len(points))
    seen, frontier = set(), seeds
    for weight in [1.0, 0.65, 0.30]:
        for vertex in frontier:
            weights[vertex] = weight
        seen |= frontier
        frontier = {v for vertex in frontier for v in neighbors[vertex]} - seen
    weights[anchors] = 0
    selected = np.flatnonzero(weights)
    trials, result = [], None
    for factor in [0.15, 0.30, 0.50]:
        candidate = points.copy()
        for iteration in range(1, 11):
            change = np.zeros_like(points)
            for vertex in selected:
                change[vertex] = (
                    (
                        candidate[list(neighbors[vertex])].mean(axis=0)
                        - candidate[vertex]
                    )
                    * weights[vertex]
                    * factor
                )
            proposed = candidate + change
            displacement = proposed - points
            length = np.linalg.norm(displacement, axis=1)
            displacement *= np.minimum(1, limit / np.maximum(length, 1e-12))[:, None]
            candidate = points + displacement
            assert np.array_equal(candidate[anchors], points[anchors])
            row, _, _ = screen(candidate, faces, body, top)
            row.update(
                factor=factor,
                iteration=iteration,
                max_displacement_m=float(
                    np.linalg.norm(candidate - points, axis=1).max()
                ),
            )
            trials.append(row)
            if row["passed"]:
                result = candidate
                break
            if (
                row["wall_body_pairs"]
                or row["wall_top_pairs"]
                or row["midsurface_self_pairs"]
                or row["reversed_offset_faces"]
            ):
                break
        if result is not None:
            break
    return result, {
        "initial": initial,
        "selected_vertices": len(selected),
        "trials": trials,
        "passed": result is not None,
    }


def run(directory, output, limit, all_frames):
    output.mkdir(parents=True, exist_ok=True)
    native = json.loads((directory / "native-cloth.json").read_text())
    data = np.load(directory / "native-panels.npz")
    input_path = Path(native["source_input"])
    inputs = np.load(input_path)
    assert (
        hashlib.sha256(input_path.read_bytes()).hexdigest()
        == native["source_hashes"][input_path.name]
    )
    assert (
        hashlib.sha256((directory / "native-panels.npz").read_bytes()).hexdigest()
        == native["native_panels_sha256"]
    )
    source = SOURCE / "male-outfit04.blend"
    assert (
        hashlib.sha256(source.read_bytes()).hexdigest()
        == native["source_hashes"][source.name]
    )
    bpy.ops.wm.open_mainfile(filepath=str(source))
    body, top = bpy.data.objects["AvatarBody"], bpy.data.objects["AvatarTop_tailored"]
    report = {
        "scope": __doc__,
        "source_directory": str(directory.resolve()),
        "raw_sample_sha256": native["native_panels_sha256"],
        "displacement_limit_m": limit,
        "all_frames": all_frames,
        "samples": [],
        "continuous_motion_checked": False,
        "status": "RUNNING",
    }
    selected_frames = (
        range(len(data["frames"])) if all_frames else [len(data["frames"]) - 1]
    )
    panels, frames = [], []
    for sample in selected_frames:
        simulation_frame = int(data["frames"][sample])
        index = min(
            len(inputs["frames"]) - 1,
            max(0, simulation_frame - native["schedule"]["warmup_end"]),
        )
        frame = float(inputs["frames"][index])
        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        result, row = correct_frame(
            data["panels"][sample], data["faces"], inputs["anchors"], body, top, limit
        )
        row.update(simulation_frame=simulation_frame, source_frame=frame)
        report["samples"].append(row)
        if result is not None:
            assert (
                np.max(np.linalg.norm(result - data["panels"][sample], axis=1))
                <= limit + 1e-7
            )
            panels.append(result)
            frames.append(simulation_frame)
        if (
            row["trials"]
            or simulation_frame in [1, 11, 21, 31, 41, 51, 61, 71, 91]
            or not row["passed"]
        ):
            print(
                "FOLD_CORRECTIVE_FRAME",
                simulation_frame,
                frame,
                row["passed"],
                row["trials"][-1] if row["trials"] else row["initial"],
                flush=True,
            )
        (output / "fold-corrective.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        if result is None:
            break
    report["passed"] = all(row["passed"] for row in report["samples"])
    report["status"] = (
        "ALL_REQUESTED_STORED_POSES_CLEAR_NOT_PROMOTED"
        if report["passed"]
        else "CORRECTED_PREFIX_ONLY_UNREPAIRED_FRAME"
    )
    report["saved_sample_count"] = len(panels)
    report["last_saved_simulation_frame"] = frames[-1] if frames else None
    report["first_unrepaired_source_frame"] = None if report["passed"] else frame
    if panels:
        if all_frames:
            np.savez_compressed(
                output / "native-panels.npz",
                panels=np.asarray(panels),
                faces=data["faces"],
                frames=frames,
            )
            result_hash = hashlib.sha256(
                (output / "native-panels.npz").read_bytes()
            ).hexdigest()
            report["corrected_panels_sha256"] = result_hash
            # Supply explicit postprocessing provenance to the independent
            # archive inspector; this is never labeled a clear raw simulation.
            inspected_input = {
                "scope": "Native cloth followed by bounded local pose correctives. See fold-corrective.json and the preserved failed raw simulation.",
                "result_kind": "POST_CLOTH_POSE_CORRECTIVES",
                "source_hashes": native["source_hashes"],
                "source_input": native["source_input"],
                "raw_simulation_directory": str(directory.resolve()),
                "raw_native_panels_sha256": native["native_panels_sha256"],
                "schedule": native["schedule"],
                "completed_frame": frames[-1],
                "status": report["status"],
                "native_panels_sha256": result_hash,
                "samples": report["samples"][: len(panels)],
            }
            (output / "native-cloth.json").write_text(
                json.dumps(inspected_input, indent=2) + "\n"
            )
        else:
            np.savez_compressed(
                output / "corrected-endpoint.npz",
                points=panels[-1],
                faces=data["faces"],
                source_frame=frame,
            )
            report["corrected_endpoint_sha256"] = hashlib.sha256(
                (output / "corrected-endpoint.npz").read_bytes()
            ).hexdigest()
    assert (
        hashlib.sha256(source.read_bytes()).hexdigest()
        == native["source_hashes"][source.name]
    )
    (output / "fold-corrective.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        "FOLD_CORRECTIVE",
        report["status"],
        "saved",
        len(panels),
        "attempted",
        len(report["samples"]),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=float, default=0.003)
    parser.add_argument("--all-frames", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.directory, args.output, args.limit, args.all_frames)
