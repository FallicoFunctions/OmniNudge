"""Fit an offline corrective target using explicit triangle separation proposals.

This target authoring step acts on a posed, structured jacket. It retains cuff
vertices and the original body/shirt, checks actual thickness after every step,
and saves rejected targets as diagnostics. It is not a runtime contact solver.
"""

# Connection map: original torso/armhole/sleeve quad adjacency is unchanged.
# Sculpt displacements are shared by all incident faces; cuff rings stay fixed.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_authored_jacket_pattern import screen
from probe_blender_garment_transfer import SOURCE, new_mesh
from surface_crossings import crossing, strict_pairs
from validate_body05_tops import between, geometry


def separating_shifts(left, right, gap=0.00005):
    a = np.roll(left, -1, axis=1) - left
    b = np.roll(right, -1, axis=1) - right
    axes = np.concatenate(
        [
            np.cross(a[:, 0], a[:, 1])[:, None],
            np.cross(b[:, 0], b[:, 1])[:, None],
            np.cross(a[:, :, None], b[:, None, :]).reshape(-1, 9, 3),
        ],
        axis=1,
    )
    lengths = np.linalg.norm(axes, axis=2)
    valid = lengths > 1e-12
    axes /= np.maximum(lengths, 1e-12)[:, :, None]
    pa = np.einsum("pvi,pai->pav", left, axes)
    pb = np.einsum("pvi,pai->pav", right, axes)
    forward = pb.max(axis=2) - pa.min(axis=2) + gap
    backward = pa.max(axis=2) - pb.min(axis=2) + gap
    distances = np.where(forward < backward, forward, -backward)
    cost = np.where(valid, np.abs(distances), np.inf)
    chosen = np.argmin(cost, axis=1)
    assert np.isfinite(cost[np.arange(len(left)), chosen]).all()
    return (
        axes[np.arange(len(left)), chosen]
        * distances[np.arange(len(left)), chosen, None]
    )


