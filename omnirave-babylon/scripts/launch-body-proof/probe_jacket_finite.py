"""Bounded finite-clearance/fold-resistance experiment, never a model export.

The default policy retains native zero-distance CCD. Optional bounded policies
require interval certificates for zero/finite clearance; fast mode omits the
unused capped-native diagnostic query. Independent reconstructed-wall native
zero-distance validation remains mandatory. Additional 1.2 mm clearance applies
to self pairs beyond three mesh
edge hops, and 0.7 mm to body/top. Local neighbors are excluded ONLY from the
additional clearance constraint: their small rest triangles cannot satisfy a
blanket fabric gap. Cosine hinge resistance addresses local fold-back from
T-pose. These constraints are not a volumetric fabric or calibrated physics
law. The selected actual wall construction must pass an independent screen
after each retained pose; a coarse clearance pass never promotes the jacket.
The reduced-wall option is a separate lower-detail topology experiment,
not a repair or acceptance of the original detailed wall transfer.
"""

import argparse
import hashlib
import json
import resource
import subprocess
from pathlib import Path

import ipctk
import numpy as np
from finite_clearance_bounds import bound_controls, clearance_bound
from probe_jacket_ipc import JacketProbe, assembly_control
from probe_panel_ipc import controls
from scipy import sparse


def hinge_data(faces):
    adjacent = {}
    for face in faces:
        for i in range(3):
            a, b, c = np.roll(face, -i)
            adjacent.setdefault(tuple(sorted((int(a), int(b)))), []).append(
                (int(a), int(b), int(c))
            )
    # Each hinge uses ordered faces (a,b,c), (b,a,d).
    hinges = []
    for values in adjacent.values():
        if len(values) == 2:
            a, b, c = values[0]
            bb, aa, d = values[1]
            assert (a, b) == (aa, bb), "Inconsistent face winding"
            hinges.append((a, b, c, d))
    return np.asarray(hinges)


def cosine_terms(points, hinges, rest_cosine=None, stiffness=1e-5, derivatives=False):
    """Exact gradient of a one-sided rest-cosine penalty; PSD GN Hessian."""
    local = points[hinges]
    a, b, c, d = (local[:, i] for i in range(4))
    u, v, w = b - a, c - a, d - b
    n0, n1 = np.cross(u, v), np.cross(-u, w)
    l0, l1 = np.linalg.norm(n0, axis=1), np.linalg.norm(n1, axis=1)
    assert min(l0.min(), l1.min()) > 1e-12, "Collapsed hinge triangle"
    n0, n1 = n0 / l0[:, None], n1 / l1[:, None]
    cosine = np.clip(np.sum(n0 * n1, axis=1), -1.0, 1.0)
    if rest_cosine is None:
        return cosine
    residual = np.minimum(cosine - rest_cosine, 0.0)
    energy = 0.5 * stiffness * np.dot(residual, residual)
    if not derivatives:
        return float(energy)
    # Reverse-mode differentiation through normalized triangle cross products.
    g0 = (n1 - cosine[:, None] * n0) / l0[:, None]
    g1 = (n0 - cosine[:, None] * n1) / l1[:, None]
    du0, dv = np.cross(v, g0), np.cross(g0, u)
    du1, dw = np.cross(w, g1), np.cross(g1, -u)
    dc = np.stack([-du0 - dv + du1, du0 - du1 - dw, dv, dw], axis=1)
    gradient = np.zeros_like(points)
    for i in range(4):
        np.add.at(gradient, hinges[:, i], stiffness * residual[:, None] * dc[:, i])
    dofs = (hinges[:, :, None] * 3 + np.arange(3)).reshape(-1, 12)
    deriv = dc.reshape(-1, 12) * (residual < 0)[:, None]
    jac = sparse.coo_matrix(
        (deriv.ravel(), (np.repeat(np.arange(len(hinges)), 12), dofs.ravel())),
        shape=(len(hinges), points.size),
    ).tocsc()
    return float(energy), gradient, stiffness * (jac.T @ jac)


