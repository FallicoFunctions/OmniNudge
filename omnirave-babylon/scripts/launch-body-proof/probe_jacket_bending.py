"""Bounded, fixed-pose jacket bending experiment; no playable model export.

Opposite vertices across each interior edge receive weak distance springs.
This rotation-invariant surrogate resists fold-back but is not a calibrated
cloth bending law. It retains the original T-pose rest distances and the
existing IPC step and linear-transition guards. A fixed-pose correction does
not prove the arm-lowering trajectory or the thick garment is valid.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy import sparse

from probe_jacket_ipc import JacketProbe


def spring_terms(points, edges, rest, stiffness, derivatives=False):
    vectors = points[edges[:, 0]] - points[edges[:, 1]]
    lengths = np.linalg.norm(vectors, axis=1)
    assert lengths.min() > 1e-12
    strain = lengths - rest
    energy = .5 * stiffness * np.dot(strain, strain)
    if not derivatives:
        return float(energy)
    unit = vectors / lengths[:, None]
    force = stiffness * strain[:, None] * unit
    gradient = np.zeros_like(points)
    np.add.at(gradient, edges[:, 0], force)
    np.add.at(gradient, edges[:, 1], -force)
    blocks = stiffness * (unit[:, :, None] * unit[:, None, :]
                          + np.maximum(0., 1 - rest / lengths)[:, None, None] * np.eye(3))
    top = np.concatenate([blocks, -blocks], axis=2)
    blocks = np.concatenate([top, -top], axis=1)
    dofs = (3 * edges[:, :, None] + np.arange(3)).reshape(-1, 6)
    rows = np.broadcast_to(dofs[:, :, None], blocks.shape).ravel()
    cols = np.broadcast_to(dofs[:, None, :], blocks.shape).ravel()
    hessian = sparse.coo_matrix((blocks.ravel(), (rows, cols)),
                                shape=(points.size, points.size)).tocsc()
    return float(energy), gradient, hessian


class BendingProbe(JacketProbe):
    def __init__(self, data, stiffness):
        super().__init__(data)
        edge_opposites = {}
        for face in data['faces']:
            for i in range(3):
                edge = tuple(sorted((int(face[i]), int(face[(i + 1) % 3]))))
                edge_opposites.setdefault(edge, []).append(int(face[(i + 2) % 3]))
        self.hinges = np.asarray(sorted({tuple(sorted(v)) for v in edge_opposites.values()
                                        if len(v) == 2 and v[0] != v[1]}))
        self.hinge_rest = np.linalg.norm(self.x[self.hinges[:, 0]] - self.x[self.hinges[:, 1]], axis=1)
        self.bending_stiffness = stiffness

    def energy(self, x, progress, target, jacobian, derivatives=False):
        base = super().energy(x, progress, target, jacobian, derivatives)
        bend = spring_terms(x, self.hinges, self.hinge_rest, self.bending_stiffness, derivatives)
        if not derivatives:
            return base + bend
        return (base[0] + bend[0],
                base[1] + np.asarray(jacobian.T @ bend[1].ravel()).ravel(),
                base[2] + jacobian.T @ bend[2] @ jacobian)


def hinge_control():
    # Flat two-triangle patch versus the same patch folded nearly closed.
    flat = np.array([[0., 0., 0.], [1., 0., 0.], [.5, 1., 0.], [.5, -1., 0.]])
    folded = flat.copy()
    folded[3] = [.5, .99, .1]
    edges, rest = np.array([[2, 3]]), np.array([2.])
    clear_energy = spring_terms(flat, edges, rest, .04)
    energy, gradient, _ = spring_terms(folded, edges, rest, .04, True)
    assert clear_energy == 0 and energy > .05
    rotation = np.array([[0., -1., 0.], [1., 0., 0.], [0., 0., 1.]])
    assert abs(spring_terms(folded @ rotation + 3, edges, rest, .04) - energy) < 1e-12
    direction = np.random.default_rng(427).normal(size=flat.shape)
    epsilon = 1e-6
    numeric = (spring_terms(folded + epsilon * direction, edges, rest, .04)
               - spring_terms(folded - epsilon * direction, edges, rest, .04)) / (2 * epsilon)
    error = abs(numeric - np.sum(gradient * direction))
    assert error < 1e-8
    return {'flat_energy': clear_energy, 'folded_energy': energy,
            'gradient_absolute_error': float(error), 'rigid_transform_invariant': True,
            'passed': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--stiffness', type=float, default=.04)
    args = parser.parse_args()
    assert args.stiffness >= 0  # Zero is the matched correction-without-bending control.
    data = np.load(args.input)
    snapshot = np.load(args.snapshot)
    frame = float(snapshot['source_frame'])
    matches = np.flatnonzero(abs(data['frames'] - frame) < 1e-9)
    assert len(matches) == 1, 'Static trial requires an original input pose'
    index = int(matches[0])
    probe = BendingProbe(data, args.stiffness)
    probe.progress_force *= len(probe.free) / 87
    probe.progress_damping = probe.progress_force
    probe.x = probe.kinematics(index)
    probe.x[:probe.n] = snapshot['panels'][0]
    probe.path_start = probe.x.copy()
    probe.data = {key: (data[key][[index, index]] if key in ['panel', 'body', 'top', 'frames']
                        else data[key]) for key in data.files}
    calibration = {'hinge': hinge_control(), 'reduced_gradient': probe.derivative_control()}
    result, surfaces = probe.solve(max_iterations=120, max_subdivisions=0)
    result.update(scope=__doc__, controls=calibration, hinge_count=len(probe.hinges),
                  bending_stiffness=args.stiffness, static_source_frame=frame,
                  whole_reduced_midsurface_included=True, fabric_thickness_included=False,
                  completed_full_arm_lowering=False,
                  temporary_input_sha256=hashlib.sha256(args.input.read_bytes()).hexdigest(),
                  snapshot_sha256=hashlib.sha256(args.snapshot.read_bytes()).hexdigest(),
                  status='STATIC_BENDING_DIAGNOSTIC_NOT_PROMOTED')
    result.pop('remaining_jacket_and_wall_thickness_included', None)
    np.savez_compressed(args.result, panels=surfaces)
    args.report.write_text(json.dumps(result, indent=2) + '\n')
