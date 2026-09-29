"""Export/check temporary actual walls on an early fitting trajectory.

Run --export with local Blender, then --check with the isolated IPC Python.
Quarter-interval samples reconstruct normal-offset walls from the interpolated
coarse surface and evaluate the original nonlinear rig. CCD tests only straight
vertex paths between these samples, not the exact nonlinear trajectory, the
original action, a GLB, or playable motion. No model is saved or promoted.
"""

# Connection map: both wall surfaces share matching coarse faces and opening
# rims. Body/top are immutable source colliders, not stitched into the cloth.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np


def export(args):
    import bpy
    from mathutils import Vector

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from inspect_jacket_ipc import P, WallTransfer, normal_walls, paired_faces
    from surface_crossings import strict_pairs
    from validate_body05_tops import geometry

    source = P / "male-outfit04.blend"
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    data = np.load(args.input)
    result = np.load(args.result)
    solver = json.loads(args.solver_report.read_text())
    assert str(data["source_sha256"]) == source_hash
    assert solver["input_sha256"] == hashlib.sha256(args.input.read_bytes()).hexdigest()
    frames = solver["result_source_frames"]
    coarse = result["panels"]
    assert len(frames) == len(coarse)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    scene.frame_set(31)
    bpy.context.view_layer.update()
    original, original_faces = geometry(bpy.data.objects["Luxury_Bomber rebuilt shell"])
    transfer = WallTransfer(data["panel"][0], data["faces"], original)
    faces = (
        paired_faces(data["faces"], len(coarse[0]))
        if args.wall_construction == "reduced"
        else original_faces
    )

    def walls(x):
        return (
            normal_walls(np.vstack([x, x]), faces, 0.001)[0]
            if args.wall_construction == "reduced"
            else transfer.apply(x)
        )

    samples = [(float(frames[0]), coarse[0])]
    for i in range(1, len(frames)):
        for fraction in [0.25, 0.5, 0.75, 1.0]:
            samples.append(
                (
                    float((1 - fraction) * frames[i - 1] + fraction * frames[i]),
                    (1 - fraction) * coarse[i - 1] + fraction * coarse[i],
                )
            )
    arrays = {"walls": [], "body": [], "top": []}
    strict = []
    for frame, points in samples:
        scene.frame_set(int(frame), subframe=frame - int(frame))
        bpy.context.view_layer.update()
        wall = walls(points)
        arrays["walls"].append(wall)
        strict.append(len(strict_pairs([Vector(p) for p in wall], faces)))
        for label, name in [("body", "AvatarBody"), ("top", "AvatarTop_tailored")]:
            vertices, triangles = geometry(bpy.data.objects[name])
            arrays[label].append(vertices)
            keys = {tuple(sorted(t)) for t in data[label + "_faces"]}
            assert all(tuple(sorted(t)) in keys for t in triangles)
    counts = {}
    directions = {}
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            key = tuple(sorted((int(a), int(b))))
            counts[key] = counts.get(key, 0) + 1
            directions[key] = directions.get(key, 0) + (1 if a < b else -1)
    metadata = {
        "scope": __doc__,
        "wall_construction": args.wall_construction,
        "source_sha256": source_hash,
        "solver_result_sha256": hashlib.sha256(args.result.read_bytes()).hexdigest(),
        "solver_report_sha256": hashlib.sha256(
            args.solver_report.read_bytes()
        ).hexdigest(),
        "vertices": len(arrays["walls"][0]),
        "triangles": len(faces),
        "nonmanifold_edges": sum(v != 2 for v in counts.values()),
        "inconsistent_edge_winding": sum(v != 0 for v in directions.values()),
        "strict_wall_self_pairs": strict,
        "no_models_saved": True,
    }
    assert (
        not metadata["nonmanifold_edges"] and not metadata["inconsistent_edge_winding"]
    )
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    np.savez_compressed(
        args.output,
        **{k: np.asarray(v) for k, v in arrays.items()},
        faces=np.asarray(faces),
        body_faces=data["body_faces"],
        top_faces=data["top_faces"],
        frames=[f for f, _ in samples],
        metadata=json.dumps(metadata),
    )
    print("FINITE_WALL_EXPORT", json.dumps(metadata), flush=True)


