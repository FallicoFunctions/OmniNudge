"""Conservative finite-clearance bounds for linearly moving IPC candidates.

A segment/triangle's Hausdorff displacement is bounded by its greatest vertex
motion. Thus primitive distance is Lipschitz with speed bounded by the sum of
the two primitives' maximum vertex speeds. Midpoint distance minus speed times
half-interval bounds EVERY time in that interval. Subdivide unresolved cases;
never accept one just because the samples are clear. This numerical check uses
IPC's candidate coverage and distance routines plus a 1 nm safety margin. It
is not a formal exact-arithmetic certificate or a nonlinear-motion guarantee.
"""

import ipctk
import numpy as np


def clearance_bound(
    mesh, start, end, gap, max_depth=12, relative_motion=False, batch_planes=False
):
    start, end = np.asfortranarray(start), np.asfortranarray(end)
    edges, faces = np.asfortranarray(mesh.edges), np.asfortranarray(mesh.faces)
    candidates = ipctk.Candidates()
    # Inflate BOTH primitive boxes by the full gap, conservatively exceeding
    # the half-gap inflation needed to include possible finite contacts.
    margin = 1e-9
    candidates.build(mesh, start, end, inflation_radius=gap + margin)
    certified = np.zeros(len(candidates), dtype=bool)
    if batch_planes:
        from batch_clearance_filter import plane_filter

        # Stencil bindings borrow their C++ storage. Keep the Candidates owner
        # alive while the batch filter reads them.
        stencils = [candidates[i] for i in range(len(candidates))]
        certified = plane_filter(stencils, start, end, edges, faces, gap)
    queries = 0
    deepest = 0
    for i in range(len(candidates)):
        if certified[i]:
            continue
        candidate = candidates[i]
        a = np.asarray(candidate.dof(start, edges, faces)).ravel()
        delta = np.asarray(candidate.dof(end, edges, faces)).ravel() - a
        speed_vertices = np.linalg.norm(delta.reshape(-1, 3), axis=1)
        # IPC dofs are [edge A, edge B] or [POINT, edge/triangle].
        # Grouping the point with face vertices can underestimate relative
        # speed when the point and one face vertex move in opposite directions.
        split = 2 if isinstance(candidate, ipctk.EdgeEdgeCandidate) else 1
        speed = float(max(speed_vertices[:split]) + max(speed_vertices[split:]))
        if relative_motion:
            # Translate BOTH primitives by the same velocity. Their distance
            # is unchanged at every time, but their Hausdorff speed bound can
            # be much smaller when nearby cloth regions travel together.
            # Taking the smaller of two valid upper bounds remains valid.
            velocity = delta.reshape(-1, 3)
            relative_speed = np.linalg.norm(velocity - velocity.mean(axis=0), axis=1)
            speed = min(
                speed, float(max(relative_speed[:split]) + max(relative_speed[split:]))
            )
        pending = [(0.0, 1.0, 0)]
        while pending:
            lo, hi, depth = pending.pop()
            deepest = max(deepest, depth)
            mid = (lo + hi) * 0.5
            squared = candidate.compute_distance(a + mid * delta)
            queries += 1
            distance = float(np.sqrt(max(0.0, squared)))
            if not np.isfinite(distance) or distance <= gap + margin:
                return False, {
                    "candidates": len(candidates),
                    "distance_queries": queries,
                    "maximum_depth": deepest,
                    "reason": "CONTACT_OR_NUMERICAL_MARGIN",
                }
            if distance - speed * (hi - lo) * 0.5 > gap + margin:
                continue
            if depth >= max_depth:
                return False, {
                    "candidates": len(candidates),
                    "distance_queries": queries,
                    "maximum_depth": deepest,
                    "reason": "UNRESOLVED_BOUND",
                }
            pending.extend([(lo, mid, depth + 1), (mid, hi, depth + 1)])
    return True, {
        "candidates": len(candidates),
        "distance_queries": queries,
        "plane_certificates": int(certified.sum()),
        "maximum_depth": deepest,
        "reason": "ALL_CANDIDATE_INTERVALS_BOUNDED_CLEAR",
    }


