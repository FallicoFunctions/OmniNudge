"""Fit structured torso rings to measured body and shirt radial envelopes.

The authored connectivity and sleeve proportions stay explicit. Torso fitting
uses ray measurements in the shared T-pose, then updates the three connecting
sleeve-cap rings consistently. This is a rest fit, not a pose contact repair.
The complete evaluated wall screen remains the acceptance gate.
"""

# Connection map: torso armhole vertices are shared, and cap-ring offsets fade
# to zero at the first full sleeve section. No independent overlapping pieces.
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from probe_blender_garment_transfer import SOURCE
from validate_body05_tops import geometry


def run(pattern, output, ease, side_ease=None):
    assert 0.005 <= ease <= 0.025
    with np.load(pattern) as data:
        points, quads = data["points"].copy(), data["quads"].copy()
    report = json.loads(pattern.with_suffix(".json").read_text())
    assert report["output_sha256"] == hashlib.sha256(pattern.read_bytes()).hexdigest()
    source = SOURCE / "male-outfit04.blend"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.scene.frame_set(31)
    bpy.context.view_layer.update()
    trees = [
        BVHTree.FromPolygons(*geometry(bpy.data.objects[n]), all_triangles=True)
        for n in ["AvatarBody", "AvatarTop_tailored"]
    ]
    original = points.copy()
    measurements = []
    for i, (point, record) in enumerate(zip(original, report["vertex_records"])):
        if record["region"] == "sleeve":
            continue
        center = np.array([0.0, -0.02, point[2]])
        direction = point - center
        radius = np.linalg.norm(direction)
        direction /= radius
        distances = []
        for tree in trees:
            hit, _, _, distance = tree.ray_cast(
                Vector(center + 0.4 * direction), Vector(-direction), 0.4
            )
            if hit is not None:
                distances.append(0.4 - distance)
        assert distances, (i, point)
        allowance = ease
        if side_ease is not None:
            side_weight = float(np.clip((abs(direction[0]) - 0.80) / 0.18, 0, 1))
            side_weight = side_weight * side_weight * (3 - 2 * side_weight)
            height_weight = 1 - float(np.clip((point[2] - 1.36) / 0.045, 0, 1))
            allowance = ease + (side_ease - ease) * side_weight * height_weight
            if point[2] < 1.26:
                allowance = min(allowance, 0.006)
        desired = max(distances) + allowance
        points[i] = center + direction * desired
        measurements.append(
            {
                "vertex": i,
                "required_radius_m": max(distances),
                "authored_radius_m": radius,
                "fitted_radius_m": desired,
            }
        )
    for i, record in enumerate(report["vertex_records"]):
        if record["region"] == "sleeve" and record["ring"] < 3:
            blend = [0.33, 0.67, 1.0][record["ring"]]
            v = report["armholes"][record["side"]][record["radial"]]
            points[i] += (points[v] - original[v]) * (1 - blend)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, points=points, quads=quads)
    report.update(
        rest_fit_scope=__doc__,
        source_sha256=digest,
        original_pattern_sha256=report["output_sha256"],
        torso_ease_m=ease,
        side_ease_m=side_ease,
        radial_measurements=measurements,
        maximum_rest_change_m=float(np.linalg.norm(points - original, axis=1).max()),
        output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
        bounds_m=[points.min(axis=0).tolist(), points.max(axis=0).tolist()],
    )
    output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    print(
        "ARMHOLE_REST_FIT",
        len(measurements),
        report["maximum_rest_change_m"],
        report["bounds_m"],
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pattern", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ease", type=float, default=0.015)
    parser.add_argument("--side-ease", type=float)
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    run(args.pattern, args.output, args.ease, args.side_ease)
