"""Read-only preservation, driver, fit and finite-motion collar audit."""

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path.cwd() / "omnirave-babylon/scripts/launch-body-proof"))
import audit_rigged_collar_deformation as D

A, N, E = D.A, D.N, D.E
p = argparse.ArgumentParser()
p.add_argument("--input", type=Path, required=True)
p.add_argument("--report", type=Path, required=True)
p.add_argument("--fit", type=Path, required=True)
p.add_argument("--quick", action="store_true")
args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
source = Path(
    "omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-collar-deformation-study/male-rigged-collar-deformation.blend"
)
sha = D.digest(source)
candidate_sha = D.digest(args.input)
source_report = json.loads((source.parent / "deformation-audit.json").read_text())
assert source_report["accepted"] and source_report["model_sha256"] == sha
assert (
    len(source_report["arm_samples"]) == 354
    and len(source_report["neck_samples"]) == 36
)
original_record = N.record
record_count = 0


def progress_record(*values):
    global record_count
    result = original_record(*values)
    record_count += 1
    if record_count % 25 == 0:
        print("CHECKED", record_count, flush=True)
    return result


N.record = progress_record
bpy.ops.wm.open_mainfile(filepath=str(source))
snap = D.without_connected(E.static_snapshot())
images = D.images()
s, r, c, b, h = A.scene_objects()
o = bpy.data.objects[N.CONNECTED]
core = E.mesh_core(o)
transform = E.transform(o)
basis = N.coordinates(o)
D.pose(s, r, 31)
ref, faces = N.geometry(o)
edges = N.edge_lengths(o, ref)
ref = A.array(ref)
D.pose(s, r, 1)
down = A.array(N.geometry(o)[0])
expected = []
for pose in ["overhead", "forward"]:
    D.pose(s, r, 31)
    r.animation_data.action = bpy.data.actions["Jacket review - " + pose + " reach"]
    A.sample(s, 49)
    names = [g.name for g in o.vertex_groups]
    weights = N.dense_weights(o, names).astype(np.float64)
    mats = np.asarray(
        [
            r.matrix_world
            @ r.pose.bones[n].matrix
            @ r.data.bones[n].matrix_local.inverted()
            @ r.matrix_world.inverted()
            for n in names
        ]
    )
    skin = np.einsum("vg,gij->vij", weights, mats)
    delta = np.load(args.fit / (pose + "-optimized.npz"))["posed_delta"]
    assert delta.shape == ref.shape and np.isfinite(delta).all()
    assert np.max(abs(delta)) <= 0.002000001 and np.count_nonzero(delta[:1152]) == 0
    assert np.array_equal(delta[1152::2], delta[1153::2])
    bind = np.linalg.solve(skin[:, :3, :3], delta[..., None])[:, :, 0]
    left = D.smooth((ref[:, 0] + 0.01) / 0.02)
    for owner in [left, 1 - left]:
        expected.append((basis + bind * owner[:, None]).astype(np.float32))
bpy.ops.wm.open_mainfile(filepath=str(args.input))
assert D.without_connected(E.static_snapshot()) == snap
assert D.images() == images
s, r, c, b, h = A.scene_objects()
o = bpy.data.objects[N.CONNECTED]
cc = E.mesh_core(o)
ct = E.transform(o)
for key in ["shape_arrays_sha256", "shape_array_shape"]:
    cc.pop(key)
    core.pop(key)
for key in ["shape_metadata", "shape_drivers"]:
    ct.pop(key)
    transform.pop(key)