def bound_controls(fixture, relative_motion=False, batch_planes=False):
    def check(*args, **kwargs):
        kwargs.setdefault("batch_planes", batch_planes)
        return clearance_bound(*args, **kwargs, relative_motion=relative_motion)

    start = np.asarray(fixture["start_points_m"])
    end = np.asarray(fixture["end_points_m"])
    edges = np.asarray(fixture["edges"])
    faces = np.empty((0, 3), dtype=int)
    mesh = ipctk.CollisionMesh(start, edges, faces)
    clear, statistics = check(mesh, start, end, 0.0007)
    assert clear
    # Two perpendicular edges tunnel through each other at t=.37. Endpoints
    # are individually clear. Positive clearance creates a detectable interval.
    a = np.array([[-0.01, 0, 0], [0.01, 0, 0], [0, -0.01, 0.0037], [0, 0.01, 0.0037]])
    b = a.copy()
    b[2:, 2] = -0.0063
    crossing_mesh = ipctk.CollisionMesh(a, edges, faces)
    endpoint_a, _ = check(crossing_mesh, a, a, 0.0007)
    endpoint_b, _ = check(crossing_mesh, b, b, 0.0007)
    tunnel, tunnel_statistics = check(crossing_mesh, a, b, 0.0007)
    assert endpoint_a and endpoint_b and not tunnel
    # A clear parallel sweep needs subdivision to prove its margin. A depth
    # limit must reject uncertainty, even when sampled points happen to clear.
    a[2:, 2] = 0.0008
    crossing_mesh = ipctk.CollisionMesh(a, edges, faces)
    b = a.copy()
    b[2:, 0] += 0.02
    sweep, sweep_statistics = check(crossing_mesh, a, b, 0.0007, batch_planes=False)
    unresolved, _ = check(crossing_mesh, a, b, 0.0007, max_depth=0, batch_planes=False)
    assert sweep and not unresolved and sweep_statistics["maximum_depth"] > 0
    triangle = np.array(
        [[-0.01, -0.01, 0.0], [0.01, -0.01, 0.0], [0.0, 0.01, 0.0], [0.0, 0.0, 0.0037]]
    )
    triangle_faces = np.array([[0, 1, 2]])
    triangle_mesh = ipctk.CollisionMesh(
        triangle, ipctk.edges(triangle_faces), triangle_faces
    )
    below = triangle.copy()
    below[3, 2] = -0.0063
    vertex_face_tunnel, _ = check(triangle_mesh, triangle, below, 0.0007)
    assert not vertex_face_tunnel
    opposed = np.array([[-1.0, -1, 0], [1, -1, 0], [0, 1, 0], [0, 0, 0.6375]])
    opposed_end = opposed.copy()
    opposed_end[0, 2] = 1
    opposed_end[3, 2] -= 1
    opposed_mesh = ipctk.CollisionMesh(
        opposed, ipctk.edges(triangle_faces), triangle_faces
    )
    candidates = ipctk.Candidates()
    candidates.build(opposed_mesh, opposed, opposed_end, inflation_radius=0.0007)
    vertex_faces = [
        candidates[i]
        for i in range(len(candidates))
        if isinstance(candidates[i], ipctk.FaceVertexCandidate)
    ]
    assert len(vertex_faces) == 1
    dof = np.asarray(
        vertex_faces[0].dof(opposed, opposed_mesh.edges, opposed_mesh.faces)
    ).reshape(-1, 3)
    assert np.array_equal(dof[0], opposed[3]), "IPC point/face ordering changed"
    # At t=.51, the moving point equals barycentric (.25,.25,.5) on the
    # moving triangle. The former incorrect 3+1 split falsely certified this.
    contact = opposed + 0.51 * (opposed_end - opposed)
    assert (
        np.linalg.norm(contact[3] - np.array([0.25, 0.25, 0.5]) @ contact[:3]) < 1e-14
    )
    opposed_clear, opposed_statistics = check(
        opposed_mesh, opposed, opposed_end, 0.0007
    )
    assert not opposed_clear
    return {
        "captured_clear_motion": statistics,
        "off_midpoint_tunneling_rejected": tunnel_statistics,
        "clear_sweep_requires_subdivision": sweep_statistics,
        "unresolved_bound_rejected": True,
        "vertex_face_tunneling_rejected": True,
        "point_first_ipc_order_verified": True,
        "opposed_point_face_motion_rejected": opposed_statistics,
        "distance_margin_m": 1e-9,
        "passed": True,
    }
