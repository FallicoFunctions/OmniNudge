# Connection map: reused wardrobe surfaces fit their original body then follow
# indexed body correspondence; hair roots meet the measured scalp surface.
# No independent spans or detached primitive parts are introduced in this pack.
import bpy, sys, json, numpy as np
from pathlib import Path
from mathutils import Matrix

root = Path(__file__).resolve().parents[2] / "assets-src/avatars"
out = Path("/tmp/omnirave-complete-pair-study")
out.mkdir(parents=True, exist_ok=True)
report = {}
sys.path.insert(
    0, str(Path(__file__).resolve().parents[2] / "scripts/launch-body-proof")
)
from build_bodies import freeze_mesh

for sex in ["male", "female"]:
    bpy.ops.wm.open_mainfile(
        filepath=str(root / "launch-body-proof" / f"{sex}-body02.blend")
    )
    rig = bpy.data.objects["AvatarSkeleton"]
    rig.animation_data_clear()
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    body = bpy.data.objects["AvatarBody"]
    np.save(
        out / (sex + "-wardrobe-body.npy"),
        np.array([list(v.co) for v in body.data.vertices]),
    )
    names = [
        "AvatarBottoms_cargo-pants",
        "AvatarShoes_high-tops" if sex == "male" else "AvatarShoes_chunky-sneakers",
        "AvatarHair_high-pony",
        "AvatarTop_mesh-crop",
    ]
    keep = [bpy.data.objects[n] for n in names]
    # Keep authoring geometry, existing UVs, material images and rigging metadata.
    bpy.data.libraries.write(
        str(out / (sex + "-wardrobe.blend")), set(keep), fake_user=True, compress=True
    )
    report[sex] = names
bpy.ops.wm.open_mainfile(filepath=str(root / "astra-male-proof/face19.blend"))
body = bpy.data.objects["AvatarBody"]
for mod in body.modifiers:
    if mod.type != "ARMATURE":
        mod.show_viewport = False
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(deps)
me = ev.to_mesh()
np.save(
    out / "hair-source-body.npy",
    np.array([list(body.matrix_world @ v.co) for v in me.vertices]),
)
ev.to_mesh_clear()
hair = {}
for o in bpy.data.objects:
    if o.hide_render or not o.name.startswith(
        ("Proof_Curl18_", "Proof_Scalp18", "Proof_Earring")
    ):
        continue
    if o.type == "CURVES":
        data = o.data
        points = np.empty(len(data.points) * 3, np.float32)
        data.attributes["position"].data.foreach_get("vector", points)
        offset = np.array(
            [c.first_point_index for c in data.curves] + [len(data.points)], np.int32
        )
        hair[o.name] = {"positions": points.reshape(-1, 3), "offsets": offset}
    elif o.type == "MESH":
        hair[o.name] = {
            "positions": np.array(
                [list(o.matrix_world @ v.co) for v in o.data.vertices]
            ),
            "faces": np.array([list(p.vertices) for p in o.data.polygons], np.int32),
        }
for name, values in hair.items():
    np.savez_compressed(out / (name + ".npz"), **values)
report["hair"] = {
    n: {k: list(v.shape) for k, v in row.items()} for n, row in hair.items()
}
(out / "asset-pack.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report["hair"]), flush=True)
