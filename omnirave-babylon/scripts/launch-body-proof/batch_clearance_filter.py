"""Batch fixed-plane clearance certificates before scalar distance bounds.

An axis is only a proposal. Every opposing vertex pair must project beyond
the required gap at BOTH interval endpoints. Affine vertex motion then keeps
that separation for the whole interval. Uncertified candidates still require
the corrected scalar bound; this filter never accepts them from samples.
"""

import ipctk
import numpy as np


def plane_filter(candidates, start, end, edges, faces, gap, chunk_size=4096):
    accepted = np.zeros(len(candidates), dtype=bool)
    groups = [(ipctk.EdgeEdgeCandidate, 4, 2), (ipctk.FaceVertexCandidate, 4, 1)]
    for kind, count, split in groups:
        indices = [i for i, c in enumerate(candidates) if isinstance(c, kind)]
        for offset in range(0, len(indices), chunk_size):
            selected = np.asarray(indices[offset : offset + chunk_size])
            # Read stencil IDs, then gather topology once in NumPy. Passing
            # whole topology arrays through vertex_ids() for every candidate
            # creates substantial binding overhead on this IPC build.
            if split == 2:
                pairs = np.asarray(
                    [(candidates[i].edge0_id, candidates[i].edge1_id) for i in selected]
                )
                ids = edges[pairs].reshape(-1, 4)
            else:
                vertices = np.asarray([candidates[i].vertex_id for i in selected])
                triangles = np.asarray([candidates[i].face_id for i in selected])
                ids = np.column_stack([vertices, faces[triangles]])
            # Check the binding's ordering on one stencil in every chunk.
            assert np.array_equal(
                ids[0], candidates[selected[0]].vertex_ids(edges, faces)
            )
            assert ids.shape == (len(selected), count) and ids.min() >= 0
            a, b = start[ids], end[ids]
            midpoint = (a + b) * 0.5
            # Midpoint geometry proposes fixed axes only. The test below
            # evaluates all endpoint support values, not midpoint distances.
            if split == 2:
                axes = [
                    np.cross(
                        midpoint[:, 1] - midpoint[:, 0], midpoint[:, 3] - midpoint[:, 2]
                    )
                ]
            else:
                axes = [
                    np.cross(
                        midpoint[:, 2] - midpoint[:, 1], midpoint[:, 3] - midpoint[:, 1]
                    )
                ]
            axes.append(
                midpoint[:, split:].mean(axis=1) - midpoint[:, :split].mean(axis=1)
            )
            for i in range(split):
                for j in range(split, count):
                    axes.append(midpoint[:, j] - midpoint[:, i])
            differences = np.concatenate(
                [
                    (points[:, split:, None, :] - points[:, None, :split, :]).reshape(
                        len(selected), -1, 3
                    )
                    for points in (a, b)
                ],
                axis=1,
            )
            clear = np.zeros(len(selected), dtype=bool)
            for axis in axes:
                remaining = np.flatnonzero(~clear)
                if not len(remaining):
                    break
                axis = axis[remaining]
                length = np.linalg.norm(axis, axis=1)
                valid = np.isfinite(length) & (length > 1e-12)
                unit = np.zeros_like(axis)
                unit[valid] = axis[valid] / length[valid, None]
                projection = np.einsum("npi,ni->np", differences[remaining], unit)
                bound = np.maximum(projection.min(axis=1), -projection.max(axis=1))
                clear[remaining] = valid & np.isfinite(bound) & (bound > gap + 1e-9)
            accepted[selected] = clear
    return accepted


def batch_controls():
    """Analytic collision fixtures, including large shared translations."""
    from finite_clearance_bounds import clearance_bound

    rng = np.random.default_rng(93281)
    rejected = 0
    for kind in ("edges", "point_face"):
        for i in range(40):
            basis, _ = np.linalg.qr(rng.normal(size=(3, 3)))
            if kind == "edges":
                at_contact = 0.01 * np.array([-basis[0], basis[0], -basis[1], basis[1]])
                faces = np.empty((0, 3), dtype=int)
                edges = np.array([[0, 1], [2, 3]])
            else:
                triangle = 0.01 * np.array(
                    [-basis[0] - basis[1], basis[0] - basis[1], basis[1]]
                )
                at_contact = np.vstack(
                    [triangle, np.array([0.25, 0.25, 0.5]) @ triangle]
                )
                faces = np.array([[0, 1, 2]])
                edges = ipctk.edges(faces)
            when = rng.uniform(0.07, 0.93)
            velocity = rng.normal(size=(4, 3)) * 0.003 + rng.normal(size=3) * 0.1
            start = at_contact - when * velocity
            end = at_contact + (1 - when) * velocity
            mesh = ipctk.CollisionMesh(start, edges, faces)
            clear, _ = clearance_bound(
                mesh,
                start,
                end,
                0.0 if i % 2 else 0.0007,
                relative_motion=True,
                batch_planes=True,
            )
            assert not clear, (kind, i, when)
            rejected += 1
    start = np.array(
        [[-0.01, 0, 0], [0.01, 0, 0], [0, -0.01, 0.0008], [0, 0.01, 0.0008]]
    )
    mesh = ipctk.CollisionMesh(
        start, np.array([[0, 1], [2, 3]]), np.empty((0, 3), dtype=int)
    )
    clear, statistics = clearance_bound(
        mesh,
        start,
        start + [0.4, -0.2, 0.3],
        0.0007,
        relative_motion=True,
        batch_planes=True,
    )
    assert clear and statistics["plane_certificates"] == 1
    return {
        "analytic_tunnels_rejected": rejected,
        "random_seed": 93281,
        "rigid_translation_clear": True,
        "passed": True,
    }
