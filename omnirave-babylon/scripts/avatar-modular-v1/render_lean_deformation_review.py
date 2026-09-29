"""Render the exact lean presets in idle, walk, and run stress poses."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_lean_body_review as review


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    camera = review.configure_scene()
    camera.location = (1.75, -3.70, 1.58)
    review.look_at(camera, Vector((0.0, -0.02, 0.86)))
    scene = bpy.context.scene
    armature = bpy.data.objects["AvatarSkeleton"]

    for sex, options in review.PRESETS.items():
        review.set_morph(sex, 1.0)
        for slot, option_id in options.items():
            review.set_option(slot, option_id)
        for action_name in ("idle", "walk", "run"):
            action = bpy.data.actions[action_name]
            armature.animation_data.action = action
            start = int(action.frame_range[0])
            sample = start + max(1, int((action.frame_range[1] - start) * 0.42))
            scene.frame_set(sample)
            scene.render.filepath = str(output_dir / f"{sex}-{action_name}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