def run(
    pattern,
    posed,
    output,
    sample=61,
    source_frame=1,
    iterations=160,
    fair_contact=False,
    action=None,
    fraction=1,
    native_thickness=False,
):
    a = np.array([[0, 0, 0], [0.04, 0, 0], [0, 0.04, 0.0]])
    b = np.array([[0.01, 0.01, -0.02], [0.01, 0.01, 0.02], [0.025, 0.015, 0]])
    assert crossing([Vector(p) for p in a], [Vector(p) for p in b])
    shift = separating_shifts(a[None], b[None])[0]
    assert not crossing(
        [Vector(p) for p in a + shift * 0.5], [Vector(p) for p in b - shift * 0.5]
    )
    output.mkdir(parents=True, exist_ok=True)
    source = SOURCE / "male-outfit04.blend"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.scene.frame_set(int(source_frame), subframe=source_frame % 1)
    bpy.context.view_layer.update()
    if action:
        from build_bodies import point_bone

        rig = bpy.data.objects["AvatarSkeleton"]
        rig.animation_data.action = None
        upper, lower = {
            "elbow_bend": ((0.5, 0, -0.8660254), (0.08, -1, 0)),
            "forward_reach": ((0.25, -1, 0), (0.15, -1, 0.15)),
            "overhead_reach": ((0.35, 0, 1), (0.15, -0.15, 1)),
        }[action]
        for side, sign in [("l", 1), ("r", -1)]:
            for part, target in [
                ("upperarm", upper),
                ("lowerarm", lower),
                ("hand", lower),
            ]:
                direction = (
                    np.array([sign, 0.0, 0.0]) * (1 - fraction)
                    + np.array([sign * target[0], target[1], target[2]]) * fraction
                )
                point_bone(rig, f"{part}_{side}", direction)
    body, top = bpy.data.objects["AvatarBody"], bpy.data.objects["AvatarTop_tailored"]
    q, u = geometry(body)
    v, t = geometry(top)
    q, u = np.asarray(q), np.asarray(u)
    v, t = np.asarray(v), np.asarray(t)
    raw = np.load(posed)["points"][sample].copy()
    construction = np.load(pattern)
    quads = construction["quads"]
    pins = np.flatnonzero(np.abs(construction["points"][:, 0]) > 0.729)
    free = np.ones(len(raw))
    free[pins] = 0
    obj = new_mesh("Offline corrective target", raw.tolist(), quads.tolist(), [])
    native = None
    if native_thickness:
        native = obj.copy()
        native.data = obj.data
        bpy.context.scene.collection.objects.link(native)
        solidify = native.modifiers.new("Checked 1 mm thickness", "SOLIDIFY")
        solidify.thickness = 0.001
        solidify.offset = 0
        solidify.use_even_offset = False
        solidify.use_quality_normals = False
    neighbors = [set() for _ in raw]
    for quad in quads:
        for a, b in zip(quad, np.roll(quad, -1)):
            neighbors[a].add(b)
            neighbors[b].add(a)
    points = raw.copy()
    rows = []
    for iteration in range(iterations + 1):
        obj.data.vertices.foreach_set("co", points.astype(np.float32).ravel())
        obj.data.update()
        bpy.context.view_layer.update()
        current, faces = geometry(obj)
        current, faces = np.asarray(current), np.asarray(faces)
        row, walls, wall_faces = screen(current, faces, body, top)
        if native:
            npw, nfw = geometry(native)
            actual = {
                "wall_self_pairs": len(strict_pairs(npw, nfw)),
                "wall_body_pairs": len(between(npw, nfw, [Vector(p) for p in q], u)),
                "wall_top_pairs": len(between(npw, nfw, [Vector(p) for p in v], t)),
            }
            actual["passed"] = not any(actual.values())
            row["native_solidify"] = actual
            row["passed"] = row["passed"] and actual["passed"]
            if not actual["passed"]:
                walls = np.asarray(npw)
                wall_faces = nfw
                assert len(walls) == 2 * len(points)
        row.update(
            iteration=iteration,
            maximum_sculpt_displacement_m=float(
                np.linalg.norm(current - raw, axis=1).max()
            ),
        )
        rows.append(row)
        if iteration % 10 == 0 or row["passed"]:
            print("CORRECTIVE_SCULPT", row, flush=True)
        if row["passed"] or iteration == iterations:
            break
        wall_faces = np.asarray(wall_faces)
        vectors = [Vector(p) for p in walls]
        self_pairs = np.asarray(strict_pairs(vectors, wall_faces))
        changes = np.zeros_like(points)
        counts = np.zeros(len(points))
        if len(self_pairs):
            ia, ib = wall_faces[self_pairs[:, 0]], wall_faces[self_pairs[:, 1]]
            shifts = separating_shifts(walls[ia], walls[ib])
            lengths = np.linalg.norm(shifts, axis=1)
            shifts *= np.minimum(1, 0.003 / np.maximum(lengths, 1e-12))[:, None]
            for ids, sign in [(ia, 1), (ib, -1)]:
                ids = ids % len(points)
                np.add.at(
                    changes, ids.ravel(), np.repeat(shifts * sign * 0.5, 3, axis=0)
                )
                np.add.at(counts, ids.ravel(), 1)
        for obstacle_points, obstacle_faces, label in [(q, u, "body"), (v, t, "top")]:
            pairs = np.asarray(
                between(
                    vectors,
                    wall_faces,
                    [Vector(p) for p in obstacle_points],
                    obstacle_faces,
                )
            )
            if not len(pairs):
                continue
            garment = wall_faces[pairs[:, 0]]
            other = obstacle_points[obstacle_faces[pairs[:, 1]]]
            normal = np.cross(other[:, 1] - other[:, 0], other[:, 2] - other[:, 0])
            normal /= np.maximum(np.linalg.norm(normal, axis=1), 1e-12)[:, None]
            if label == "top":
                # Inner shirt walls point inward; project toward the outer side.
                inner = np.min(obstacle_faces[pairs[:, 1]], axis=1) >= len(v) // 2
                normal[inner] *= -1
            signed = np.einsum("pvi,pi->pv", walls[garment] - other[:, None, 0], normal)
            depth = np.minimum(0.003, np.maximum(0, 0.0005 - signed.min(axis=1)))
            shifts = normal * depth[:, None]
            ids = garment % len(points)
            np.add.at(changes, ids.ravel(), np.repeat(shifts * 2, 3, axis=0))
            np.add.at(counts, ids.ravel(), 2)
        changes /= np.maximum(counts, 1)[:, None]
        if fair_contact and len(self_pairs):
            active = {int(v) for v in wall_faces[self_pairs].ravel() % len(points)}
            active |= {v for i in list(active) for v in neighbors[i]}
            for i in active:
                shift = (points[list(neighbors[i])].mean(axis=0) - points[i]) * 0.2
                length = np.linalg.norm(shift)
                changes[i] += shift * min(1, 0.001 / max(length, 1e-12))
        delta = points - raw
        smooth = np.asarray(
            [delta[list(n)].mean(axis=0) - delta[i] for i, n in enumerate(neighbors)]
        )
        proposed = points + free[:, None] * (changes + 0.03 * smooth)
        displacement = proposed - raw
        lengths = np.linalg.norm(displacement, axis=1)
        displacement *= np.minimum(1, 0.08 / np.maximum(lengths, 1e-12))[:, None]
        points = raw + displacement
        assert np.array_equal(points[pins], raw[pins])
    np.savez_compressed(
        output / "sculpted-target.npz",
        points=current,
        quads=quads,
        faces=faces,
        pins=pins,
    )
    report = {
        "scope": __doc__,
        "source_sha256": digest,
        "input_sha256": hashlib.sha256(posed.read_bytes()).hexdigest(),
        "pattern_sha256": hashlib.sha256(pattern.read_bytes()).hexdigest(),
        "native_thickness": native_thickness,
        "action": action,
        "fraction": fraction,
        "fair_contact": fair_contact,
        "sample_index": sample,
        "source_frame": source_frame,
        "passed": row["passed"],
        "accepted": False,
        "synthetic_crossing_separation_passed": True,
        "pinned_cuff_vertices": len(pins),
        "samples": rows,
        "output_sha256": hashlib.sha256(
            (output / "sculpted-target.npz").read_bytes()
        ).hexdigest(),
    }
    (output / "corrective-sculpt.json").write_text(json.dumps(report, indent=2) + "\n")
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", type=Path, required=True)
    parser.add_argument("--posed", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sample", type=int, default=61)
    parser.add_argument("--source-frame", type=float, default=1)
    parser.add_argument("--iterations", type=int, default=160)
    parser.add_argument("--fair-contact", action="store_true")
    parser.add_argument(
        "--action", choices=["elbow_bend", "forward_reach", "overhead_reach"]
    )
    parser.add_argument("--fraction", type=float, default=1)
    parser.add_argument("--native-thickness", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(
        args.pattern,
        args.posed,
        args.output,
        args.sample,
        args.source_frame,
        args.iterations,
        args.fair_contact,
        args.action,
        args.fraction,
        args.native_thickness,
    )