def areas(args):
    # Reuse the existing analytically controlled helper inside Blender.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from inspect_panel_ipc import minimum_linear_triangle_area

    flat = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])
    folded = flat.copy()
    folded[2, 1] = -1
    assert abs(minimum_linear_triangle_area(flat, flat, [[0, 1, 2]]) - 0.5) < 1e-12
    assert minimum_linear_triangle_area(flat, folded, [[0, 1, 2]]) < 1e-12
    data = np.load(args.input)
    minima = [
        minimum_linear_triangle_area(a, b, data["faces"])
        for a, b in zip(data["walls"][:-1], data["walls"][1:])
    ]
    report = {
        "scope": "Analytic triangle-area minima along the same sampled linear wall paths as CCD; no nonlinear-motion or garment acceptance.",
        "stationary_and_collapse_controls_passed": True,
        "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "intervals": len(minima),
        "minimum_area_m2": min(minima),
        "passed": min(minima) > 1e-12,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print("FINITE_WALL_AREAS", json.dumps(report), flush=True)
    if args.require_clear:
        assert report["passed"], "Wall triangle collapse detected"


def check(args):
    import ipctk
    from linear_separation_bounds import separation_bound, separation_controls
    from native_zero_subdivision import native_zero_controls, native_zero_path_clear
    from probe_jacket_finite import finite_tolerance_control

    tolerance_control = finite_tolerance_control()
    finite_ccd = ipctk.TightInclusionCCD(tolerance=1e-10)
    separation_control = separation_controls() if args.separation_bounds else None
    zero_control = native_zero_controls()

    data = np.load(args.input)
    meta = json.loads(str(data["metadata"]))
    count = len(data["walls"][0])
    nb = len(data["body"][0])
    faces = np.vstack(
        [data["faces"], data["body_faces"] + count, data["top_faces"] + count + nb]
    )

    def positions(i):
        return np.vstack([data[k][i] for k in ["walls", "body", "top"]]).astype(
            np.float64
        )

    start = positions(0)
    mesh = ipctk.CollisionMesh(start, ipctk.edges(faces), faces)
    active = ipctk.make_static_obstacle_filter(count)
    mesh.can_collide = active
    cross = ipctk.CollisionMesh(start, mesh.edges, faces)
    cross.can_collide = active & ipctk.make_vertex_patches_filter(
        np.r_[np.zeros(count, dtype=int), np.ones(len(start) - count, dtype=int)]
    )
    contacts = ipctk.NormalCollisions()
    rows = []
    transitions = []
    previous = None
    for i, frame in enumerate(data["frames"]):
        x = positions(i)
        contacts.build(cross, x, 0.01)
        distance = float(np.sqrt(contacts.compute_minimum_distance(cross, x)))
        row = {
            "source_frame": float(frame),
            "ipc_wall_intersections": bool(ipctk.has_intersections(mesh, x)),
            "minimum_wall_obstacle_distance_m": distance,
            "strict_wall_self_pairs": meta["strict_wall_self_pairs"][i],
        }
        rows.append(row)
        if previous is not None:
            # Invalid endpoints are recorded, never submitted to a step-size
            # helper that assumes a valid starting configuration.
            valid = (
                not rows[-2]["ipc_wall_intersections"]
                and not row["ipc_wall_intersections"]
            )
            clear, zero_subdivision = (
                native_zero_path_clear(mesh, previous, x)
                if valid
                else (False, {"reason": "INVALID_ENDPOINT"})
            )
            finite = (
                bool(
                    ipctk.is_step_collision_free(
                        cross,
                        previous,
                        x,
                        min_distance=0.0002,
                        narrow_phase_ccd=finite_ccd,
                    )
                )
                if min(distance, rows[-2]["minimum_wall_obstacle_distance_m"]) > 0.0002
                else False
            )
            native_finite = finite
            separating_plane_certificate = None
            if not finite and args.separation_bounds:
                finite, separating_plane_certificate = separation_bound(
                    cross, previous, x, 0.0002
                )
            transitions.append(
                {
                    "start_source_frame": rows[-2]["source_frame"],
                    "end_source_frame": float(frame),
                    "linear_wall_crossing_clear": clear,
                    "native_zero_subdivision": zero_subdivision,
                    "linear_wall_obstacle_0_2mm_clear": finite,
                    "native_linear_wall_obstacle_0_2mm_clear": native_finite,
                    "separating_plane_certificate": separating_plane_certificate,
                }
            )
        previous = x
        print("FINITE_ACTUAL_WALL", json.dumps(row), flush=True)
    passed = all(
        not r["ipc_wall_intersections"]
        and not r["strict_wall_self_pairs"]
        and r["minimum_wall_obstacle_distance_m"] > 0.0002
        for r in rows
    ) and all(
        t["linear_wall_crossing_clear"] and t["linear_wall_obstacle_0_2mm_clear"]
        for t in transitions
    )
    report = {
        "scope": __doc__,
        "construction": meta,
        "finite_ccd_tolerance_control": tolerance_control,
        "independent_separation_controls": separation_control,
        "native_zero_subdivision_controls": zero_control,
        "separation_fallback_enabled": args.separation_bounds,
        "separation_scope": (
            "Full-interval vertex projection certificates; no IPC primitive distance "
            "or fitting Lipschitz routine. IPC swept candidate coverage is shared."
        )
        if args.separation_bounds
        else None,
        "poses": rows,
        "transitions": transitions,
        "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "passed_bounded_wall_checks": passed,
        "status": "BOUNDED_ACTUAL_WALL_CHECKS_CLEAR_NOT_PROMOTED"
        if passed
        else "ACTUAL_WALL_CHECK_FAILED_NOT_PROMOTED",
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    if args.require_clear:
        assert passed, "Actual wall check failed; no model saved"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--export", action="store_true")
    modes.add_argument("--check", action="store_true")
    modes.add_argument(
        "--areas", action="store_true", help="Run analytic wall-area checks in Blender"
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--result", type=Path)
    parser.add_argument("--solver-report", type=Path)
    parser.add_argument(
        "--wall-construction", choices=["original", "reduced"], default="reduced"
    )
    parser.add_argument("--require-clear", action="store_true")
    parser.add_argument(
        "--separation-bounds",
        action="store_true",
        help="Independently certify unresolved finite-distance CCD with separating planes",
    )
    cli = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None
    args = parser.parse_args(cli)
    if args.export:
        assert args.result and args.solver_report
        export(args)
    elif args.areas:
        areas(args)
    else:
        check(args)
