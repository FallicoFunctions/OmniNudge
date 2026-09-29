"""Render connected-collar motion and construction views without saving the scene."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from build_bodies import review


def run(args):
    digest = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, _body, _shirt = A.scene_objects()
    original = scene["riggedJacketOriginalLoweringAction"]
    collar = bpy.data.objects["Shirt detail - connected collar"]
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    scene.render.resolution_x = scene.render.resolution_y = 1000
    args.output.mkdir(parents=True, exist_ok=True)
    views = (
        ("neckband-front-t", 31, 0, "dressed", (0, -4, 1.52), (0, 0, 1.49), 0.29),
        ("neckband-back-fit", 31, 0, "jacket-hidden", (1, 3, 1.8), (0, 0, 1.52), 0.28),
        ("neckband-neck-turn", 1, 20, "dressed", (0, -4, 1.52), (0, 0, 1.49), 0.29),
        (
            "neckband-connected-clay",
            31,
            0,
            "collar-only-clay",
            (1, -3, 2.1),
            (0, 0, 1.48),
            0.27,
        ),
    )
    records = []
    saved_visibility = {obj: obj.hide_render for obj in bpy.data.objects}
    for label, frame, rotation, mode, location, target, scale in views:
        for obj, hidden in saved_visibility.items():
            obj.hide_render = hidden
        rig.animation_data.action = bpy.data.actions[original]
        A.sample(scene, frame)
        bone = rig.pose.bones["neck_01"]
        basis = bone.matrix_basis.copy()
        if rotation:
            rig.animation_data.action = None
            bone.matrix_basis = (
                basis
                @ Quaternion((0, 0, 1), math.radians(rotation)).to_matrix().to_4x4()
            )
            A.update()
        if mode == "jacket-hidden":
            coat.hide_render = True
            for obj in bpy.data.objects:
                if obj.get("jacketHardware"):
                    obj.hide_render = True
        elif mode == "collar-only-clay":
            for obj in bpy.data.objects:
                if obj.type == "MESH" and obj != collar:
                    obj.hide_render = True
            clay = bpy.data.materials.new("Diagnostic collar clay")
            clay.use_nodes = True
            node = clay.node_tree.nodes.get("Principled BSDF")
            node.inputs["Base Color"].default_value = (0.3, 0.3, 0.3, 1)
            node.inputs["Roughness"].default_value = 0.65
            collar.data.materials[0] = clay
        camera.location = location
        camera.data.ortho_scale = scale
        review.look_at(camera, Vector(target))
        scene.render.filepath = str(args.output / (label + ".png"))
        bpy.ops.render.render(write_still=True)
        bone.matrix_basis = basis
        A.update()
        records.append(
            {
                "view": label + ".png",
                "frame": frame,
                "neck_local_z_degrees": rotation,
                "display_mode": mode,
                "camera": location,
                "target": target,
                "orthographic_scale_m": scale,
            }
        )
    assert A.digest(args.input) == digest
    (args.output / "neckband-render-check.json").write_text(
        json.dumps(
            {"model_sha256": digest, "model_preserved": True, "views": records},
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
