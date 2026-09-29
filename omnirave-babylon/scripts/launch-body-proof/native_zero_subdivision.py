"""Resolve conservative native zero-distance CCD with bounded time subdivision.

Every accepted leaf must pass native CCD on the same straight vertex path.
No positive-distance bound substitutes for native CCD, and depth exhaustion
rejects the interval. This refines a query, not the motion or its clearance.
"""

import hashlib
import json
from itertools import pairwise
from pathlib import Path

import ipctk
import numpy as np


def native_zero_path_clear(mesh, start, end, max_depth=4):
    pending = [(start, end, 0.0, 1.0, 0)]
    accepted = []
    queries = 0
    root_clear = None
    deepest = 0
    while pending:
        a, b, lo, hi, depth = pending.pop()
        deepest = max(deepest, depth)
        clear = bool(ipctk.is_step_collision_free(mesh, a, b))
        queries += 1
        if root_clear is None:
            root_clear = clear
        if clear:
            accepted.append([lo, hi])
            continue
        if depth == max_depth:
            return False, {
                "root_native_clear": root_clear,
                "native_queries": queries,
                "maximum_depth": deepest,
                "accepted_intervals": sorted(accepted),
                "unresolved_interval": [lo, hi],
                "reason": "NATIVE_CCD_UNRESOLVED_AT_DEPTH_LIMIT",
            }
        mid = (a + b) * 0.5
        tm = (lo + hi) * 0.5
        pending.extend([(mid, b, tm, hi, depth + 1), (a, mid, lo, tm, depth + 1)])
    intervals = sorted(accepted)
    assert intervals[0][0] == 0 and intervals[-1][1] == 1
    assert all(a[1] == b[0] for a, b in pairwise(intervals))
    return True, {
        "root_native_clear": root_clear,
        "native_queries": queries,
        "maximum_depth": deepest,
        "accepted_intervals": intervals,
        "reason": "ALL_LINEAR_SUBINTERVALS_NATIVE_CLEAR",
    }


def native_zero_controls():
    from linear_separation_bounds import separation_bound

    fixture = (
        Path(__file__).resolve().parents[2]
        / "assets-src/avatars/launch-body-proof/outfit04-native-zero-subdivision-fixture.json"
    )
    recorded = json.loads(fixture.read_text())
    a = np.asarray(recorded["start_points_m"])
    b = np.asarray(recorded["end_points_m"])
    edges = np.asarray(recorded["edges"])
    faces = np.empty((0, 3), dtype=int)
    mesh = ipctk.CollisionMesh(a, edges, faces)
    root = bool(ipctk.is_step_collision_free(mesh, a, b))
    refined, statistics = native_zero_path_clear(mesh, a, b)
    unresolved, _ = native_zero_path_clear(mesh, a, b, max_depth=0)
    separated, separation = separation_bound(mesh, a, b, 0.0)
    assert not root and refined and not unresolved and separated
    tunnels = []
    for crossing_time in (0.17, 0.37, 0.73):
        x = np.array(
            [
                [-0.01, 0, 0],
                [0.01, 0, 0],
                [0, -0.01, 0.01 * crossing_time],
                [0, 0.01, 0.01 * crossing_time],
            ]
        )
        y = x.copy()
        y[2:, 2] -= 0.01
        control = ipctk.CollisionMesh(x, edges, faces)
        assert native_zero_path_clear(control, x, x)[0]
        assert native_zero_path_clear(control, y, y)[0]
        assert not native_zero_path_clear(control, x, y)[0]
        tunnels.append(crossing_time)
    # A face/point crossing also has clear endpoints. The isolated point must
    # remain in the collision mesh for this to be a meaningful control.
    x = np.array([[-0.01, -0.01, 0], [0.01, -0.01, 0], [0, 0.01, 0], [0, 0, 0.0037]])
    y = x.copy()
    y[3, 2] = -0.0063
    face = np.array([[0, 1, 2]])
    control = ipctk.CollisionMesh(x, ipctk.edges(face), face)
    assert control.num_vertices == len(x)
    assert native_zero_path_clear(control, x, x)[0]
    assert native_zero_path_clear(control, y, y)[0]
    assert not native_zero_path_clear(control, x, y)[0]
    return {
        "fixture_sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
        "recorded_root_native_rejection_retained": not root,
        "recorded_refined_native_clear": refined,
        "recorded_refinement": statistics,
        "independent_fixture_separation": separation,
        "depth_exhaustion_rejected": not unresolved,
        "off_midpoint_edge_tunnels_rejected_at": tunnels,
        "vertex_face_tunnel_rejected": True,
        "passed": True,
    }
