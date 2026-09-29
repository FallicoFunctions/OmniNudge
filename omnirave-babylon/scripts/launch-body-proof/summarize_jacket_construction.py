"""Evaluate the predeclared local construction protocol, including failures."""

import argparse
import json
from pathlib import Path

import numpy as np
from probe_jacket_construction import edge_map, quality, read, sha, write
from probe_jacket_finite import cosine_terms, hinge_data


def metrics(data, end, target, selection_rest=None):
    rest, faces = data["panel"][0].astype(float), data["faces"]
    selection = rest if selection_rest is None else selection_rest
    radius = ((np.abs(selection[:, 0]) - 0.20) / 0.12) ** 2 + (
        (selection[:, 2] - 1.40) / 0.13
    ) ** 2
    # Classify using original geometry so changing rest depth cannot move a
    # difficult triangle outside the comparison region.
    roi = radius < 1
    edges = np.array(sorted(edge_map(faces)))
    rest_lengths = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
    lengths = np.linalg.norm(end[edges[:, 0]] - end[edges[:, 1]], axis=1)
    strain = abs(lengths / rest_lengths - 1)
    hinges = hinge_data(faces)
    angles = np.degrees(np.arccos(cosine_terms(end, hinges)))
    return {
        "global_p95_absolute_edge_strain": float(np.percentile(strain, 95)),
        "underarm_p95_absolute_edge_strain": float(
            np.percentile(strain[roi[edges].all(axis=1)], 95)
        ),
        "underarm_p95_fold_angle_degrees": float(
            np.percentile(angles[roi[hinges].all(axis=1)], 95)
        ),
        "global_maximum_fold_angle_degrees": float(angles.max()),
        "underarm_minimum_triangle_quality": float(
            quality(end, faces)[roi[faces].all(axis=1)].min()
        ),
        "original_anchor_maximum_error_m": float(
            np.max(abs(end[data["anchors"]] - target[data["anchors"]]))
        ),
    }


