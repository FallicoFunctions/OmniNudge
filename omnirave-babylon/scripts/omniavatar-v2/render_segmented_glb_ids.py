"""Render flat semantic-ID views for a segmented Tripo GLB."""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PALETTE = (
    (0.89, 0.10, 0.11, 1), (0.22, 0.49, 0.72, 1), (0.30, 0.69, 0.29, 1),
    (0.60, 0.31, 0.64, 1), (1.00, 0.50, 0.00, 1), (0.65, 0.34, 0.16, 1),
    (0.97, 0.51, 0.75, 1), (0.50, 0.50, 0.50, 1), (0.74, 0.74, 0.13, 1),
    (0.09, 0.75, 0.81, 1), (0.12, 0.47, 0.71, 1), (0.68, 0.78, 0.91, 1),
    (1.00, 0.73, 0.47, 1), (0.17, 0.63, 0.17, 1),
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(argv)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    args = parse_args()
    output = Path(args.output_dir).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).expanduser().resolve()))
    meshes = sorted((obj for obj in bpy.data.objects if obj.type == "MESH"), key=lambda obj: obj.name)
    for index, obj in enumerate(meshes):
        material = bpy.data.materials.new("ID_" + obj.name)
        material.diffuse_color = PALETTE[index % len(PALETTE)]
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = material.diffuse_color
        bsdf.inputs["Roughness"].default_value = 0.78
        obj.data.materials.clear()
        obj.data.materials.append(material)

    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[i] for point in corners) for i in range(3)))
    maximum = Vector(tuple(max(point[i] for point in corners) for i in range(3)))
    center = (minimum + maximum) * 0.5
    radius = max(maximum - minimum) * 0.5

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("SegmentAuditWorld")
    scene.world.color = (0.025, 0.025, 0.025)
    bpy.ops.object.light_add(type="AREA", location=(3, -4, 5))
    bpy.context.object.data.energy = 1000
    bpy.context.object.data.size = 4
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = radius * 2.35
    scene.camera = camera
    distance = radius * 4
    for name, location in {
        "front": (distance, 0, center.z),
        "three-quarter": (distance / math.sqrt(2), -distance / math.sqrt(2), center.z),
        "back": (-distance, 0, center.z),
    }.items():
        camera.location = location
        look_at(camera, center)
        scene.render.filepath = str(output / f"segments-{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
