import bpy, sys, numpy as np, json
from pathlib import Path

sys.path.insert(
    0, str(Path(__file__).resolve().parents[2] / "scripts/launch-body-proof")
)
import audit_rigged_jacket_sleeves as A

root = Path(__file__).resolve().parents[2] / "assets-src/avatars/launch-body-proof"
out = Path("/tmp/omnirave-complete-pair-study")
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(
    filepath=str(
        root / "rigged-collar-corrective-study/male-rigged-collar-correctives.blend"
    )
)
s, r, c, b, h = A.scene_objects()
r.animation_data.action = bpy.data.actions[s["riggedJacketOriginalLoweringAction"]]
A.sample(s, 31)
names = [x.name for x in r.data.bones]
mats = np.asarray(
    [
        r.matrix_world
        @ r.pose.bones[n].matrix
        @ r.data.bones[n].matrix_local.inverted()
        @ r.matrix_world.inverted()
        for n in names
    ]
)
np.savez_compressed(
    out / "jacket-source.npz",
    body=A.array(A.H.geometry(b)[0]),
    skin=mats,
    names=np.array(names),
)
obs = [c] + [o for o in bpy.data.objects if o.get("jacketHardware")]
bpy.data.libraries.write(
    str(out / "jacket-source.blend"), set(obs), fake_user=True, compress=True
)
(out / "jacket-source.json").write_text(json.dumps([o.name for o in obs]))
print("PACK", len(obs))
