"""Local collision-barrier feasibility test of one jacket midsurface panel.

Requires ipctk==1.6.0, numpy and scipy in a separate Python environment.
Input comes from export_panel_motion_probe.py. Nothing is uploaded. This is
a quasi-static spring/shape fit, not a fabric simulator or a runtime rig.
All body/top triangles participate as prescribed obstacles. Obstacle against
obstacle pairs are excluded; panel self/obstacle contacts remain enabled.
The remaining jacket and fabric thickness are NOT included in this solve.

Body and attachment positions share one progress variable for each of the
60 linear segments. Free panel vertices and progress are solved together;
every accepted Newton step must also pass a separate continuous collision
check. Optimizer trajectories and endpoint animation interpolation are
different paths, so both are reported. Neither implies garment acceptance.
"""
import argparse
from collections import deque
import hashlib
import importlib.metadata
import json
import time
from pathlib import Path

import ipctk
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve


def controls():
    """Analytic tunneling, filtering, distance and barrier-derivative controls."""
    faces = np.array([[0, 1, 2], [3, 4, 5]])
    start = np.array([[-1., -1, 0], [1, -1, 0], [0, 1, 0],
                      [-.1, -.1, 1], [.1, -.1, 1], [0, .1, 1]])
    end = start.copy()
    end[3:, 2] = -1
    mesh = ipctk.CollisionMesh(start, ipctk.edges(faces), faces)
    result = {
        'stationary_clear': bool(ipctk.is_step_collision_free(mesh, start, start)),
        'both_tunnel_endpoints_clear': not ipctk.has_intersections(mesh, start)
            and not ipctk.has_intersections(mesh, end),
        'tunnel_detected': not ipctk.is_step_collision_free(mesh, start, end),
        'tunnel_safe_fraction': float(ipctk.compute_collision_free_stepsize(
            mesh, start, end)),
    }
    assert result['stationary_clear'] and result['both_tunnel_endpoints_clear']
    assert result['tunnel_detected'] and .49 < result['tunnel_safe_fraction'] < .5
    mesh.can_collide = ipctk.make_static_obstacle_filter(3)
    result['panel_obstacle_tunnel_detected'] = not ipctk.is_step_collision_free(
        mesh, start, end)
    assert result['panel_obstacle_tunnel_detected']
    mesh.can_collide = ipctk.make_static_obstacle_filter(0)
    result['obstacle_obstacle_excluded'] = bool(ipctk.is_step_collision_free(
        mesh, start, end))
    assert result['obstacle_obstacle_excluded']
    mesh.can_collide = ipctk.make_static_obstacle_filter(6)
    result['panel_self_tunnel_detected'] = not ipctk.is_step_collision_free(
        mesh, start, end)
    assert result['panel_self_tunnel_detected']
    near = start.copy()
    near[3:, 2] = .0001
    collisions = ipctk.NormalCollisions()
    collisions.build(mesh, near, .0003)
    # API returns squared distance despite its short docstring.
    distance_squared = collisions.compute_minimum_distance(mesh, near)
    result['known_0_1mm_distance_m'] = float(np.sqrt(distance_squared))
    assert abs(result['known_0_1mm_distance_m'] - .0001) < 1e-12
    barrier = ipctk.BarrierPotential(.0003, 1e7)
    gradient = barrier.gradient(collisions, mesh, near).reshape(-1, 3)
    eps = 1e-8
    values = []
    for sign in [-1, 1]:
        sample = near.copy()
        sample[3:, 2] += sign * eps
        c = ipctk.NormalCollisions()
        c.build(mesh, sample, .0003)
        values.append(barrier(c, mesh, sample))
    measured = (values[1] - values[0]) / (2 * eps)
    predicted = gradient[3:, 2].sum()
    result['barrier_gradient_relative_error'] = float(
        abs(measured - predicted) / max(abs(measured), 1e-12))
    assert result['barrier_gradient_relative_error'] < 1e-5
    result['passed'] = True
    return result


