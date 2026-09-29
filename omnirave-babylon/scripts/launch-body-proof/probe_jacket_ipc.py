"""Fit the connected jacket midsurface with the local IPC experiment.

The isolated-panel solver's collision and interpolation checks are retained.
Vectorized edge assembly reduces CPU overhead for a larger connected surface.
Source bodies and prescribed ribbing openings are fixed. This remains an
offline, zero-thickness construction test, not cloth physics or an exported
rig. The complete original action and visual acceptance are still separate.
"""
import argparse
import hashlib
import json
from pathlib import Path

import ipctk
import numpy as np
from scipy import sparse

from probe_panel_ipc import PanelProbe, controls


class JacketProbe(PanelProbe):
    progress_damping = 0.
    def energy(self, x, progress, target, jacobian, derivatives=False):
        energy = 0.
        gradient = np.zeros_like(x) if derivatives else None
        hessian = sparse.csc_matrix((x.size, x.size)) if derivatives else None
        for fraction in self.path_fractions:
            path = self.path_start + fraction * (x - self.path_start)
            self.collisions.build(self.mesh, path, self.dhat)
            energy += self.barrier(self.collisions, self.mesh, path) / len(self.path_fractions)
            if derivatives:
                gradient += fraction / len(self.path_fractions) * self.barrier.gradient(
                    self.collisions, self.mesh, path).reshape(-1, 3)
                hessian += fraction ** 2 / len(self.path_fractions) * self.barrier.hessian(
                    self.collisions, self.mesh, path, ipctk.PSDProjectionMethod.CLAMP)
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
        blocks = self.edge_stiffness * (
            unit[:, :, None] * unit[:, None, :]
            + np.maximum(0., 1 - self.rest / lengths)[:, None, None] * np.eye(3))
        top = np.concatenate([blocks, -blocks], axis=2)
        blocks6 = np.concatenate([top, -top], axis=1)
        dofs = (3 * self.edges[:, :, None] + np.arange(3)).reshape(-1, 6)
        rows = np.broadcast_to(dofs[:, :, None], blocks6.shape).ravel()
        cols = np.broadcast_to(dofs[:, None, :], blocks6.shape).ravel()
        hessian += sparse.coo_matrix((blocks6.ravel(), (rows, cols)),
                                     shape=hessian.shape).tocsc()
        reduced_hessian = jacobian.T @ hessian @ jacobian
        reduced_hessian += sparse.diags(np.r_[
            np.full(self.nf, self.shape_stiffness + 1e-8), 1e-8 + self.progress_damping])
        return float(energy), reduced_gradient, reduced_hessian


def assembly_control(data):
    """Compare with the previously checked scalar edge assembly at one pose."""
    probe = JacketProbe(data)
    target = probe.kinematics(1)
    delta = target - probe.x
    delta[probe.free] = 0
    jacobian = probe.jacobian(delta)
    fast = probe.energy(probe.x, 0., target, jacobian, True)
    old = PanelProbe.energy(probe, probe.x, 0., target, jacobian, True)
    difference = fast[2] - old[2]
    errors = {'energy': abs(fast[0] - old[0]),
              'gradient_max': float(np.max(abs(fast[1] - old[1]))),
              'hessian_max': float(abs(difference.data).max()) if difference.nnz else 0.}
    assert max(errors.values()) < 1e-8, errors
    return {'absolute_errors': errors, 'passed': True}