def finite_controls():
    # Parallel triangles approach to 0.8 mm but never cross: zero-thickness
    # CCD must pass and 1 mm clearance CCD must fail.
    faces = np.array([[0, 1, 2], [3, 4, 5]])
    start = np.array(
        [
            [-1.0, -1, 0],
            [1, -1, 0],
            [0, 1, 0],
            [-0.1, -0.1, 0.002],
            [0.1, -0.1, 0.002],
            [0, 0.1, 0.002],
        ]
    )
    end = start.copy()
    end[3:, 2] = 0.0008
    mesh = ipctk.CollisionMesh(start, ipctk.edges(faces), faces)
    assert ipctk.is_step_collision_free(mesh, start, end)
    assert not ipctk.is_step_collision_free(mesh, start, end, min_distance=0.001)
    alpha = ipctk.compute_collision_free_stepsize(mesh, start, end, min_distance=0.001)
    assert 0 < alpha < (1 / 1.2)
    assert ipctk.is_step_collision_free(
        mesh, start, start + alpha * (end - start), min_distance=0.001
    )
    near = start.copy()
    near[3:, 2] = 0.0011
    contacts = ipctk.NormalCollisions()
    contacts.build(mesh, near, 0.0003, dmin=0.001)
    barrier = ipctk.BarrierPotential(0.0003, 1e7)
    gradient = barrier.gradient(contacts, mesh, near).reshape(-1, 3)

    def e(x):
        contacts.build(mesh, x, 0.0003, dmin=0.001)
        return barrier(contacts, mesh, x)

    direction = np.zeros_like(near)
    direction[3:, 2] = 1
    eps = 1e-8
    measured = (e(near + eps * direction) - e(near - eps * direction)) / (2 * eps)
    relative = abs(measured - np.sum(gradient * direction)) / abs(measured)
    assert relative < 1e-5
    flat = np.array([[0.0, 0, 0], [1, 0, 0], [0.5, 1, 0], [0.5, -1, 0]])
    hinges = np.array([[0, 1, 2, 3]])
    rest = cosine_terms(flat, hinges)
    folded = flat.copy()
    folded[3] = [0.5, 0.8, 0.6]
    value, g, _ = cosine_terms(folded, hinges, rest, 1e-5, True)
    direction = np.random.default_rng(721).normal(size=flat.shape)
    eps = 1e-6
    derivative = (
        cosine_terms(folded + eps * direction, hinges, rest)
        - cosine_terms(folded - eps * direction, hinges, rest)
    ) / (2 * eps)
    error = abs(derivative - np.sum(g * direction))
    rotation = np.array([[0.0, -1, 0], [1, 0, 0], [0, 0, 1]])
    assert cosine_terms(flat, hinges, rest) == 0 and value > 1e-5 and error < 1e-10
    assert abs(cosine_terms(folded @ rotation + 3, hinges, rest) - value) < 1e-12
    return {
        "noncrossing_clearance_violation_detected": True,
        "finite_ccd_safe_fraction": float(alpha),
        "finite_barrier_gradient_relative_error": float(relative),
        "folded_hinge_gradient_absolute_error": float(error),
        "hinge_rigid_transform_invariant": True,
        "passed": True,
    }