assert cc == core and ct == transform
assert not N.winding_conflicts(N.oriented_faces(o))
assert np.array_equal(E.shape_array(o.data)[0], basis)
assert np.array_equal(
    E.shape_array(o.data)[:, :1152], np.repeat(basis[None, :1152], 5, axis=0)
)
assert [x.name for x in o.data.shape_keys.key_blocks] == [
    "Basis",
    "Collar overhead l",
    "Collar overhead r",
    "Collar forward l",
    "Collar forward r",
]
for f in o.data.shape_keys.animation_data.drivers:
    name = next(
        k.name
        for k in o.data.shape_keys.key_blocks
        if k.path_from_id("value") == f.data_path
    )
    _, pose, side = name.split()
    d = f.driver
    assert d.expression == "coat_value" and len(d.variables) == 1
    v = d.variables[0]
    assert v.name == "coat_value" and v.type == "SINGLE_PROP"
    assert v.targets[0].id == c.data.shape_keys and v.targets[
        0
    ].data_path == c.data.shape_keys.key_blocks[pose + "_reach_" + side].path_from_id(
        "value"
    )
assert len(o.data.shape_keys.animation_data.drivers) == 4
print("KEY_DELTA", float(np.max(abs(E.shape_array(o.data)[1:] - np.array(expected)))), flush=True)
assert np.array_equal(E.shape_array(o.data)[1:], np.array(expected))
assert o.data.shape_keys.use_relative
assert all(
    k.relative_key == o.data.shape_keys.key_blocks[0] and k.vertex_group == ""
    for k in o.data.shape_keys.key_blocks
)
for frame, goal in [(31, ref), (1, down)]:
    D.pose(s, r, frame)
    assert np.array_equal(A.array(N.geometry(o)[0]), goal)
hardware = [x for x in bpy.data.objects if x.get("jacketHardware")]
details = [bpy.data.objects[n] for n in N.REMAINING]
arm, neck, failures = D.run_motion(
    s, r, o, h, b, c, hardware, details, edges, args.quick
)
print("STANDARD", len(arm), len(neck), len(failures), flush=True)
unilateral = []
for pose in ["overhead", "forward"]:
    for frame in [49] if args.quick else [13, 25, 37, 49]:
        r.animation_data.action = bpy.data.actions["Jacket review - " + pose + " reach"]
        A.sample(s, frame)
        target = A.arm_basis(r)
        D.pose(s, r, 31)
        neutral = A.arm_basis(r)
        for side in A.SIDES:
            D.pose(s, r, 31)
            r.animation_data.action = None
            for other in A.SIDES:
                for part, matrix in (target if other == side else neutral)[
                    other
                ].items():
                    r.pose.bones[f"{part}_{other}"].matrix_basis = matrix
            A.update()
            row = N.record(r, o, h, b, c, hardware, details, edges)
            row.update(
                scope="unilateral " + pose,
                frame=frame,
                side=side,
                collar_keys={
                    k.name: float(k.value) for k in o.data.shape_keys.key_blocks
                },
            )
            unilateral.append(row)
            if not row["accepted"]:
                failures.append(row)
            print(
                "UNILATERAL",
                pose,
                frame,
                side,
                row["accepted"],
                row["edge_strain_percent"],
                flush=True,
            )
assert D.digest(source) == sha and D.digest(args.input) == candidate_sha
rows = arm + neck + unilateral
report = {
    "accepted": not failures,
    "model_sha256": candidate_sha,
    "source_sha256": sha,
    "auditor_sha256": D.digest(Path(__file__)),
    "fit_sha256": {
        pose: D.digest(args.fit / (pose + "-optimized.npz"))
        for pose in ["overhead", "forward"]
    },
    "source_static_and_basis_weights_exact": True,
    "source_pose_reconstructed_keys_exact": True,
    "t_and_down_exact": True,
    "source_relative_max_edge_strain_percent": max(
        x["edge_strain_percent"] for x in rows
    ),
    "arm_samples": arm,
    "neck_samples": neck,
    "unilateral_samples": unilateral,
    "failures": failures,
}
args.report.write_text(json.dumps(report, indent=2) + "\n")
print(
    "RESULT",
    report["accepted"],
    report["source_relative_max_edge_strain_percent"],
    len(failures),
    flush=True,
)

assert not failures, f"{len(failures)} finite-motion failures"
