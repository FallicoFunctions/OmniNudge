"""Transfer the completed male jacket construction to the female body and rig.
Connection map: existing sewn jacket topology stays connected. Hem is extended
from its measured existing rim; fitted surface follows indexed body landmarks.
"""

import bpy, sys, json, numpy as np
from pathlib import Path
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, PACK, BodyWarp, attach, array, material, review
from complete_pair_geometry import Surface, skin_weights, smooth
import audit_rigged_jacket_sleeves as A

bpy.ops.wm.open_mainfile(filepath=str(OUT / "female-assembly.blend"))
s = bpy.context.scene
r = bpy.data.objects["AvatarSkeleton"]
b = bpy.data.objects["AvatarBody"]
A.sample(s, 31)
surf = Surface(r, b)
d = np.load(PACK / "jacket-source.npz")
names = list(d["names"])
warp = BodyWarp(d["body"], surf.array)
with bpy.data.libraries.load(str(PACK / "jacket-source.blend"), link=False) as (
    src,
    dst,
):
    dst.objects = json.loads((PACK / "jacket-source.json").read_text())
for ob in dst.objects:
    s.collection.objects.link(ob)
    w = skin_weights(ob, names)
    source_skin = np.einsum("vg,gij->vij", w, d["skin"])
    target_skin = np.einsum("vg,gij->vij", w, surf.mats)
    co = array(ob)
    posed = np.einsum("vij,vj->vi", source_skin, np.c_[co, np.ones(len(co))])[:, :3]
    goal = warp(posed)
    # Longer relaxed foil shell reaches over the hip, with extra hem ease.
    fade = smooth((1.12 - posed[:, 2]) / 0.13)
    goal[:, 2] -= 0.055 * fade
    goal[:, 0] *= 1 + 0.10 * fade
    goal[:, 1] -= 0.004 * smooth((-posed[:, 1] - 0.03) / 0.09)
    bind = np.linalg.solve(target_skin, np.c_[goal, np.ones(len(goal))][..., None])[
        :, :3, 0
    ]
    keys = ob.data.shape_keys
    if keys:
        old = [np.array([list(p.co) for p in k.data]) for k in keys.key_blocks]
        for k, p in zip(keys.key_blocks, old):
            delta = np.einsum("vij,vj->vi", source_skin[:, :3, :3], p - co)
            local = np.linalg.solve(target_skin[:, :3, :3], delta[..., None])[:, :, 0]
            k.data.foreach_set("co", (bind + local).astype(np.float32).ravel())
        if keys.animation_data:
            for f in keys.animation_data.drivers:
                for v in f.driver.variables:
                    for t in v.targets:
                        if getattr(t.id, "type", None) == "ARMATURE":
                            t.id = r
    ob.data.vertices.foreach_set("co", bind.astype(np.float32).ravel())
    attach(ob, r)
    ob["avatarSlot"] = "jacket"
    ob["avatarOptionId"] = "plurr-foil"
    if ob.name == "Structured armhole jacket":
        foil = material("PLURR iridescent foil", (0.56, 0.03, 0.20), 0.20, 0.75)
        bs = foil.node_tree.nodes.get("Principled BSDF")
        bs.inputs["Coat Weight"].default_value = 0.65
        bs.inputs["Coat Roughness"].default_value = 0.15
        layer = foil.node_tree.nodes.new("ShaderNodeLayerWeight")
        ramp = foil.node_tree.nodes.new("ShaderNodeValToRGB")
        colors = [
            (0, (0.02, 0.65, 0.8, 1)),
            (0.25, (0.55, 0.018, 0.5, 1)),
            (0.5, (0.8, 0.07, 0.28, 1)),
            (0.72, (0.28, 0.055, 0.8, 1)),
            (1, (0.66, 0.33, 0.07, 1)),
        ]
        cr = ramp.color_ramp
        cr.elements.remove(cr.elements[1])
        cr.elements[0].position = 0
        cr.elements[0].color = colors[0][1]
        for pos, color in colors[1:]:
            cr.elements.new(pos).color = color
        foil.node_tree.links.new(layer.outputs["Facing"], ramp.inputs[0])
        foil.node_tree.links.new(ramp.outputs["Color"], bs.inputs["Base Color"])
        ob.data.materials.clear()
        ob.data.materials.append(foil)
        for p in ob.data.polygons:
            p.material_index = 0
A.sample(s, 1)
s["completePairPhase"] = "female jacket fitting in progress"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(
    filepath=str(OUT / "female-jacket-assembly.blend"), compress=True
)
camera = review.configure_scene()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.98
camera.location = (0.65, -4, 1.12)
review.look_at(camera, Vector((0, 0, 0.90)))
s.render.resolution_x = 800
s.render.resolution_y = 1000
s.render.filepath = str(OUT / "female-jacket-assembly.png")
bpy.ops.render.render(write_still=True)
