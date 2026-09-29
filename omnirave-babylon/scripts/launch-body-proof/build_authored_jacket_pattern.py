"""Build an independent front/back jacket pattern with rounded sewn edges.

Four planar outlines define two front panels and two back halves. Shared side,
shoulder and sleeve edges weld exactly; the back center joins, while front,
neck, hem and cuffs remain open. Depth is authored analytically. No vertex or
surface is copied or projected from the earlier body-derived jacket.
This is an initial three-dimensional pattern hypothesis, not simulated sewing.
"""

# Connection map: front/back meet on identical outer seam vertices except the
# cuff edges. Mirrored back halves meet on the center seam. Neck, front/hem and
# two cuff openings are intentionally open; there are no overlapping pieces.
import argparse
import hashlib
import json
from collections import defaultdict
from itertools import pairwise
from pathlib import Path

import numpy as np
from rebuild_jacket_underarm_patch import edges_of, recover_boundary
from scipy.spatial import Delaunay

OUTER = np.array(
    [
        [0.205, 1.015],
        [0.205, 1.25],
        [0.215, 1.305],
        [0.235, 1.338],
        [0.270, 1.355],
        [0.53, 1.383],
        [0.744, 1.385],
        [0.744, 1.477],
        [0.53, 1.500],
        [0.28, 1.517],
        [0.18, 1.532],
        [0.095, 1.535],
    ]
)
FRONT = np.array([[0.095, 1.493], [0.043, 1.460], [0.025, 1.390], [0.025, 1.015]])
BACK = np.array([[0.065, 1.514], [0, 1.514], [0, 1.015]])


def inside_polygon(points, polygon):
    inside = np.zeros(len(points), dtype=bool)
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        if abs(a[1] - b[1]) < 1e-12:
            continue
        hit = (a[1] > points[:, 1]) != (b[1] > points[:, 1])
        at_x = (b[0] - a[0]) * (points[:, 1] - a[1]) / (b[1] - a[1]) + a[0]
        inside ^= hit & (points[:, 0] < at_x)
    return inside


def segment_distance(points, a, b):
    edge = b - a
    alpha = np.clip(
        np.einsum("pei,ei->pe", points[:, None] - a, edge)
        / np.sum(edge * edge, axis=1),
        0,
        1,
    )
    return np.linalg.norm(points[:, None] - (a + alpha[:, :, None] * edge), axis=2).min(
        axis=1
    )


def surface_depth(chart, front):
    seams = [i for i in range(len(OUTER) - 1) if i != 6]
    d = segment_distance(chart, OUTER[seams], OUTER[np.asarray(seams) + 1])
    x = chart[:, 0]
    depth = np.interp(
        x,
        [0, 0.18, 0.30, 0.55, 0.744],
        [0.145 if front else 0.130, 0.145 if front else 0.130, 0.078, 0.065, 0.043],
    )
    radius = np.interp(
        x, [0, 0.18, 0.30, 0.55, 0.744], [0.09, 0.09, 0.068, 0.058, 0.046]
    )
    t = np.clip(d / radius, 0, 1)
    section = np.sqrt(np.maximum(0, 2 * t - t * t))
    section[d < 1e-9] = 0
    return -0.020 + (-1 if front else 1) * depth * section


