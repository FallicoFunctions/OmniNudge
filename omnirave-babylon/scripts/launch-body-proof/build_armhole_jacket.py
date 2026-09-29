"""Author a structured open jacket with welded armholes and sleeve ring topology.

The torso and sleeves are independently proportioned around measured T-pose
landmarks. Explicit shared armhole loops connect them. No old garment surface,
cloth cache, or body vertices define this construction. Weights are authored
by garment regions and must be checked through the intended action range.
"""

# Connection map: torso side-hole boundaries are reused by the sleeve lofts;
# every sleeve ring connects with shared quad edges, never overlapping shells.
# Front/neck/hem form one opening and the two sleeve cuffs remain open.
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from itertools import pairwise
from pathlib import Path

import numpy as np


def smooth(value):
    t = np.clip(value, 0, 1)
    return t * t * (3 - 2 * t)


def build(dense=False, high_armhole=False):
    heights = np.array(
        [1.015, 1.04, 1.10, 1.18, 1.26, 1.32, 1.35, 1.38, 1.41, 1.44, 1.47, 1.49, 1.515]
    )
    radii = np.array(
        [
            0.16,
            0.16,
            0.165,
            0.17,
            0.18,
            0.185,
            0.19,
            0.195,
            0.195,
            0.19,
            0.175,
            0.135,
            0.088,
        ]
    )
    front = np.array(
        [
            0.14,
            0.14,
            0.14,
            0.14,
            0.145,
            0.145,
            0.15,
            0.15,
            0.145,
            0.135,
            0.12,
            0.10,
            0.078,
        ]
    )
    back = np.array(
        [0.12, 0.12, 0.12, 0.12, 0.12, 0.125, 0.13, 0.13, 0.13, 0.13, 0.13, 0.12, 0.105]
    )
    factor = 2 if dense else 1
    if high_armhole:
        old_heights = heights.copy()
        heights = np.unique(np.r_[heights, 1.37, 1.475])
        radii = np.interp(heights, old_heights, radii)
        front = np.interp(heights, old_heights, front)
        back = np.interp(heights, old_heights, back)
    if dense:
        original_heights = heights.copy()
        heights = np.concatenate(
            [
                np.linspace(a, b, int(np.ceil((b - a) / 0.025)) + 1)[:-1]
                for a, b in pairwise(heights)
            ]
            + [heights[-1:]]
        )
        radii = np.interp(heights, original_heights, radii)
        front = np.interp(heights, original_heights, front)
        back = np.interp(heights, original_heights, back)
    angular = np.arange(factor, 48 * factor - factor + 1) * np.pi / (24 * factor)
    points, quads, records = [], [], []
    lookup = {}
    for i, z in enumerate(heights):
        for j, angle in enumerate(angular, start=factor):
            lookup[i, j] = len(points)
            points.append(
                [
                    radii[i] * np.sin(angle),
                    -0.02
                    - (front[i] if np.cos(angle) > 0 else back[i]) * np.cos(angle),
                    z,
                ]
            )
            records.append(
                {"region": "torso", "arm": 0.0, "side": "l" if j < 24 * factor else "r"}
            )
    hole_bottom, hole_top = (1.37, 1.475) if high_armhole else (1.35, 1.49)
    lower, upper = (
        int(np.flatnonzero(heights == hole_bottom)[0]),
        int(np.flatnonzero(heights == hole_top)[0]),
    )
    for i in range(len(heights) - 1):
        for j in range(factor, 48 * factor - factor):
            if lower <= i < upper and (
                8 * factor <= j < 16 * factor or 32 * factor <= j < 40 * factor
            ):
                continue
            quads.append(
                [lookup[i, j], lookup[i, j + 1], lookup[i + 1, j + 1], lookup[i + 1, j]]
            )
    armholes = {}
    for side, start, end, sign in [
        ("l", 8 * factor, 16 * factor, 1),
        ("r", 32 * factor, 40 * factor, -1),
    ]:
        boundary = (
            [(lower, j) for j in range(start, end + 1)]
            + [(i, end) for i in range(lower + 1, upper + 1)]
            + [(upper, j) for j in range(end - 1, start - 1, -1)]
            + [(i, start) for i in range(upper - 1, lower, -1)]
        )
        loop = [lookup[q] for q in boundary]
        hole = np.asarray([points[v] for v in loop])
        phi = np.unwrap(
            np.arctan2((hole[:, 2] - 1.425) / 0.065, (hole[:, 1] + 0.02) / 0.09)
        )
        boundary_arm = 0.35 * smooth(
            (hole[:, 2] - hole_bottom) / (hole_top - hole_bottom)
        )
        for vertex, share in zip(loop, boundary_arm):
            records[vertex].update(region="armhole", side=side, arm=float(share))
        armholes[side] = loop.copy()
        previous = loop
        specifications = [
            (0.28, 0.064, 0.07, 0.055, 0.33),
            (0.28, 0.064, 0.07, 0.055, 0.67),
            (0.28, 0.064, 0.07, 0.055, 1.0),
            (0.34, 0.064, 0.067, 0.054, 1.0),
            (0.40, 0.064, 0.063, 0.053, 1.0),
            (0.43, 0.061, 0.06, 0.052, 1.0),
            (0.45553, 0.060, 0.058, 0.051, 1.0),
            (0.48, 0.060, 0.055, 0.050, 1.0),
            (0.51, 0.058, 0.052, 0.048, 1.0),
            (0.56, 0.055, 0.047, 0.045, 1.0),
            (0.62, 0.047, 0.040, 0.04, 1.0),
            (0.68, 0.040, 0.035, 0.035, 1.0),
            (0.73, 0.034, 0.031, 0.030, 1.0),
            (0.744, 0.032, 0.030, 0.029, 1.0),
        ]
        if dense:
            original_specs = np.asarray(specifications[2:])
            samples = np.concatenate(
                [
                    np.linspace(a, b, int(np.ceil((b - a) / 0.025)) + 1)[:-1]
                    for a, b in zip(original_specs[:, 0], original_specs[1:, 0])
                ]
                + [original_specs[-1:, 0]]
            )
            specifications = specifications[:2] + [
                tuple(
                    [x]
                    + [
                        float(np.interp(x, original_specs[:, 0], original_specs[:, k]))
                        for k in range(1, 5)
                    ]
                )
                for x in samples
            ]
        for ring, (x, rf, rb, rz, blend) in enumerate(specifications):
            target = np.column_stack(
                [
                    np.full(len(phi), sign * x),
                    -0.02222 + np.where(np.cos(phi) < 0, rf, rb) * np.cos(phi),
                    1.42929 + rz * np.sin(phi),
                ]
            )
            current_points = hole * (1 - blend) + target * blend if ring < 3 else target
            current = []
            for k, point in enumerate(current_points):
                current.append(len(points))
                points.append(point.tolist())
                records.append(
                    {
                        "region": "sleeve",
                        "side": side,
                        "arm": float(boundary_arm[k] * (1 - blend) + blend),
                        "ring": ring,
                        "radial": k,
                    }
                )
            for k in range(len(loop)):
                n = (k + 1) % len(loop)
                quads.append([previous[k], previous[n], current[n], current[k]])
            previous = current
    used = sorted({v for q in quads for v in q})
    remap = {v: i for i, v in enumerate(used)}
    points = np.asarray(points)[used]
    quads = np.asarray([[remap[v] for v in q] for q in quads])
    records = [records[v] for v in used]
    armholes = {side: [remap[v] for v in loop] for side, loop in armholes.items()}
    edges = Counter(
        tuple(sorted((int(a), int(b))))
        for q in quads
        for a, b in zip(q, np.roll(q, -1))
    )
    assert max(edges.values()) == 2
    neighbors = defaultdict(list)
    for (a, b), count in edges.items():
        if count == 1:
            neighbors[a].append(b)
            neighbors[b].append(a)
    assert all(len(n) == 2 for n in neighbors.values())
    remaining = set(neighbors)
    openings = []
    while remaining:
        todo = [min(remaining)]
        loop = set()
        while todo:
            v = todo.pop()
            if v in loop:
                continue
            loop.add(v)
            todo.extend(neighbors[v])
        remaining -= loop
        openings.append(sorted(loop))
    assert len(openings) == 3
    weights = []
    for p, record in zip(points, records):
        x, _, z = p
        side = record["side"]
        arm = record["arm"]
        elbow = float(smooth((abs(x) - 0.405) / 0.10))
        hand = float(smooth((abs(x) - 0.72) / 0.04))
        upper_spine = float(smooth((z - 1.16) / 0.11))
        w = {
            "spine_02": (1 - arm) * (1 - upper_spine),
            "spine_03": (1 - arm) * upper_spine,
            f"upperarm_{side}": arm * (1 - elbow),
            f"lowerarm_{side}": arm * elbow * (1 - hand),
            f"hand_{side}": arm * elbow * hand,
        }
        w = {k: float(v) for k, v in w.items() if v > 1e-8}
        total = sum(w.values())
        weights.append({k: v / total for k, v in w.items()})
        assert len(w) <= 4
    return points, quads, records, weights, armholes, openings


def run(output, dense=False, high_armhole=False):
    points, quads, records, weights, armholes, openings = build(dense, high_armhole)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, points=points, quads=quads)
    report = {
        "scope": __doc__,
        "vertices": len(points),
        "quads": len(quads),
        "armhole_loop_vertices": {k: len(v) for k, v in armholes.items()},
        "opening_loop_vertices": [len(v) for v in openings],
        "weights": weights,
        "vertex_records": records,
        "armholes": armholes,
        "bounds_m": [points.min(axis=0).tolist(), points.max(axis=0).tolist()],
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "accepted": False,
        "dense_fitting_grid": dense,
        "high_armhole": high_armhole,
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        "ARMHOLE_JACKET",
        {
            k: v
            for k, v in report.items()
            if k not in ["weights", "vertex_records", "armholes", "scope"]
        },
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dense-fitting-grid", action="store_true")
    parser.add_argument("--high-armhole", action="store_true")
    args = parser.parse_args()
    run(args.output, args.dense_fitting_grid, args.high_armhole)
