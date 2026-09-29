"""Experimental actual-wall barrier with analytic normal-offset derivatives.

The 1 mm outer/inner walls share coarse connectivity and closed opening rims.
Body/top stay prescribed. Wall CCD covers straight transitions between quarter
samples of reconstructed walls; it does not prove the exact nonlinear offset
trajectory. Independent Blender/native-CCD checks remain mandatory.
"""

import json
import time
from pathlib import Path

import ipctk
import numpy as np
from finite_clearance_bounds import clearance_bound
from probe_jacket_finite import FiniteProbe
from scipy import sparse


def paired_faces(faces, count):
    output = [tuple(f) for f in faces]
    output += [tuple(int(i) + count for i in reversed(f)) for f in faces]
    edges = {}
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            edges.setdefault(tuple(sorted((int(a), int(b)))), []).append(
                (int(a), int(b))
            )
    for directions in edges.values():
        if len(directions) == 1:
            a, b = directions[0]
            output.extend([(b, a, a + count), (b, a + count, b + count)])
    return np.asarray(output)


def skew(v):
    matrix = np.zeros((len(v), 3, 3))
    matrix[:, 0, 1], matrix[:, 0, 2] = -v[:, 2], v[:, 1]
    matrix[:, 1, 0], matrix[:, 1, 2] = v[:, 2], -v[:, 0]
    matrix[:, 2, 0], matrix[:, 2, 1] = -v[:, 1], v[:, 0]
    return matrix


def normal_offset(x, faces, thickness=0.001, derivatives=False):
    count = len(x)
    a, b, c = (x[faces[:, i]] for i in range(3))
    triangle_normals = np.cross(b - a, c - a)
    normals = np.zeros_like(x)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], triangle_normals)
    lengths = np.linalg.norm(normals, axis=1)
    assert lengths.min() > 1e-12, "Undefined wall offset normal"
    normals /= lengths[:, None]
    walls = np.vstack([x + thickness / 2 * normals, x - thickness / 2 * normals])
    if not derivatives:
        return walls
    blocks = [skew(c - b), -skew(c - a), skew(b - a)]
    rows, cols, values = [], [], []
    for output_corner in range(3):
        for input_corner in range(3):
            rows.append(
                np.broadcast_to(
                    (faces[:, output_corner, None] * 3 + np.arange(3))[:, :, None],
                    blocks[0].shape,
                ).ravel()
            )
            cols.append(
                np.broadcast_to(
                    (faces[:, input_corner, None] * 3 + np.arange(3))[:, None, :],
                    blocks[0].shape,
                ).ravel()
            )
            values.append(blocks[input_corner].ravel())
    area_jacobian = sparse.coo_matrix(
        (np.concatenate(values), (np.concatenate(rows), np.concatenate(cols))),
        shape=(count * 3, count * 3),
    ).tocsc()
    projection = (np.eye(3) - normals[:, :, None] * normals[:, None, :]) / lengths[
        :, None, None
    ]
    normal_jacobian = sparse.block_diag(projection, format="csc") @ area_jacobian
    identity = sparse.eye(count * 3, format="csc")
    jacobian = sparse.vstack(
        [
            identity + thickness / 2 * normal_jacobian,
            identity - thickness / 2 * normal_jacobian,
        ],
        format="csc",
    )
    return walls, jacobian


