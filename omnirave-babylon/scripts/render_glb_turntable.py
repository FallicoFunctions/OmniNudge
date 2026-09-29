"""Render neutral turntable views of a GLB for reconstruction QA."""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--size", type=int, default=768)
    return parser.parse_args(argv)


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def mesh_bounds() -> tuple[Vector, Vector]:
    corners = []
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH" and not obj.hide_render:
            corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not corners:
        raise RuntimeError("Imported GLB contains no renderable meshes")
    return (
        Vector((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners))),
        Vector((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners))),
    )


def configure_scene(size: int) -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("BenchmarkWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.035, 0.045, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.world = world

    bpy.ops.object.light_add(type="AREA", location=(3.5, -4.5, 5.0))
    key = bpy.context.object
    key.data.energy = 900
    key.data.shape = "DISK"
    key.data.size = 4.0

    bpy.ops.object.light_add(type="AREA", location=(-3.0, -1.5, 2.8))
    fill = bpy.context.object
    fill.data.energy = 650
    fill.data.size = 3.0

    bpy.ops.object.light_add(type="AREA", location=(0.0, 4.0, 4.0))
    rim = bpy.context.object
    rim.data.energy = 800
    rim.data.size = 3.0

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.lens = 55
    scene.camera = camera
    return camera


def main() -> None:
    args = parse_args()
    source = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    minimum, maximum = mesh_bounds()
    center = (minimum + maximum) * 0.5
    extent = maximum - minimum
    radius = max(extent.x, extent.y, extent.z) * 0.5

    camera = configure_scene(args.size)
    camera.data.ortho_scale = radius * 2.35
    distance = radius * 4.0

    # Blender's glTF importer converts Y-up assets to Z-up. These views orbit the
    # resulting vertical axis and make no assumptions about the model's scale.
    # Tripo's current outputs face +X after Blender's glTF axis conversion.
    views = {
        "front": (distance, 0.0, center.z),
        "left": (0.0, distance, center.z),
        "back": (-distance, 0.0, center.z),
        "right": (0.0, -distance, center.z),
        "front-three-quarter": (distance / math.sqrt(2), -distance / math.sqrt(2), center.z),
    }
    for name, location in views.items():
        camera.location = location
        look_at(camera, center)
        bpy.context.scene.render.filepath = str(output_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
