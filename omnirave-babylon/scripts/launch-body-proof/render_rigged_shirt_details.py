"""Render native shirt detail closeups without saving the source scene."""

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_rigged_jacket_sleeves as A
from build_bodies import review


def run(args):
    digest = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, _coat, _body, _shirt = A.scene_objects()
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    camera = review.configure_scene()
    camera.data.type = "ORTHO"
    scene.render.resolution_x = scene.render.resolution_y = 1000
    args.output.mkdir(parents=True, exist_ok=True)
    views = (
        ("shirt-placket-close", 1, (0, -4, 1.14), (0, 0, 1.14), 0.35),
        ("shirt-button-close", 1, (0.02, -4, 1.192), (0.002, 0, 1.191), 0.04),
        ("shirt-collar-t", 31, (0, -4, 1.455), (0, 0, 1.455), 0.21),
    )
    records = []
    for label, frame, location, target, scale in views:
        A.sample(scene, frame)
        camera.location = location
        camera.data.ortho_scale = scale
        review.look_at(camera, Vector(target))
        scene.render.filepath = str(args.output / (label + ".png"))
        bpy.ops.render.render(write_still=True)
        records.append(
            {
                "view": label + ".png",
                "frame": frame,
                "camera": location,
                "target": target,
                "orthographic_scale_m": scale,
            }
        )
    assert A.digest(args.input) == digest
    (args.output / "shirt-render-check.json").write_text(
        json.dumps(
            {"model_sha256": digest, "model_preserved": True, "views": records}, indent=2
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
