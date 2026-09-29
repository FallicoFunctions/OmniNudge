"""Replace transmission corneas with transparent-blend shells + re-render.

EEVEE renders Principled transmission over dark cavities as opaque gray.
A Transparent/Glossy fresnel shell stays invisible with a live highlight.
Operates on the face01 file (ours). Re-renders the face set + key0.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--renders", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    path = Path(args.blend).expanduser().resolve()
    bpy.ops.wm.open_mainfile(filepath=str(path))
    material = bpy.data.materials["OA_MUSE_Cornea"]
    material.use_nodes = True
    material.blend_method = "BLEND"
    tree = material.node_tree
    tree.nodes.clear()
    transparent = tree.nodes.new("ShaderNodeBsdfTransparent")
    transparent.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    glossy = tree.nodes.new("ShaderNodeBsdfGlossy")
    glossy.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    glossy.inputs["Roughness"].default_value = 0.05
    fresnel = tree.nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.376
    mix = tree.nodes.new("ShaderNodeMixShader")
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(fresnel.outputs["Fac"], mix.inputs["Fac"])
    tree.links.new(glossy.outputs["BSDF"], mix.inputs[1])
    tree.links.new(transparent.outputs["BSDF"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])

    scene = bpy.context.scene
    renders = Path(args.renders).expanduser().resolve()
    head = Vector((0.0, -0.03, 1.575))
    views = [
        ("face-front.png", (0.0, -0.95, 1.60), head, 85.0, False),
        ("face-profile.png", (0.95, -0.03, 1.60), head, 85.0, False),
        ("face-three-quarter.png", (0.62, -0.68, 1.63), head, 85.0, False),
        ("face-front-wireframe.png", (0.0, -0.95, 1.60), head, 85.0, True),
        ("face-key0.png", (0.0, -0.95, 1.60), head, 85.0, False),
    ]
    key_names = ["OA_Male_Likeness_v1"]
    for filename, location, aim, lens, wire in views:
        if filename == "face-key0.png":
            for obj in bpy.data.objects:
                if obj.type == "MESH" and obj.data.shape_keys is not None:
                    for key in obj.data.shape_keys.key_blocks:
                        if key.name in key_names:
                            key.value = 0.0
        camera_data = bpy.data.cameras.new("FACE01B_Cam")
        camera = bpy.data.objects.new("FACE01B_Cam", camera_data)
        scene.collection.objects.link(camera)
        review_collection = bpy.data.collections.get("MUSE_Review_DoNotExport")
        if review_collection is not None:
            for owner in list(camera.users_collection):
                owner.objects.unlink(camera)
            review_collection.objects.link(camera)
        camera.location = Vector(location)
        camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.lens = lens
        scene.camera = camera
        scene.render.filepath = str(renders / filename)
        if wire:
            wire_material = bpy.data.materials.get("FACE01_Wire")
            for view_layer in scene.view_layers:
                view_layer.material_override = wire_material
        bpy.ops.render.render(write_still=True)
        if wire:
            for view_layer in scene.view_layers:
                view_layer.material_override = None
        if filename == "face-key0.png":
            for obj in bpy.data.objects:
                if obj.type == "MESH" and obj.data.shape_keys is not None:
                    for key in obj.data.shape_keys.key_blocks:
                        if key.name in key_names:
                            key.value = 1.0
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print("CORNEA FIX DONE")


if __name__ == "__main__":
    main()
