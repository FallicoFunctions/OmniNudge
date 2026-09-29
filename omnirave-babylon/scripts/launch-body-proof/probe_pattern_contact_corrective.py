"""Probe bounded garment fairing with body and shirt contact projection.

Post-cloth pose correction only. The raw simulation and all original models
remain unchanged. Every candidate needs the complete reconstructed 1 mm wall
screen; nearest-surface projection is a proposal, not a collision guarantee.
"""

# Connection map: the independent pattern's welded seams and openings remain
# unchanged. Contact-seeded vertex neighborhoods move; hard anchors stay exact.
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE
from surface_crossings import strict_pairs
from validate_body05_tops import between, geometry


def project_contacts(
    points, selected, colliders, gap, faces=None, balanced_facets=False
):
    result = points.copy()
    for vertex in selected:
        position = Vector(result[vertex])
        for _ in range(2):
            for number, tree in enumerate(colliders):
                hit, normal, _, distance = tree.find_nearest(position)
                signed = (position - hit).dot(normal)
                if signed < gap and (number == 0 or distance < 0.015):
                    position += normal * min(0.002, gap - signed)
        result[vertex] = position
    if faces is not None:
        free = np.zeros(len(points))
        free[selected] = 1
        active_faces = faces[np.any(free[faces] > 0, axis=1)]
        snapshot = result.copy()
        changes = np.zeros_like(result)
        contributions = np.zeros(len(result))
        for face in active_faces:
            # Edge and interior witnesses constrain facets that bridge across
            # the body while all garment vertices remain outside it.
            for bary in np.asarray(
                [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]]
            ):
                movable = bary * free[face]
                denominator = float(np.dot(movable, movable))
                if denominator < 1e-12:
                    continue
                for number, tree in enumerate(colliders):
                    position = Vector(
                        bary @ (snapshot if balanced_facets else result)[face]
                    )
                    hit, normal, _, distance = tree.find_nearest(position)
                    signed = (position - hit).dot(normal)
                    if signed < gap and (number == 0 or distance < 0.015):
                        correction = np.asarray(normal) * min(0.002, gap - signed)
                        movement = movable[:, None] * correction / denominator
                        if balanced_facets:
                            changes[face] += movement
                            contributions[face] += movable > 0
                        else:
                            result[face] += movement
        if balanced_facets:
            changes /= np.maximum(1, contributions)[:, None]
            length = np.linalg.norm(changes, axis=1)
            changes *= np.minimum(1, 0.0005 / np.maximum(length, 1e-12))[:, None]
            result += changes
    return result


