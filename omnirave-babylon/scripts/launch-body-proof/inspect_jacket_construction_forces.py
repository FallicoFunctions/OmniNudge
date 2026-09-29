"""Read-only endpoint-force comparison; progress is fixed in the FD probe."""

import argparse
from pathlib import Path

import numpy as np
from probe_jacket_actual_walls import ActualWallProbe
from probe_jacket_construction import read, sha, write


def inspect(directory):
    output = {}
    for name in ("control", "underarm_rest_depth", "underarm_layout"):
        prefix = directory / name
        with np.load(str(prefix) + "-input.npz") as archive:
            data = {k: archive[k] for k in archive.files}
        result = read(str(prefix) + ".json")
        assert result["result_source_frames"] == [20.5, 20.0]
        with np.load(str(prefix) + ".npz") as archive:
            panels = archive["panels"]
        probe = ActualWallProbe(data, bounds=True)
        probe.bounded_ccd = probe.fast_bounds = True
        first = int(np.flatnonzero(data["frames"] == 20.5)[0])
        last = int(np.flatnonzero(data["frames"] == 20.0)[0])
        start, target = probe.kinematics(first), probe.kinematics(last)
        end = target.copy()
        start[: probe.n], end[: probe.n] = panels
        probe.path_start = start
        delta = target - start
        delta[probe.free] = 0
        jacobian = probe.jacobian(delta)
        value, gradient, _ = probe.energy(end, 1.0, target, jacobian, True)
        direction = np.zeros(probe.nf + 1)
        direction[int(np.argmax(abs(gradient[:-1])))] = 0.001
        displacement = np.asarray(jacobian @ direction).reshape(end.shape)
        epsilon = 1e-5
        measured = (
            probe.energy(end + epsilon * displacement, 1.0, target, jacobian)
            - probe.energy(end - epsilon * displacement, 1.0, target, jacobian)
        ) / (2 * epsilon)
        predicted = float(gradient @ direction)
        error = abs(measured - predicted)
        passed = error < 1e-11 + 1e-3 * abs(predicted)
        assert passed
        output[name] = {
            "input_sha256": sha(str(prefix) + "-input.npz"),
            "result_sha256": sha(str(prefix) + ".npz"),
            "energy": float(value),
            "free_gradient_max": float(abs(gradient[:-1]).max()),
            "free_gradient_l2": float(np.linalg.norm(gradient[:-1])),
            "largest_free_gradient_finite_difference": {
                "measured": measured,
                "predicted": predicted,
                "absolute_error": error,
                "passed": passed,
            },
            "meets_endpoint_free_gradient_1e_5": bool(abs(gradient[:-1]).max() < 1e-5),
        }
    write(directory / "endpoint-gradients.json", output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    inspect(parser.parse_args().directory)
