"""Render matched canonical/source views from the male v3.1 workfile."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ACTIVE_OPTIONS = {
    "AvatarHair_": "AvatarHair_textured-crop",
    "AvatarTop_": "AvatarTop_ribbed-tank",
    "AvatarJacket_": "AvatarJacket_bomber",
    "AvatarBottoms_": "AvatarBottoms_cargo-pants",
    "AvatarShoes_": "AvatarShoes_high-tops",
    "AvatarAccessory_": "AvatarAccessory_gold-hoops",
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(argv)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def set_canonical_visibility(visible: bool) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name.startswith("SOURCE_"):
            continue
        selected = True
        for prefix, active in ACTIVE_OPTIONS.items():
            if obj.name.startswith(prefix):
                selected = obj.name == active or obj.name.startswith(active + "_")
                break
        obj.hide_render = not (visible and selected)

    for obj in bpy.data.objects:
        if not obj.name.startswith("AvatarOption_"):
            continue
        selected = any(obj.name.endswith("__" + active.removeprefix(prefix)) for prefix, active in ACTIVE_OPTIONS.items())
        obj.hide_render = not (visible and selected)


def set_male_shape() -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data.shape_keys is None:
            continue
        keys = obj.data.shape_keys.key_blocks
        for key in keys:
            if key.name != "Basis":
                key.value = 0.0
        if keys.get("male") is not None:
            keys["male"].value = 1.0
        if keys.get("lean") is not None:
            keys["lean"].value = 1.0


def configure_scene() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.2

    world = bpy.data.worlds.new("ConformanceWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.028, 0.038, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.world = world

    for name, location, energy, size in (
        ("ConformanceKey", (-2.4, -3.5, 3.2), 750, 2.8),
        ("ConformanceFill", (2.8, -2.0, 2.2), 340, 2.4),
        ("ConformanceRim", (0.8, 2.5, 3.0), 650, 2.0),
    ):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = location
        look_at(light, Vector((0.0, 0.0, 1.0)))

    data = bpy.data.cameras.new("ConformanceCamera")
    data.type = "ORTHO"
    data.ortho_scale = 2.05
    camera = bpy.data.objects.new("ConformanceCamera", data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, -4.0, 0.92)
    look_at(camera, Vector((0.0, 0.0, 0.88)))
    scene.camera = camera
    return camera


def render(path: Path) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    configure_scene()
    set_male_shape()

    source = bpy.data.objects["SOURCE_TripoV31_MaleLuxury_High"]
    set_canonical_visibility(False)
    source.hide_render = False
    render(output_dir / "source-front.png")

    source.hide_render = True
    set_canonical_visibility(True)
    render(output_dir / "canonical-front.png")


if __name__ == "__main__":
    main()