def correct_frame(
    points,
    faces,
    anchors,
    body,
    top,
    limit,
    iterations=60,
    gap=0.001,
    project=True,
    facet_contacts=False,
    failure_output=None,
    balanced_facets=False,
):
    points = points.astype(np.float64)
    initial, walls, wall_faces = screen(points, faces, body, top)
    if initial["passed"]:
        return points.copy(), {
            "initial": initial,
            "selected_vertices": 0,
            "trials": [],
            "passed": True,
        }
    body_points, body_faces = geometry(body)
    top_points, top_faces = geometry(top)
    colliders = [
        BVHTree.FromPolygons(body_points, body_faces, all_triangles=True),
        BVHTree.FromPolygons(
            top_points,
            [f for f in top_faces if max(f) < len(top_points) // 2],
            all_triangles=True,
        ),
    ]
    wall_vectors = [Vector(p) for p in walls]
    hits = strict_pairs(wall_vectors, wall_faces)
    object_hits = between(wall_vectors, wall_faces, body_points, body_faces) + between(
        wall_vectors, wall_faces, top_points, top_faces
    )
    seeds = {
        v % len(points) for pair in hits for face in pair for v in wall_faces[face]
    } | {v % len(points) for face, _ in object_hits for v in wall_faces[face]}
    neighbors = defaultdict(set)
    for a, b, c in faces:
        for u, v in [(a, b), (b, c), (c, a)]:
            neighbors[int(u)].add(int(v))
            neighbors[int(v)].add(int(u))
    weights = np.zeros(len(points))
    seen, frontier = set(), seeds
    for weight in [1.0, 0.65, 0.3]:
        for vertex in frontier:
            weights[vertex] = weight
        seen |= frontier
        frontier = {v for vertex in frontier for v in neighbors[vertex]} - seen
    weights[anchors] = 0
    selected = np.flatnonzero(weights)
    trials, result = [], None
    for factor in [0.15, 0.3]:
        candidate = points.copy()
        for iteration in range(1, iterations + 1):
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
            if project:
                proposed = project_contacts(
                    proposed,
                    selected,
                    colliders,
                    gap,
                    faces if facet_contacts else None,
                    balanced_facets,
                )
            displacement = proposed - points
            lengths = np.linalg.norm(displacement, axis=1)
            displacement *= np.minimum(1, limit / np.maximum(lengths, 1e-12))[:, None]
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
            if iteration in [1, 10, 30, 60]:
                print("CONTACT_CORRECTIVE_TRIAL", row, flush=True)
        if result is not None:
            break
    if result is None and failure_output is not None:
        np.savez_compressed(failure_output, points=candidate, faces=faces)
    return result, {
        "initial": initial,
        "selected_vertices": len(selected),
        "trials": trials,
        "passed": result is not None,
    }


def run(
    directory,
    output,
    sample_frame,
    limit,
    iterations,
    gap,
    project,
    all_frames=False,
    facet_contacts=False,
    balanced_facets=False,
):
    assert 0 < limit <= 0.02 and iterations > 0 and 0 < gap <= 0.005
    output.mkdir(parents=True, exist_ok=True)
    native = json.loads((directory / "native-cloth.json").read_text())
    archive = directory / "native-panels.npz"
    assert (
        hashlib.sha256(archive.read_bytes()).hexdigest()
        == native["native_panels_sha256"]
    )
    input_path = Path(native["source_input"])
    assert (
        hashlib.sha256(input_path.read_bytes()).hexdigest()
        == native["source_hashes"][input_path.name]
    )
    source = SOURCE / "male-outfit04.blend"
    assert (
        hashlib.sha256(source.read_bytes()).hexdigest()
        == native["source_hashes"][source.name]
    )
    data, inputs = np.load(archive), np.load(input_path)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    report = {
        "scope": __doc__,
        "raw_directory": str(directory.resolve()),
        "raw_panels_sha256": native["native_panels_sha256"],
        "source_hashes": native["source_hashes"],
        "displacement_limit_m": limit,
        "projection_gap_m": gap,
        "projection_enabled": project,
        "facet_contacts": facet_contacts,
        "balanced_facets": balanced_facets,
        "maximum_iterations_per_factor": iterations,
        "accepted": False,
        "all_frames": all_frames,
        "samples": [],
    }
    if all_frames:
        selected_samples = range(len(data["frames"]))
    else:
        matches = np.flatnonzero(data["frames"] == sample_frame)
        assert len(matches) == 1
        selected_samples = [int(matches[0])]
    panels, frames = [], []
    for sample in selected_samples:
        simulation_frame = int(data["frames"][sample])
        index = min(
            len(inputs["frames"]) - 1,
            max(0, simulation_frame - native["schedule"]["warmup_end"]),
        )
        frame = float(inputs["frames"][index])
        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
        bpy.context.view_layer.update()
        result, row = correct_frame(
            data["panels"][sample],
            data["faces"],
            inputs["anchors"],
            bpy.data.objects["AvatarBody"],
            bpy.data.objects["AvatarTop_tailored"],
            limit,
            iterations,
            gap,
            project,
            facet_contacts,
            output / "failed-proposal.npz",
            balanced_facets,
        )
        row.update(simulation_frame=simulation_frame, source_frame=frame)
        report["samples"].append(row)
        if result is not None:
            assert (
                np.linalg.norm(result - data["panels"][sample], axis=1).max()
                <= limit + 1e-9
            )
            assert np.array_equal(
                result[inputs["anchors"]], data["panels"][sample][inputs["anchors"]]
            )
            panels.append(result)
            frames.append(simulation_frame)
        print(
            "CONTACT_CORRECTIVE_FRAME",
            simulation_frame,
            frame,
            row["passed"],
            row["trials"][-1] if row["trials"] else row["initial"],
            flush=True,
        )
        (output / "contact-corrective.json").write_text(
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
    report["first_unrepaired_source_frame"] = None if report["passed"] else frame
    if panels and all_frames:
        destination = output / "native-panels.npz"
        np.savez_compressed(
            destination, panels=np.asarray(panels), faces=data["faces"], frames=frames
        )
        report["result_sha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
        inspection_input = {
            "scope": __doc__,
            "result_kind": "POST_CLOTH_CONTACT_CORRECTIVES",
            "source_hashes": native["source_hashes"],
            "source_input": native["source_input"],
            "raw_simulation_directory": str(directory.resolve()),
            "raw_native_panels_sha256": native["native_panels_sha256"],
            "schedule": native["schedule"],
            "completed_frame": frames[-1],
            "status": report["status"],
            "native_panels_sha256": report["result_sha256"],
            "samples": report["samples"][: len(panels)],
        }
        (output / "native-cloth.json").write_text(
            json.dumps(inspection_input, indent=2) + "\n"
        )
    elif panels:
        destination = output / "corrected-endpoint.npz"
        np.savez_compressed(
            destination, points=panels[-1], faces=data["faces"], source_frame=frame
        )
        report["result_sha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
    (output / "contact-corrective.json").write_text(json.dumps(report, indent=2) + "\n")
    assert (
        hashlib.sha256(source.read_bytes()).hexdigest()
        == native["source_hashes"][source.name]
    )
    print(
        "CONTACT_CORRECTIVE_RESULT",
        report["passed"],
        report["status"],
        report["saved_sample_count"],
        report["first_unrepaired_source_frame"],
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sample-frame", type=int, default=54)
    parser.add_argument("--limit", type=float, default=0.003)
    parser.add_argument("--iterations", type=int, default=60)
    parser.add_argument("--gap", type=float, default=0.001)
    parser.add_argument("--no-project-control", action="store_true")
    parser.add_argument("--all-frames", action="store_true")
    parser.add_argument("--facet-contacts", action="store_true")
    parser.add_argument("--balanced-facets", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(
        args.directory,
        args.output,
        args.sample_frame,
        args.limit,
        args.iterations,
        args.gap,
        not args.no_project_control,
        args.all_frames,
        args.facet_contacts,
        args.balanced_facets,
    )
