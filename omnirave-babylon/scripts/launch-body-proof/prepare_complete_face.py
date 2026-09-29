import bpy, numpy as np, json
from pathlib import Path

p = (
    Path(__file__).resolve().parents[2]
    / "assets-src/avatars/astra-male-proof/face19.blend"
)
out = Path("/tmp/omnirave-complete-pair-study")
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(p))
r = bpy.data.objects["AvatarSkeleton"]
d = {}
for ob in bpy.data.objects:
    if ob.type != "MESH" or not (
        ob.name == "AvatarBody"
        or ob.name.startswith(("AvatarEye", "AvatarIris", "AvatarPupil"))
    ):
        continue
    for m in ob.modifiers:
        if m.type != "ARMATURE":
            m.show_viewport = False
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    d[ob.name] = np.array([list(ob.matrix_world @ v.co) for v in me.vertices])
    ev.to_mesh_clear()
d["head_matrix"] = np.array(r.matrix_world @ r.pose.bones["head"].matrix)
d["head_length"] = np.array(r.pose.bones["head"].length)
np.savez_compressed(out / "male-face-source.npz", **d)
print({k: list(v.shape) for k, v in d.items()})
print("GROUPS", [g.name for g in bpy.data.objects["AvatarBody"].vertex_groups])
