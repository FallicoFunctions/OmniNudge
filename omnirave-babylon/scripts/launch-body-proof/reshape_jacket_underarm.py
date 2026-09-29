"""Author a smooth underarm depth change on the regular jacket construction.

This changes only the initial free surface, which supplies native cloth rest
geometry. Pins, topology, body/top samples and later prescribed poses are fixed.
It is a construction diagnostic, not a sewn pattern or accepted garment.
"""

# Connection map: existing continuous jacket, unchanged three opening loops;
# compact symmetric depth deformation affects free underarm vertices only.
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def run(input_path, output, depth):
    assert 0 <= depth <= 0.05
    data = dict(np.load(input_path))
    before = data["panel"]
    points = before[0]
    radius = ((abs(points[:, 0]) - 0.215) / 0.105) ** 2
    radius += ((points[:, 2] - 1.37) / 0.12) ** 2
    weight = np.maximum(0, 1 - radius) ** 3
    weight[data["anchors"]] = 0
    data["panel"] = before.copy()
    data["panel"][0, :, 2] -= depth * weight
    assert np.array_equal(data["panel"][1:], before[1:])
    assert np.array_equal(data["panel"][:, data["anchors"]], before[:, data["anchors"]])
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, **data)
    report = {
        "scope": __doc__,
        "input": str(input_path.resolve()),
        "input_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "requested_depth_m": depth,
        "actual_max_depth_m": float(depth * weight.max()),
        "changed_free_vertices": int(np.count_nonzero(depth * weight)),
        "pins_and_later_samples_identical": True,
        "status": "PENDING_NATIVE_WALL_AND_MOTION_CHECKS",
    }
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--depth", type=float, required=True)
    args = parser.parse_args()
    run(args.input, args.output, args.depth)
