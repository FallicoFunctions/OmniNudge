"""Install a finite, editable set of pose-space corrective shape keys.

Targets are authored offline and must pass their recorded endpoint screen.
The live garment uses the armature and ordinary shape-key drivers only.
Pose interpolation remains subject to independent motion checks.
"""

import hashlib
import json
from pathlib import Path

import bpy
import numpy as np
from build_bodies import point_bone

POSES = {
    "elbow_bend": ((0.5, 0, -0.8660254), (0.08, -1, 0)),
    "forward_reach": ((0.25, -1, 0), (0.15, -1, 0.15)),
    "overhead_reach": ((0.35, 0, 1), (0.15, -0.15, 1)),
}


def feature(rig, side):
    return [
        float(rig.pose.bones[f"{part}_{side}"].matrix[axis][1])
        for part in ["upperarm", "lowerarm"]
        for axis in range(3)
    ]


def install(coat, rig, rest_points, weights, configuration):
    configuration = Path(configuration)
    config = json.loads(configuration.read_text())
    if config.get("weights_sha256"):
        assert (
            hashlib.sha256(
                json.dumps(weights, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            == config["weights_sha256"]
        )
    scene = bpy.context.scene
    action = rig.animation_data.action
    basis = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
    rest = np.asarray([v.co[:] for v in coat.data.vertices])
    coat.shape_key_add(name="Basis")
    supports = {"basis": {side: feature(rig, side) for side in ["l", "r"]}}
    report = {"scope": __doc__, "targets": [], "driver_owner": "Jacket pose weights"}
    names = [b.name for b in rig.pose.bones]
    weighted = np.zeros((len(weights), len(names)))
    for i, row in enumerate(weights):
        for name, value in row.items():
            weighted[i, names.index(name)] = value
    rig.animation_data.action = None
    for label, entry in config["targets"].items():
        target_path = configuration.parent / entry["target"]
        evidence = json.loads((configuration.parent / entry["evidence"]).read_text())
        if config.get("pattern_sha256"):
            assert evidence["pattern_sha256"] == config["pattern_sha256"]
        assert evidence["passed"], f"Rejected endpoint cannot become a key: {label}"
        assert (
            hashlib.sha256(target_path.read_bytes()).hexdigest()
            == evidence["output_sha256"]
        )
        target_data = np.load(target_path)
        target = target_data["points"]
        assert np.array_equal(
            target_data["quads"],
            np.asarray([tuple(p.vertices) for p in coat.data.polygons]),
        )
        assert target.shape == rest.shape
        for bone in rig.pose.bones:
            bone.matrix_basis = basis[bone.name]
        bpy.context.view_layer.update()
        upper, lower = POSES[entry.get("action", label)]
        fraction = entry.get("fraction", 1.0)
        for side, sign in [("l", 1), ("r", -1)]:
            for part, vector in [
                ("upperarm", upper),
                ("lowerarm", lower),
                ("hand", lower),
            ]:
                direction = (
                    np.array([sign, 0.0, 0.0]) * (1 - fraction)
                    + np.array([sign * vector[0], vector[1], vector[2]]) * fraction
                )
                point_bone(rig, f"{part}_{side}", direction)
        skin = np.asarray(
            [
                rig.pose.bones[n].matrix @ rig.data.bones[n].matrix_local.inverted()
                for n in names
            ]
        )
        transforms = np.einsum("vb,bij->vij", weighted, skin)
        local = np.einsum(
            "vij,vj->vi",
            np.linalg.inv(transforms),
            np.column_stack([target, np.ones(len(target))]),
        )[:, :3]
        delta = local - rest
        supports[label] = {side: feature(rig, side) for side in ["l", "r"]}
        left = np.clip(0.5 + rest_points[:, 0] / 0.08, 0, 1)
        for side, mask in [("l", left), ("r", 1 - left)]:
            key = coat.shape_key_add(name=f"{label}_{side}")
            key.data.foreach_set(
                "co", (rest + delta * mask[:, None]).astype(np.float32).ravel()
            )
            key.value = 0
        report["targets"].append(
            {
                "label": label,
                "sha256": evidence["output_sha256"],
                "maximum_bind_delta_m": float(np.linalg.norm(delta, axis=1).max()),
            }
        )
    for bone in rig.pose.bones:
        bone.matrix_basis = basis[bone.name]
    rig.animation_data.action = action
    scene.frame_set(31)
    bpy.context.view_layer.update()
    controls = bpy.data.objects.new("Jacket pose weights", None)
    scene.collection.objects.link(controls)
    controls.hide_render = True
    controls.hide_set(True)
    method = config.get("interpolation", "shepard")
    coefficients = {}
    if method == "gaussian":
        for side in ["l", "r"]:
            samples = np.asarray([row[side] for row in supports.values()])
            distances = ((samples[:, None] - samples[None, :]) ** 2).sum(axis=2)
            kernel = np.exp(-distances / 1.0)
            assert np.linalg.cond(kernel) < 1e8
            coefficients[side] = np.linalg.inv(kernel)
            assert np.allclose(
                kernel @ coefficients[side], np.eye(len(supports)), atol=1e-7
            )
    report["interpolation"] = method
    report["kernel_coefficients"] = {
        side: matrix.tolist() for side, matrix in coefficients.items()
    }
    variables = ["ux", "uy", "uz", "lx", "ly", "lz"]
    for label, samples in supports.items():
        for side in ["l", "r"]:
            prop = f"score_{label}_{side}"
            controls[prop] = 0.0
            driver = controls.driver_add(f'["{prop}"]').driver
            for i, variable_name in enumerate(variables):
                var = driver.variables.new()
                var.name = variable_name
                var.type = "SINGLE_PROP"
                var.targets[0].id = rig
                part = "upperarm" if i < 3 else "lowerarm"
                var.targets[
                    0
                ].data_path = f'pose.bones["{part}_{side}"].matrix[1][{i % 3}]'
                # RNA matrix indexing is column-major; mathutils indexing is row-major.
                assert (
                    abs(
                        rig.path_resolve(var.targets[0].data_path)
                        - feature(rig, side)[i]
                    )
                    < 1e-6
                )
            distance = "+".join(
                f"({name}-({value:.8f}))**2"
                for name, value in zip(variables, samples[side])
            )
            driver.expression = (
                f"exp(-({distance}))"
                if method == "gaussian"
                else f"1/(.0001+{distance})**2"
            )
    for label in config["targets"]:
        for side in ["l", "r"]:
            key = coat.data.shape_keys.key_blocks[f"{label}_{side}"]
            driver = key.driver_add("value").driver
            for i, support in enumerate(supports):
                var = driver.variables.new()
                var.name = f"p{i}"
                var.type = "SINGLE_PROP"
                var.targets[0].id = controls
                var.targets[0].data_path = f'["score_{support}_{side}"]'
            target_index = list(supports).index(label)
            if method == "gaussian":
                driver.expression = "+".join(
                    f"({value:.10f})*p{i}"
                    for i, value in enumerate(coefficients[side][target_index])
                )
                key.slider_min = -1
                key.slider_max = 2
            else:
                driver.expression = (
                    f"p{target_index}/max(1e-20,"
                    + "+".join(f"p{i}" for i in range(len(supports)))
                    + ")"
                )
    bpy.context.view_layer.update()
    assert max(abs(key.value) for key in coat.data.shape_keys.key_blocks[1:]) < 1e-5
    report["support_directions"] = supports
    report["key_count_excluding_basis"] = len(coat.data.shape_keys.key_blocks) - 1
    report["runtime_contact_solver"] = False
    return report