def refine_surface(points, faces, labels, records, max_edge):
    """Split long 3D edges and evaluate midpoints on the authored surface."""
    points = points.tolist()
    faces = faces.tolist()
    labels = list(labels)
    for iteration in range(12):
        edges = {}
        for face, label in zip(faces, labels):
            for a, b in zip(face, np.roll(face, -1)):
                key = tuple(sorted((int(a), int(b))))
                if (
                    key in edges
                    or np.linalg.norm(np.asarray(points[a]) - points[b]) <= max_edge
                ):
                    continue
                midpoint = (np.asarray(points[a]) + points[b]) * 0.5
                chart = np.array([[abs(midpoint[0]), midpoint[2]]])
                midpoint[1] = surface_depth(chart, records[label]["front"])[0]
                edges[key] = len(points)
                points.append(midpoint.tolist())
        if not edges:
            return np.asarray(points), np.asarray(faces), np.asarray(labels), iteration
        next_faces, next_labels = [], []
        for face, label in zip(faces, labels):
            mids = [
                edges.get(tuple(sorted((int(a), int(b)))))
                for a, b in zip(face, np.roll(face, -1))
            ]
            count = sum(m is not None for m in mids)
            if count == 0:
                additions = [face]
            elif count == 1:
                i = next(i for i, m in enumerate(mids) if m is not None)
                a, b, c = [face[(i + j) % 3] for j in range(3)]
                m = mids[i]
                additions = [(a, m, c), (m, b, c)]
            elif count == 2:
                i = next(
                    i
                    for i in range(3)
                    if mids[i] is not None and mids[(i + 1) % 3] is not None
                )
                a, b, c = [face[(i + j) % 3] for j in range(3)]
                m, n = mids[i], mids[(i + 1) % 3]
                additions = [(m, b, n), (a, m, n), (a, n, c)]
            else:
                a, b, c = face
                m, n, o = mids
                additions = [(a, m, o), (m, b, n), (o, n, c), (m, n, o)]
            next_faces.extend(additions)
            next_labels.extend([label] * len(additions))
        faces, labels = next_faces, next_labels
    raise AssertionError("Authored surface edge refinement did not converge")


def curved_chart(polygon, front, spacing):
    """Sample physical arc length across rounded panel seams, not flat XZ."""
    boundary = []
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        t = np.linspace(0, 1, 1001)
        chart = a + t[:, None] * (b - a)
        world = np.column_stack([chart[:, 0], surface_depth(chart, front), chart[:, 1]])
        arc = np.concatenate(
            [[0], np.cumsum(np.linalg.norm(np.diff(world, axis=0), axis=1))]
        )
        count = max(1, int(np.ceil(arc[-1] / spacing)))
        parameter = np.interp(np.arange(count) * arc[-1] / count, arc, t)
        boundary.extend(a + parameter[:, None] * (b - a))
    boundary = np.asarray(boundary)
    candidates = []
    for edge_id in range(len(OUTER) - 1):
        if edge_id == 6:
            continue
        a, b = OUTER[edge_id : edge_id + 2]
        edge = b - a
        normal = np.array([-edge[1], edge[0]]) / np.linalg.norm(edge)
        count = max(1, int(np.ceil(np.linalg.norm(edge) / spacing)))
        for row in range(1, 20):
            for j in range(count):
                base = a + (j + (0.5 if row % 2 else 0.0)) / count * edge
                depth = np.interp(
                    base[0],
                    [0, 0.18, 0.30, 0.55, 0.744],
                    [
                        0.145 if front else 0.130,
                        0.145 if front else 0.130,
                        0.078,
                        0.065,
                        0.043,
                    ],
                )
                radius = np.interp(
                    base[0],
                    [0, 0.18, 0.30, 0.55, 0.744],
                    [0.09, 0.09, 0.068, 0.058, 0.046],
                )
                angle = row * spacing * np.sqrt(3) / (2 * max(depth, radius))
                if angle < np.pi / 2:
                    candidates.append(base + normal * radius * (1 - np.cos(angle)))
    lo, hi = polygon.min(axis=0), polygon.max(axis=0)
    candidates.extend(
        (x + row % 2 * spacing / 2, z)
        for row, z in enumerate(np.arange(lo[1], hi[1], spacing * np.sqrt(3) / 2))
        for x in np.arange(lo[0], hi[0], spacing)
    )
    candidates = np.asarray(candidates)
    candidates = candidates[inside_polygon(candidates, polygon)]
    world = np.column_stack(
        [candidates[:, 0], surface_depth(candidates, front), candidates[:, 1]]
    )
    accepted = np.empty((len(boundary) + len(world), 3))
    accepted[: len(boundary)] = np.column_stack(
        [boundary[:, 0], surface_depth(boundary, front), boundary[:, 1]]
    )
    size = len(boundary)
    kept = []
    for point, position in zip(candidates, world):
        if (
            np.min(np.sum((accepted[:size] - position) ** 2, axis=1))
            > (0.60 * spacing) ** 2
        ):
            accepted[size] = position
            kept.append(point)
            size += 1
    return boundary, np.vstack([boundary, np.asarray(kept)])


