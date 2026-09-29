"""Replace two underarm patches with a welded triangular gusset lattice.

The old patch boundary is retained exactly. A regular interior lattice samples
its piecewise-linear initial surface and prescribed motion. This changes local
connectivity and density while preserving pins and openings. New vertices lie
on the old surface; retriangulation can change the surface between vertices.
Optional bounded fairing changes initial interior heights only. Optional soft
guides pull underarm vertices toward their original prescribed motion.
It is not a sewn fabric pattern or a validated garment.
"""

# Connection map: each new underarm patch shares the original boundary vertex
# indices with the torso/sleeve shell. No overlapping parts or sewing gaps.
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.sparse import eye, lil_matrix
from scipy.sparse.linalg import spsolve
from scipy.spatial import Delaunay


def edges_of(faces):
    return Counter(
        tuple(sorted((int(a), int(b))))
        for face in faces
        for a, b in zip(face, np.roll(face, -1))
    )


def barycentric_xy(points, triangles):
    """Locate points inside the old planar chart; return triangle and weights."""
    matrices = np.stack(
        [triangles[:, 0] - triangles[:, 2], triangles[:, 1] - triangles[:, 2]], axis=2
    )
    inv = np.linalg.inv(matrices)
    uv = np.einsum("tij,ptj->pti", inv, points[:, None] - triangles[None, :, 2])
    weights = np.concatenate([uv, 1 - uv.sum(axis=2, keepdims=True)], axis=2)
    valid = weights.min(axis=2) >= -1e-9
    found = valid.any(axis=1)
    index = valid.argmax(axis=1)
    return found, index, weights[np.arange(len(points)), index]


def recover_boundary(uv, triangles, boundary):
    """Recover boundary segments by convex diagonal flips before clipping."""
    triangles = triangles.tolist()

    def orient(a, b, c):
        u, v = uv[b] - uv[a], uv[c] - uv[a]
        return u[0] * v[1] - u[1] * v[0]

    def crosses(a, b, c, d):
        return (
            orient(a, b, c) * orient(a, b, d) < -1e-20
            and orient(c, d, a) * orient(c, d, b) < -1e-20
        )

    fixed = set()
    for target in boundary:
        a, b = target
        for _ in range(2000):
            adjacent = defaultdict(list)
            for face_id, face in enumerate(triangles):
                for u, v in zip(face, np.roll(face, -1)):
                    adjacent[tuple(sorted((int(u), int(v))))].append(face_id)
            if target in adjacent:
                fixed.add(target)
                break
            options = []
            for (u, v), fs in adjacent.items():
                if len(fs) != 2 or (u, v) in fixed or not crosses(a, b, u, v):
                    continue
                c = next(x for x in triangles[fs[0]] if x not in (u, v))
                d = next(x for x in triangles[fs[1]] if x not in (u, v))
                if not crosses(u, v, c, d):
                    continue
                options.append((crosses(a, b, c, d), u, v, c, d, fs))
            assert options, ("Cannot recover boundary", target)
            _, u, v, c, d, fs = min(options)
            for face_id, face in zip(fs, [(c, d, u), (d, c, v)]):
                triangles[face_id] = face if orient(*face) > 0 else face[::-1]
        else:
            raise AssertionError("Boundary recovery iteration limit")
    return np.asarray(triangles)


