"""Render stressed collar poses without modifying the saved model."""

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
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    scene.render.resolution_x = scene.render.resolution_y = 1000
    args.output.mkdir(parents=True, exist_ok=True)
    original = scene["riggedJacketOriginalLoweringAction"]
    views = (
        (
            "collar-overhead-fit",
            "Jacket review - overhead reach",
            49,
            0,
            True,
            (-1, -2, 1.9),
            (0, 0, 1.50),
            0.27,
        ),
        (
            "collar-forward-fit",
            "Jacket review - forward reach",
            49,
            0,
            True,
            (-2, 0.8, 1.85),
            (0, 0, 1.51),
            0.25,
        ),
        (
            "collar-overhead-dressed",
            "Jacket review - overhead reach",
            49,
            0,
            False,
            (0, -4, 1.52),
            (0, 0, 1.49),
            0.32,
        ),
        ("collar-neck-fit", original, 1, 20, True, (1, 3, 1.8), (0, 0, 1.52), 0.28),
    )
    records = []
    visibility = {obj: obj.hide_render for obj in bpy.data.objects}
    for label, action, frame, angle, hide_coat, location, target, scale in views:
        for obj, hidden in visibility.items():
            obj.hide_render = hidden
        rig.animation_data.action = bpy.data.actions[action]
        A.sample(scene, frame)
        if angle:
            rig.animation_data.action = None
            bone = rig.pose.bones["neck_01"]
            bone.matrix_basis = (
                bone.matrix_basis
                @ Quaternion((0, 0, 1), math.radians(angle)).to_matrix().to_4x4()
            )
            A.update()
        if hide_coat:
            coat.hide_render = True
            for obj in bpy.data.objects:
                if obj.get("jacketHardware"):
                    obj.hide_render = True
        camera.location = location
        camera.data.ortho_scale = scale
        review.look_at(camera, Vector(target))
        scene.render.filepath = str(args.output / (label + ".png"))
        bpy.ops.render.render(write_still=True)
        records.append(
            {
                "view": label + ".png",
                "action": action,
                "frame": frame,
                "neck_local_z_degrees": angle,
                "jacket_hidden": hide_coat,
                "camera": location,
                "target": target,
                "orthographic_scale_m": scale,
            }
        )
    assert A.digest(args.input) == digest
    (args.output / "deformation-render-check.json").write_text(
        json.dumps(
            {"model_sha256": digest, "model_preserved": True, "views": records},
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
