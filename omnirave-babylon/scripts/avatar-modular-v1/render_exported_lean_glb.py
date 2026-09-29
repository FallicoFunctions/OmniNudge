"""Render the exported lean GLB itself for round-trip visual verification."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_lean_body_review as review


SLOT_PREFIXES = {
    "accessories": "AvatarAccessory_",
    "bottoms": "AvatarBottoms_",
    "hair": "AvatarHair_",
    "jacket": "AvatarJacket_",
    "shoes": "AvatarShoes_",
    "top": "AvatarTop_",
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    source = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.context.scene.world = bpy.data.worlds.new("LeanRoundTripWorld")
    camera = review.configure_scene()
    camera.location = (0.0, -3.92, 1.55)
    review.look_at(camera, Vector((0.0, -0.02, 0.86)))

    for sex, options in review.PRESETS.items():
        review.set_morph(sex, 1.0)
        for slot, option_id in options.items():
            prefix = SLOT_PREFIXES[slot]
            selected_prefix = f"{prefix}{option_id}"
            for obj in (candidate for candidate in bpy.data.objects if candidate.name.startswith(prefix)):
                obj.hide_render = not (
                    obj.name == selected_prefix or obj.name.startswith(f"{selected_prefix}_")
                )
        bpy.context.scene.render.filepath = str(output_dir / f"{sex}-front.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
