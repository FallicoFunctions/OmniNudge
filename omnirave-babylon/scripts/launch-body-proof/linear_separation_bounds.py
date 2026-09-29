"""Continuous separating-plane certificates for IPC's swept candidates.

Independent of IPC primitive distances and the fitting Lipschitz routine.
A fixed unit axis separates two convex primitives throughout a linear time
interval if every vertex-pair projection exceeds the gap at both endpoints.
Midpoint geometry proposes axes only; endpoint inequalities certify the entire
interval. Unresolved intervals subdivide, then reject at the depth limit.
IPC broad-phase candidate coverage is still shared with the other checks.
"""

import ipctk
import numpy as np


def axes_for(a, b):
    axes = [y - x for x in a for y in b]
    edges_a = (
        [(a[0], a[1])]
        if len(a) == 2
        else (list(zip(a, np.roll(a, -1, axis=0))) if len(a) == 3 else [])
    )
    edges_b = (
        [(b[0], b[1])]
        if len(b) == 2
        else (list(zip(b, np.roll(b, -1, axis=0))) if len(b) == 3 else [])
    )
    for points in [a, b]:
        if len(points) == 3:
            axes.append(np.cross(points[1] - points[0], points[2] - points[0]))
    for edges, other in [(edges_a, b), (edges_b, a)]:
        for x, y in edges:
            direction = y - x
            length2 = np.dot(direction, direction)
            if length2 > 1e-24:
                for point in other:
                    delta = point - x
                    axes.append(delta - direction * np.dot(delta, direction) / length2)
    for x, y in edges_a:
        for u, v in edges_b:
            axes.append(np.cross(y - x, v - u))
    axes = np.asarray(axes)
    lengths = np.linalg.norm(axes, axis=1)
    valid = lengths > 1e-12
    return axes[valid] / lengths[valid, None]


def projected_interval_gap(start, end, split):
    middle = (start + end) * 0.5
    axes = axes_for(middle[:split], middle[split:])
    if not len(axes):
        return -np.inf
    # Each pair difference is affine in time. Testing both endpoints bounds
    # all times, including when different vertices attain the support value.
    differences = np.concatenate(
        [
            (points[split:, None, :] - points[None, :split, :]).reshape(-1, 3)
            for points in [start, end]
        ]
    )
    projection = differences @ axes.T
    return float(np.max(np.maximum(projection.min(axis=0), -projection.max(axis=0))))


def separation_bound(mesh, start, end, gap, max_depth=12):
    start, end = np.asfortranarray(start), np.asfortranarray(end)
    edges, faces = np.asfortranarray(mesh.edges), np.asfortranarray(mesh.faces)
    margin = 1e-9
    candidates = ipctk.Candidates()
    candidates.build(mesh, start, end, inflation_radius=gap + margin)
    statistics = {
        "candidates": len(candidates),
        "intervals_tested": 0,
        "maximum_depth": 0,
        "minimum_certified_projection_m": None,
        "distance_margin_m": margin,
    }
    minimum = np.inf
    for i in range(len(candidates)):
        candidate = candidates[i]
        a = np.asarray(candidate.dof(start, edges, faces)).reshape(-1, 3)
        delta = np.asarray(candidate.dof(end, edges, faces)).reshape(-1, 3) - a
        # IPC point/edge and point/face dofs put the point first.
        split = 2 if isinstance(candidate, ipctk.EdgeEdgeCandidate) else 1
        pending = [(0.0, 1.0, 0)]
        while pending:
            lo, hi, depth = pending.pop()
            statistics["intervals_tested"] += 1
            statistics["maximum_depth"] = max(statistics["maximum_depth"], depth)
            bound = projected_interval_gap(a + lo * delta, a + hi * delta, split)
            if np.isfinite(bound) and bound > gap + margin:
                minimum = min(minimum, bound)
                statistics["minimum_certified_projection_m"] = float(minimum)
                continue
            if depth >= max_depth:
                statistics["reason"] = "NO_SEPARATING_PLANE_CERTIFICATE"
                return False, statistics
            mid = (lo + hi) * 0.5
            pending.extend([(lo, mid, depth + 1), (mid, hi, depth + 1)])
    statistics["reason"] = "ALL_CANDIDATE_INTERVALS_SEPARATED"
    return True, statistics


def separation_controls():
    edges = np.array([[0, 1], [2, 3]])
    empty = np.empty((0, 3), dtype=int)
    start = np.array([[-0.01, 0, 0], [0.01, 0, 0], [0, -0.01, 0.001], [0, 0.01, 0.001]])
    mesh = ipctk.CollisionMesh(start, edges, empty)
    end = start + [0.012, 0.005, 0.003]
    clear, _ = separation_bound(mesh, start, end, 0.0007)
    assert clear
    for when in [0.13, 0.37, 0.81]:
        start[2:, 2] = when * 0.01
        end = start.copy()
        end[2:, 2] -= 0.01
        assert not separation_bound(mesh, start, end, 0.0002)[0]
    start[2:, 2] = 0.001
    end = start.copy()
    end[2:, 0] += 0.03
    end[2:, 2] = -0.001
    # A clear route around the segment endpoint needs changing certificate
    # axes. Insufficient subdivision must reject, never fall back to samples.
    assert separation_bound(mesh, start, end, 0.0002)[0]
    assert not separation_bound(mesh, start, end, 0.0002, max_depth=0)[0]
    triangle = np.array(
        [[-0.01, -0.01, 0], [0.01, -0.01, 0], [0, 0.01, 0], [0, 0, 0.0037]]
    )
    faces = np.array([[0, 1, 2]])
    mesh = ipctk.CollisionMesh(triangle, ipctk.edges(faces), faces)
    end = triangle.copy()
    end[3, 2] = -0.0063
    assert not separation_bound(mesh, triangle, end, 0.0002)[0]
    opposed = np.array([[-1.0, -1, 0], [1, -1, 0], [0, 1, 0], [0, 0, 0.6375]])
    opposed_end = opposed.copy()
    opposed_end[0, 2] = 1
    opposed_end[3, 2] -= 1
    opposed_mesh = ipctk.CollisionMesh(opposed, ipctk.edges(faces), faces)
    assert not separation_bound(opposed_mesh, opposed, opposed_end, 0.0002)[0]
    # Coplanar edge crossing has no separating axis even at a stationary time.
    start[2:, 2] = 0
    assert projected_interval_gap(start, start, 2) <= 0
    return {
        "rigid_clear_sweep_passed": True,
        "three_off_midpoint_edge_tunnels_rejected": True,
        "vertex_face_tunnel_rejected": True,
        "opposed_point_face_motion_rejected": True,
        "stationary_crossing_rejected": True,
        "clear_sweep_with_subdivision_passed": True,
        "unresolved_clear_sweep_rejected": True,
        "no_ipc_distance_queries_used": True,
        "passed": True,
    }