def run(output, spacing, max_edge, coarse_control, curved_lattice):
    assert 0.015 <= max_edge <= 0.05
    assert 0.008 <= spacing <= 0.025
    all_points, all_faces, panel_labels = [], [], []
    lookup = {}
    records = []
    for front in [True, False]:
        polygon = np.vstack([OUTER, FRONT if front else BACK])
        if curved_lattice:
            boundary, chart = curved_chart(polygon, front, spacing)
        else:
            boundary = []
            for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
                count = max(1, int(np.ceil(np.linalg.norm(b - a) / spacing)))
                boundary.extend(a + (b - a) * i / count for i in range(count))
            boundary = np.asarray(boundary)
            lo, hi = polygon.min(axis=0), polygon.max(axis=0)
            grid = np.array(
                [
                    (x + row % 2 * spacing / 2, z)
                    for row, z in enumerate(
                        np.arange(lo[1], hi[1], spacing * np.sqrt(3) / 2)
                    )
                    for x in np.arange(lo[0], hi[0], spacing)
                ]
            )
            distance = segment_distance(grid, polygon, np.roll(polygon, -1, axis=0))
            grid = grid[inside_polygon(grid, polygon) & (distance > spacing * 0.55)]
            chart = np.vstack([boundary, grid])
        constraints = sorted(
            tuple(sorted((i, (i + 1) % len(boundary)))) for i in range(len(boundary))
        )
        faces = recover_boundary(chart, Delaunay(chart).simplices, constraints)
        faces = faces[inside_polygon(chart[faces].mean(axis=1), polygon)]
        # Qhull may create near-zero-area fans along long sampled straight
        # seams. Remove those slivers and split the remaining boundary edges
        # at every original collinear seam vertex, preserving the shared seam.
        tri = chart[faces]
        u, v = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
        faces = faces[abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0]) > 1e-10].tolist()
        for _ in range(len(boundary)):
            counts = edges_of(faces)
            replacement = None
            for face_id, face in enumerate(faces):
                for a, b in zip(face, np.roll(face, -1)):
                    if counts[tuple(sorted((int(a), int(b))))] != 1:
                        continue
                    edge = chart[b] - chart[a]
                    alpha = (boundary - chart[a]) @ edge / (edge @ edge)
                    distance = np.linalg.norm(
                        boundary - (chart[a] + alpha[:, None] * edge), axis=1
                    )
                    middle = np.flatnonzero(
                        (distance < 1e-9) & (alpha > 1e-6) & (alpha < 1 - 1e-6)
                    )
                    if len(middle):
                        chain = [a, *middle[np.argsort(alpha[middle])], b]
                        third = next(c for c in face if c not in (a, b))
                        replacement = (
                            face_id,
                            [(u, v, third) for u, v in pairwise(chain)],
                        )
                        break
                if replacement:
                    break
            if replacement is None:
                break
            face_id, additions = replacement
            faces[face_id : face_id + 1] = additions
        faces = np.asarray(faces)
        assert {edge for edge, count in edges_of(faces).items() if count == 1} == set(
            constraints
        )
        y = surface_depth(chart, front)
        for sign in [-1, 1]:
            points = np.column_stack([sign * chart[:, 0], y, chart[:, 1]])
            ids = []
            for point in points:
                key = tuple(np.round(point, 9))
                if key not in lookup:
                    lookup[key] = len(all_points)
                    all_points.append(point)
                ids.append(lookup[key])
            panel_faces = np.asarray(ids)[faces]
            if (front and sign == -1) or (not front and sign == 1):
                panel_faces = panel_faces[:, ::-1]
            all_faces.extend(panel_faces)
            panel_labels.extend([len(records)] * len(panel_faces))
            records.append(
                {
                    "front": front,
                    "side": sign,
                    "chart_vertices": len(chart),
                    "triangles": len(faces),
                }
            )
    points, faces = np.asarray(all_points), np.asarray(all_faces)
    refinement_iterations = 0
    if not coarse_control:
        points, faces, panel_labels, refinement_iterations = refine_surface(
            points, faces, panel_labels, records, max_edge
        )
    counts = edges_of(faces)
    assert max(counts.values()) == 2
    directions = defaultdict(list)
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            directions[tuple(sorted((int(a), int(b))))].append((int(a), int(b)))
    assert all(len(ds) == 1 or ds[0] == ds[1][::-1] for ds in directions.values())
    graph = defaultdict(set)
    for (a, b), count in counts.items():
        if count == 1:
            graph[a].add(b)
            graph[b].add(a)
    assert all(len(ns) == 2 for ns in graph.values())
    seen, loops = set(), []
    for start in graph:
        if start in seen:
            continue
        pending, loop = [start], []
        while pending:
            v = pending.pop()
            if v in seen:
                continue
            seen.add(v)
            loop.append(v)
            pending.extend(graph[v] - seen)
        loops.append(loop)
    assert len(loops) == 3, [len(loop) for loop in loops]
    normals = np.cross(
        points[faces[:, 1]] - points[faces[:, 0]],
        points[faces[:, 2]] - points[faces[:, 0]],
    )
    assert np.linalg.norm(normals, axis=1).min() > 1e-8
    edge_lengths = np.asarray(
        [np.linalg.norm(points[a] - points[b]) for a, b in counts]
    )
    side_lengths = np.linalg.norm(
        points[faces] - np.roll(points[faces], 1, axis=1), axis=2
    )
    quality = (
        2
        * np.sqrt(3)
        * np.linalg.norm(normals, axis=1)
        / np.sum(side_lengths**2, axis=1)
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        points=points,
        faces=faces,
        anchors=sorted(graph),
        panel_labels=panel_labels,
    )
    report = {
        "scope": __doc__,
        "spacing_m": spacing,
        "max_edge_m": max_edge,
        "coarse_geometry_control": coarse_control,
        "curved_lattice": curved_lattice,
        "refinement_iterations": refinement_iterations,
        "outline_xz_m": {
            "outer": OUTER.tolist(),
            "front": FRONT.tolist(),
            "back": BACK.tolist(),
        },
        "panels": records,
        "edge_quantiles_m": np.quantile(edge_lengths, [0, 0.01, 0.1, 0.5, 1]).tolist(),
        "triangle_quality_quantiles": np.quantile(
            quality, [0, 0.01, 0.1, 0.5, 1]
        ).tolist(),
        "vertices": len(points),
        "triangles": len(faces),
        "boundary_loop_counts": [len(loop) for loop in loops],
        "boundary_anchors": len(graph),
        "bounds_m": [points.min(axis=0).tolist(), points.max(axis=0).tolist()],
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "status": "PENDING_BODY_SHIRT_WALL_AND_MOTION_CHECKS",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {
                k: report[k]
                for k in [
                    "vertices",
                    "triangles",
                    "boundary_loop_counts",
                    "bounds_m",
                    "status",
                ]
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--spacing", type=float, default=0.016)
    parser.add_argument("--max-edge", type=float, default=0.03)
    parser.add_argument("--refine-control", action="store_true")
    parser.add_argument("--uniform-chart-control", action="store_true")
    args = parser.parse_args()
    run(
        args.output,
        args.spacing,
        args.max_edge,
        not args.refine_control,
        not args.uniform_chart_control,
    )
