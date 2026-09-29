"""Collect the bounded Blender skill follow-up without promoting a model.

Run with ordinary Python after the Blender probes. Raw simulation arrays and
failed bind models remain temporary; the ledger retains scoped measurements,
controls, source hashes and selected diagnostic images.
"""

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parents[2]
OUTPUT = ROOT / "omnirave-babylon/assets-src/avatars/launch-body-proof"
GATES = [
    "midsurface_self_pairs",
    "wall_self_pairs",
    "wall_body_pairs",
    "wall_top_pairs",
    "reversed_offset_faces",
]


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_prefix(report):
    rows = report["samples"]
    first_bad = next(
        (i for i, row in enumerate(rows) if any(row[k] for k in GATES)), len(rows)
    )
    return {
        "checked_sample_count": len(rows),
        "clear_prefix_sample_count": first_bad,
        "clear_prefix_last_source_frame": rows[first_bad - 1]["source_frame"]
        if first_bad
        else None,
        "first_failing_sample": rows[first_bad] if first_bad < len(rows) else None,
        "continuous_motion_checked": False,
    }


def run(directory):
    baseline = read(directory / "baseline-model-hashes.json")
    assert len(baseline) == 32
    assert all(sha(ROOT / path) == digest for path, digest in baseline.items())
    current = {
        str(path.relative_to(ROOT))
        for suffix in ["*.blend", "*.glb"]
        for path in OUTPUT.glob(suffix)
    }
    assert current == set(baseline)
    native = {
        path.parent.name: read(path)
        for path in sorted(directory.glob("*/native-cloth.json"))
    }
    inspected = {
        path.parent.name: read(path)
        for path in sorted(directory.glob("*/native-wall-check.json"))
    }
    native_initial = native["native-none"]["samples"][-1]
    native_body = native["native-body"]["samples"][-1]
    native_top = native["native-top"]["samples"][-1]
    native_outer = native["native-outer"]["samples"][-1]
    assert native_initial["max_displacement_from_initial_m"] < 1e-6
    assert native_body["max_displacement_from_initial_m"] < 1e-6
    assert native_top["top_pairs"] > 0
    assert native_outer["max_displacement_from_initial_m"] < 1e-6
    assert native_outer["top_pairs"] == 0
    assert inspected["open-regular-verified-warmup"][
        "all_sampled_walls_clear_and_oriented"
    ]
    assert not inspected["open-regular-bending200"][
        "all_sampled_walls_clear_and_oriented"
    ]
    assert not inspected["open-regular-bending800"][
        "all_sampled_walls_clear_and_oriented"
    ]
    images = {}
    for case, filename in [
        ("open-regular-verified-warmup", "male-outfit04-blender-regular-tpose.png"),
        (
            "open-regular-bending200",
            "male-outfit04-blender-regular-motion-diagnostic.png",
        ),
    ]:
        source = directory / case / "native-walls-endpoint.png"
        shutil.copyfile(source, OUTPUT / filename)
        images[filename] = {
            "case": case,
            "sha256": sha(OUTPUT / filename),
            "accepted": False,
        }
    script_names = [
        "probe_blender_garment_transfer.py",
        "probe_fitted_garment_bind.py",
        "probe_native_jacket_cloth.py",
        "inspect_native_jacket_cloth.py",
        "rebuild_native_jacket_proxy.py",
        "summarize_blender_cloth_study.py",
    ]
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "status": "BLENDER_SETUP_AND_TOPOLOGY_REVISED_GARMENT_NOT_PROMOTED",
        "scope": "Resumed local garment work using blender-image-character-clothing. Native rest/binding, collider isolation, topology and evaluated 1 mm walls were checked. This is separate from the historical stopped IPC trajectory; no old fit was resumed.",
        "accepted": False,
        "model_preservation": {
            "unchanged_prior_binaries": 32,
            "new_model_binaries": 0,
            "sha256": baseline,
        },
        "transfer_probe": read(directory / "transfer/transfer-probe.json"),
        "fitted_bind_probes": {
            case: read(directory / case / "fitted-bind.json")
            for case in ["fitted-bind-tri", "fitted-bind-quad"]
        },
        "native_cloth_trials": native,
        "regular_construction_trials": {
            path.stem: read(path) for path in sorted(directory.glob("*input.json"))
        },
        "final_constructor_controls": {
            "open": read(directory / "controls-recheck/open-input.json"),
            "capped": read(directory / "controls-recheck/capped-input.json"),
            "array_replay_parity": read(directory / "controls-recheck/parity.json"),
        },
        "independent_sampled_wall_inspections": inspected,
        "independent_prefix_summaries": {
            case: checked_prefix(value) for case, value in inspected.items()
        },
        "matched_collider_finding": "At scale 1, with no self collision or external forcing, full shirt walls produced 5070 shirt crossing pairs by warm-up frame 11. Keeping only the outer shirt surface as the simulation collider retained submicron movement and zero tested crossings against the complete shirt. This is a measured configuration finding, not a universal collider rule.",
        "topology_finding": "QuadriFlow's preserve-boundary request did not retain either cuff hole. The corrected builder removes end-facing cap proposals before projection and explicitly requires three boundary loops. A 2 mm normal-ease construction has 2284 vertices, 4408 triangles and 162 boundary pins; it differs from the earlier construction and attachment sampling.",
        "limits": [
            "Strict nonadjacent, noncoplanar triangle crossings are sampled; continuous native-cloth trajectories were not checked.",
            "Simulation uses 10x geometry for the small configured distances. Distances are read back and converted to meters; fabric physics is not calibrated or scale-equivalent.",
            "The regular bend-200 trial has 36 initially clear stored frames but fails at source frame 18; later sampled midsurface recovery does not clear the path.",
            "Bend 800 also fails within stationary warm-up and reaches about 73 mm displacement there; higher stiffness is not an accepted fix.",
            "Counts across changed topologies are not comparable severity scores. Local elapsed times are not a speedup or device benchmark.",
            "Reference tailoring, full action, source/export, gameplay, both complete characters and the automated OmniAI pipeline remain unfinished.",
        ],
        "next_step": "Redesign the underarm rest pattern and its sleeve/torso transition on the corrected native setup; retain the clean openings and actual-wall checks. Do not repeat weight-transfer-only fixes or simply increase stiffness. The archived IPC trajectory remains stopped.",
        "images": images,
        "current_scripts_sha256": {name: sha(SCRIPTS / name) for name in script_names},
    }
    path = OUTPUT / "outfit04-blender-skill-study.json"
    path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(
        "BLENDER_SKILL_STUDY",
        len(native),
        "native trials, 32 preserved models, no promotion",
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    run(parser.parse_args().directory)