class PanelProbe:
    dhat = .0003
    barrier_stiffness = 1e7
    edge_stiffness = .4
    shape_stiffness = .003
    progress_force = .002
    path_fractions = (.25, .5, .75, 1.)
    guard_animation_path = True
    position_tolerance_m = 1e-9

    def __init__(self, data):
        assert 'collider_policy' in data, 'Re-export input with conservative quad diagonals'
        self.data = data
        self.n = len(data['panel'][0])
        self.anchors = data['anchors']
        self.free = np.setdiff1d(np.arange(self.n), self.anchors)
        self.nf = len(self.free) * 3
        self.free_ids = (self.free[:, None] * 3 + np.arange(3)).ravel()
        self.edges = ipctk.edges(data['faces'])
        self.x = self.kinematics(0)
        self.path_start = self.x.copy()
        faces = np.vstack([data['faces'], data['body_faces'] + self.n,
                           data['top_faces'] + self.n + len(data['body'][0])])
        self.mesh = ipctk.CollisionMesh(self.x, ipctk.edges(faces), faces)
        self.mesh.can_collide = ipctk.make_static_obstacle_filter(self.n)
        self.barrier = ipctk.BarrierPotential(self.dhat, self.barrier_stiffness)
        self.collisions = ipctk.NormalCollisions()
        self.rest = np.linalg.norm(self.x[self.edges[:, 0]]
                                   - self.x[self.edges[:, 1]], axis=1)
        assert self.rest.min() > 1e-10

    def kinematics(self, sample):
        return np.vstack([self.data['panel'][sample], self.data['body'][sample],
                          self.data['top'][sample]]).astype(np.float64)

    def jacobian(self, delta):
        nonzero = np.flatnonzero(delta.ravel())
        rows = np.r_[self.free_ids, nonzero]
        cols = np.r_[np.arange(self.nf), np.full(len(nonzero), self.nf)]
        values = np.r_[np.ones(self.nf), delta.ravel()[nonzero]]
        return sparse.coo_matrix((values, (rows, cols)),
                                 shape=(self.x.size, self.nf + 1)).tocsc()

    def derivative_control(self):
        """Check the reduced gradient, including moving-collider derivatives."""
        target = self.kinematics(1)
        delta = target - self.x
        delta[self.free] = 0
        jacobian = self.jacobian(delta)
        _, gradient, _ = self.energy(self.x, 0., target, jacobian, True)
        rng = np.random.default_rng(127)
        direction = rng.normal(size=self.nf + 1)
        direction[:-1] *= .001
        displacement = np.asarray(jacobian @ direction).reshape(self.x.shape)
        epsilon = 1e-5
        values = [self.energy(self.x + sign * epsilon * displacement,
                              sign * epsilon * direction[-1], target, jacobian)
                  for sign in [-1, 1]]
        measured = (values[1] - values[0]) / (2 * epsilon)
        predicted = float(gradient @ direction)
        relative_error = abs(measured - predicted) / max(abs(measured), 1e-12)
        assert relative_error < 1e-4, relative_error
        return {'relative_error': relative_error, 'passed': True}

    def step_clear(self, start, end):
        return bool(ipctk.is_step_collision_free(self.mesh, start, end))

    def step_size(self, start, end):
        return float(ipctk.compute_collision_free_stepsize(self.mesh, start, end))

    def energy(self, x, progress, target, jacobian, derivatives=False):
        energy = 0.
        gradient = np.zeros_like(x) if derivatives else None
        hessian = sparse.csc_matrix((x.size, x.size)) if derivatives else None
        # Guide the endpoint using barrier samples along its intended linear
        # animation path. CCD below still verifies the whole interval; these
        # four samples alone are not a continuous-collision guarantee.
        for fraction in self.path_fractions:
            path_x = self.path_start + fraction * (x - self.path_start)
            self.collisions.build(self.mesh, path_x, self.dhat)
            energy += self.barrier(self.collisions, self.mesh, path_x) / len(self.path_fractions)
            if derivatives:
                gradient += (fraction / len(self.path_fractions)) * self.barrier.gradient(
                    self.collisions, self.mesh, path_x).reshape(-1, 3)
                hessian += (fraction ** 2 / len(self.path_fractions)) * self.barrier.hessian(
                    self.collisions, self.mesh, path_x, ipctk.PSDProjectionMethod.CLAMP)
        vectors = x[self.edges[:, 0]] - x[self.edges[:, 1]]
        lengths = np.linalg.norm(vectors, axis=1)
        strain = lengths - self.rest
        difference = x[self.free] - target[self.free]
        energy += .5 * self.edge_stiffness * np.dot(strain, strain)
        energy += .5 * self.shape_stiffness * np.sum(difference * difference)
        energy -= self.progress_force * progress
        if not derivatives:
            return float(energy)
        unit = vectors / lengths[:, None]
        edge_gradient = self.edge_stiffness * strain[:, None] * unit
        np.add.at(gradient, self.edges[:, 0], edge_gradient)
        np.add.at(gradient, self.edges[:, 1], -edge_gradient)
        gradient[self.free] += self.shape_stiffness * difference
        reduced_gradient = np.asarray(jacobian.T @ gradient.ravel()).ravel()
        reduced_gradient[-1] -= self.progress_force
        rows, cols, values = [], [], []
        for edge, (a, b) in enumerate(self.edges):
            # Positive spring Hessian approximation; gradient remains exact.
            h = self.edge_stiffness * (
                np.outer(unit[edge], unit[edge])
                + np.eye(3) * max(0., 1 - self.rest[edge] / lengths[edge]))
            for u, usign in [(a, 1), (b, -1)]:
                for v, vsign in [(a, 1), (b, -1)]:
                    for i in range(3):
                        for j in range(3):
                            rows.append(3 * u + i)
                            cols.append(3 * v + j)
                            values.append(h[i, j] * usign * vsign)
        hessian += sparse.coo_matrix((values, (rows, cols)),
                                     shape=hessian.shape).tocsc()
        reduced_hessian = jacobian.T @ hessian @ jacobian
        reduced_hessian += sparse.diags(np.r_[
            np.full(self.nf, self.shape_stiffness + 1e-8), 1e-8])
        return float(energy), reduced_gradient, reduced_hessian

    def solve(self, max_iterations=120, max_subdivisions=6):
        assert not ipctk.has_intersections(self.mesh, self.x), 'Initial intersection'
        start_time = time.monotonic()
        panels = [self.x[:self.n].copy()]
        rows = []
        rejected_intervals = []
        accepted_steps = 0
        ccd_retries = 0
        pending = deque((sample, self.kinematics(sample),
                         float(self.data['frames'][sample]), 0)
                        for sample in range(1, len(self.data['panel'])))
        current_target = self.kinematics(0)
        current_frame = float(self.data['frames'][0])
        accepted_frames = [current_frame]
        while pending:
            sample, target, target_frame, depth = pending.popleft()
            segment_start = self.x.copy()
            self.path_start = segment_start
            delta = target - self.x
            delta[self.free] = 0
            jacobian = self.jacobian(delta)
            progress = 0.
            reason = 'ITERATION_LIMIT'
            min_alpha = 1.
            self.current_interval = (current_frame, target_frame, depth)
            for iteration in range(max_iterations):
                self.current_iteration = iteration
                energy, gradient, hessian = self.energy(
                    self.x, progress, target, jacobian, True)
                direction = spsolve(hessian, -gradient)
                dq = direction[-1]
                cap = (min(1., (1 - progress) / dq) if dq > 0
                       else min(1., -progress / dq) if dq < 0 else 1.)
                if cap < 1e-10:
                    direction = np.r_[spsolve(hessian[:-1, :-1],
                                              -gradient[:-1]), 0.]
                    dq, cap = 0., 1.
                displacement = np.asarray(jacobian @ direction).reshape(self.x.shape)
                assert np.all(np.isfinite(displacement))
                alpha = cap * self.step_size(self.x, self.x + cap * displacement)
                slope = float(gradient @ direction)
                for _ in range(40):
                    trial = self.x + alpha * displacement
                    trial_progress = progress + alpha * dq
                    # Independent verification, not trust in the step-size helper.
                    clear = self.step_clear(self.x, trial)
                    if self.guard_animation_path:
                        clear = clear and self.step_clear(segment_start, trial)
                    if not clear:
                        ccd_retries += 1
                    value = self.energy(trial, trial_progress, target, jacobian) if clear else np.inf
                    if clear and np.isfinite(value) and value <= energy + 1e-4 * alpha * slope:
                        break
                    alpha *= .5
                else:
                    reason = 'LINE_SEARCH_REJECTED'
                    break
                if np.max(abs(alpha * displacement)) < self.position_tolerance_m and abs(alpha * dq) < 1e-7:
                    reason = 'CONVERGED' if progress > 1 - 1e-7 else 'STALLED'
                    break
                self.x, progress = trial, trial_progress
                accepted_steps += 1
                min_alpha = min(min_alpha, alpha)
                assert -1e-10 <= progress <= 1 + 1e-10
                if progress > 1 - 1e-7 and np.max(abs(gradient[:-1])) < 1e-5:
                    reason = 'CONVERGED'
                    break
            expected = segment_start + progress * delta
            fixed_error = max(np.max(abs(self.x[self.anchors] - expected[self.anchors])),
                              np.max(abs(self.x[self.n:] - expected[self.n:])))
            assert fixed_error < 1e-9
            lengths = np.linalg.norm(self.x[self.edges[:, 0]] - self.x[self.edges[:, 1]], axis=1)
            ratios = lengths / self.rest
            pinned_edges = np.isin(self.edges, self.anchors).all(axis=1)
            row = {
                'sample': sample, 'progress': float(progress),
                'source_frame': float(current_frame + progress * (target_frame - current_frame)),
                'start_source_frame': current_frame,
                'subdivision_depth': depth,
                'iterations': iteration + 1, 'reason': reason,
                'endpoint_intersections': bool(ipctk.has_intersections(self.mesh, self.x)),
                'endpoint_linear_interpolation_clear': self.step_clear(segment_start, self.x),
                'fixed_motion_error_m': float(fixed_error),
                'max_edge_length_ratio': float(ratios.max()),
                'pinned_edge_max_length_ratio': float(ratios[pinned_edges].max()),
                'min_step_fraction': float(min_alpha),
                'last_proposed_coordinate_step_m': float(np.max(abs(alpha * displacement))),
            }
            segment_passed = (progress > 1 - 1e-7 and reason == 'CONVERGED'
                              and not row['endpoint_intersections']
                              and row['endpoint_linear_interpolation_clear'])
            if not segment_passed and depth < max_subdivisions:
                rejected_intervals.append(row)
                print('IPC_PANEL_SUBDIVIDE', json.dumps(row), flush=True)
                self.x = segment_start
                middle = (current_target + target) * .5
                middle_frame = (current_frame + target_frame) * .5
                pending.appendleft((sample, target, target_frame, depth + 1))
                pending.appendleft((sample, middle, middle_frame, depth + 1))
                continue
            rows.append(row)
            panels.append(self.x[:self.n].copy())
            accepted_frames.append(row['source_frame'])
            observer = getattr(self, 'segment_observer', None)
            if observer is not None:
                # Observation receives copies and cannot alter the solve.
                if observer(dict(row), self.x[:self.n].copy()) is False:
                    row['external_screen_rejected'] = True
                    segment_passed = False
            print('IPC_PANEL_SEGMENT', json.dumps(row), flush=True)
            if not segment_passed:
                break
            current_target, current_frame = target, target_frame
        result = {
            'scope': __doc__, 'package_versions': {name: importlib.metadata.version(name)
                for name in ['ipctk', 'numpy', 'scipy']},
            'settings': {name: getattr(self, name) for name in
                ['dhat', 'barrier_stiffness', 'edge_stiffness', 'shape_stiffness', 'progress_force', 'path_fractions', 'guard_animation_path', 'position_tolerance_m']},
            'source_sha256': str(self.data['source_sha256']),
            'panel_vertices': self.n, 'panel_triangles': len(self.data['faces']),
            'all_body_top_triangles_included': True,
            'collider_policy': str(self.data['collider_policy']),
            'body_diagonal_change_samples': int(self.data['body_diagonal_change_samples']),
            'top_diagonal_change_samples': int(self.data['top_diagonal_change_samples']),
            'remaining_jacket_and_wall_thickness_included': False,
            'optimizer_steps_ccd_verified_including_discarded_attempts': accepted_steps,
            'independent_ccd_rejections_retried': ccd_retries,
            'completed_all_segments': (not pending and segment_passed
                                       and abs(current_frame - float(self.data['frames'][-1])) < 1e-9),
            'linear_interpolation_failures': [r['sample'] for r in rows if not r['endpoint_linear_interpolation_clear']],
            'discarded_intervals_before_subdivision': rejected_intervals,
            'maximum_subdivisions': max_subdivisions,
            'result_source_frames': accepted_frames,
            'elapsed_seconds': time.monotonic() - start_time,
            'segments': rows, 'status': 'FEASIBILITY_ONLY_NOT_A_GARMENT',
        }
        result['linear_motion_gate_passed'] = (result['completed_all_segments']
            and not result['linear_interpolation_failures']
            and not any(row['endpoint_intersections'] for row in rows))
        if result['linear_motion_gate_passed']:
            result['status'] = 'ISOLATED_LINEAR_MIDSURFACE_MOTION_CLEAR_NOT_PROMOTED'
        return result, np.asarray(panels)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--temporary-result', type=Path, required=True)
    parser.add_argument('--path-mode', choices=['guarded', 'endpoint'], default='guarded')
    parser.add_argument('--max-subdivisions', type=int, choices=range(7), default=6)
    parser.add_argument('--require-motion-clear', action='store_true',
                        help='Fail after recording if the isolated linear-motion gate fails')
    args = parser.parse_args()
    calibration = controls()
    data = np.load(args.input)
    probe = PanelProbe(data)
    if args.path_mode == 'endpoint':
        probe.path_fractions = (1.,)
        probe.guard_animation_path = False
    calibration['reduced_energy_gradient'] = probe.derivative_control()
    result, panels = probe.solve(max_subdivisions=args.max_subdivisions)
    result['controls'] = calibration
    result['temporary_input_sha256'] = hashlib.sha256(args.input.read_bytes()).hexdigest()
    args.report.write_text(json.dumps(result, indent=2) + '\n')
    np.savez_compressed(args.temporary_result, panels=panels)
    print('IPC_PANEL_REPORT', args.report, flush=True)
    if args.require_motion_clear:
        assert result['linear_motion_gate_passed'], 'Isolated linear-motion gate failed; no model was saved'