def finite_tolerance_control():
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "assets-src/avatars/launch-body-proof/outfit04-finite-ccd-control.json"
    )
    fixture = json.loads(fixture_path.read_text())
    start = np.asarray(fixture["start_points_m"])
    end = np.asarray(fixture["end_points_m"])
    edges = np.asarray(fixture["edges"])
    faces = np.empty((0, 3), dtype=int)
    mesh = ipctk.CollisionMesh(start, edges, faces)
    stencil = ipctk.EdgeEdgeCandidate(0, 1)
    distance = float(np.sqrt(stencil.compute_distance(start, edges, faces)))
    # Distance between moving segments is Lipschitz under their maximum
    # endpoint displacements. This bound covers ALL times, not just samples.
    lower_bound = (
        distance
        - np.linalg.norm(end[:2] - start[:2], axis=1).max()
        - np.linalg.norm(end[2:] - start[2:], axis=1).max()
    )
    gap = fixture["minimum_required_distance_m"]
    assert lower_bound > gap
    tight = ipctk.TightInclusionCCD(tolerance=1e-10)
    default_clear = bool(
        ipctk.is_step_collision_free(mesh, start, end, min_distance=gap)
    )
    tight_clear = bool(
        ipctk.is_step_collision_free(
            mesh, start, end, min_distance=gap, narrow_phase_ccd=tight
        )
    )
    collision_end = start.copy()
    collision_end[2:] += start[0] - start[2]
    negative_rejected = not ipctk.is_step_collision_free(
        mesh, start, collision_end, min_distance=gap, narrow_phase_ccd=tight
    )
    assert tight_clear and negative_rejected
    return {
        "fixture_sha256": hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
        "minimum_required_distance_m": gap,
        "continuous_distance_lower_bound_m": float(lower_bound),
        "default_tolerance_reports_clear": default_clear,
        "tightened_tolerance_reports_clear": tight_clear,
        "tightened_tolerance_rejects_colliding_control": negative_rejected,
        "tightened_tolerance": 1e-10,
        "passed": True,
    }


class FiniteProbe(JacketProbe):
    def __init__(
        self, data, bending=1e-5, finite=True, ccd_tolerance=1e-10, bounds=False
    ):
        super().__init__(data)
        self.finite_ccd_tolerance = ccd_tolerance
        self.finite_ccd = ipctk.TightInclusionCCD(tolerance=ccd_tolerance)
        self.use_clearance_bounds = bounds
        self.bound_statistics = {
            "calls": 0,
            "clear": 0,
            "rejected": 0,
            "distance_queries": 0,
        }
        self.hinges = hinge_data(data["faces"])
        self.rest_cosine = cosine_terms(self.x, self.hinges)
        self.bending = bending
        self.progress_force *= len(self.free) / 87
        self.progress_damping = self.progress_force
        neighbors = [{i} for i in range(self.n)]
        for a, b in self.edges:
            neighbors[a].add(b)
            neighbors[b].add(a)
        near = neighbors
        for _ in range(2):
            near = [set().union(*(neighbors[j] for j in row)) for row in near]
        excluded = {(a, b): False for a, row in enumerate(near) for b in row if a < b}
        self.excluded_vertex_pairs = len(excluded)
        active = ipctk.make_static_obstacle_filter(self.n)
        cross = ipctk.make_vertex_patches_filter(
            np.r_[np.zeros(self.n, dtype=int), np.ones(len(self.x) - self.n, dtype=int)]
        )
        self.clearance = []
        if finite:
            for label, filter, gap in [
                (
                    "nonlocal_self",
                    active & ~cross & ipctk.make_sparse_filter(excluded, True),
                    0.0012,
                ),
                ("body_and_top", active & cross, 0.0007),
            ]:
                mesh = ipctk.CollisionMesh(self.x, self.mesh.edges, self.mesh.faces)
                mesh.can_collide = filter
                collisions = ipctk.NormalCollisions()
                self.clearance.append((label, mesh, collisions, gap))
        self.initial_distances = self.distances(self.x)
        for label, mesh, collisions, gap in self.clearance:
            assert self.initial_distances[label] > gap, (
                "Initial clearance invalid",
                label,
            )
            assert ipctk.is_step_collision_free(
                mesh, self.x, self.x, min_distance=gap, narrow_phase_ccd=self.finite_ccd
            )

    def distances(self, x):
        values = {}
        for label, mesh, c, gap in self.clearance:
            c.build(mesh, x, 0.01)
            values[label] = float(np.sqrt(c.compute_minimum_distance(mesh, x)))
        return values

    def step_clear(self, start, end):
        if not super().step_clear(start, end):
            return False
        for _, mesh, _, gap in self.clearance:
            clear = ipctk.is_step_collision_free(
                mesh, start, end, min_distance=gap, narrow_phase_ccd=self.finite_ccd
            )
            if not clear and self.use_clearance_bounds:
                clear, statistics = clearance_bound(mesh, start, end, gap)
                self.bound_statistics["calls"] += 1
                self.bound_statistics["clear" if clear else "rejected"] += 1
                self.bound_statistics["distance_queries"] += statistics[
                    "distance_queries"
                ]
            if not clear:
                return False
        return True

    def step_size(self, start, end):
        if self.use_clearance_bounds:
            # This is only a proposal. The line search still MUST pass the
            # finite-distance CCD or conservative bound for every constraint,
            # on both the optimizer step and complete animation interval.
            return super().step_size(start, end)
        return min(
            [super().step_size(start, end)]
            + [
                float(
                    ipctk.compute_collision_free_stepsize(
                        mesh,
                        start,
                        end,
                        min_distance=gap,
                        narrow_phase_ccd=self.finite_ccd,
                    )
                )
                for _, mesh, _, gap in self.clearance
            ]
        )

    def energy(self, x, progress, target, jacobian, derivatives=False):
        base = super().energy(x, progress, target, jacobian, derivatives)
        bend = cosine_terms(x, self.hinges, self.rest_cosine, self.bending, derivatives)
        if derivatives:
            value = base[0] + bend[0]
            g = bend[1]
            h = bend[2]
        else:
            value = base + bend
        for fraction in self.path_fractions:
            path = self.path_start + fraction * (x - self.path_start)
            for _, mesh, c, gap in self.clearance:
                c.build(mesh, path, self.dhat, dmin=gap)
                value += self.barrier(c, mesh, path) / len(self.path_fractions)
                if derivatives:
                    g += (
                        fraction
                        / len(self.path_fractions)
                        * self.barrier.gradient(c, mesh, path).reshape(-1, 3)
                    )
                    h += (
                        fraction**2
                        / len(self.path_fractions)
                        * self.barrier.hessian(
                            c, mesh, path, ipctk.PSDProjectionMethod.CLAMP
                        )
                    )
        if not derivatives:
            return float(value)
        return (
            float(value),
            base[1] + np.asarray(jacobian.T @ g.ravel()).ravel(),
            base[2] + jacobian.T @ h @ jacobian,
        )