def run(
    input_path,
    output,
    spacing,
    smooth,
    fairing_limit,
    guide_weight,
    unbounded_fair_control,
):
    assert 0 <= guide_weight < 1
    assert fairing_limit > 0
    assert smooth >= 0
    assert 0.003 <= spacing <= 0.02
    data = dict(np.load(input_path))
    samples, original_faces = data["panel"], data["faces"]
    points = samples[0]
    radius = ((abs(points[:, 0]) - 0.215) / 0.065) ** 2 + (
        (points[:, 1] + 0.005) / 0.075
    ) ** 2
    selected = (radius < 1) & (points[:, 2] < 1.415) & (points[:, 2] > 1.30)
    retained = np.ones(len(original_faces), dtype=bool)
    new_samples, new_faces, records = [], [], []
    total = len(points)
    for sign in [-1, 1]:
        mask = np.all((selected & (points[:, 0] * sign > 0))[original_faces], axis=1)
        patch = original_faces[mask]
        assert len(patch) > 10
        counts = edges_of(patch)
        boundary_edges = {edge for edge, uses in counts.items() if uses == 1}
        graph = defaultdict(set)
        for a, b in boundary_edges:
            graph[a].add(b)
            graph[b].add(a)
        assert all(len(neighbors) == 2 for neighbors in graph.values())
        start = min(graph)
        loop, previous, current = [], None, start
        while current not in loop:
            loop.append(current)
            choices = sorted(
                graph[current] - ({previous} if previous is not None else set())
            )
            previous, current = current, choices[0]
        assert current == start and len(loop) == len(graph)
        assert not set(np.unique(patch)) & set(data["anchors"])
        chart = points[patch, :2]
        normal = np.cross(
            points[patch[:, 1]] - points[patch[:, 0]],
            points[patch[:, 2]] - points[patch[:, 0]],
        )
        assert np.all(normal[:, 2] < -1e-8), (
            "Patch must be a single downward-facing chart"
        )
        lo, hi = chart.min(axis=(0, 1)), chart.max(axis=(0, 1))
        candidates = np.array(
            [
                (x + (row % 2) * spacing / 2, y)
                for row, y in enumerate(
                    np.arange(lo[1], hi[1], spacing * np.sqrt(3) / 2)
                )
                for x in np.arange(lo[0], hi[0], spacing)
            ]
        )
        found, source_ids, weights = barycentric_xy(candidates, chart)
        # Avoid tiny boundary triangles by keeping new lattice points away from
        # existing boundary segments. The original edge/vertex ring stays fixed.
        a = points[[edge[0] for edge in boundary_edges], :2]
        b = points[[edge[1] for edge in boundary_edges], :2]
        direction = b - a
        alpha = np.clip(
            np.einsum("pei,ei->pe", candidates[:, None] - a, direction)
            / (direction * direction).sum(axis=1),
            0,
            1,
        )
        distance = np.linalg.norm(
            candidates[:, None] - (a + alpha[:, :, None] * direction), axis=2
        ).min(axis=1)
        use = found & (distance > 0.6 * spacing)
        candidates, source_ids, weights = candidates[use], source_ids[use], weights[use]
        assert len(candidates) > 10
        mapped = np.einsum("tvij,vi->tvj", samples[:, patch[source_ids]], weights)
        uv = np.vstack([points[loop, :2], candidates])
        triangles = Delaunay(uv).simplices
        constraints = {
            tuple(sorted((i, (i + 1) % len(loop)))) for i in range(len(loop))
        }
        triangles = recover_boundary(uv, triangles, sorted(constraints))
        center = uv[triangles].mean(axis=1)
        inside, _, _ = barycentric_xy(center, chart)
        triangles = triangles[inside]
        # Delaunay does not promise constrained boundaries: reject if any old
        # boundary segment is missing or an unintended opening was introduced.
        ids = np.concatenate([loop, np.arange(total, total + len(mapped[0]))])
        smoothing_change = 0.0
        if smooth:
            # A screened biharmonic fairing removes inherited small ridges in
            # the initial patch. The shared boundary coordinates stay fixed.
            local_faces = triangles
            neighbors = defaultdict(set)
            for face in local_faces:
                for a, b in zip(face, np.roll(face, -1)):
                    neighbors[int(a)].add(int(b))
                    neighbors[int(b)].add(int(a))
            laplacian = lil_matrix((len(uv), len(uv)))
            for a, ns in neighbors.items():
                laplacian[a, a] = 1
                for b in ns:
                    laplacian[a, b] = -1 / len(ns)
            laplacian = laplacian.tocsr()
            energy = eye(len(uv), format="csr") + smooth * (laplacian.T @ laplacian)
            boundary_count = len(loop)
            original_z = np.concatenate([points[loop, 2], mapped[0, :, 2]])
            free = np.arange(boundary_count, len(uv))
            boundary = np.arange(boundary_count)
            rhs = original_z[free] - energy[free][:, boundary] @ original_z[boundary]
            new_z = spsolve(energy[free][:, free], rhs)
            delta = new_z - original_z[free]
            fade = np.clip(distance[use] / (2 * spacing), 0, 1)
            fade = fade * fade * (3 - 2 * fade)
            if not unbounded_fair_control:
                new_z = (
                    original_z[free]
                    + fairing_limit * np.tanh(delta / fairing_limit) * fade
                )
            smoothing_change = float(np.max(abs(new_z - original_z[free])))
            mapped[0, :, 2] = new_z
        patch_faces = ids[triangles[:, ::-1]]
        new_counts = edges_of(patch_faces)
        assert {
            edge for edge, uses in new_counts.items() if uses == 1
        } == boundary_edges
        assert max(new_counts.values()) == 2
        retained[mask] = False
        new_samples.append(mapped)
        new_faces.extend(patch_faces)
        records.append(
            {
                "side": sign,
                "removed_triangles": len(patch),
                "boundary_vertices": len(loop),
                "new_interior_vertices": len(mapped[0]),
                "new_triangles": len(patch_faces),
                "boundary_shared_exactly": True,
                "max_fairing_displacement_m": smoothing_change,
            }
        )
        total += len(mapped[0])
    all_samples = np.concatenate([samples, *new_samples], axis=1)
    faces = np.concatenate([original_faces[retained], np.asarray(new_faces)])
    used = np.unique(faces)
    remap = np.full(total, -1, dtype=int)
    remap[used] = np.arange(len(used))
    anchors = remap[data["anchors"]]
    assert (anchors >= 0).all()
    assert np.array_equal(all_samples[:, used][:, anchors], samples[:, data["anchors"]])
    result_faces = remap[faces]
    original_boundary = {
        e for e, count in edges_of(original_faces).items() if count == 1
    }
    new_boundary = {e for e, count in edges_of(result_faces).items() if count == 1}
    assert new_boundary == {
        tuple(sorted((int(remap[a]), int(remap[b])))) for a, b in original_boundary
    }
    assert max(edges_of(result_faces).values()) == 2
    data.update(panel=all_samples[:, used], faces=result_faces, anchors=anchors)
    if guide_weight:
        q = data["panel"][0]
        radius = ((abs(q[:, 0]) - 0.21) / 0.065) ** 2 + ((q[:, 2] - 1.365) / 0.095) ** 2
        weights = guide_weight * np.maximum(0, 1 - radius) ** 3
        weights[data["anchors"]] = 0
        data["guide_weights"] = weights
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, **data)
    report = {
        "scope": __doc__,
        "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "spacing_m": spacing,
        "screened_biharmonic_weight": smooth,
        "fairing_limit_m": fairing_limit,
        "unbounded_fair_negative_control": unbounded_fair_control,
        "maximum_requested_guide_weight": guide_weight,
        "soft_guide_vertices": int(np.count_nonzero(data.get("guide_weights", []))),
        "patches": records,
        "vertices": len(used),
        "triangles": len(faces),
        "pins": len(anchors),
        "openings_and_pin_motion_unchanged": True,
        "status": "PENDING_INITIAL_WALL_AND_MOTION_CHECKS",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--spacing", type=float, default=0.008)
    parser.add_argument("--smooth", type=float, default=0)
    parser.add_argument("--fairing-limit", type=float, default=0.003)
    parser.add_argument("--guide-weight", type=float, default=0)
    parser.add_argument("--unbounded-fair-control", action="store_true")
    args = parser.parse_args()
    run(
        args.input,
        args.output,
        args.spacing,
        args.smooth,
        args.fairing_limit,
        args.guide_weight,
        args.unbounded_fair_control,
    )