def main(args):
    protocol = read(args.directory / "protocol.json")
    reference_report = read(str(args.reference) + ".json")
    assert reference_report["completed_all_segments"]
    assert reference_report["result_source_frames"] == [20.5, 20.0]
    reference_iterations = sum(
        row["iterations"] for row in reference_report["segments"]
    )
    with np.load(protocol["variants"]["control"]["input"]) as archive:
        original = {k: archive[k] for k in archive.files}
    original_rest = original["panel"][0]
    target = original["panel"][22]
    assert original["frames"][22] == 20
    with np.load(str(args.reference) + ".npz") as archive:
        reference = archive["panels"][-1]
    baseline = metrics(original, reference, target)
    runs = read(args.directory / "runs.json")
    rows = []
    for run in runs["trials"]:
        name = run["variant"]
        row = {k: v for k, v in run.items() if k != "solver_report"}
        prefix = args.directory / name
        row["solver_log_sha256"] = sha(str(prefix) + ".log")
        if not Path(str(prefix) + ".json").exists():
            row["decision"] = "NO_COMPLETED_RESULT_NO_BENEFIT_CLAIM"
            rows.append(row)
            continue
        result = read(str(prefix) + ".json")
        with np.load(protocol["variants"][name]["input"]) as archive:
            data = {k: archive[k] for k in archive.files}
        with np.load(str(prefix) + ".npz") as archive:
            panels = archive["panels"]
        # Use the same original spatial mask for all variants, while computing
        # strain from each variant's own rest lengths.
        measured = metrics(data, panels[-1], target, original_rest)
        rest = data["panel"][0].astype(float)
        assert np.array_equal(data["anchors"], original["anchors"])
        row.update(
            solver=result,
            solver_metadata_amendment=(
                "The first driver version inherited the panel-only field "
                "remaining_jacket_and_wall_thickness_included=false. That field "
                "does not describe this whole-jacket ActualWallProbe subclass: "
                "reduced 1mm walls and their barrier are included, with bounded "
                "fast certificates during fitting and independent native wall "
                "checks afterward. The current driver removes that inherited "
                "field and records the explicit policy; no solve behavior changed."
            ),
            metrics=measured,
            result_sha256=sha(str(prefix) + ".npz"),
            solver_report_sha256=sha(str(prefix) + ".json"),
            changed_rest_max_coordinate_m=float(abs(rest - original_rest).max()),
            endpoint_max_coordinate_difference_from_reference_m=float(
                abs(panels[-1] - reference).max()
            ),
        )
        if Path(str(prefix) + "-path.json").exists():
            row["independent_wall_path"] = read(str(prefix) + "-path.json")
        if Path(str(prefix) + "-areas.json").exists():
            row["analytic_wall_areas"] = read(str(prefix) + "-areas.json")
        completed_clear = run["status"] == "COMPLETE_AND_CLEAR"
        iterations = result["segments"][-1]["iterations"]
        iterations_better = (
            iterations <= 40
            and iterations / reference_iterations
            <= 40 / protocol["protocol"]["reference_iterations"]
        )
        strain_better = (
            measured["underarm_p95_absolute_edge_strain"]
            <= 0.8 * baseline["underarm_p95_absolute_edge_strain"]
        )
        no_regression = (
            measured["global_p95_absolute_edge_strain"]
            <= 1.1 * baseline["global_p95_absolute_edge_strain"]
            and measured["underarm_p95_fold_angle_degrees"]
            <= baseline["underarm_p95_fold_angle_degrees"] + 5
            and measured["original_anchor_maximum_error_m"] < 1e-9
        )
        row["predeclared_benefit_gate"] = {
            "completed_and_clear": completed_clear,
            "iteration_reduction": iterations_better,
            "underarm_strain_reduction": strain_better,
            "within_predeclared_regression_limits": no_regression,
        }
        row["decision"] = (
            "LOCAL_CONSTRUCTION_CANDIDATE_REQUIRES_TPOSE_FIT"
            if completed_clear
            and no_regression
            and (iterations_better or strain_better)
            else "DOES_NOT_MEET_PREDECLARED_LOCAL_BENEFIT_GATE"
        )
        if name == "control":
            row["decision"] = (
                "MATCHED_CONTROL_COMPLETE_AND_CLEAR"
                if completed_clear
                else "MATCHED_CONTROL_FAILED_COMPARISON_REQUIRES_REVIEW"
            )
        rows.append(row)
    output = {
        "scope": "Same warm start and short motion; a local construction sensitivity experiment, not a continuous new garment fit, rig, export or acceptance.",
        "protocol": protocol,
        "reference_report_sha256": sha(str(args.reference) + ".json"),
        "reference_result_sha256": sha(str(args.reference) + ".npz"),
        "reference_metrics": baseline,
        "measured_reference_iterations": reference_iterations,
        "trials": rows,
        "completed": runs.get("finished", False),
        "new_model_binaries": 0,
        "visual_acceptance": False,
    }
    for name in ("endpoint-gradients", "matched-control"):
        path = args.directory / (name + ".json")
        if path.exists():
            output[name.replace("-", "_")] = read(path)
    output["endpoint_check_scope"] = (
        "Post-hoc force diagnostics supplement the predeclared gate. They do "
        "not change solver stopping rules or convert the layout iteration-limit "
        "result into a completed run. Cross-construction energies are not comparable."
    )
    write(args.output, output)
    print(
        json.dumps(
            {
                "reference": baseline,
                "trials": [
                    {
                        k: row[k]
                        for k in (
                            "variant",
                            "decision",
                            "metrics",
                            "predeclared_benefit_gate",
                        )
                        if k in row
                    }
                    for row in rows
                ],
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument(
        "--reference", type=Path, default=Path("/tmp/omnirave-finite-fast-control")
    )
    parser.add_argument("--output", type=Path, required=True)
    main(parser.parse_args())
