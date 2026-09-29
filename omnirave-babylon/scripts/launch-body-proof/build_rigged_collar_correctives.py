"""Apply paired-wall collar pose corrections through existing jacket drivers."""

import argparse
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path.cwd() / "omnirave-babylon/scripts/launch-body-proof"))
import audit_rigged_jacket_sleeves as A
from build_rigged_shirt_neckband import smooth

parser = argparse.ArgumentParser()
parser.add_argument("--fit", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--provenance", type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
root = args.fit
source = Path(
    "omnirave-babylon/assets-src/avatars/launch-body-proof/rigged-collar-deformation-study/male-rigged-collar-deformation.blend"
)
bpy.ops.wm.open_mainfile(filepath=str(source))
s, r, c, b, h = A.scene_objects()
o = bpy.data.objects["Shirt detail - connected collar"]
co = np.asarray([list(v.co) for v in o.data.vertices], np.float32)
o.shape_key_add(name="Basis")
archive = {}
report = []
for pose in ["overhead", "forward"]:
    r.animation_data.action = bpy.data.actions[s["riggedJacketOriginalLoweringAction"]]
    A.sample(s, 31)
    reference_t = A.array(A.H.geometry(o)[0])
    r.animation_data.action = bpy.data.actions["Jacket review - " + pose + " reach"]
    A.sample(s, 49)
    names = [g.name for g in o.vertex_groups]
    from build_rigged_shirt_neckband import weight_array

    weights = weight_array(o, names)
    mats = np.asarray(
        [
            r.matrix_world
            @ r.pose.bones[n].matrix
            @ r.data.bones[n].matrix_local.inverted()
            @ r.matrix_world.inverted()
            for n in names
        ]
    )
    d = {"weights": weights, "skin_matrices": mats, "reference_t": reference_t}
    delta = np.load(root / (pose + "-optimized.npz"))["posed_delta"]
    skin = np.einsum("vg,gij->vij", d["weights"], d["skin_matrices"])
    bind = np.linalg.solve(skin[:, :3, :3], delta[..., None])[:, :, 0]
    left = smooth((d["reference_t"][:, 0] + 0.01) / 0.02)
    for side, owner in [("l", left), ("r", 1 - left)]:
        key = o.shape_key_add(name="Collar " + pose + " " + side)
        key.data.foreach_set(
            "co", (co + bind * owner[:, None]).astype(np.float32).reshape(-1)
        )
        driver = key.driver_add("value").driver
        driver.type = "SCRIPTED"
        driver.expression = "coat_value"
        v = driver.variables.new()
        v.name = "coat_value"
        v.type = "SINGLE_PROP"
        v.targets[0].id_type = "KEY"
        v.targets[0].id = c.data.shape_keys
        v.targets[0].data_path = c.data.shape_keys.key_blocks[
            pose + "_reach_" + side
        ].path_from_id("value")
    archive[pose + "_posed_delta"] = delta
    archive[pose + "_bind_delta"] = bind
r.animation_data.action = bpy.data.actions[s["riggedJacketOriginalLoweringAction"]]
A.sample(s, 1)
bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
np.savez_compressed(
    args.provenance,
    **archive,
    expected_keys=np.array(
        [
            np.asarray([list(v.co) for v in key.data])
            for key in o.data.shape_keys.key_blocks
        ],
        np.float32,
    ),
)