def attachment_control(data):
    """Reject prescribed attachment paths the free cloth cannot repair."""
    anchors = data['anchors']
    edges = ipctk.edges(data['faces'])
    edges = edges[np.isin(edges, anchors).all(axis=1)]
    lookup = {vertex: i for i, vertex in enumerate(anchors)}
    pin_edges = np.array([[lookup[a], lookup[b]] for a, b in edges])
    faces = np.vstack([data['body_faces'] + len(anchors),
                       data['top_faces'] + len(anchors) + len(data['body'][0])])
    edges = np.vstack([pin_edges, ipctk.edges(faces)])
    def positions(i):
        return np.vstack([data['panel'][i, anchors], data['body'][i], data['top'][i]])
    previous = positions(0)
    mesh = ipctk.CollisionMesh(previous, edges, faces)
    mesh.can_collide = ipctk.make_static_obstacle_filter(len(anchors))
    failures = []
    for i in range(1, len(data['frames'])):
        current = positions(i)
        if not ipctk.is_step_collision_free(mesh, previous, current):
            failures.append(float(data['frames'][i]))
        previous = current
    assert not failures, ('Prescribed attachment path intersects', failures)
    return {'pinned_vertices': len(anchors), 'pinned_edges': len(pin_edges),
            'checked_intervals': len(data['frames']) - 1,
            'failed_source_frames': failures, 'passed': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--temporary-result', type=Path, required=True)
    parser.add_argument('--max-subdivisions', type=int, default=6, choices=range(7))
    parser.add_argument('--require-motion-clear', action='store_true')
    parser.add_argument('--first-interval', action='store_true', help='Bounded first-interval solver comparison')
    parser.add_argument('--damped-progress', action='store_true',
                        help='Regularize the progress direction without changing energy or CCD gates')
    args = parser.parse_args()
    data = np.load(args.input)
    if args.first_interval:
        data = {key: (data[key][:2] if key in ['panel', 'body', 'top', 'frames'] else data[key])
                for key in data.files}
    assert str(data['region']) == 'whole_jacket'
    calibration = controls()
    calibration['vectorized_assembly'] = assembly_control(data)
    calibration['prescribed_attachments'] = attachment_control(data)
    probe = JacketProbe(data)
    probe.progress_force *= len(probe.free) / 87
    if args.damped_progress:
        probe.progress_damping = probe.progress_force
    calibration['reduced_energy_gradient'] = probe.derivative_control()
    probe.collisions.build(probe.mesh, probe.x, probe.dhat)
    calibration['initial_barrier_contacts'] = len(probe.collisions)
    calibration['initial_minimum_contact_distance_m'] = float(np.sqrt(
        probe.collisions.compute_minimum_distance(probe.mesh, probe.x)))
    checkpoint = args.temporary_result.with_name(args.temporary_result.stem + '-latest.npz')
    def observe(row, surface):
        np.savez_compressed(checkpoint, panels=surface[None, ...],
                            source_frame=row['source_frame'])
        checkpoint.with_suffix('.json').write_text(json.dumps({
            'status': 'RUNNING_SNAPSHOT_NOT_ACCEPTED', 'scope': __doc__,
            'result_source_frames': [row['source_frame']], 'latest_segment': row}, indent=2) + '\n')
    probe.segment_observer = observe
    print('JACKET_IPC_CONTROLS', json.dumps(calibration), flush=True)
    result, surfaces = probe.solve(max_subdivisions=args.max_subdivisions)
    result['scope'] = __doc__
    result['settings']['progress_force_normalization'] = 'free vertex count / 87'
    result['settings']['progress_damping'] = probe.progress_damping
    result['input_source_frame_range'] = [float(data['frames'][0]), float(data['frames'][-1])]
    result['completed_full_arm_lowering'] = (result['completed_all_segments']
                                            and float(data['frames'][-1]) == 1.)
    result.pop('remaining_jacket_and_wall_thickness_included', None)
    result['whole_reduced_midsurface_included'] = True
    result['fabric_thickness_included'] = False
    result['build'] = json.loads(str(data['build_metadata']))
    result['controls'] = calibration
    result['temporary_input_sha256'] = hashlib.sha256(args.input.read_bytes()).hexdigest()
    result['status'] = ('CONNECTED_LINEAR_MIDSURFACE_MOTION_CLEAR_NOT_PROMOTED'
                        if result['linear_motion_gate_passed'] else 'CONNECTED_MIDSURFACE_MOTION_FAILED')
    args.report.write_text(json.dumps(result, indent=2) + '\n')
    np.savez_compressed(args.temporary_result, panels=surfaces)
    print('JACKET_IPC_REPORT', args.report, flush=True)
    if args.require_motion_clear:
        assert result['linear_motion_gate_passed'], 'Connected midsurface motion failed; no model was saved'
