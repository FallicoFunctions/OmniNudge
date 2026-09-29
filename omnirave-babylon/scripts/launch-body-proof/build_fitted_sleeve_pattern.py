"""Author a closer sleeve envelope using measured T-pose body cross sections.

This is a new independent outline/depth construction, not a deformation of an
old garment. Approximate 4-16 mm local arm allowances motivate the profile;
actual complete body, shirt and 1 mm wall checks remain mandatory.
"""

# Connection map: shared front/back sleeve, shoulder and side seam vertices;
# retain the center-back weld, front opening, neck/hem and both cuff openings.
import argparse
import hashlib
import json
from pathlib import Path

import build_authored_jacket_pattern as builder
import numpy as np


def run(output, clearance_adjusted=False):
    original_outline = builder.OUTER.copy()
    original_depth = builder.surface_depth
    builder.OUTER = np.asarray(
        [
            [0.205, 1.015],
            [0.205, 1.25],
            [0.21, 1.325],
            [0.225, 1.355],
            [0.27, 1.368],
            [0.53, 1.382],
            [0.744, 1.40],
            [0.744, 1.46],
            [0.53, 1.48],
            [0.28, 1.475],
            [0.18, 1.515],
            [0.095, 1.535],
        ]
    )
    if clearance_adjusted:
        builder.OUTER[4, 1] = 1.364
    front_depth = (
        [0.145, 0.145, 0.065, 0.058, 0.03]
        if clearance_adjusted
        else [0.145, 0.145, 0.055, 0.048, 0.03]
    )
    back_depth = (
        [0.13, 0.13, 0.068, 0.05, 0.032]
        if clearance_adjusted
        else [0.13, 0.13, 0.06, 0.045, 0.03]
    )

    def fitted_depth(chart, front):
        old = original_depth(chart, front)
        previous = np.interp(
            chart[:, 0],
            [0, 0.18, 0.30, 0.55, 0.744],
            [0.145, 0.145, 0.078, 0.065, 0.043]
            if front
            else [0.13, 0.13, 0.078, 0.065, 0.043],
        )
        desired = np.interp(
            chart[:, 0],
            [0, 0.18, 0.27, 0.55, 0.744],
            front_depth if front else back_depth,
        )
        return -0.02 + (old + 0.02) * desired / previous

    builder.surface_depth = fitted_depth
    try:
        builder.run(output, 0.016, 0.03, True, True)
        report = json.loads(output.with_suffix(".json").read_text())
        report["scope"] = __doc__
        report["construction_variant"] = "FITTED_SLEEVE_OUTLINE_AND_DEPTH"
        report["retained_torso_and_neck_openings"] = True
        report["clearance_adjusted"] = clearance_adjusted
        report["depth_profiles_m"] = {
            "x": [0, 0.18, 0.27, 0.55, 0.744],
            "front": front_depth,
            "back": back_depth,
        }
        report["output_sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
        output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
    finally:
        builder.OUTER = original_outline
        builder.surface_depth = original_depth


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--clearance-adjusted", action="store_true")
    args = parser.parse_args()
    run(args.output, args.clearance_adjusted)