class ActualWallProbe(FiniteProbe):
    wall_barrier_distance = 0.0003

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.wall_faces = paired_faces(self.data["faces"], self.n)
        faces = np.vstack(
            [
                self.wall_faces,
                self.data["body_faces"] + 2 * self.n,
                self.data["top_faces"] + 2 * self.n + len(self.data["body"][0]),
            ]
        )
        initial = self.wall_positions(self.x)
        self.wall_mesh = ipctk.CollisionMesh(initial, ipctk.edges(faces), faces)
        self.wall_mesh.can_collide = ipctk.make_static_obstacle_filter(2 * self.n)
        self.wall_collisions = ipctk.NormalCollisions()
        self.wall_barrier = ipctk.BarrierPotential(
            self.wall_barrier_distance, self.barrier_stiffness
        )
        assert not ipctk.has_intersections(self.wall_mesh, initial)
        self.wall_checks = 0
        self.bounded_ccd = False
        self.fast_bounds = False
        self.last_progress_log = 0.0
        self.bounded_zero_ccd = ipctk.TightInclusionCCD(
            tolerance=1e-6, max_iterations=10000
        )
        self.bounded_finite_ccd = ipctk.TightInclusionCCD(
            tolerance=1e-10, max_iterations=10000
        )
        self.bounded_statistics = {
            "calls": 0,
            "native_clear": 0,
            "bound_clear": 0,
            "bound_rejected": 0,
            "distance_queries": 0,
            "plane_certificates": 0,
            "native_queries_skipped": 0,
        }

    def bounded_clear(self, mesh, start, end, gap=0.0):
        """Always require an all-time bound, irrespective of capped CCD output.

        This deliberate policy change prevents an iteration-limit return from
        authorizing motion. Contact, a 1 nm margin, or uncertainty rejects it.
        Independent validation still uses the original native CCD settings.
        """
        # In bounded mode the native boolean never authorizes a step. The
        # fast option omits that redundant diagnostic query; the all-time
        # certificate remains mandatory, as do independent wall checks.
        native = False
        if self.fast_bounds:
            self.bounded_statistics["native_queries_skipped"] += 1
        else:
            native = ipctk.is_step_collision_free(
                mesh,
                start,
                end,
                min_distance=gap,
                narrow_phase_ccd=self.bounded_finite_ccd
                if gap
                else self.bounded_zero_ccd,
            )
        clear, statistics = clearance_bound(
            mesh,
            start,
            end,
            gap,
            relative_motion=self.fast_bounds,
            batch_planes=self.fast_bounds,
        )
        self.bounded_statistics["calls"] += 1
        self.bounded_statistics["native_clear"] += bool(native)
        self.bounded_statistics["bound_clear" if clear else "bound_rejected"] += 1
        self.bounded_statistics["distance_queries"] += statistics["distance_queries"]
        self.bounded_statistics["plane_certificates"] += statistics.get(
            "plane_certificates", 0
        )
        return clear

    def bounded_controls(self):
        edges = np.array([[0, 1], [2, 3]])
        faces = np.empty((0, 3), dtype=int)
        cases = []
        for when in [0.13, 0.37, 0.81]:
            start = np.array(
                [
                    [-0.01, 0, 0],
                    [0.01, 0, 0],
                    [0, -0.01, when * 0.01],
                    [0, 0.01, when * 0.01],
                ]
            )
            end = start.copy()
            end[2:, 2] -= 0.01
            mesh = ipctk.CollisionMesh(start, edges, faces)
            assert self.bounded_clear(mesh, start, start)
            assert self.bounded_clear(mesh, end, end)
            assert not self.bounded_clear(mesh, start, end)
            cases.append({"contact_time": when, "zero_gap_tunnel_rejected": True})
        start = np.array(
            [[-0.01, -0.01, 0], [0.01, -0.01, 0], [0, 0.01, 0], [0, 0, 0.0037]]
        )
        faces = np.array([[0, 1, 2]])
        mesh = ipctk.CollisionMesh(start, ipctk.edges(faces), faces)
        end = start.copy()
        end[3, 2] = -0.0063
        assert not self.bounded_clear(mesh, start, end)
        stationary = start.copy()
        stationary[3, 2] = 0.0008
        assert self.bounded_clear(mesh, stationary, stationary, 0.0007)
        too_close = stationary.copy()
        too_close[3, 2] = 0.0006
        assert not self.bounded_clear(mesh, stationary, too_close, 0.0007)
        return {
            "edge_edge_cases": cases,
            "vertex_face_tunnel_rejected": True,
            "finite_distance_control_passed": True,
            "all_motion_requires_conservative_bound": True,
            "unresolved_bounds_reject_motion": True,
            "passed": True,
        }

    def step_size(self, start, end):
        if self.bounded_ccd:
            # Proposal only: both optimizer and complete animation paths must
            # still pass every wall/midsurface distance bound in line search.
            return 1.0
        return super().step_size(start, end)

    def wall_positions(self, x, derivatives=False):
        result = normal_offset(x[: self.n], self.data["faces"], derivatives=derivatives)
        if not derivatives:
            return np.vstack([result, x[self.n :]])
        walls, jacobian = result
        return np.vstack([walls, x[self.n :]]), sparse.block_diag(
            [jacobian, sparse.eye((len(x) - self.n) * 3)], format="csc"
        )

    def step_clear(self, start, end):
        if self.bounded_ccd:
            if not self.bounded_clear(self.mesh, start, end):
                return False
            for _, mesh, _, gap in self.clearance:
                if not self.bounded_clear(mesh, start, end, gap):
                    return False
        elif not super().step_clear(start, end):
            return False
        try:
            previous = self.wall_positions(start)
            for fraction in self.path_fractions:
                wall = self.wall_positions(start + fraction * (end - start))
                self.wall_checks += 1
                if ipctk.has_intersections(self.wall_mesh, wall):
                    return False
                clear = (
                    self.bounded_clear(self.wall_mesh, previous, wall)
                    if self.bounded_ccd
                    else ipctk.is_step_collision_free(self.wall_mesh, previous, wall)
                )
                if not clear:
                    return False
                previous = wall
        except AssertionError:
            return False
        return True

    def energy(self, x, progress, target, jacobian, derivatives=False):
        log_progress = (
            self.fast_bounds
            and derivatives
            and time.monotonic() - self.last_progress_log > 30
        )
        base = super().energy(x, progress, target, jacobian, derivatives)
        if derivatives:
            value, gradient, hessian = base
        else:
            value = base
        for fraction in self.path_fractions:
            path = self.path_start + fraction * (x - self.path_start)
            mapped = self.wall_positions(path, derivatives)
            if derivatives:
                wall, wall_jacobian = mapped
                chain = wall_jacobian @ jacobian
            else:
                wall = mapped
            self.wall_collisions.build(self.wall_mesh, wall, self.wall_barrier_distance)
            value += self.wall_barrier(
                self.wall_collisions, self.wall_mesh, wall
            ) / len(self.path_fractions)
            if derivatives:
                wall_gradient = self.wall_barrier.gradient(
                    self.wall_collisions, self.wall_mesh, wall
                )
                wall_hessian = self.wall_barrier.hessian(
                    self.wall_collisions,
                    self.wall_mesh,
                    wall,
                    ipctk.PSDProjectionMethod.CLAMP,
                )
                gradient += (
                    fraction
                    / len(self.path_fractions)
                    * np.asarray(chain.T @ wall_gradient).ravel()
                )
                hessian += (
                    fraction**2
                    / len(self.path_fractions)
                    * (chain.T @ wall_hessian @ chain)
                )
        if log_progress:
            metadata = {
                "progress": float(progress),
                "energy": float(value),
                "free_gradient_max": float(np.max(abs(gradient[:-1]))),
                "iteration": getattr(self, "current_iteration", None),
                "position_tolerance_m": self.position_tolerance_m,
                "source_interval": getattr(self, "current_interval", None),
                "bounds": self.bounded_statistics,
                "status": "INCOMPLETE_OPTIMIZER_STATE_NOT_A_RESUME_CHECKPOINT",
            }
            print("FINITE_OPTIMIZER_PROGRESS", json.dumps(metadata), flush=True)
            if getattr(self, "progress_snapshot_prefix", None) is not None:
                output = Path(str(self.progress_snapshot_prefix) + "-progress.npz")
                temporary = output.with_suffix(".temporary.npz")
                np.savez_compressed(
                    temporary,
                    positions=x,
                    path_start=self.path_start,
                    target=target,
                    metadata=json.dumps(metadata),
                )
                temporary.replace(output)
            self.last_progress_log = time.monotonic()
        return (float(value), gradient, hessian) if derivatives else float(value)

    def wall_derivative_control(self):
        x = self.x[: self.n]
        walls, jacobian = normal_offset(x, self.data["faces"], derivatives=True)
        direction = np.random.default_rng(719).normal(size=x.shape) * 0.001
        epsilon = 1e-5
        measured = (
            normal_offset(x + epsilon * direction, self.data["faces"])
            - normal_offset(x - epsilon * direction, self.data["faces"])
        ) / (2 * epsilon)
        predicted = (jacobian @ direction.ravel()).reshape(walls.shape)
        error = float(np.max(abs(measured - predicted)))
        assert error < 1e-8, error
        self.wall_collisions.build(
            self.wall_mesh, self.wall_positions(self.x), self.wall_barrier_distance
        )
        return {
            "normal_offset_jacobian_maximum_error": error,
            "active_wall_barrier_contacts": len(self.wall_collisions),
            "passed": True,
        }
