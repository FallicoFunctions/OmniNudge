"""Render matched baseline/lean review angles for the two preserved presets."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PRESETS = {
    "male": {
        "hair": "taper-fade",
        "top": "ribbed-tank",
        "jacket": "utility-vest",
        "bottoms": "cargo-pants",
        "shoes": "work-boots",
        "accessories": "gold-hoops",
    },
    "female": {
        "hair": "blunt-bob",
        "top": "mesh-crop",
        "jacket": "cropped-puffer",
        "bottoms": "mesh-shorts",
        "shoes": "chunky-sneakers",
        "accessories": "gold-hoops",
    },
}

CAMERAS = {
    "front": ((0.0, -3.92, 1.55), (0.0, -0.02, 0.86)),
    "three-quarter": ((1.75, -3.70, 1.58), (0.0, -0.02, 0.86)),
    "profile": ((3.92, 0.0, 1.55), (0.0, -0.01, 0.86)),
    "left-profile": ((-3.92, 0.0, 1.55), (0.0, -0.01, 0.86)),
    "rear": ((0.0, 3.92, 1.55), (0.0, 0.0, 0.86)),
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--lean", type=float, choices=(0.0, 1.0), default=0.0)
    return parser.parse_args(argv)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location: tuple[float, float, float], energy: float, size: float) -> None:
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, Vector((0.0, -0.03, 1.12)))


def set_morph(sex: str, lean: float) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data.shape_keys is None:
            continue
        keys = obj.data.shape_keys.key_blocks
        for key in keys:
            if key.name != "Basis":
                key.value = 0.0
        if keys.get(sex) is not None:
            keys[sex].value = 1.0
        if keys.get("lean") is not None:
            keys["lean"].value = lean


def set_option(slot: str, option_id: str) -> None:
    prefix = f"AvatarOption_{slot}__"
    for option_root in (obj for obj in bpy.data.objects if obj.name.startswith(prefix)):
        visible = option_root.name == f"{prefix}{option_id}"
        option_root.hide_render = not visible
        for child in option_root.children_recursive:
            child.hide_render = not visible


def configure_scene() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.45
    scene.world.color = (0.012, 0.015, 0.022)

    old_camera = bpy.data.objects.get("LeanReviewCamera")
    if old_camera is not None:
        bpy.data.objects.remove(old_camera, do_unlink=True)
    camera_data = bpy.data.cameras.new("LeanReviewCamera")
    camera_data.lens = 72
    camera = bpy.data.objects.new("LeanReviewCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    add_area_light("LeanKey", (-1.8, -3.2, 3.1), 560.0, 2.2)
    add_area_light("LeanFill", (2.4, -2.2, 2.1), 210.0, 1.8)
    add_area_light("LeanRim", (0.8, 1.5, 2.7), 520.0, 1.2)

    armature = bpy.data.objects["AvatarSkeleton"]
    armature.show_in_front = False
    armature.hide_render = True
    return camera


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    camera = configure_scene()
    scene = bpy.context.scene

    for sex, options in PRESETS.items():
        set_morph(sex, args.lean)
        for slot, option_id in options.items():
            set_option(slot, option_id)
        for view_name, (location, target) in CAMERAS.items():
            camera.location = location
            look_at(camera, Vector(target))
            scene.render.filepath = str(output_dir / f"{sex}-{view_name}.png")
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
