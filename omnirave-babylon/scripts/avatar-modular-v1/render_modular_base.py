"""Render fixed review views for the modular avatar base."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector


STARTER_OPTIONS = {
    "hair": "textured-crop",
    "top": "graphic-tee",
    "jacket": "bomber",
    "bottoms": "tech-joggers",
    "shoes": "high-tops",
    "accessories": "gold-hoops",
}
HAIR_OPTIONS = (
    "long-waves",
    "box-braids",
    "high-pony",
    "blunt-bob",
    "space-buns",
    "buzz",
    "taper-fade",
    "textured-crop",
    "man-bun",
    "shoulder-shag",
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(argv)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location: tuple[float, float, float], energy: float, size: float) -> None:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, Vector((0.0, -0.03, 1.30)))


def set_morph(name: str) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data.shape_keys is None:
            continue
        for key in obj.data.shape_keys.key_blocks:
            if key.name != "Basis":
                key.value = 1.0 if key.name == name else 0.0


def set_option(slot: str, option_id: str) -> None:
    prefix = f"AvatarOption_{slot}__"
    for option_root in (obj for obj in bpy.data.objects if obj.name.startswith(prefix)):
        visible = option_root.name == f"{prefix}{option_id}"
        for child in option_root.children_recursive:
            child.hide_render = not visible


def render(path: Path, camera_location: tuple[float, float, float], target: tuple[float, float, float]) -> None:
    scene = bpy.context.scene
    camera = bpy.data.objects.get("ReviewCamera")
    camera.location = camera_location
    look_at(camera, Vector(target))
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

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

    camera_data = bpy.data.cameras.new("ReviewCamera")
    camera_data.lens = 72
    camera = bpy.data.objects.new("ReviewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    scene.camera = camera

    add_area_light("Key", (-1.8, -3.2, 3.1), 560.0, 2.2)
    add_area_light("Fill", (2.4, -2.2, 2.1), 210.0, 1.8)
    add_area_light("Rim", (0.8, 1.5, 2.7), 520.0, 1.2)

    armature = bpy.data.objects["AvatarSkeleton"]
    armature.show_in_front = False
    armature.hide_render = True

    for slot, option_id in STARTER_OPTIONS.items():
        set_option(slot, option_id)

    set_morph("male")
    render(output_dir / "male-face.png", (0.34, -1.22, 1.64), (0.0, -0.035, 1.48))
    render(output_dir / "male-three-quarter.png", (1.75, -3.7, 1.58), (0.0, -0.02, 0.86))

    set_morph("female")
    render(output_dir / "female-face.png", (-0.31, -1.20, 1.63), (0.0, -0.035, 1.48))
    render(output_dir / "female-three-quarter.png", (-1.65, -3.65, 1.56), (0.0, -0.02, 0.84))

    set_morph("male")
    for option_id in HAIR_OPTIONS:
        set_option("hair", option_id)
        render(
            output_dir / f"hair-{option_id}.png",
            (0.34, -1.22, 1.64),
            (0.0, -0.035, 1.48),
        )

    for slot, option_id in {
        "hair": "taper-fade",
        "top": "ribbed-tank",
        "jacket": "utility-vest",
        "bottoms": "cargo-pants",
        "shoes": "work-boots",
    }.items():
        set_option(slot, option_id)
    render(output_dir / "male-outfit-utility.png", (1.75, -3.7, 1.58), (0.0, -0.02, 0.86))

    set_morph("female")
    for slot, option_id in {
        "hair": "blunt-bob",
        "top": "mesh-crop",
        "jacket": "cropped-puffer",
        "bottoms": "mesh-shorts",
        "shoes": "chunky-sneakers",
    }.items():
        set_option(slot, option_id)
    render(output_dir / "female-outfit-cropped.png", (-1.65, -3.65, 1.56), (0.0, -0.02, 0.84))


if __name__ == "__main__":
    main()