def resume_probe(probe, prefix, input_hash, wall_variant, source_frame=None):
    """Restore positions only; retain the original T-pose constitutive state."""
    report_path = Path(str(prefix) + ".json")
    result_path = Path(str(prefix) + ".npz")
    report = json.loads(report_path.read_text())
    assert report["input_sha256"] == input_hash, "Checkpoint input differs"
    assert report["source_sha256"] == str(probe.data["source_sha256"])
    assert report["completed_all_segments"] or report.get(
        "retained_prefix_intervals_complete", False
    )
    assert report["linear_motion_gate_passed"]
    assert all(
        row["reason"] == "CONVERGED"
        and row["progress"] > 1 - 1e-7
        and row["endpoint_linear_interpolation_clear"]
        and not row["endpoint_intersections"]
        and not row.get("external_screen_rejected", False)
        for row in report["segments"]
    )
    assert all(row["passed"] for row in report["screens"])
    assert report["wall_variant"] == wall_variant
    assert report["cosine_bending_stiffness"] == probe.bending
    assert report["finite_ccd_tolerance"] == probe.finite_ccd_tolerance
    assert report["conservative_clearance_bounds"] == probe.use_clearance_bounds
    assert not report.get("actual_wall_barrier", False) or hasattr(
        probe, "wall_barrier"
    ), "Cannot drop an active wall barrier when resuming"
    assert not report.get("bounded_ccd", False) or getattr(probe, "bounded_ccd", False)
    assert report["finite_clearance_m"] == {
        name: gap for name, _, _, gap in probe.clearance
    }
    assert report["local_zero_thickness_crossing_checks_retained"]
    for key, value in report["settings"].items():
        if key == "position_tolerance_m":
            # A separately reported numerical stopping choice does not
            # change the retained rest state, energy or collision constraints.
            continue
        expected = getattr(probe, key)
        assert value == (list(expected) if isinstance(expected, tuple) else expected)
    frames = np.asarray(report["result_source_frames"])
    assert len(frames) == len(report["segments"]) + 1 == len(report["screens"])
    assert frames[1:].tolist() == [row["source_frame"] for row in report["segments"]]
    assert frames.tolist() == [row["source_frame"] for row in report["screens"]]
    frame = frames[-1] if source_frame is None else source_frame
    saved = np.flatnonzero(frames == frame)
    original = np.flatnonzero(probe.data["frames"] == frame)
    assert len(saved) == len(original) == 1, "Resume requires an exact source sample"
    saved_index, sample = int(saved[0]), int(original[0])
    assert 0 < sample < len(probe.data["frames"]) - 1, "No pending interval"
    with np.load(result_path) as archive:
        panels = archive["panels"]
    assert panels.shape == (len(frames), probe.n, 3) and np.isfinite(panels).all()
    expected = probe.kinematics(sample)
    anchor_error = float(
        np.max(abs(panels[saved_index, probe.anchors] - expected[probe.anchors]))
    )
    assert anchor_error < 1e-9, "Checkpoint anchors differ from prescribed motion"
    rest = probe.rest.copy()
    rest_cosine = probe.rest_cosine.copy()
    probe.data = {
        key: value[sample:] if key in ["panel", "body", "top", "frames"] else value
        for key, value in probe.data.items()
    }
    probe.x = expected
    probe.x[: probe.n] = panels[saved_index]
    probe.path_start = probe.x.copy()
    assert np.array_equal(probe.rest, rest)
    assert np.array_equal(probe.rest_cosine, rest_cosine)
    assert probe.step_clear(probe.x, probe.x), "Checkpoint clearance fails"
    return {
        "source_frame": float(frame),
        "report_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest(),
        "result_sha256": hashlib.sha256(result_path.read_bytes()).hexdigest(),
        "original_rest_lengths_sha256": hashlib.sha256(rest.tobytes()).hexdigest(),
        "original_rest_cosines_sha256": hashlib.sha256(
            rest_cosine.tobytes()
        ).hexdigest(),
        "original_rest_state_retained": True,
        "additional_actual_wall_barrier_enabled": (
            hasattr(probe, "wall_barrier")
            and not report.get("actual_wall_barrier", False)
        ),
        "maximum_anchor_error_m": anchor_error,
        "resume_clearance_minima_m": probe.distances(probe.x),
        "prior_position_tolerance_m": report["settings"].get(
            "position_tolerance_m", 1e-9
        ),
        "current_position_tolerance_m": probe.position_tolerance_m,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-prefix", type=Path, required=True)
    parser.add_argument("--intervals", type=int, default=1)
    parser.add_argument("--bending", type=float, default=1e-5)
    parser.add_argument("--ccd-tolerance", type=float, default=1e-10)
    parser.add_argument("--clearance-bounds", action="store_true")
    parser.add_argument("--actual-wall-barrier", action="store_true")
    parser.add_argument("--bounded-ccd", action="store_true")
    parser.add_argument("--fast-bounds", action="store_true")
    parser.add_argument("--position-tolerance-m", type=float, default=1e-9)
    parser.add_argument("--resume-prefix", type=Path)
    parser.add_argument("--resume-source-frame", type=float)
    parser.add_argument("--zero-clearance-control", action="store_true")
    parser.add_argument(
        "--wall-construction", choices=["original", "reduced"], default="original"
    )
    parser.add_argument(
        "--require-wall-clear",
        action="store_true",
        help="Exit with failure after writing evidence if the bounded screen fails",
    )
    parser.add_argument(
        "--blender", default="/Applications/Blender.app/Contents/MacOS/Blender"
    )
    args = parser.parse_args()
    assert args.intervals > 0 and args.bending >= 0
    assert 0 < args.position_tolerance_m <= 1e-4
    assert args.resume_source_frame is None or args.resume_prefix is not None
    assert 0 < args.ccd_tolerance <= 1e-6
    original = np.load(args.input)
    assert str(original["region"]) == "whole_jacket"
    assert args.intervals < len(original["frames"])
    data = {
        k: (
            original[k][: args.intervals + 1]
            if k in ["panel", "body", "top", "frames"]
            else original[k]
        )
        for k in original.files
    }
    probe_class = FiniteProbe
    if args.actual_wall_barrier:
        assert args.wall_construction == "reduced"
        from probe_jacket_actual_walls import ActualWallProbe

        probe_class = ActualWallProbe
    probe = probe_class(
        data,
        args.bending,
        not args.zero_clearance_control,
        args.ccd_tolerance,
        args.clearance_bounds,
    )
    if args.bounded_ccd:
        assert args.actual_wall_barrier and args.clearance_bounds
        probe.bounded_ccd = True
    if args.fast_bounds:
        assert args.bounded_ccd
        probe.fast_bounds = True
    probe.position_tolerance_m = args.position_tolerance_m
    calibration = {
        "zero_thickness": controls(),
        "finite_and_hinge": finite_controls(),
        "finite_ccd_tolerance": finite_tolerance_control(),
        "conservative_clearance_bounds": bound_controls(
            json.loads(
                (
                    Path(__file__).resolve().parents[2]
                    / "assets-src/avatars/launch-body-proof/outfit04-finite-ccd-control.json"
                ).read_text()
            ),
            relative_motion=args.fast_bounds,
            batch_planes=args.fast_bounds,
        ),
        "base_assembly": assembly_control(data),
        "reduced_gradient": probe.derivative_control(),
    }
    screens = []
    wall_variant = (
        "transferred_walls"
        if args.wall_construction == "original"
        else "direct_coarse_1mm_walls"
    )
    input_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    resumed = None
    if args.resume_prefix is not None:
        resumed = resume_probe(
            probe,
            args.resume_prefix,
            input_hash,
            wall_variant,
            args.resume_source_frame,
        )
        data = probe.data
        calibration["resumed_reduced_gradient"] = probe.derivative_control()
    if args.actual_wall_barrier:
        calibration["actual_wall_derivatives"] = probe.wall_derivative_control()
    if args.bounded_ccd:
        calibration["bounded_ccd_policy"] = probe.bounded_controls()
    if args.fast_bounds:
        from batch_clearance_filter import batch_controls

        calibration["batch_plane_controls"] = batch_controls()

    # Each invocation reopens the preserved source and evaluates actual rig
    # obstacles independently of the solver. Missing/crashed screens stop work.
    def screen(row, surface):
        ordinal = len(screens)
        prefix = Path(str(args.output_prefix) + f"-screen{ordinal:03d}")
        np.savez_compressed(str(prefix) + ".npz", panels=surface[None, ...])
        Path(str(prefix) + ".json").write_text(
            json.dumps({"result_source_frames": [row["source_frame"]]})
        )
        report = Path(str(prefix) + "-independent.json")
        cmd = [
            args.blender,
            "--background",
            "--threads",
            "2",
            "--python-exit-code",
            "1",
            "--python",
            str(Path(__file__).with_name("inspect_jacket_ipc.py")),
            "--",
            "--input",
            str(args.input),
            "--result",
            str(prefix) + ".npz",
            "--solver-report",
            str(prefix) + ".json",
            "--report",
            str(report),
            "--all-samples",
        ]
        with Path(str(prefix) + ".log").open("w") as log:
            try:
                run = subprocess.run(
                    cmd, stdout=log, stderr=subprocess.STDOUT, timeout=180, check=False
                )
            except subprocess.TimeoutExpired:
                screens.append(
                    {
                        "source_frame": row["source_frame"],
                        "passed": False,
                        "error": "INDEPENDENT_SCREEN_TIMED_OUT",
                    }
                )
                return False
        if run.returncode or not report.exists():
            screens.append(
                {
                    "source_frame": row["source_frame"],
                    "passed": False,
                    "error": "INDEPENDENT_SCREEN_FAILED",
                    "log": str(prefix) + ".log",
                }
            )
            return False
        independent = json.loads(report.read_text())
        assert independent["source_sha256"] == str(data["source_sha256"])
        assert independent["source_frames_checked"] == [row["source_frame"]]
        pose = independent["poses"][0]
        passed = not any(pose[wall_variant].values()) and not any(
            pose["simulation"].values()
        )
        screens.append(
            {
                "source_frame": row["source_frame"],
                "passed": passed,
                "report": str(report),
                "wall_variant": wall_variant,
                "actual_walls": pose[wall_variant],
                "original_transferred_walls": pose["transferred_walls"],
                "clearance_minima_m": probe.distances(probe.x),
                "simulation_quality": pose["simulation_quality"],
            }
        )
        print("FINITE_WALL_SCREEN", json.dumps(screens[-1]), flush=True)
        return passed

    # The initial actual walls must pass before any motion is attempted.
    initial_pass = screen(
        {"source_frame": float(data["frames"][0])}, probe.x[: probe.n].copy()
    )
    probe.segment_observer = screen
    if initial_pass:
        if args.fast_bounds:
            probe.progress_snapshot_prefix = args.output_prefix
            probe.last_progress_log = 0.0
        result, surfaces = probe.solve(max_iterations=100, max_subdivisions=3)
    else:
        result = {
            "completed_all_segments": False,
            "linear_motion_gate_passed": False,
            "result_source_frames": [float(data["frames"][0])],
            "segments": [],
        }
        surfaces = probe.x[None, : probe.n].copy()
    result.update(
        scope=__doc__,
        controls=calibration,
        screens=screens,
        wall_variant=wall_variant,
        finite_ccd_tolerance=probe.finite_ccd_tolerance,
        conservative_clearance_bounds=probe.use_clearance_bounds,
        clearance_bound_statistics=probe.bound_statistics,
        initial_clearance_minima_m=probe.initial_distances,
        finite_clearance_m={name: gap for name, _, _, gap in probe.clearance},
        local_finite_clearance_exclusion_hops=3,
        excluded_local_vertex_pairs=probe.excluded_vertex_pairs,
        local_zero_thickness_crossing_checks_retained=True,
        cosine_bending_stiffness=args.bending,
        hinges=len(probe.hinges),
        initial_maximum_adjacent_angle_degrees=float(
            np.degrees(np.arccos(probe.rest_cosine.min()))
        ),
        input_sha256=input_hash,
        resumed_checkpoint=resumed,
        actual_wall_barrier=args.actual_wall_barrier,
        bounded_ccd=args.bounded_ccd,
        fast_bounds=args.fast_bounds,
        bounded_ccd_statistics=getattr(probe, "bounded_statistics", None),
        bounded_ccd_iteration_limit=10000
        if args.bounded_ccd and not args.fast_bounds
        else None,
        actual_wall_barrier_distance_m=getattr(probe, "wall_barrier_distance", None),
        actual_wall_linear_subinterval_checks=getattr(probe, "wall_checks", 0),
        input_source_frame_range=[float(data["frames"][0]), float(data["frames"][-1])],
        completed_full_arm_lowering=(
            result["completed_all_segments"]
            and float(data["frames"][-1]) == 1.0
            and all(r["passed"] for r in screens)
        ),
        model_exported=False,
        process_peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        status="EARLY_WALL_SCREEN_REJECTED_NOT_PROMOTED"
        if not all(r["passed"] for r in screens)
        else (
            "BOUNDED_SCREEN_ONLY_NOT_PROMOTED"
            if result["completed_all_segments"]
            else "BOUNDED_MOTION_FAILED_NOT_PROMOTED"
        ),
    )
    result.pop("remaining_jacket_and_wall_thickness_included", None)
    np.savez_compressed(str(args.output_prefix) + ".npz", panels=surfaces)
    Path(str(args.output_prefix) + ".json").write_text(
        json.dumps(result, indent=2) + "\n"
    )
    print("FINITE_REPORT", str(args.output_prefix) + ".json", flush=True)
    if args.require_wall_clear:
        assert result["completed_all_segments"] and all(r["passed"] for r in screens), (
            "Bounded motion/wall screen failed; no model was saved"
        )


if __name__ == "__main__":
    main()
